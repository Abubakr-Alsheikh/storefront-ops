import { sql } from "drizzle-orm";
import type { Overview, SeriesPoint } from "@/lib/contracts/overview";
import type { CountryCode } from "@/lib/data/countries";
import { productById, variantById } from "@/lib/data/catalogue";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain";
import { RETENTION_DAYS, type ResolvedRange } from "@/lib/ranges";
import { daySessionsUntil } from "@/lib/sim/rate";
import {
  addZonedDays,
  dayKeyFromNumber,
  dayNumberFromKey,
  startOfDayNumber,
  zonedParts,
} from "@/lib/tz";
import { rows, type Db } from "../db/client";
import { readSimState } from "../sim/catchUp";
import { countLowStock } from "./inventory";

/**
 * The overview (DATA.md §6). Whole days come from the daily rollups, which
 * the catch-up keeps current for today as well. The orders table is read
 * only for hourly buckets and for the previous period's last day, which is
 * cut at the same wall-clock time as now so a partial day meets a partial day.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const iso = (ms: number) => new Date(ms).toISOString();
const ts = (ms: number) => sql`${iso(ms)}::timestamptz`;

interface Totals {
  orders: number;
  revenue: number;
  sessions: number;
  days: number;
}

const dayOf = (ms: number) => zonedParts(ms).dayNumber;
const isMidnight = (ms: number) => startOfDayNumber(dayOf(ms)) === ms;

/** Local days of a period, split into whole days and an optional cut-off last day. */
function periodDays(from: number, to: number) {
  const first = dayOf(from);
  const partial = isMidnight(to) ? null : dayOf(to);
  const lastWhole = (partial ?? dayOf(to - 1) + 1) - 1;
  return { first, lastWhole, partial };
}

async function dailyRows(db: Db, firstDay: number, lastDay: number) {
  if (lastDay < firstDay) return new Map<number, { orders: number; revenue: number; sessions: number }>();
  const list = await rows<{ day: string; orders: number; revenue_cents: number; sessions: number }>(
    db,
    sql`SELECT day::text AS day, orders, revenue_cents, sessions FROM daily_stats
      WHERE day BETWEEN ${dayKeyFromNumber(firstDay)}::date AND ${dayKeyFromNumber(lastDay)}::date`,
  );
  return new Map(
    list.map((r) => [dayNumberFromKey(r.day), { orders: r.orders, revenue: r.revenue_cents, sessions: r.sessions }]),
  );
}

/** Orders and revenue placed in `[from, to)`, straight from the orders table. */
async function placedBetween(db: Db, from: number, to: number) {
  const [row] = await rows<{ orders: number; revenue: number }>(
    db,
    sql`SELECT count(*)::int AS orders, coalesce(sum(total_cents), 0)::int AS revenue
      FROM orders WHERE placed_at >= ${ts(from)} AND placed_at < ${ts(to)}`,
  );
  return row;
}

/**
 * Per-day totals for a period. The current period's last day is always
 * whole or today (whose rollup is live); the previous period's last day may
 * be cut mid-day, and then comes from orders plus simulated sessions.
 */
async function periodByDay(db: Db, from: number, to: number, live: boolean, now: number) {
  const { first, lastWhole, partial } = periodDays(from, to);
  const days = await dailyRows(db, first, partial ?? lastWhole);
  const whole = partial === null ? undefined : days.get(partial);
  // A cut-off day of the previous period counts only up to the same time of
  // day as now, and only when the database holds that day at all.
  if (!live && partial !== null && whole) {
    const sessions = daySessionsUntil(partial, to);
    if (startOfDayNumber(partial) >= now - RETENTION_DAYS * DAY_MS) {
      days.set(partial, { ...(await placedBetween(db, startOfDayNumber(partial), to)), sessions });
    } else {
      // Its orders are already trimmed: scale the day by its traffic so far.
      const share = sessions / Math.max(1, daySessionsUntil(partial, startOfDayNumber(partial + 1)));
      days.set(partial, {
        orders: Math.round(whole.orders * share),
        revenue: Math.round(whole.revenue * share),
        sessions,
      });
    }
  }
  return days;
}

function sum(days: Map<number, { orders: number; revenue: number; sessions: number }>): Totals {
  let orders = 0;
  let revenue = 0;
  let sessions = 0;
  for (const d of days.values()) {
    orders += d.orders;
    revenue += d.revenue;
    sessions += d.sessions;
  }
  return { orders, revenue, sessions, days: days.size };
}

async function hourlySeries(db: Db, range: ResolvedRange): Promise<SeriesPoint[]> {
  const bucket = async (from: number, to: number) => {
    const list = await rows<{ hour: string | Date; orders: number; revenue: number }>(
      db,
      sql`SELECT date_trunc('hour', placed_at, 'UTC') AS hour, count(*)::int AS orders,
          sum(total_cents)::int AS revenue
        FROM orders WHERE placed_at >= ${ts(from)} AND placed_at < ${ts(to)}
        GROUP BY 1`,
    );
    return new Map(list.map((r) => [new Date(r.hour).getTime(), r]));
  };
  const [current, previous] = await Promise.all([
    bucket(range.current.from, range.current.to),
    bucket(range.previous.from, range.previous.to),
  ]);
  const points: SeriesPoint[] = [];
  const dayEnd = startOfDayNumber(dayOf(range.current.from) + 1);
  // Lisbon's offset is whole hours, so UTC hours are local hours.
  for (let start = range.current.from; start < Math.min(range.current.to, dayEnd); start += HOUR_MS) {
    const prevStart = addZonedDays(start, -1);
    const now = current.get(start);
    const before = previous.get(prevStart);
    points.push({
      start: iso(start),
      revenueCents: now?.revenue ?? 0,
      orders: now?.orders ?? 0,
      previousRevenueCents: prevStart < range.previous.to ? (before?.revenue ?? 0) : null,
    });
  }
  return points;
}

export async function getOverview(db: Db, range: ResolvedRange, now: number): Promise<Overview> {
  const [currentDays, previousDays] = await Promise.all([
    periodByDay(db, range.current.from, range.current.to, true, now),
    periodByDay(db, range.previous.from, range.previous.to, false, now),
  ]);
  const current = sum(currentDays);
  const previous = sum(previousDays);
  const hasPrevious = previous.days > 0 && previous.orders > 0;

  const firstDay = dayNumberFromKey(range.firstDay);
  const lastDay = dayNumberFromKey(range.lastDay);
  const daysFrom = dayKeyFromNumber(firstDay);
  const daysTo = dayKeyFromNumber(lastDay);

  const [series, statusRows, variantRows, countryRows, lowStockVariants, state] = await Promise.all([
    range.granularity === "hour"
      ? hourlySeries(db, range)
      : Promise.resolve(
          Array.from({ length: range.days }, (_, i): SeriesPoint => {
            const d = firstDay + i;
            const prev = previousDays.get(dayOf(range.previous.from) + i);
            return {
              start: iso(startOfDayNumber(d)),
              revenueCents: currentDays.get(d)?.revenue ?? 0,
              orders: currentDays.get(d)?.orders ?? 0,
              previousRevenueCents: prev ? prev.revenue : null,
            };
          }),
        ),
    rows<{ status: string; orders: number }>(
      db,
      sql`SELECT status, sum(orders)::int AS orders FROM daily_status_stats
        WHERE day BETWEEN ${daysFrom}::date AND ${daysTo}::date GROUP BY status`,
    ),
    rows<{ variant_id: number; units: number; revenue: number }>(
      db,
      sql`SELECT variant_id, sum(units)::int AS units, sum(revenue_cents)::int AS revenue
        FROM daily_variant_stats WHERE day BETWEEN ${daysFrom}::date AND ${daysTo}::date
        GROUP BY variant_id`,
    ),
    rows<{ country: string; orders: number; revenue: number }>(
      db,
      sql`SELECT country, sum(orders)::int AS orders, sum(revenue_cents)::int AS revenue
        FROM daily_country_stats WHERE day BETWEEN ${daysFrom}::date AND ${daysTo}::date
        GROUP BY country ORDER BY revenue DESC, country`,
    ),
    countLowStock(db, now),
    readSimState(db),
  ]);

  const statusCounts = new Map(statusRows.map((r) => [r.status as OrderStatus, r.orders]));

  const byProduct = new Map<number, { units: number; revenue: number }>();
  for (const v of variantRows) {
    const productId = variantById(v.variant_id)?.productId;
    if (!productId) continue;
    const entry = byProduct.get(productId) ?? { units: 0, revenue: 0 };
    entry.units += v.units;
    entry.revenue += v.revenue;
    byProduct.set(productId, entry);
  }
  const topProducts = [...byProduct]
    .sort(([a, x], [b, y]) => y.units - x.units || y.revenue - x.revenue || a - b)
    .slice(0, 5)
    .map(([productId, t]) => {
      const product = productById(productId);
      return {
        productId,
        name: product?.name ?? "Unknown product",
        imageSlot: product?.imageSlot ?? "",
        units: t.units,
        revenueCents: t.revenue,
      };
    });

  const countryRevenue = countryRows.reduce((s, r) => s + r.revenue, 0);
  const aov = (t: Totals) => (t.orders ? Math.round(t.revenue / t.orders) : 0);
  const conversion = (t: Totals) => (t.sessions ? t.orders / t.sessions : 0);

  return {
    range: {
      key: range.key,
      label: range.label,
      previousLabel: range.previousLabel,
      from: iso(range.current.from),
      to: iso(range.current.to),
      firstDay: range.firstDay,
      lastDay: range.lastDay,
      granularity: range.granularity,
    },
    kpis: {
      revenueCents: { current: current.revenue, previous: hasPrevious ? previous.revenue : null },
      orders: { current: current.orders, previous: hasPrevious ? previous.orders : null },
      averageOrderCents: { current: aov(current), previous: hasPrevious ? aov(previous) : null },
      conversionRate: { current: conversion(current), previous: hasPrevious ? conversion(previous) : null },
    },
    series,
    statuses: ORDER_STATUSES.map((status) => ({ status, orders: statusCounts.get(status) ?? 0 })),
    topProducts,
    countries: countryRows.map((r) => ({
      country: r.country as CountryCode,
      orders: r.orders,
      revenueCents: r.revenue,
      share: countryRevenue ? r.revenue / countryRevenue : 0,
    })),
    lowStockVariants,
    // Not `now`: a read may be served while a long catch-up is still running.
    asOf: iso(Math.min(now, state?.materialisedUntil.getTime() ?? now)),
  };
}
