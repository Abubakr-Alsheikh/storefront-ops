import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import type {
  BulkShipResult,
  OrderDetail,
  OrderFilters,
  OrderRow,
  OrdersPage,
  OrdersQuery,
  TimelineEntry,
} from "@/lib/contracts/orders";
import type { CountryCode } from "@/lib/data/countries";
import { productById, variantById } from "@/lib/data/catalogue";
import {
  ALLOWED_TRANSITIONS,
  SHIPPABLE_STATUSES,
  canTransition,
  type Actor,
  type EventType,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/domain";
import { addressFor } from "@/lib/sim/customers";
import { STORE_TIME_ZONE, dayNumberFromKey, startOfDayNumber } from "@/lib/tz";
import { rows, type Db } from "../db/client";
import { customers, orderEvents, orderItems, orders, simState } from "../db/schema";
import { badRequest, conflict, notFound } from "../errors";
import { statusMoves } from "../sim/materialise";

const iso = (d: Date) => d.toISOString();
const ts = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`;

/** Escapes LIKE wildcards in user input. */
function likeContains(text: string): string {
  return `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The WHERE clause for a set of filters (DATA.md §7). */
export function orderWhere(f: OrderFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    f.status ? inArray(orders.status, f.status) : undefined,
    f.country ? inArray(orders.country, f.country) : undefined,
    f.payment ? inArray(orders.paymentMethod, f.payment) : undefined,
    f.from ? gte(orders.placedAt, new Date(startOfDayNumber(dayNumberFromKey(f.from)))) : undefined,
    f.to ? lt(orders.placedAt, new Date(startOfDayNumber(dayNumberFromKey(f.to) + 1))) : undefined,
    f.min !== undefined ? gte(orders.totalCents, f.min) : undefined,
    f.max !== undefined ? lte(orders.totalCents, f.max) : undefined,
  ];
  const q = f.q?.replace(/^#/, "").trim();
  if (q) conditions.push(sql`${orders.searchText} LIKE ${likeContains(q)}`);
  return and(...conditions);
}

const SORT_COLUMNS = {
  placed: orders.placedAt,
  number: orders.id,
  customer: orders.customerName,
  total: orders.totalCents,
  items: orders.itemCount,
  status: orders.status,
  country: orders.country,
} as const;

/** Whitelisted sort with an `id` tiebreak, so pages never overlap. */
function orderBy(f: OrderFilters): SQL[] {
  const dir = f.dir === "asc" ? asc : desc;
  const column = SORT_COLUMNS[f.sort];
  return column === orders.id ? [dir(orders.id)] : [dir(column), dir(orders.id)];
}

const rowColumns = {
  number: orders.id,
  placedAt: orders.placedAt,
  customerName: orders.customerName,
  customerEmail: orders.customerEmail,
  country: orders.country,
  city: orders.city,
  itemCount: orders.itemCount,
  totalCents: orders.totalCents,
  paymentMethod: orders.paymentMethod,
  status: orders.status,
};

type RawRow = { [K in keyof typeof rowColumns]: (typeof rowColumns)[K]["_"]["data"] };

function toOrderRow(r: RawRow): OrderRow {
  return {
    ...r,
    placedAt: iso(r.placedAt),
    country: r.country as CountryCode,
    paymentMethod: r.paymentMethod as PaymentMethod,
    status: r.status as OrderStatus,
  };
}

const hasUserFilters = (q: OrderFilters) =>
  Boolean(q.status || q.country || q.payment || q.from || q.to || q.q) ||
  q.min !== undefined ||
  q.max !== undefined;

/** The statement that counts the rows a query matches. */
export function ordersTotalQuery(db: Db, query: OrdersQuery) {
  if (hasUserFilters(query)) {
    return db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(orderWhere(query), query.upTo ? lte(orders.id, query.upTo) : undefined));
  }
  // No filters: the exact counter the catch-up and the trim keep, minus any
  // orders newer than the frozen number (a short primary-key range).
  return db
    .select({
      total: query.upTo
        ? sql<number>`${simState.ordersTotal} - (SELECT count(*)::int FROM orders WHERE id > ${query.upTo})`
        : simState.ordersTotal,
    })
    .from(simState)
    .where(eq(simState.id, 1));
}

/**
 * Where to read a page from. Past the middle of the result, the same rows
 * are nearer the other end: OFFSET 120000 of 140000 newest-first is
 * OFFSET 19800 oldest-first, reversed, which walks a sixth of the index.
 */
export function planPage(query: OrdersQuery, total: number) {
  if (query.offset <= total / 2) return { query, reversed: false };
  const limit = Math.max(0, Math.min(query.limit, total - query.offset));
  return {
    query: {
      ...query,
      dir: query.dir === "asc" ? ("desc" as const) : ("asc" as const),
      offset: Math.max(0, total - query.offset - limit),
      limit,
    },
    reversed: true,
  };
}

/**
 * The statement behind one page, unexecuted, so scripts can EXPLAIN it.
 *
 * It is a deferred join: the inner query walks the index for just the ids of
 * the wanted window (an index-only scan for the default sort), and only
 * those rows are read in full.
 */
export function ordersPageQuery(db: Db, query: OrdersQuery) {
  const order = orderBy(query);
  const ids = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(orderWhere(query), query.upTo ? lte(orders.id, query.upTo) : undefined))
    .orderBy(...order)
    .limit(query.limit)
    .offset(query.offset);
  return db.select(rowColumns).from(orders).where(inArray(orders.id, ids)).orderBy(...order);
}

export async function listOrders(db: Db, query: OrdersQuery): Promise<OrdersPage> {
  let total: number;
  let page: RawRow[];
  let newest: number | null = null;
  if (query.offset === 0) {
    // The first page cannot be in the far half: page and count in parallel.
    const [rows0, [count], newestNumber] = await Promise.all([
      ordersPageQuery(db, query),
      ordersTotalQuery(db, query),
      query.upTo ? null : newestOrderNumber(db),
    ]);
    total = count?.total ?? 0;
    page = rows0;
    newest = newestNumber;
  } else {
    total = (await ordersTotalQuery(db, query))[0]?.total ?? 0;
    const plan = planPage(query, total);
    page = plan.query.limit > 0 ? await ordersPageQuery(db, plan.query) : [];
    if (plan.reversed) page.reverse();
  }
  return { rows: page.map(toOrderRow), total, offset: query.offset, newest };
}

/** Orders newer than `after`, oldest first: what the live feed sends next. */
export async function ordersAfter(db: Db, after: number, limit: number): Promise<OrderRow[]> {
  const list = await db
    .select(rowColumns)
    .from(orders)
    .where(gt(orders.id, after))
    .orderBy(asc(orders.id))
    .limit(limit);
  return list.map(toOrderRow);
}

export async function newestOrderNumber(db: Db): Promise<number> {
  const [row] = await db.select({ number: orders.id }).from(orders).orderBy(desc(orders.id)).limit(1);
  return row?.number ?? 0;
}

export async function ordersForCustomer(db: Db, customerId: number): Promise<OrderRow[]> {
  const list = await db
    .select(rowColumns)
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.placedAt), desc(orders.id));
  return list.map(toOrderRow);
}

export async function getOrder(db: Db, number: number): Promise<OrderDetail> {
  const [order] = await db
    .select({
      ...rowColumns,
      subtotalCents: orders.subtotalCents,
      discountCents: orders.discountCents,
      discountCode: orders.discountCode,
      shippingCents: orders.shippingCents,
      taxCents: orders.taxCents,
      planPaidAt: orders.planPaidAt,
      customerId: orders.customerId,
      visitorTouchedAt: orders.visitorTouchedAt,
    })
    .from(orders)
    .where(eq(orders.id, number));
  if (!order) throw notFound(`Order #${number} does not exist.`);

  const [items, events, [customer]] = await Promise.all([
    db
      .select({
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, number))
      .orderBy(asc(orderItems.id)),
    db
      .select({
        type: orderEvents.type,
        actor: orderEvents.actor,
        message: orderEvents.message,
        at: orderEvents.createdAt,
      })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, number))
      .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id)),
    db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        country: customers.country,
        city: customers.city,
        customerSince: customers.createdAt,
        ordersCount: customers.ordersCount,
        orderOrdinal: sql<number>`(
          SELECT count(*)::int FROM orders o
          WHERE o.customer_id = ${order.customerId}
            AND (o.placed_at, o.id) <= (${order.placedAt.toISOString()}::timestamptz, ${number}))`,
      })
      .from(customers)
      .where(eq(customers.id, order.customerId)),
  ]);

  // "Placed" and "paid" are not stored (every order has them); add them here.
  const timeline: TimelineEntry[] = [
    { type: "placed", at: iso(order.placedAt), actor: "system", message: null },
    { type: "paid", at: iso(order.planPaidAt), actor: "system", message: null },
    ...events.map((e) => ({
      type: e.type as EventType,
      actor: e.actor as Actor,
      message: e.message,
      at: iso(e.at),
    })),
  ];

  const status = order.status as OrderStatus;
  return {
    ...toOrderRow(order),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    discountCode: order.discountCode,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    items: items.map((i) => {
      const variant = variantById(i.variantId);
      const product = variant ? productById(variant.productId) : undefined;
      return {
        sku: variant?.sku ?? "",
        productId: product?.id ?? 0,
        productName: product?.name ?? "Unknown product",
        optionLabel: variant?.optionLabel ?? "",
        imageSlot: product?.imageSlot ?? "",
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        lineTotalCents: i.quantity * i.unitPriceCents,
      };
    }),
    customer: {
      ...customer,
      country: customer.country as CountryCode,
      customerSince: iso(customer.customerSince),
      address: addressFor(customer.id, customer.country as CountryCode),
    },
    timeline,
    allowedTransitions: [...ALLOWED_TRANSITIONS[status]],
    changedByVisitor: order.visitorTouchedAt !== null,
  };
}

async function currentStatus(db: Db, number: number): Promise<OrderStatus> {
  const [row] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, number));
  if (!row) throw notFound(`Order #${number} does not exist.`);
  return row.status as OrderStatus;
}

/**
 * A visitor's status change: one allowed step, applied only if the order is
 * still in the status we read (otherwise someone else moved it: conflict).
 * The event, the status rollup and, for refunds, the day's refunds move in
 * the same statement.
 */
export async function changeStatus(db: Db, number: number, to: OrderStatus, now: number): Promise<OrderDetail> {
  const from = await currentStatus(db, number);
  if (from === to) throw conflict(`Order #${number} is already ${to}.`);
  if (!canTransition(from, to)) {
    throw badRequest(`An order that is ${from} cannot become ${to}.`);
  }
  const refund =
    to === "refunded"
      ? sql`, refunds AS (
          INSERT INTO daily_stats (day, refunds_cents)
          SELECT (${ts(now)} AT TIME ZONE ${STORE_TIME_ZONE})::date, total_cents FROM moved
          ON CONFLICT (day) DO UPDATE SET refunds_cents = daily_stats.refunds_cents + excluded.refunds_cents
        )`
      : sql``;
  const [result] = await rows<{ moved: number }>(
    db,
    sql`
    WITH moved AS (
      UPDATE orders SET status = ${to}, visitor_touched_at = ${ts(now)}
      WHERE id = ${number} AND status = ${from}
      RETURNING id, placed_at, total_cents
    ),
    events AS (
      INSERT INTO order_events (order_id, type, actor, created_at)
      SELECT id, ${to}, 'visitor', ${ts(now)} FROM moved
    ),
    ${statusMoves(from, to)}${refund}
    SELECT count(*)::int AS moved FROM moved`,
  );
  if (result.moved === 0) throw conflict(`Order #${number} changed while you were editing it.`);
  return getOrder(db, number);
}

export async function addNote(db: Db, number: number, message: string, now: number): Promise<TimelineEntry> {
  const [result] = await rows<{ added: number }>(
    db,
    sql`
    WITH touched AS (
      UPDATE orders SET visitor_touched_at = ${ts(now)} WHERE id = ${number} RETURNING id
    ),
    note AS (
      INSERT INTO order_events (order_id, type, message, actor, created_at)
      SELECT id, 'note', ${message}, 'visitor', ${ts(now)} FROM touched
      RETURNING id
    )
    SELECT count(*)::int AS added FROM note`,
  );
  if (result.added === 0) throw notFound(`Order #${number} does not exist.`);
  return { type: "note", at: new Date(now).toISOString(), actor: "visitor", message };
}

/**
 * Bulk "Mark as shipped": paid and packed orders ship (paid ones are packed
 * on the way), everything else is skipped and reported back.
 */
export async function bulkShip(db: Db, numbers: number[], now: number): Promise<BulkShipResult> {
  const moved = await rows<{ id: number }>(
    db,
    sql`
    WITH picked AS (
      SELECT id, status AS before FROM orders
      WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(numbers)}::jsonb)::int)
        AND status IN (${sql.join(SHIPPABLE_STATUSES.map((s) => sql`${s}`), sql`, `)})
      FOR UPDATE
    ),
    moved AS (
      UPDATE orders o SET status = 'shipped', visitor_touched_at = ${ts(now)}
      FROM picked p WHERE o.id = p.id AND o.status = p.before
      RETURNING o.id, o.placed_at, p.before
    ),
    events AS (
      INSERT INTO order_events (order_id, type, actor, created_at)
      SELECT id, 'packed', 'visitor', ${ts(now)} FROM moved WHERE before = 'paid'
      UNION ALL
      SELECT id, 'shipped', 'visitor', ${ts(now)} FROM moved
    ),
    status_moves AS (
      INSERT INTO daily_status_stats (day, status, orders)
      SELECT day, status, sum(delta)::int FROM (
        SELECT (placed_at AT TIME ZONE ${STORE_TIME_ZONE})::date AS day, before AS status, -1 AS delta FROM moved
        UNION ALL
        SELECT (placed_at AT TIME ZONE ${STORE_TIME_ZONE})::date, 'shipped', 1 FROM moved
      ) x GROUP BY 1, 2
      ON CONFLICT (day, status) DO UPDATE SET orders = daily_status_stats.orders + excluded.orders
    )
    SELECT id FROM moved ORDER BY id`,
  );
  const shipped = moved.map((m) => m.id);
  const done = new Set(shipped);
  return { shipped, skipped: numbers.filter((n) => !done.has(n)) };
}

