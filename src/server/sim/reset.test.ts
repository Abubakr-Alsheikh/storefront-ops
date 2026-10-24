import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_NOW, seededTestDb } from "@/test/db";
import { rows, type Db, type DbHandle } from "../db/client";
import { statusMoves } from "./materialise";
import { resetDemo } from "./reset";

let handle: DbHandle;
let db: Db;

beforeAll(async () => {
  handle = await seededTestDb();
  db = handle.db;
}, 60_000);
afterAll(() => handle.close());

/** Everything a visitor can change, in a form that compares exactly. */
async function snapshot(database: Db) {
  return {
    orders: await rows(database, sql`select id, status, visitor_touched_at from orders order by id`),
    events: await rows(
      database,
      sql`select order_id, type, actor, message, created_at from order_events
        order by order_id, created_at, type`,
    ),
    stock: await rows(database, sql`select id, stock_on_hand, units_sold from variants order by id`),
    adjustments: await rows(
      database,
      sql`select variant_id, delta, actor from stock_adjustments order by id`,
    ),
    stats: await rows(
      database,
      sql`select day::text, orders, revenue_cents, units, new_customers, refunds_cents, sessions
        from daily_stats order by day`,
    ),
    rollups: await rows(
      database,
      sql`select 'v' k, day::text, variant_id::text id, units a, revenue_cents b from daily_variant_stats
        union all select 'c', day::text, country, orders, revenue_cents from daily_country_stats
        union all select 's', day::text, status, orders, 0 from daily_status_stats where orders <> 0
        order by 1, 2, 3`,
    ),
    customers: await rows(
      database,
      sql`select id, orders_count, lifetime_cents, last_order_at from customers order by id`,
    ),
  };
}

describe("resetDemo", () => {
  it("reverts every visitor change and leaves system data as it was", async () => {
    // Settle first, so the comparison sees only visitor changes.
    await resetDemo(db, TEST_NOW);
    const before = await snapshot(db);

    // A visitor ships, cancels and refunds orders, writes notes and restocks.
    await db.execute(sql`
      with moved as (
        update orders set status = 'packed', visitor_touched_at = now()
        where id in (select id from orders where status = 'paid' order by id limit 5)
        returning placed_at
      ), ${statusMoves("paid", "packed")}
      select 1`);
    await db.execute(sql`
      insert into order_events (order_id, type, actor, created_at)
      select id, 'packed', 'visitor', now() from orders where visitor_touched_at is not null`);
    await db.execute(sql`
      with picked as (select id from orders where status = 'paid' order by id desc limit 2)
      update orders set status = 'cancelled', visitor_touched_at = now() where id in (select id from picked)`);
    await db.execute(sql`
      with picked as (select id from orders where status = 'delivered' order by id limit 2)
      update orders set status = 'refunded', visitor_touched_at = now() where id in (select id from picked)`);
    await db.execute(sql`
      insert into order_events (order_id, type, message, actor, created_at)
      select id, 'note', 'Customer called about delivery', 'visitor', now()
      from orders order by id limit 3`);
    await db.execute(sql`update orders set visitor_touched_at = now()
      where id in (select id from orders order by id limit 3)`);
    await db.execute(sql`
      insert into stock_adjustments (variant_id, delta, reason, actor, created_at)
      values (1, 120, 'restock', 'visitor', now()), (2, 40, 'restock', 'visitor', now())`);
    await db.execute(sql`update variants set stock_on_hand = stock_on_hand + 120 where id = 1`);
    await db.execute(sql`update variants set stock_on_hand = stock_on_hand + 40 where id = 2`);
    await db.execute(sql`update daily_stats set refunds_cents = refunds_cents + 9999
      where day = (select max(day) from daily_stats)`);

    expect(await snapshot(db)).not.toEqual(before);
    const [touched] = await rows<{ n: number }>(
      db,
      sql`select count(*)::int n from orders where visitor_touched_at is not null`,
    );
    expect(touched.n).toBeGreaterThanOrEqual(9);

    const report = await resetDemo(db, TEST_NOW);
    expect(report.inserted).toBe(0);
    expect(report.revertedOrders).toBe(touched.n);
    expect(report.revertedAdjustments).toBe(2);
    expect(report.trimmedOrders).toBe(0);
    expect(await snapshot(db)).toEqual(before);
  });

  it("trims orders past retention, with their items, events and customers", async () => {
    const [oldest] = await rows<{ day: string }>(
      db,
      sql`select min(placed_at)::date::text as day from orders`,
    );
    const report = await resetDemo(db, TEST_NOW, { retentionDays: 2 });
    expect(report.trimmedOrders).toBeGreaterThan(1000);
    const [left] = await rows<{ old: number; orphans: number; items: number; events: number }>(
      db,
      sql`select
        (select count(*)::int from orders where placed_at < ${new Date(TEST_NOW - 2 * 86_400_000).toISOString()}::timestamptz) as old,
        (select count(*)::int from customers c where not exists (select 1 from orders o where o.customer_id = c.id)) as orphans,
        (select count(*)::int from order_items i where not exists (select 1 from orders o where o.id = i.order_id)) as items,
        (select count(*)::int from order_events e where not exists (select 1 from orders o where o.id = e.order_id)) as events`,
    );
    expect(left).toEqual({ old: 0, orphans: 0, items: 0, events: 0 });
    expect(oldest.day).toBeDefined();
  });
});
