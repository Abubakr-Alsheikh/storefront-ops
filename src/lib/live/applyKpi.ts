import type { LiveKpi } from "@/lib/contracts/orders";
import type { Overview, SeriesPoint } from "@/lib/contracts/overview";

const HOUR_MS = 3_600_000;

/**
 * An overview with a `kpi` event folded in, or the same object when it changes
 * nothing. It works from the difference against the overview's own count for
 * today, so an event can be applied twice, or arrive after a fresher fetch,
 * without counting anything twice. Previous-period values, statuses and
 * countries wait for the next refresh.
 */
export function applyLiveKpi(overview: Overview, kpi: LiveKpi, now: number): Overview {
  const { range, series, kpis } = overview;
  const last = series[series.length - 1];
  if (!last || kpi.day !== range.lastDay) return overview;

  // A single-day range holds today in hours; a longer one, in its last point.
  const today = range.granularity === "hour" ? series : [last];
  const total = (key: "orders" | "revenueCents" | "sessions", points: SeriesPoint[]) =>
    points.reduce((sum, point) => sum + point[key], 0);

  const addOrders = kpi.orders - total("orders", today);
  const addRevenue = kpi.revenueCents - total("revenueCents", today);
  if (addOrders <= 0) return overview;
  const addSessions = kpi.sessions - total("sessions", today);

  // Sessions per hour are rounded on the server, so the difference can dip below zero.
  const grown = (point: SeriesPoint): SeriesPoint => ({
    ...point,
    orders: point.orders + addOrders,
    revenueCents: point.revenueCents + addRevenue,
    sessions: point.sessions + Math.max(0, addSessions),
  });

  const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const nextHour = range.granularity === "hour" && Date.parse(last.start) < hour;
  const nextSeries = nextHour
    ? [
        ...series,
        grown({
          start: new Date(hour).toISOString(),
          orders: 0,
          revenueCents: 0,
          sessions: 0,
          previousRevenueCents: null,
          previousOrders: null,
          previousSessions: null,
        }),
      ]
    : [...series.slice(0, -1), grown(last)];

  const orders = kpis.orders.current + addOrders;
  const revenue = kpis.revenueCents.current + addRevenue;
  const sessions = total("sessions", series) + addSessions;

  return {
    ...overview,
    // The chart reads this to tell a finished hour from one still in progress.
    range: { ...range, to: new Date(Math.max(now, Date.parse(range.to))).toISOString() },
    series: nextSeries,
    kpis: {
      revenueCents: { ...kpis.revenueCents, current: revenue },
      orders: { ...kpis.orders, current: orders },
      averageOrderCents: { ...kpis.averageOrderCents, current: orders ? Math.round(revenue / orders) : 0 },
      conversionRate: { ...kpis.conversionRate, current: sessions > 0 ? orders / sessions : 0 },
    },
  };
}
