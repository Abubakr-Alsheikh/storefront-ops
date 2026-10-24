import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VARIANTS } from "@/lib/data/catalogue";
import { statusAt } from "@/lib/sim/lifecycle";
import { simulateOrders } from "@/lib/sim/orders";
import { startOfDayNumber, zonedParts } from "@/lib/tz";
import { TEST_DAYS, TEST_NOW, seededTestDb } from "@/test/db";
import { rows, type Db, type DbHandle } from "../db/client";
import { catchUp, readSimState } from "./catchUp";
import { advanceLifecycles, materialiseRange, statusMoves } from "./materialise";

const HOUR = 3_600_000;
const STATUS_RANK = { paid: 0, packed: 1, shipped: 2, delivered: 3, cancelled: 3, refunded: 4 };

let handle: DbHandle;
let db: Db;

beforeAll(async () => {
  handle = await seededTestDb();
  db = handle.db;
}, 60_000);
afterAll(() => handle.close());

/** Totals that every write must keep consistent with each other. */
async function totals(database: Db) {
  const [orders] = await rows<{ n: number; revenue: number; keys: number }>(
    database,
    sql`select count(*)::int n, coalesce(sum(total_cents), 0)::bigint::float8 revenue,
      count(distinct sim_key)::int keys from orders`,
  );
  const [items] = await rows<{ units: number }>(
    database,
    sql`select coalesce(sum(quantity), 0)::int units from order_items`,
  );
  const [stats] = await rows<{ orders: number; revenue: number; units: number }>(
    database,
    sql`select coalesce(sum(orders), 0)::int orders, coalesce(sum(revenue_cents), 0)::float8 revenue,
      coalesce(sum(units), 0)::int units from daily_stats where day >= (
        select min((placed_at at time zone 'Europe/Lisbon')::date) from orders)`,
  );
  const [stock] = await rows<{ sold: number; broken: number }>(
    database,
    sql`select coalesce(sum(units_sold), 0)::int sold,
      count(*) filter (where stock_on_hand <> opening_stock - units_sold +
        coalesce((select sum(delta) from stock_adjustments a where a.variant_id = v.id), 0))::int broken
      from variants v`,
  );
  // Rollups and customer aggregates must agree with the raw rows exactly.
  const [rollups] = await rows<{ variants: number; countries: number; statuses: number; customers: number }>(
    database,
    sql`with first as (select min((placed_at at time zone 'Europe/Lisbon')::date) d from orders)
      select
        (select count(*)::int from (
          select o.day, i.variant_id, sum(i.quantity) u, sum(i.quantity * i.unit_price_cents) r
          from order_items i join (select id, (placed_at at time zone 'Europe/Lisbon')::date as day from orders) o on o.id = i.order_id
          group by 1, 2
          except select day, variant_id, units, revenue_cents from daily_variant_stats, first where day >= first.d
        ) x) as variants,
        (select count(*)::int from (
          select (placed_at at time zone 'Europe/Lisbon')::date, country, count(*), sum(total_cents) from orders group by 1, 2
          except select day, country, orders, revenue_cents from daily_country_stats, first where day >= first.d
        ) x) as countries,
        (select count(*)::int from (
          (select (placed_at at time zone 'Europe/Lisbon')::date, status, count(*)::int from orders group by 1, 2)
          except (select day, status, orders from daily_status_stats where orders <> 0)
        ) x) + (select count(*)::int from daily_status_stats where orders < 0) as statuses,
        (select count(*)::int from customers c
          left join (select customer_id, count(*)::int n, sum(total_cents)::int ltv, max(placed_at) last
            from orders group by 1) a on a.customer_id = c.id
          where (c.orders_count, c.lifetime_cents, c.last_order_at)
            is distinct from (coalesce(a.n, 0), coalesce(a.ltv, 0), a.last)) as customers`,
  );
  const [counter] = await rows<{ drift: number }>(
    database,
    sql`select (select orders_total from sim_state) - (select count(*)::int from orders) as drift`,
  );
  return { orders, items, stats, stock, rollups: { ...rollups, counter: counter.drift } };
}

const CONSISTENT = { variants: 0, countries: 0, statuses: 0, customers: 0, counter: 0 };

describe("seed", () => {
  it("writes exactly the simulated orders, with matching counters", async () => {
    const today = zonedParts(TEST_NOW).dayNumber;
    const expected = simulateOrders(startOfDayNumber(today - TEST_DAYS), TEST_NOW);
    const t = await totals(db);
    expect(t.orders.n).toBe(expected.length);
    expect(t.orders.keys).toBe(expected.length);
    expect(t.orders.revenue).toBe(expected.reduce((s, o) => s + o.totalCents, 0));
    expect(t.items.units).toBe(expected.reduce((s, o) => s + o.itemCount, 0));
    expect(t.stats.orders).toBe(t.orders.n);
    expect(t.stats.revenue).toBe(t.orders.revenue);
    expect(t.stats.units).toBe(t.items.units);
    expect(t.stock.sold).toBe(t.items.units);
    expect(t.stock.broken).toBe(0);
    expect(t.rollups).toEqual(CONSISTENT);
  });

  it("numbers orders from 100001 in the order they were placed", async () => {
    const out = await rows<{ first: number; inversions: number }>(
      db,
      sql`select min(id)::int first, count(*) filter (where id < prev)::int inversions
        from (select id, lag(id) over (order by placed_at, sim_key) prev from orders) x`,
    );
    expect(out[0]).toEqual({ first: 100001, inversions: 0 });
  });

  it("stores statuses and timelines as of now", async () => {
    const sample = await rows<{ sim_key: string; status: string; events: number }>(
      db,
      sql`select o.sim_key, o.status, count(e.id)::int events
        from orders o left join order_events e on e.order_id = o.id
        group by o.id order by o.id limit 300`,
    );
    const byKey = new Map(simulateOrders(TEST_NOW - 4 * 24 * HOUR, TEST_NOW).map((o) => [o.simKey, o]));
    for (const row of sample) {
      const sim = byKey.get(row.sim_key);
      expect(sim).toBeDefined();
      if (!sim) continue;
      expect(row.status).toBe(statusAt(sim.plan, TEST_NOW));
    }
  });

  it("runs the Monday 09:00 delivery once and writes 180 days of stats", async () => {
    const runs = await rows<{ week: number }>(db, sql`select week from restock_runs`);
    expect(runs).toHaveLength(1);
    // Three days after a four-week opening stock, only the fast sellers need topping up.
    const [restocks] = await rows<{ n: number; variants: number; min: number }>(
      db,
      sql`select count(*)::int n, count(distinct variant_id)::int variants, min(delta)::int min
        from stock_adjustments where reason = 'restock' and actor = 'system'`,
    );
    expect(restocks.n).toBeGreaterThan(0);
    expect(restocks.n).toBe(restocks.variants);
    expect(restocks.n).toBeLessThan(VARIANTS.length);
    expect(restocks.min).toBeGreaterThan(0);
    const [days] = await rows<{ n: number }>(db, sql`select count(*)::int n from daily_stats`);
    expect(days.n).toBe(2 * TEST_DAYS + 1);
  });

  it("keeps sessions for every day and a believable conversion", async () => {
    const stats = await rows<{ orders: number; sessions: number }>(
      db,
      sql`select orders, sessions from daily_stats where orders > 0 order by day`,
    );
    for (const s of stats.slice(0, -1)) {
      const conversion = s.orders / s.sessions;
      expect(conversion).toBeGreaterThan(0.018);
      expect(conversion).toBeLessThan(0.032);
    }
  });
});

describe("catch-up", () => {
  it("adds the next hour, then nothing when run again", async () => {
    const later = TEST_NOW + HOUR;
    const before = await totals(db);
    const t0 = performance.now();
    const first = await catchUp(db, later);
    const ms = performance.now() - t0;
    const expected = simulateOrders(TEST_NOW, later).length;
    expect(first.inserted).toBe(expected);
    // Sanity ceiling; `npm run bench:sim` measures the 300 ms budget alone.
    expect(ms).toBeLessThan(3000);

    const after = await totals(db);
    expect(after.orders.n).toBe(before.orders.n + expected);

    const second = await catchUp(db, later);
    expect(second.inserted).toBe(0);
    expect(second.moved).toBe(0);
    expect(await totals(db)).toEqual(after);
    expect((await readSimState(db))?.materialisedUntil.getTime()).toBe(later);
  });

  it("writes each order once when two catch-ups race over the same window", async () => {
    const from = TEST_NOW + HOUR;
    const to = from + 3 * HOUR;
    const before = await totals(db);
    const [a, b] = await Promise.all([
      materialiseRange(db, from, to, to),
      materialiseRange(db, from, to, to),
    ]);
    const expected = simulateOrders(from, to).length;
    expect(a + b).toBe(expected);
    const after = await totals(db);
    expect(after.orders.n).toBe(before.orders.n + expected);
    expect(after.orders.keys).toBe(after.orders.n);
    expect(after.stats.orders).toBe(after.orders.n);
    expect(after.stats.units).toBe(after.items.units);
    expect(after.stock.broken).toBe(0);
    expect(after.rollups).toEqual(CONSISTENT);
  });

  it("only moves lifecycles forward, even past a visitor's change", async () => {
    // A visitor ships some paid orders early.
    await db.execute(sql`
      with moved as (
        update orders set status = 'shipped', visitor_touched_at = now()
        where id in (select id from orders where status = 'paid' order by id limit 20)
        returning placed_at
      ), ${statusMoves("paid", "shipped")}
      select 1`);
    const before = await rows<{ id: number; status: keyof typeof STATUS_RANK }>(
      db,
      sql`select id, status from orders`,
    );
    const moved = await advanceLifecycles(db, TEST_NOW + 3 * 24 * HOUR);
    expect(moved).toBeGreaterThan(0);
    const after = new Map(
      (await rows<{ id: number; status: keyof typeof STATUS_RANK }>(db, sql`select id, status from orders`)).map(
        (r) => [r.id, r.status],
      ),
    );
    for (const row of before) {
      const now = after.get(row.id);
      expect(now).toBeDefined();
      if (now) expect(STATUS_RANK[now]).toBeGreaterThanOrEqual(STATUS_RANK[row.status]);
    }
    // Every status change left exactly one event of that type.
    const [dupes] = await rows<{ n: number }>(
      db,
      sql`select count(*)::int n from (select order_id, type from order_events
        where type <> 'note' group by 1, 2 having count(*) > 1) x`,
    );
    expect(dupes.n).toBe(0);
    expect((await totals(db)).rollups).toEqual(CONSISTENT);
  });
});
