import { sql } from "drizzle-orm";
import { RETENTION_DAYS } from "@/lib/ranges";
import { STORE_TIME_ZONE, dayKeyFromNumber, zonedParts } from "@/lib/tz";
import { rows, type Db } from "../db/client";
import { catchUp } from "./catchUp";

/**
 * The nightly reset (DATA.md §4): catch up, undo every visitor change, trim
 * old history and rebuild the stats the visitors could have moved. Each step
 * is a single statement, so a failure part-way leaves consistent data and
 * the next run finishes the job.
 */

const DAY_MS = 86_400_000;

/** Daily stats live twice as long as orders, so "Last 90 days" has a previous period. */
export const STATS_RETENTION_DAYS = 2 * RETENTION_DAYS;

export interface ResetOptions {
  /** Days of orders to keep (tests shrink it). */
  retentionDays?: number;
}

export interface ResetReport {
  inserted: number;
  revertedOrders: number;
  revertedAdjustments: number;
  trimmedOrders: number;
  ms: number;
}

function ts(ms: number) {
  return sql`${new Date(ms).toISOString()}::timestamptz`;
}

/** Puts visitor-touched orders back on their plans, timeline included. */
async function revertOrders(db: Db, now: number): Promise<number> {
  const at = ts(now);
  const [result] = await rows<{ n: number }>(
    db,
    sql`
    WITH touched AS (
      UPDATE orders SET
        visitor_touched_at = NULL,
        status = CASE
          WHEN plan_cancelled_at IS NOT NULL AND plan_cancelled_at <= ${at} THEN 'cancelled'
          WHEN plan_refunded_at IS NOT NULL AND plan_refunded_at <= ${at} THEN 'refunded'
          WHEN plan_delivered_at IS NOT NULL AND plan_delivered_at <= ${at} THEN 'delivered'
          WHEN plan_shipped_at IS NOT NULL AND plan_shipped_at <= ${at} THEN 'shipped'
          WHEN plan_packed_at IS NOT NULL AND plan_packed_at <= ${at} THEN 'packed'
          ELSE 'paid'
        END
      WHERE visitor_touched_at IS NOT NULL
      RETURNING id, plan_packed_at, plan_shipped_at, plan_delivered_at,
        plan_cancelled_at, plan_refunded_at
    ),
    cleared AS (
      DELETE FROM order_events e USING touched t
      WHERE e.order_id = t.id
    ),
    replanned AS (
      INSERT INTO order_events (order_id, type, actor, created_at)
      SELECT id, type, 'system', at FROM (
        SELECT id, 'cancelled' AS type, plan_cancelled_at AS at FROM touched
        UNION ALL SELECT id, 'packed', plan_packed_at FROM touched
        UNION ALL SELECT id, 'shipped', plan_shipped_at FROM touched
        UNION ALL SELECT id, 'delivered', plan_delivered_at FROM touched
        UNION ALL SELECT id, 'refunded', plan_refunded_at FROM touched
      ) steps
      WHERE at IS NOT NULL AND at <= ${at}
      ORDER BY at
    )
    SELECT count(*)::int AS n FROM touched`,
  );
  // Visitor events on untouched orders should not exist; remove any stragglers.
  await db.execute(sql`DELETE FROM order_events WHERE actor = 'visitor'`);
  return result.n;
}

/** Drops visitor restocks and recomputes stock from its parts. */
async function revertStock(db: Db): Promise<number> {
  const [result] = await rows<{ n: number }>(
    db,
    sql`
    WITH removed AS (
      DELETE FROM stock_adjustments WHERE actor = 'visitor' RETURNING variant_id
    ),
    recomputed AS (
      UPDATE variants v SET stock_on_hand = v.opening_stock - v.units_sold + coalesce(
        (SELECT sum(delta) FROM stock_adjustments a WHERE a.variant_id = v.id AND a.actor = 'system'), 0)
    )
    SELECT count(*)::int AS n FROM removed`,
  );
  return result.n;
}

/** Deletes orders, stats and customers past their retention. */
async function trim(db: Db, now: number, retentionDays: number): Promise<number> {
  const [result] = await rows<{ n: number }>(
    db,
    sql`
    WITH gone AS (
      DELETE FROM orders WHERE placed_at < ${ts(now - retentionDays * DAY_MS)} RETURNING id
    )
    SELECT count(*)::int AS n FROM gone`,
  );
  const statsCutoff = dayKeyFromNumber(zonedParts(now).dayNumber - 2 * retentionDays);
  await db.execute(sql`DELETE FROM daily_stats WHERE day < ${statsCutoff}::date`);
  await db.execute(sql`DELETE FROM restock_runs WHERE ran_at < ${ts(now - 2 * retentionDays * DAY_MS)}`);
  await db.execute(sql`
    DELETE FROM customers c
    WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`);
  return result.n;
}

/**
 * Rebuilds order-derived columns of daily_stats for the days whose orders
 * are all still present. Sessions come from the simulator and stay as they are.
 */
async function rebuildRecentStats(db: Db, now: number, retentionDays: number): Promise<void> {
  const firstDay = dayKeyFromNumber(zonedParts(now).dayNumber - retentionDays + 1);
  await db.execute(sql`
    WITH placed AS (
      SELECT (placed_at AT TIME ZONE ${STORE_TIME_ZONE})::date AS day,
        count(*)::int AS orders, sum(total_cents)::int AS revenue, sum(item_count)::int AS units,
        (count(*) FILTER (WHERE NOT is_returning))::int AS new_customers
      FROM orders
      WHERE placed_at >= (${firstDay}::date::timestamp AT TIME ZONE ${STORE_TIME_ZONE})
      GROUP BY 1
    ),
    refunds AS (
      SELECT (e.created_at AT TIME ZONE ${STORE_TIME_ZONE})::date AS day, sum(o.total_cents)::int AS refunds
      FROM order_events e JOIN orders o ON o.id = e.order_id
      WHERE e.type = 'refunded'
        AND e.created_at >= (${firstDay}::date::timestamp AT TIME ZONE ${STORE_TIME_ZONE})
      GROUP BY 1
    ),
    merged AS (
      SELECT coalesce(p.day, r.day) AS day, coalesce(p.orders, 0) AS orders,
        coalesce(p.revenue, 0) AS revenue, coalesce(p.units, 0) AS units,
        coalesce(p.new_customers, 0) AS new_customers, coalesce(r.refunds, 0) AS refunds
      FROM placed p FULL JOIN refunds r ON r.day = p.day
    )
    INSERT INTO daily_stats (day, orders, revenue_cents, units, new_customers, refunds_cents)
    SELECT day, orders, revenue, units, new_customers, refunds FROM merged
    ON CONFLICT (day) DO UPDATE SET
      orders = excluded.orders,
      revenue_cents = excluded.revenue_cents,
      units = excluded.units,
      new_customers = excluded.new_customers,
      refunds_cents = excluded.refunds_cents`);
}

export async function resetDemo(
  db: Db,
  now: number = Date.now(),
  { retentionDays = RETENTION_DAYS }: ResetOptions = {},
): Promise<ResetReport> {
  const started = performance.now();
  // The nightly job also closes gaps older than the live catch-up's 26 hours.
  const { inserted } = await catchUp(db, now, { capMs: retentionDays * DAY_MS });
  const revertedOrders = await revertOrders(db, now);
  const revertedAdjustments = await revertStock(db);
  const trimmedOrders = await trim(db, now, retentionDays);
  await rebuildRecentStats(db, now, retentionDays);
  return {
    inserted,
    revertedOrders,
    revertedAdjustments,
    trimmedOrders,
    ms: performance.now() - started,
  };
}
