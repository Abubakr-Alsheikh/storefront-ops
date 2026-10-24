import { sql, type SQL } from "drizzle-orm";
import type {
  CustomerDetail,
  CustomerRow,
  CustomersPage,
  CustomersQuery,
} from "@/lib/contracts/catalogue";
import type { CountryCode } from "@/lib/data/countries";
import { AT_RISK_DAYS, NEW_DAYS, VIP_SHARE, type Segment } from "@/lib/segments";
import { rows, type Db } from "../db/client";
import { notFound } from "../errors";
import { ordersForCustomer } from "./orders";

const DAY_MS = 86_400_000;
const ts = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`;

/** Lifetime value at the VIP cut-off. Cached briefly: it moves slowly and costs a scan. */
let vipCache: { at: number; cents: number } | null = null;
const VIP_CACHE_MS = 60_000;

export async function vipThreshold(db: Db, now: number): Promise<number> {
  if (vipCache && now - vipCache.at < VIP_CACHE_MS && now >= vipCache.at) return vipCache.cents;
  const [row] = await rows<{ cents: number | null }>(
    db,
    sql`SELECT percentile_disc(${1 - VIP_SHARE}) WITHIN GROUP (ORDER BY lifetime_cents)::int AS cents
      FROM customers WHERE orders_count > 0`,
  );
  const cents = row?.cents ?? 0;
  vipCache = { at: now, cents };
  return cents;
}

/** Tests reseed between files; they reset the cache. */
export function clearVipCache() {
  vipCache = null;
}

/** The SQL twin of `segmentOf` in src/lib/segments.ts, built from the same constants. */
function segmentSql(vipCents: number, now: number): SQL {
  return sql`CASE
    WHEN lifetime_cents >= ${vipCents} THEN 'vip'
    WHEN orders_count >= 2 AND last_order_at < ${ts(now - AT_RISK_DAYS * DAY_MS)} THEN 'at_risk'
    WHEN orders_count >= 2 THEN 'returning'
    WHEN last_order_at >= ${ts(now - NEW_DAYS * DAY_MS)} THEN 'new'
    ELSE 'one_time' END`;
}

const SORT_SQL: Record<CustomersQuery["sort"], SQL> = {
  lifetime: sql`lifetime_cents`,
  orders: sql`orders_count`,
  last_order: sql`last_order_at`,
  name: sql`name`,
};

type CustomerSqlRow = {
  id: number;
  name: string;
  email: string;
  country: string;
  city: string;
  orders_count: number;
  lifetime_cents: number;
  last_order_at: string | Date;
  created_at: string | Date;
  segment: string;
};

function toCustomerRow(r: CustomerSqlRow): CustomerRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    country: r.country as CountryCode,
    city: r.city,
    ordersCount: r.orders_count,
    lifetimeCents: r.lifetime_cents,
    lastOrderAt: new Date(r.last_order_at).toISOString(),
    segment: r.segment as Segment,
  };
}

export async function listCustomers(db: Db, query: CustomersQuery, now: number): Promise<CustomersPage> {
  const vip = await vipThreshold(db, now);
  const segment = segmentSql(vip, now);
  const where = sql.join(
    [
      sql`orders_count > 0`,
      query.q ? sql`search_text LIKE ${`%${query.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`}` : undefined,
      query.segment ? sql`(${segment}) = ${query.segment}` : undefined,
    ].filter((c): c is SQL => c !== undefined),
    sql` AND `,
  );
  const dir = query.dir === "asc" ? sql`ASC` : sql`DESC`;
  const [list, [count]] = await Promise.all([
    rows<CustomerSqlRow>(
      db,
      sql`SELECT id, name, email, country, city, orders_count, lifetime_cents, last_order_at, created_at,
          ${segment} AS segment
        FROM customers WHERE ${where}
        ORDER BY ${SORT_SQL[query.sort]} ${dir}, id ${dir}
        LIMIT ${query.limit} OFFSET ${query.offset}`,
    ),
    rows<{ total: number }>(db, sql`SELECT count(*)::int AS total FROM customers WHERE ${where}`),
  ]);
  return { rows: list.map(toCustomerRow), total: count.total, offset: query.offset, vipThresholdCents: vip };
}

export async function getCustomer(db: Db, id: number, now: number): Promise<CustomerDetail> {
  const vip = await vipThreshold(db, now);
  const [row] = await rows<CustomerSqlRow>(
    db,
    sql`SELECT id, name, email, country, city, orders_count, lifetime_cents, last_order_at, created_at,
        ${segmentSql(vip, now)} AS segment
      FROM customers WHERE id = ${id} AND orders_count > 0`,
  );
  if (!row) throw notFound(`Customer ${id} does not exist.`);
  const base = toCustomerRow(row);
  return {
    ...base,
    customerSince: new Date(row.created_at).toISOString(),
    averageOrderCents: Math.round(base.lifetimeCents / base.ordersCount),
    orders: await ordersForCustomer(db, id),
  };
}
