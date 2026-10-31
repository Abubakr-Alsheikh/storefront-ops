import { sql } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { segmentOf } from "@/lib/segments";
import { dayKeyAt, startOfZonedDay } from "@/lib/tz";
import { TEST_NOW, seededTestDb } from "@/test/db";
import { createApp } from "./app";
import { rows, type DbHandle } from "./db/client";
import { clearVipCache } from "./queries/customers";

let handle: DbHandle;
let app: ReturnType<typeof createApp>;
let api: ReturnType<typeof testClient<ReturnType<typeof createApp>>>["api"];

beforeAll(async () => {
  handle = await seededTestDb();
  clearVipCache();
  app = createApp({
    getDbHandle: async () => handle,
    now: () => TEST_NOW,
    resetToken: "test-token",
    writesPerMinute: 10_000,
  });
  api = testClient(app).api;
}, 60_000);
afterAll(() => handle.close());

/** Raw requests, for the cases the typed client refuses to build. */
async function raw(path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function count(query: ReturnType<typeof sql>) {
  const [row] = await rows<{ n: number }>(handle.db, query);
  return row.n;
}

/** First order in a given status, for write tests. */
async function orderIn(status: string, offset = 0) {
  const [row] = await rows<{ id: number }>(
    handle.db,
    sql`select id from orders where status = ${status} order by id limit 1 offset ${offset}`,
  );
  return row.id;
}

describe("health and errors", () => {
  it("reports the database and simulator version", async () => {
    const res = await api.health.$get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, db: "pglite", simVersion: 1, storedSimVersion: 1 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("server-timing")).toMatch(/^app;dur=\d/);
  });

  it("answers unknown endpoints with the error shape", async () => {
    expect(await raw("/api/nope")).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "No such endpoint." } },
    });
  });
});

describe("GET /api/overview", () => {
  it("matches SQL for today, hour by hour, against yesterday until now", async () => {
    const res = await api.overview.$get({ query: { range: "today" } });
    expect(res.status).toBe(200);
    const o = await res.json();
    const from = startOfZonedDay(TEST_NOW);
    const [today] = await rows<{ n: number; revenue: number }>(
      handle.db,
      sql`select count(*)::int n, sum(total_cents)::int revenue from orders
        where placed_at >= ${new Date(from).toISOString()}::timestamptz`,
    );
    expect(o.kpis.orders.current).toBe(today.n);
    expect(o.kpis.revenueCents.current).toBe(today.revenue);
    expect(o.kpis.averageOrderCents.current).toBe(Math.round(today.revenue / today.n));
    expect(o.kpis.orders.previous).toBeGreaterThan(0);
    expect(o.kpis.conversionRate.current).toBeGreaterThan(0.015);
    expect(o.kpis.conversionRate.current).toBeLessThan(0.035);

    // 00:00 to 10:30 is eleven hourly buckets.
    expect(o.range.granularity).toBe("hour");
    expect(o.series).toHaveLength(11);
    expect(o.series.reduce((s, p) => s + p.orders, 0)).toBe(today.n);
    expect(o.series.every((p) => p.previousRevenueCents !== null)).toBe(true);
    expect(o.series.every((p) => p.sessions > 0 && (p.previousSessions ?? 0) > 0)).toBe(true);
    const yesterdayOrders = o.series.reduce((s, p) => s + (p.previousOrders ?? 0), 0);
    expect(yesterdayOrders).toBe(o.kpis.orders.previous);

    expect(o.statuses.reduce((s, x) => s + x.orders, 0)).toBe(today.n);
    expect(o.topProducts).toHaveLength(5);
    expect(o.countries.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
    expect(o.countries.reduce((s, c) => s + c.orders, 0)).toBe(today.n);
    expect(o.lowStockVariants).toBeGreaterThanOrEqual(0);
  });

  it("covers 7 days by day, with simulated history and no previous period", async () => {
    const o = await (await api.overview.$get({ query: { range: "7d" } })).json();
    expect(o.range.granularity).toBe("day");
    expect(o.series).toHaveLength(7);
    expect(o.series.every((p) => p.orders > 1000 || p.start >= o.series[6].start)).toBe(true);
    // The test seed holds 7 days in all, so the 7 days before are empty.
    expect(o.kpis.revenueCents.previous).toBeNull();
    expect(o.series.every((p) => p.previousRevenueCents === null)).toBe(true);
  });

  it("accepts a custom range and rejects impossible ones", async () => {
    const day = dayKeyAt(TEST_NOW - 2 * 86_400_000);
    const custom = await api.overview.$get({ query: { range: "custom", from: day, to: day } });
    expect(custom.status).toBe(200);
    expect((await custom.json()).range.label).toBe("24 Oct");

    expect((await raw("/api/overview?range=custom")).status).toBe(400);
    const future = await raw("/api/overview?range=custom&from=2026-10-25&to=2026-10-30");
    expect(future).toMatchObject({ status: 400, body: { error: { code: "bad_request" } } });
    expect((await raw("/api/overview?range=year")).status).toBe(400);
  });
});

describe("GET /api/orders", () => {
  it("returns the newest first with the full total", async () => {
    const res = await api.orders.$get({ query: { limit: "50" } });
    const page = await res.json();
    expect(page.total).toBe(await count(sql`select count(*)::int n from orders`));
    expect(page.rows).toHaveLength(50);
    for (let i = 1; i < page.rows.length; i++) {
      expect(page.rows[i - 1].placedAt >= page.rows[i].placedAt).toBe(true);
    }
  });

  it.each(["placed", "number", "customer", "total", "items", "status", "country"] as const)(
    "pages by %s without overlap or gaps, both ways",
    async (sort) => {
      for (const dir of ["asc", "desc"] as const) {
        const whole = await (await api.orders.$get({ query: { sort, dir, limit: "150" } })).json();
        const pages = [];
        for (const offset of ["0", "50", "100"]) {
          pages.push(...(await (await api.orders.$get({ query: { sort, dir, limit: "50", offset } })).json()).rows);
        }
        expect(pages.map((r) => r.number)).toEqual(whole.rows.map((r) => r.number));
      }
    },
  );

  it.each([
    ["status", { status: "paid,packed" }, sql`select count(*)::int n from orders where status in ('paid','packed')`],
    ["country", { country: "PT" }, sql`select count(*)::int n from orders where country = 'PT'`],
    ["payment", { payment: "mbway,klarna" }, sql`select count(*)::int n from orders where payment_method in ('mbway','klarna')`],
    ["amount", { min: "5000", max: "10000" }, sql`select count(*)::int n from orders where total_cents between 5000 and 10000`],
    [
      "dates",
      { from: "2026-10-24", to: "2026-10-25" },
      sql`select count(*)::int n from orders where (placed_at at time zone 'Europe/Lisbon')::date between '2026-10-24' and '2026-10-25'`,
    ],
    ["search", { q: "silva" }, sql`select count(*)::int n from orders where customer_name ilike '%silva%'`],
  ] as const)("filters by %s", async (_, query, expected) => {
    const page = await (await api.orders.$get({ query })).json();
    const n = await count(expected);
    expect(n).toBeGreaterThan(0);
    expect(page.total).toBe(n);
  });

  it.each([
    ["placed", "desc", sql`placed_at desc, id desc`],
    ["customer", "asc", sql`customer_name asc, id asc`],
    ["total", "desc", sql`total_cents desc, id desc`],
  ] as const)("reads far pages from the other end, same rows (%s %s)", async (sort, dir, order) => {
    const { total } = await (await api.orders.$get({ query: { limit: "1" } })).json();
    for (const offset of [total - 150, total - 40, total - 1]) {
      const page = await (await api.orders.$get({ query: { sort, dir, limit: "100", offset: String(offset) } })).json();
      const expected = await rows<{ id: number }>(
        handle.db,
        sql`select id from orders order by ${order} limit 100 offset ${offset}`,
      );
      expect(page.rows.map((r) => r.number)).toEqual(expected.map((r) => r.id));
    }
    const past = await (await api.orders.$get({ query: { offset: String(total + 5) } })).json();
    expect(past.rows).toEqual([]);
  });

  it("freezes the result at upTo, with and without filters", async () => {
    const [{ max }] = await rows<{ max: number }>(handle.db, sql`select max(id)::int max from orders`);
    const upTo = max - 25;
    const frozen = await (await api.orders.$get({ query: { upTo: String(upTo) } })).json();
    expect(frozen.total).toBe(await count(sql`select count(*)::int n from orders where id <= ${upTo}`));
    expect(frozen.rows.every((r) => r.number <= upTo)).toBe(true);
    const first = await (await api.orders.$get({ query: { limit: "1" } })).json();
    expect(first.newest).toBe(max);
    expect(frozen.newest).toBeNull();
    const later = await (await api.orders.$get({ query: { offset: "10", limit: "1" } })).json();
    expect(later.newest).toBeNull();
    const filtered = await (await api.orders.$get({ query: { upTo: String(upTo), country: "ES" } })).json();
    expect(filtered.total).toBe(
      await count(sql`select count(*)::int n from orders where id <= ${upTo} and country = 'ES'`),
    );
  });

  it("finds an order by its number, with or without #", async () => {
    const id = await orderIn("delivered");
    const page = await (await api.orders.$get({ query: { q: `#${id}` } })).json();
    expect(page.rows.map((r) => r.number)).toContain(id);
  });

  it("treats LIKE wildcards in search as text", async () => {
    expect((await (await api.orders.$get({ query: { q: "%" } })).json()).total).toBe(0);
  });

  it.each([
    ["an unknown sort", "sort=price"],
    ["a page that is too big", "limit=201"],
    ["min above max", "min=500&max=100"],
    ["a bad date", "from=2026-02-30"],
    ["an unknown status", "status=lost"],
  ])("rejects %s", async (_, query) => {
    const res = await raw(`/api/orders?${query}`);
    expect(res).toMatchObject({ status: 400, body: { error: { code: "bad_request" } } });
  });
});

describe("GET /api/orders/:number", () => {
  it("returns lines, customer and a timeline that starts placed then paid", async () => {
    const id = await orderIn("delivered");
    const res = await api.orders[":number"].$get({ param: { number: String(id) } });
    expect(res.status).toBe(200);
    const o = await res.json();
    expect(o.items.reduce((s, i) => s + i.lineTotalCents, 0)).toBe(o.subtotalCents);
    expect(o.totalCents).toBe(o.subtotalCents - o.discountCents + o.shippingCents);
    expect(o.timeline.map((t) => t.type).slice(0, 2)).toEqual(["placed", "paid"]);
    expect(o.timeline.map((t) => t.type)).toEqual(expect.arrayContaining(["packed", "shipped", "delivered"]));
    expect(o.allowedTransitions).toEqual(["refunded"]);
    expect(o.customer.orderOrdinal).toBeGreaterThanOrEqual(1);
    expect(o.customer.orderOrdinal).toBeLessThanOrEqual(o.customer.ordersCount);
    expect(o.customer.address.line.length).toBeGreaterThan(3);
    expect(o.customer.address.postcode).toMatch(/^[\dA-Z -]+$/);
  });

  it("answers 404 for a number that does not exist and 400 for one that cannot", async () => {
    expect((await raw("/api/orders/999999")).body).toMatchObject({ error: { code: "not_found" } });
    expect((await raw("/api/orders/12")).status).toBe(400);
  });
});

describe("GET /api/inventory", () => {
  it("counts and filters stock states", async () => {
    const all = await (await api.inventory.$get({ query: {} })).json();
    expect(all.counts.all).toBe(all.rows.length);
    const low = await (await api.inventory.$get({ query: { state: "low" } })).json();
    expect(low.rows).toHaveLength(all.counts.low);
    expect(low.rows.every((r) => r.state === "low")).toBe(true);
    for (let i = 1; i < all.rows.length; i++) {
      expect(all.rows[i - 1].daysOfCover ?? Infinity).toBeLessThanOrEqual(all.rows[i].daysOfCover ?? Infinity);
    }
  });
});

describe("GET /api/customers", () => {
  it("gives each customer the segment segmentOf would", async () => {
    const page = await (await api.customers.$get({ query: { limit: "200", sort: "last_order", dir: "asc" } })).json();
    expect(page.rows).toHaveLength(200);
    for (const c of page.rows) {
      const expected = segmentOf(
        { ordersCount: c.ordersCount, lifetimeCents: c.lifetimeCents, lastOrderAt: Date.parse(c.lastOrderAt) },
        page.vipThresholdCents,
        TEST_NOW,
      );
      expect(c.segment).toBe(expected);
    }
  });

  it("filters by segment and sorts by lifetime value", async () => {
    const vip = await (await api.customers.$get({ query: { segment: "vip" } })).json();
    const all = await (await api.customers.$get({ query: {} })).json();
    expect(vip.total).toBeGreaterThan(0);
    expect(vip.total / all.total).toBeLessThan(0.08);
    expect(vip.rows.every((c) => c.segment === "vip")).toBe(true);
    for (let i = 1; i < all.rows.length; i++) {
      expect(all.rows[i - 1].lifetimeCents).toBeGreaterThanOrEqual(all.rows[i].lifetimeCents);
    }
  });

  it("returns a customer with their orders", async () => {
    const [top] = (await (await api.customers.$get({ query: { limit: "1" } })).json()).rows;
    const res = await api.customers[":id"].$get({ param: { id: String(top.id) } });
    const detail = await res.json();
    expect(detail.orders).toHaveLength(detail.ordersCount);
    expect(detail.orders.reduce((s, o) => s + o.totalCents, 0)).toBe(detail.lifetimeCents);
    expect((await raw("/api/customers/1")).status).toBe(404);
  });
});

describe("GET /api/search", () => {
  it("finds orders, customers and products", async () => {
    const id = await orderIn("shipped");
    const byNumber = await (await api.search.$get({ query: { q: String(id) } })).json();
    expect(byNumber.orders.map((o) => o.number)).toEqual([id]);
    const byWord = await (await api.search.$get({ query: { q: "alfama" } })).json();
    expect(byWord.products.length).toBeGreaterThan(0);
    expect(byWord.products.every((p) => p.name.startsWith("Alfama"))).toBe(true);
    const byName = await (await api.search.$get({ query: { q: "silva" } })).json();
    expect(byName.customers.length).toBeGreaterThan(0);
    expect((await raw("/api/search?q=")).status).toBe(400);
  });
});

describe("writes", () => {
  it("moves an order one allowed step and records the visitor", async () => {
    const id = await orderIn("paid");
    const res = await api.orders[":number"].status.$patch({ param: { number: String(id) }, json: { status: "packed" } });
    expect(res.status).toBe(200);
    const o = await res.json();
    expect(o.status).toBe("packed");
    expect(o.changedByVisitor).toBe(true);
    expect(o.timeline.at(-1)).toMatchObject({ type: "packed", actor: "visitor" });
    expect(o.allowedTransitions).toEqual(["shipped"]);
  });

  it("refuses steps the rules do not allow, and repeats", async () => {
    const paid = await orderIn("paid");
    const skip = await raw(`/api/orders/${paid}/status`, json({ status: "delivered" }, "PATCH"));
    expect(skip).toMatchObject({ status: 400, body: { error: { code: "bad_request" } } });
    const same = await raw(`/api/orders/${paid}/status`, json({ status: "paid" }, "PATCH"));
    expect(same).toMatchObject({ status: 409, body: { error: { code: "conflict" } } });
    const cancelled = await orderIn("cancelled");
    const revive = await raw(`/api/orders/${cancelled}/status`, json({ status: "packed" }, "PATCH"));
    expect(revive.status).toBe(400);
    const missing = await raw("/api/orders/999999/status", json({ status: "packed" }, "PATCH"));
    expect(missing.status).toBe(404);
  });

  it("refunds a delivered order and counts the refund today", async () => {
    const id = await orderIn("delivered");
    const day = dayKeyAt(TEST_NOW);
    const before = await count(sql`select refunds_cents::int n from daily_stats where day = ${day}::date`);
    const o = await (await api.orders[":number"].status.$patch({ param: { number: String(id) }, json: { status: "refunded" } })).json();
    const after = await count(sql`select refunds_cents::int n from daily_stats where day = ${day}::date`);
    expect(after - before).toBe(o.totalCents);
  });

  it("adds notes up to 280 characters", async () => {
    const id = await orderIn("shipped");
    const res = await api.orders[":number"].notes.$post({ param: { number: String(id) }, json: { message: "  Left with the neighbour.  " } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ type: "note", actor: "visitor", message: "Left with the neighbour." });
    expect((await raw(`/api/orders/${id}/notes`, json({ message: "x".repeat(281) }))).status).toBe(400);
    expect((await raw(`/api/orders/${id}/notes`, json({ message: "   " }))).status).toBe(400);
    expect((await raw("/api/orders/999999/notes", json({ message: "Hello" }))).status).toBe(404);
  });

  it("bulk-ships paid and packed orders and skips the rest", async () => {
    const paid = await orderIn("paid", 3);
    const packed = await orderIn("packed");
    const delivered = await orderIn("delivered", 5);
    const res = await api.orders.bulk.ship.$post({ json: { numbers: [paid, packed, delivered, 999999] } });
    const result = await res.json();
    expect(result.shipped).toEqual([paid, packed].sort((a, b) => a - b));
    expect(result.skipped).toEqual([delivered, 999999]);
    const timeline = (await (await api.orders[":number"].$get({ param: { number: String(paid) } })).json()).timeline;
    expect(timeline.slice(-2).map((t) => t.type)).toEqual(["packed", "shipped"]);

    expect((await raw("/api/orders/bulk/ship", json({ numbers: [paid, paid] }))).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, i) => 100001 + i);
    expect((await raw("/api/orders/bulk/ship", json({ numbers: tooMany }))).status).toBe(400);
  });

  it("restocks a variant and rejects bad quantities", async () => {
    const before = (await (await api.inventory.$get({ query: {} })).json()).rows[0];
    const res = await api.inventory[":sku"].restock.$post({ param: { sku: before.sku }, json: { quantity: 40 } });
    expect((await res.json()).onHand).toBe(before.onHand + 40);
    expect((await raw(`/api/inventory/${before.sku}/restock`, json({ quantity: 0 }))).status).toBe(400);
    expect((await raw(`/api/inventory/${before.sku}/restock`, json({ quantity: 501 }))).status).toBe(400);
    expect((await raw("/api/inventory/ZZZ-ZZZ-01/restock", json({ quantity: 5 }))).status).toBe(404);
    expect((await raw("/api/inventory/not-a-sku/restock", json({ quantity: 5 }))).status).toBe(400);
  });

  it("keeps the rollups exact after visitor writes", async () => {
    const statuses = await count(sql`select count(*)::int n from (
      (select (placed_at at time zone 'Europe/Lisbon')::date, status, count(*)::int from orders group by 1, 2)
      except (select day, status, orders from daily_status_stats where orders <> 0)) x`);
    expect(statuses).toBe(0);
  });
});

describe("GET /api/stream/orders", () => {
  const feed = () =>
    createApp({
      getDbHandle: async () => handle,
      now: () => TEST_NOW,
      liveFeed: { durationMs: 40, tickMs: 5 },
    });

  function parse(text: string) {
    return text
      .split("\n\n")
      .filter((block) => block.trim() && !block.startsWith(":"))
      .map((block) => {
        const field = (name: string) =>
          block.split("\n").find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim();
        return { id: field("id"), event: field("event"), data: field("data"), retry: field("retry") };
      });
  }

  it("streams orders after the given number, then asks the client to reconnect", async () => {
    const [{ max }] = await rows<{ max: number }>(handle.db, sql`select max(id)::int max from orders`);
    const res = await feed().request(`/api/stream/orders?after=${max - 3}`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parse(await res.text());
    expect(events.filter((e) => e.event === "order").map((e) => Number(e.id))).toEqual([max - 2, max - 1, max]);
    expect(JSON.parse(events.find((e) => e.event === "order")?.data ?? "{}").number).toBe(max - 2);
    const kpi = events.filter((e) => e.event === "kpi");
    expect(kpi).toHaveLength(1);
    expect(JSON.parse(kpi[0].data ?? "{}")).toMatchObject({ day: dayKeyAt(TEST_NOW) });
    expect(events.at(-1)).toMatchObject({ event: "close", retry: "1000" });
  });

  it("loses and repeats nothing across a reconnect with Last-Event-ID", async () => {
    const [{ max }] = await rows<{ max: number }>(handle.db, sql`select max(id)::int max from orders`);
    const first = await feed().request(`/api/stream/orders?after=${max - 2}`);
    const seen = parse(await first.text()).filter((e) => e.event === "order").map((e) => Number(e.id));
    expect(seen).toEqual([max - 1, max]);
    const again = await feed().request("/api/stream/orders", { headers: { "last-event-id": String(max) } });
    expect(parse(await again.text()).filter((e) => e.event === "order")).toEqual([]);
  });

  it("starts at the newest order when told nothing, and caps a backlog at 50 a tick", async () => {
    const fresh = parse(await (await feed().request("/api/stream/orders")).text());
    expect(fresh.filter((e) => e.event === "order")).toEqual([]);
    const [{ max }] = await rows<{ max: number }>(handle.db, sql`select max(id)::int max from orders`);
    const slow = createApp({
      getDbHandle: async () => handle,
      now: () => TEST_NOW,
      liveFeed: { durationMs: 1, tickMs: 5 },
    });
    const backlog = parse(await (await slow.request(`/api/stream/orders?after=${max - 80}`)).text());
    const ids = backlog.filter((e) => e.event === "order").map((e) => Number(e.id));
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe(max - 79);
  });
});

describe("limits and admin", () => {
  it("fails a write on request, without writing, so the UI can prove its rollback", async () => {
    const id = await orderIn("shipped", 3);
    const res = await raw(`/api/orders/${id}/status`, {
      ...json({ status: "delivered" }, "PATCH"),
      headers: { "content-type": "application/json", "x-simulate-failure": "1" },
    });
    expect(res).toMatchObject({ status: 500, body: { error: { code: "internal" } } });
    const after = await (await api.orders[":number"].$get({ param: { number: String(id) } })).json();
    expect(after.status).toBe("shipped");
  });

  it("allows a set number of writes per minute, then answers 429", async () => {
    const strict = createApp({ getDbHandle: async () => handle, now: () => TEST_NOW, writesPerMinute: 2 });
    const id = await orderIn("shipped", 2);
    const note = () =>
      strict.request(`/api/orders/${id}/notes`, json({ message: "Checked" }));
    expect((await note()).status).toBe(201);
    expect((await note()).status).toBe(201);
    const third = await note();
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("60");
    expect(await third.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("protects the reset with the token and reverts visitor changes", async () => {
    expect((await raw("/api/admin/reset", { method: "POST" })).status).toBe(401);
    expect(
      (await raw("/api/admin/reset", { method: "POST", headers: { authorization: "Bearer wrong" } })).status,
    ).toBe(401);
    const touched = await count(sql`select count(*)::int n from orders where visitor_touched_at is not null`);
    expect(touched).toBeGreaterThan(0);
    const res = await raw("/api/admin/reset", { method: "POST", headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    expect(res.body.revertedOrders).toBe(touched);
    expect(await count(sql`select count(*)::int n from orders where visitor_touched_at is not null`)).toBe(0);

    const closed = createApp({ getDbHandle: async () => handle, now: () => TEST_NOW });
    expect((await closed.request("/api/admin/reset", { method: "POST" })).status).toBe(404);
  });
});
