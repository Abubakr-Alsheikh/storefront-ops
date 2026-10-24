import { sql, type SQL } from "drizzle-orm";
import { elapsedEvents, statusAt } from "@/lib/sim/lifecycle";
import { firstOrderAt, simulateOrders, type SimOrder } from "@/lib/sim/orders";
import { daySessionsUntil } from "@/lib/sim/rate";
import { restockPlan, restocksBetween, VELOCITY_DAYS } from "@/lib/sim/supply";
import { STORE_TIME_ZONE, dayKeyAt, dayKeyFromNumber, zonedParts } from "@/lib/tz";
import { rows, type Db } from "../db/client";

/**
 * Writes simulated orders into the database (DATA.md §4).
 *
 * Every write is one SQL statement built from data-modifying CTEs, so it is
 * atomic on both drivers without an interactive transaction (Neon's HTTP
 * driver has none). Every write is also idempotent: orders conflict on
 * `sim_key`, and the counters (units sold, stock, daily stats) move only by
 * the rows a statement actually inserted, read back through RETURNING. Two
 * catch-ups racing over the same window therefore write each order once.
 */

const BATCH_SIZE = 500;
const SEGMENT_MS = 6 * 3_600_000;

/** A UTC instant as a timestamptz literal both drivers accept. */
function ts(ms: number): SQL {
  return sql`${new Date(ms).toISOString()}::timestamptz`;
}

function json(value: unknown): SQL {
  return sql`${JSON.stringify(value)}::jsonb`;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function orderRows(batch: SimOrder[], asOf: number) {
  return batch.map((o) => ({
    sim_key: o.simKey,
    customer_id: o.customer.id,
    customer_name: o.customer.name,
    customer_email: o.customer.email,
    customer_since: iso(firstOrderAt(o.customer.id)),
    country: o.country,
    city: o.customer.city,
    status: statusAt(o.plan, asOf),
    payment_method: o.paymentMethod,
    subtotal_cents: o.subtotalCents,
    discount_cents: o.discountCents,
    discount_code: o.discountCode,
    shipping_cents: o.shippingCents,
    tax_cents: o.taxCents,
    total_cents: o.totalCents,
    item_count: o.itemCount,
    is_returning: o.isReturning,
    placed_at: iso(o.placedAt),
    plan_paid_at: iso(o.plan.paidAt),
    plan_packed_at: iso(o.plan.packedAt),
    plan_shipped_at: iso(o.plan.shippedAt),
    plan_delivered_at: iso(o.plan.deliveredAt),
    plan_cancelled_at: iso(o.plan.cancelledAt),
    plan_refunded_at: iso(o.plan.refundedAt),
    plan_outcome: o.plan.outcome,
    day: dayKeyAt(o.placedAt),
    refund_day:
      o.plan.refundedAt !== null && o.plan.refundedAt <= asOf ? dayKeyAt(o.plan.refundedAt) : null,
  }));
}

/** Inserts one batch with its customers, items, events, stock and daily stats. */
async function insertBatch(db: Db, batch: SimOrder[], asOf: number): Promise<number> {
  const items = batch.flatMap((o) =>
    o.items.map((i) => ({
      sim_key: o.simKey,
      variant_id: i.variantId,
      quantity: i.quantity,
      unit_price_cents: i.unitPriceCents,
    })),
  );
  const events = batch.flatMap((o) =>
    elapsedEvents(o.plan, asOf).map((e) => ({
      sim_key: o.simKey,
      type: e.type,
      created_at: iso(e.at),
    })),
  );

  const [result] = await rows<{ inserted: number }>(
    db,
    sql`
    WITH o_in AS (
      SELECT * FROM jsonb_to_recordset(${json(orderRows(batch, asOf))}) AS x(
        sim_key text, customer_id int, customer_name text, customer_email text,
        customer_since timestamptz, country text, city text, status text, payment_method text,
        subtotal_cents int, discount_cents int, discount_code text, shipping_cents int,
        tax_cents int, total_cents int, item_count int, is_returning boolean,
        placed_at timestamptz, plan_paid_at timestamptz, plan_packed_at timestamptz,
        plan_shipped_at timestamptz, plan_delivered_at timestamptz,
        plan_cancelled_at timestamptz, plan_refunded_at timestamptz, plan_outcome text,
        day date, refund_day date)
    ),
    i_in AS (
      SELECT * FROM jsonb_to_recordset(${json(items)}) AS x(
        sim_key text, variant_id int, quantity int, unit_price_cents int)
    ),
    e_in AS (
      SELECT * FROM jsonb_to_recordset(${json(events)}) AS x(
        sim_key text, type text, created_at timestamptz)
    ),
    new_orders AS (
      INSERT INTO orders (
        sim_key, customer_id, customer_name, customer_email, country, city, status,
        payment_method, subtotal_cents, discount_cents, discount_code, shipping_cents,
        tax_cents, total_cents, item_count, is_returning, placed_at, plan_paid_at,
        plan_packed_at, plan_shipped_at, plan_delivered_at, plan_cancelled_at,
        plan_refunded_at, plan_outcome)
      SELECT
        sim_key, customer_id, customer_name, customer_email, country, city, status,
        payment_method, subtotal_cents, discount_cents, discount_code, shipping_cents,
        tax_cents, total_cents, item_count, is_returning, placed_at, plan_paid_at,
        plan_packed_at, plan_shipped_at, plan_delivered_at, plan_cancelled_at,
        plan_refunded_at, plan_outcome
      FROM o_in ORDER BY placed_at, sim_key
      ON CONFLICT (sim_key) DO NOTHING
      RETURNING id, sim_key
    ),
    inserted AS (
      SELECT n.id, o.* FROM new_orders n JOIN o_in o USING (sim_key)
    ),
    -- The FK from orders to customers is checked at the end of the statement,
    -- so customers can be written from the orders that were actually inserted.
    new_customers AS (
      INSERT INTO customers (id, name, email, country, city, created_at,
        orders_count, lifetime_cents, last_order_at)
      SELECT customer_id, min(customer_name), min(customer_email), min(country), min(city),
        min(customer_since), count(*)::int, sum(total_cents)::int, max(placed_at)
      FROM inserted GROUP BY customer_id
      ON CONFLICT (id) DO UPDATE SET
        orders_count = customers.orders_count + excluded.orders_count,
        lifetime_cents = customers.lifetime_cents + excluded.lifetime_cents,
        last_order_at = GREATEST(customers.last_order_at, excluded.last_order_at)
    ),
    new_items AS (
      INSERT INTO order_items (order_id, variant_id, quantity, unit_price_cents)
      SELECT n.id, i.variant_id, i.quantity, i.unit_price_cents
      FROM i_in i JOIN new_orders n USING (sim_key)
      RETURNING order_id, variant_id, quantity, unit_price_cents
    ),
    new_events AS (
      INSERT INTO order_events (order_id, type, actor, created_at)
      SELECT n.id, e.type, 'system', e.created_at
      FROM e_in e JOIN new_orders n USING (sim_key)
      ORDER BY e.created_at
    ),
    sold AS (
      UPDATE variants v
      SET units_sold = v.units_sold + s.units, stock_on_hand = v.stock_on_hand - s.units
      FROM (SELECT variant_id, sum(quantity)::int AS units FROM new_items GROUP BY variant_id) s
      WHERE v.id = s.variant_id
    ),
    deltas AS (
      SELECT day, 1 AS orders, total_cents AS revenue, 0 AS units,
        (NOT is_returning)::int AS new_customers, 0 AS refunds
      FROM inserted
      UNION ALL
      SELECT o.day, 0, 0, i.quantity, 0, 0
      FROM new_items i JOIN inserted o ON o.id = i.order_id
      UNION ALL
      SELECT refund_day, 0, 0, 0, 0, total_cents FROM inserted WHERE refund_day IS NOT NULL
    ),
    stats AS (
      INSERT INTO daily_stats (day, orders, revenue_cents, units, new_customers, refunds_cents)
      SELECT day, sum(orders), sum(revenue), sum(units), sum(new_customers), sum(refunds)
      FROM deltas GROUP BY day
      ON CONFLICT (day) DO UPDATE SET
        orders = daily_stats.orders + excluded.orders,
        revenue_cents = daily_stats.revenue_cents + excluded.revenue_cents,
        units = daily_stats.units + excluded.units,
        new_customers = daily_stats.new_customers + excluded.new_customers,
        refunds_cents = daily_stats.refunds_cents + excluded.refunds_cents
    ),
    variant_stats AS (
      INSERT INTO daily_variant_stats (day, variant_id, units, revenue_cents)
      SELECT o.day, i.variant_id, sum(i.quantity)::int, sum(i.quantity * i.unit_price_cents)::int
      FROM new_items i JOIN inserted o ON o.id = i.order_id
      GROUP BY 1, 2
      ON CONFLICT (day, variant_id) DO UPDATE SET
        units = daily_variant_stats.units + excluded.units,
        revenue_cents = daily_variant_stats.revenue_cents + excluded.revenue_cents
    ),
    country_stats AS (
      INSERT INTO daily_country_stats (day, country, orders, revenue_cents)
      SELECT day, country, count(*)::int, sum(total_cents)::int FROM inserted GROUP BY 1, 2
      ON CONFLICT (day, country) DO UPDATE SET
        orders = daily_country_stats.orders + excluded.orders,
        revenue_cents = daily_country_stats.revenue_cents + excluded.revenue_cents
    ),
    status_stats AS (
      INSERT INTO daily_status_stats (day, status, orders)
      SELECT day, status, count(*)::int FROM inserted GROUP BY 1, 2
      ON CONFLICT (day, status) DO UPDATE SET
        orders = daily_status_stats.orders + excluded.orders
    ),
    counted AS (
      UPDATE sim_state SET orders_total = orders_total + (SELECT count(*) FROM new_orders)
      WHERE id = 1
    )
    SELECT count(*)::int AS inserted FROM new_orders`,
  );
  return result.inserted;
}

/** Inserts orders in time order, in batches; returns how many were new. */
export async function insertOrders(db: Db, orders: SimOrder[], asOf: number): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    inserted += await insertBatch(db, orders.slice(i, i + BATCH_SIZE), asOf);
  }
  return inserted;
}

/**
 * Sessions so far for each local day that `(fromMs, toMs]` touches. The
 * value only grows with time, so GREATEST() makes repeats and races harmless.
 */
export async function upsertSessions(db: Db, fromMs: number, toMs: number): Promise<void> {
  const first = zonedParts(fromMs).dayNumber;
  const last = zonedParts(toMs).dayNumber;
  const days = [];
  for (let d = first; d <= last; d++) {
    days.push({ day: dayKeyFromNumber(d), sessions: daySessionsUntil(d, toMs) });
  }
  await db.execute(sql`
    INSERT INTO daily_stats (day, sessions)
    SELECT day, sessions FROM jsonb_to_recordset(${json(days)}) AS x(day date, sessions int)
    ON CONFLICT (day) DO UPDATE SET sessions = GREATEST(daily_stats.sessions, excluded.sessions)`);
}

/**
 * The Monday supplier delivery for `week` at instant `at`. Brings each
 * variant up to its 14-day velocity × the week's cover. The `restock_runs`
 * claim in the same statement makes it run once per week, however many
 * catch-ups reach the instant.
 */
export async function runRestock(db: Db, at: number, week: number): Promise<void> {
  await db.execute(sql`
    WITH plan AS (
      SELECT * FROM jsonb_to_recordset(${json(restockPlan(week))}) AS p(
        variant_id int, cover float8, expected_daily float8)
    ),
    claim AS (
      INSERT INTO restock_runs (week, ran_at) VALUES (${week}, ${ts(at)})
      ON CONFLICT (week) DO NOTHING
      RETURNING week
    ),
    history AS (
      SELECT LEAST(${VELOCITY_DAYS}, extract(epoch FROM (${ts(at)} - min(placed_at))) / 86400)::float8 AS days
      FROM orders
    ),
    velocity AS (
      SELECT oi.variant_id, sum(oi.quantity)::float8 AS units
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.placed_at > ${ts(at)} - make_interval(days => ${VELOCITY_DAYS})
        AND o.placed_at <= ${ts(at)}
      GROUP BY oi.variant_id
    ),
    wanted AS (
      SELECT v.id, GREATEST(0, ceil(p.cover * 7 *
        CASE WHEN h.days >= 3 THEN coalesce(vel.units, 0) / h.days ELSE p.expected_daily END
      ) - v.stock_on_hand)::int AS qty
      FROM variants v
      JOIN plan p ON p.variant_id = v.id
      CROSS JOIN history h
      LEFT JOIN velocity vel ON vel.variant_id = v.id
      WHERE EXISTS (SELECT 1 FROM claim)
    ),
    adjusted AS (
      INSERT INTO stock_adjustments (variant_id, delta, reason, actor, created_at)
      SELECT id, qty, 'restock', 'system', ${ts(at)} FROM wanted WHERE qty > 0
      RETURNING variant_id, delta
    )
    UPDATE variants v SET stock_on_hand = v.stock_on_hand + a.delta
    FROM adjusted a WHERE v.id = a.variant_id`);
}

/**
 * A CTE named `status_moves` that shifts daily_status_stats for the rows of a
 * CTE named `moved` (which must return `placed_at`) from one status to another.
 */
export function statusMoves(from: string, to: string): SQL {
  return sql`status_moves AS (
    INSERT INTO daily_status_stats (day, status, orders)
    SELECT day, status, sum(delta)::int FROM (
      SELECT (placed_at AT TIME ZONE ${STORE_TIME_ZONE})::date AS day, ${from}::text AS status, -1 AS delta FROM moved
      UNION ALL
      SELECT (placed_at AT TIME ZONE ${STORE_TIME_ZONE})::date, ${to}::text, 1 FROM moved
    ) x GROUP BY 1, 2
    ON CONFLICT (day, status) DO UPDATE SET orders = daily_status_stats.orders + excluded.orders
  )`;
}

/** One lifecycle step: rows in `from` whose planned time for `to` has passed. */
const STEPS = [
  { from: "paid", to: "cancelled", column: "plan_cancelled_at" },
  { from: "paid", to: "packed", column: "plan_packed_at" },
  { from: "packed", to: "shipped", column: "plan_shipped_at" },
  { from: "shipped", to: "delivered", column: "plan_delivered_at" },
  { from: "delivered", to: "refunded", column: "plan_refunded_at" },
] as const;

/**
 * Moves orders along their plans up to `now`, one step per statement, each
 * with its timeline event. A row lock plus the `status = from` check means
 * racing runs move a row once, and nothing ever moves backward: a visitor
 * change that already went further simply stops matching.
 */
export async function advanceLifecycles(db: Db, now: number): Promise<number> {
  let moved = 0;
  for (const step of STEPS) {
    const column = sql.identifier(step.column);
    const refundStats =
      step.to === "refunded"
        ? sql`, stats AS (
            INSERT INTO daily_stats (day, refunds_cents)
            SELECT (at AT TIME ZONE ${STORE_TIME_ZONE})::date, sum(total_cents)::int
            FROM moved GROUP BY 1
            ON CONFLICT (day) DO UPDATE
            SET refunds_cents = daily_stats.refunds_cents + excluded.refunds_cents
          )`
        : sql``;
    const [result] = await rows<{ moved: number }>(
      db,
      sql`
      WITH moved AS (
        UPDATE orders SET status = ${step.to}
        WHERE status = ${step.from} AND ${column} <= ${ts(now)}
        RETURNING id, ${column} AS at, total_cents, placed_at
      ),
      events AS (
        INSERT INTO order_events (order_id, type, actor, created_at)
        SELECT id, ${step.to}, 'system', at FROM moved
      ),
      ${statusMoves(step.from, step.to)}${refundStats}
      SELECT count(*)::int AS moved FROM moved`,
    );
    moved += result.moved;
  }
  return moved;
}

/**
 * Materialises every order placed in `(fromMs, toMs]`, with lifecycles as of
 * `asOf`. Works in segments of at most six hours that also break at each
 * Monday delivery, so a restock sees exactly the orders placed before it.
 */
export async function materialiseRange(
  db: Db,
  fromMs: number,
  toMs: number,
  asOf: number,
): Promise<number> {
  const restocks = restocksBetween(fromMs, toMs);
  let inserted = 0;
  let start = fromMs;
  while (start < toMs) {
    const restock = restocks[0];
    const end = Math.min(start + SEGMENT_MS, toMs, restock?.at ?? Infinity);
    inserted += await insertOrders(db, simulateOrders(start, end), asOf);
    await upsertSessions(db, start, end);
    if (restock && end === restock.at) {
      await runRestock(db, restock.at, restock.week);
      restocks.shift();
    }
    start = end;
  }
  return inserted;
}
