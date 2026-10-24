import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Health } from "@/lib/contracts/catalogue";
import {
  customerIdParam,
  customersQuery,
  inventoryQuery,
  restockBody,
  searchQuery,
  skuParam,
} from "@/lib/contracts/catalogue";
import {
  bulkShipBody,
  noteBody,
  orderNumberParam,
  ordersQuery,
  statusChangeBody,
} from "@/lib/contracts/orders";
import { overviewQuery } from "@/lib/contracts/overview";
import { SIM_VERSION } from "@/lib/sim/config";
import { resolveRange } from "@/lib/ranges";
import { getDbHandle } from "./db";
import { validate, type AppDeps, type AppEnv } from "./env";
import { ApiError, badRequest, errorBody, notFound, rateLimited } from "./errors";
import { ensureFresh } from "./freshness";
import { getCustomer, listCustomers } from "./queries/customers";
import { listInventory, restock } from "./queries/inventory";
import { addNote, bulkShip, changeStatus, getOrder, listOrders } from "./queries/orders";
import { getOverview } from "./queries/overview";
import { search } from "./queries/search";
import { RateLimiter, clientKey } from "./rateLimit";
import { readSimState } from "./sim/catchUp";
import { resetDemo } from "./sim/reset";

/**
 * The Storefront Ops API (DATA.md §6), mounted at /api by the Next.js route
 * handler. Routes are chained on one instance so their types flow into
 * `AppType`, which the client imports for `hc`.
 */
export function createApp(deps: AppDeps) {
  const limiter = new RateLimiter(deps.writesPerMinute ?? 20, 60_000);

  /** Counts a write against the caller's per-minute budget. */
  const limitWrites = createMiddleware<AppEnv>(async (c, next) => {
    const wait = limiter.hit(clientKey(c), c.var.now);
    if (wait > 0) {
      c.header("Retry-After", String(wait));
      throw rateLimited("Too many changes in a minute.");
    }
    await next();
  });

  /** Reads run a catch-up first when the data is stale (off in tests). */
  const fresh = createMiddleware<AppEnv>(async (c, next) => {
    if (deps.autoCatchUp) await ensureFresh(await deps.getDbHandle(), c.var.now);
    await next();
  });

  const app = new Hono<AppEnv>()
    .basePath("/api")
    .use(async (c, next) => {
      const handle = await deps.getDbHandle();
      c.set("db", handle.db);
      c.set("dbKind", handle.kind);
      c.set("now", deps.now());
      await next();
      // Live data: never let a CDN or the browser keep an API response.
      if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
    })
    .onError((error, c) => {
      if (error instanceof ApiError) return c.json(errorBody(error.code, error.message), error.status);
      console.error("[storefront] unhandled API error", error);
      return c.json(errorBody("internal", "Something went wrong on our side."), 500);
    })
    .notFound((c) => c.json(errorBody("not_found", "No such endpoint."), 404))

    .get("/health", async (c) => {
      const state = await readSimState(c.var.db);
      const body: Health = {
        ok: state !== null && state.simVersion === SIM_VERSION,
        db: c.var.dbKind,
        simVersion: SIM_VERSION,
        storedSimVersion: state?.simVersion ?? null,
        materialisedUntil: state ? state.materialisedUntil.toISOString() : null,
      };
      return c.json(body);
    })

    .get("/overview", fresh, validate("query", overviewQuery), async (c) => {
      const q = c.req.valid("query");
      let range;
      try {
        range = resolveRange(q.range, c.var.now, q.from && q.to ? { from: q.from, to: q.to } : undefined);
      } catch (error) {
        if (error instanceof RangeError) throw badRequest(error.message);
        throw error;
      }
      return c.json(await getOverview(c.var.db, range, c.var.now));
    })

    .get("/orders", fresh, validate("query", ordersQuery), async (c) =>
      c.json(await listOrders(c.var.db, c.req.valid("query"))),
    )
    // Static segments before the :number routes.
    .post("/orders/bulk/ship", limitWrites, validate("json", bulkShipBody), async (c) =>
      c.json(await bulkShip(c.var.db, c.req.valid("json").numbers, c.var.now)),
    )
    .get("/orders/:number", validate("param", orderNumberParam), async (c) =>
      c.json(await getOrder(c.var.db, c.req.valid("param").number)),
    )
    .patch(
      "/orders/:number/status",
      limitWrites,
      validate("param", orderNumberParam),
      validate("json", statusChangeBody),
      async (c) =>
        c.json(
          await changeStatus(c.var.db, c.req.valid("param").number, c.req.valid("json").status, c.var.now),
        ),
    )
    .post(
      "/orders/:number/notes",
      limitWrites,
      validate("param", orderNumberParam),
      validate("json", noteBody),
      async (c) =>
        c.json(
          await addNote(c.var.db, c.req.valid("param").number, c.req.valid("json").message, c.var.now),
          201,
        ),
    )

    .get("/inventory", fresh, validate("query", inventoryQuery), async (c) =>
      c.json(await listInventory(c.var.db, c.req.valid("query"), c.var.now)),
    )
    .post(
      "/inventory/:sku/restock",
      limitWrites,
      validate("param", skuParam),
      validate("json", restockBody),
      async (c) =>
        c.json(await restock(c.var.db, c.req.valid("param").sku, c.req.valid("json").quantity, c.var.now)),
    )

    .get("/customers", fresh, validate("query", customersQuery), async (c) =>
      c.json(await listCustomers(c.var.db, c.req.valid("query"), c.var.now)),
    )
    .get("/customers/:id", validate("param", customerIdParam), async (c) =>
      c.json(await getCustomer(c.var.db, c.req.valid("param").id, c.var.now)),
    )

    .get("/search", validate("query", searchQuery), async (c) =>
      c.json(await search(c.var.db, c.req.valid("query").q)),
    )

    .post("/admin/reset", async (c) => {
      if (!deps.resetToken) throw notFound("No such endpoint.");
      const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const digest = (s: string) => createHash("sha256").update(s).digest();
      if (!timingSafeEqual(digest(given), digest(deps.resetToken))) {
        return c.json(errorBody("bad_request", "Missing or wrong reset token."), 401);
      }
      const report = await resetDemo(c.var.db, c.var.now);
      return c.json({ ...report, ms: Math.round(report.ms) });
    });

  return app;
}

export type AppType = ReturnType<typeof createApp>;

/** The production app: the process-wide database, the real clock, live catch-up. */
export const app = createApp({
  getDbHandle,
  now: Date.now,
  resetToken: process.env.DEMO_RESET_TOKEN || undefined,
  autoCatchUp: true,
});
