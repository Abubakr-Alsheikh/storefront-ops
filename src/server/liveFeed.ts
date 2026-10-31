import { eq } from "drizzle-orm";
import type { SSEStreamingApi } from "hono/streaming";
import type { LiveKpi, LiveReady } from "@/lib/contracts/orders";
import { dayKeyAt } from "@/lib/tz";
import type { Db } from "./db/client";
import { dailyStats } from "./db/schema";
import { newestOrderNumber, ordersAfter } from "./queries/orders";
import { catchUp } from "./sim/catchUp";

/**
 * The live order feed over server-sent events (DATA.md §8). Netlify cuts a
 * function's response at 30 seconds, so a stream lasts 25, then tells the
 * client to reconnect; EventSource resumes with `Last-Event-ID`,
 * and the client sees one unbroken feed.
 */

export interface LiveFeedTiming {
  /** How long one stream lasts. */
  durationMs: number;
  tickMs: number;
  pingEveryMs: number;
  /** Statuses move on a scale of hours; there is no need to do it every tick. */
  advanceEveryMs: number;
}

const DEFAULT_TIMING: LiveFeedTiming = {
  durationMs: 25_000,
  tickMs: 2_000,
  pingEveryMs: 15_000,
  advanceEveryMs: 60_000,
};

/** Most orders sent per tick; a longer backlog drains over the next ticks. */
const MAX_ORDERS_PER_TICK = 50;

export interface LiveFeedOptions {
  db: Db;
  now: () => number;
  /** The last order number the client has, if any. */
  after: number | undefined;
  catchUpOnTick: boolean;
  timing?: Partial<LiveFeedTiming>;
}

async function todayTotals(db: Db, now: number): Promise<LiveKpi> {
  const day = dayKeyAt(now);
  const [row] = await db
    .select({
      orders: dailyStats.orders,
      revenueCents: dailyStats.revenueCents,
      sessions: dailyStats.sessions,
    })
    .from(dailyStats)
    .where(eq(dailyStats.day, day));
  return { day, orders: row?.orders ?? 0, revenueCents: row?.revenueCents ?? 0, sessions: row?.sessions ?? 0 };
}

export async function runLiveFeed(stream: SSEStreamingApi, options: LiveFeedOptions): Promise<void> {
  const { db, now, catchUpOnTick } = options;
  const timing = { ...DEFAULT_TIMING, ...options.timing };

  let open = true;
  stream.onAbort(() => {
    open = false;
  });

  const started = performance.now();
  let lastPing = started;
  let lastAdvance = 0;
  let lastKpi = "";
  let last = options.after ?? null;
  let ready = false;

  do {
    // A hiccup must not end the stream silently: log it and try next tick.
    try {
      if (catchUpOnTick) {
        const tick = performance.now();
        const advance = lastAdvance === 0 || tick - lastAdvance >= timing.advanceEveryMs;
        await catchUp(db, now(), { advance });
        if (advance) lastAdvance = tick;
      }
      last ??= await newestOrderNumber(db);
      if (!ready) {
        const data: LiveReady = { last };
        await stream.writeSSE({ id: String(last), event: "ready", data: JSON.stringify(data) });
        ready = true;
      }
      for (const order of await ordersAfter(db, last, MAX_ORDERS_PER_TICK)) {
        await stream.writeSSE({ id: String(order.number), event: "order", data: JSON.stringify(order) });
        last = order.number;
      }
      // Sessions creep up every second; only a new order is worth an event.
      const kpi = await todayTotals(db, now());
      const kpiKey = `${kpi.day}|${kpi.orders}|${kpi.revenueCents}`;
      if (kpiKey !== lastKpi) {
        await stream.writeSSE({ event: "kpi", data: JSON.stringify(kpi) });
        lastKpi = kpiKey;
      }
    } catch (error) {
      console.error("[storefront] live feed tick failed", error);
    }
    if (performance.now() - lastPing >= timing.pingEveryMs) {
      await stream.write(": ping\n\n");
      lastPing = performance.now();
    }
    if (performance.now() - started < timing.durationMs) await stream.sleep(timing.tickMs);
  } while (open && performance.now() - started < timing.durationMs);

  if (open) await stream.writeSSE({ event: "close", data: "{}", retry: 1000 });
}
