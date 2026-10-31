import { describe, expect, it } from "vitest";
import type { Overview, SeriesPoint } from "@/lib/contracts/overview";
import { completeSeries } from "@/lib/overviewSummary";
import { applyLiveKpi } from "./applyKpi";

const NOON = Date.parse("2026-10-31T12:30:00.000Z");

function point(start: string, orders: number, revenueCents: number, sessions: number): SeriesPoint {
  return { start, orders, revenueCents, sessions, previousOrders: 1, previousRevenueCents: 1, previousSessions: 1 };
}

function overview(granularity: "hour" | "day", series: SeriesPoint[], lastDay = "2026-10-31"): Overview {
  const sum = (key: "orders" | "revenueCents" | "sessions") => series.reduce((s, p) => s + p[key], 0);
  return {
    range: {
      key: granularity === "hour" ? "today" : "7d",
      label: "",
      previousLabel: "",
      from: series[0].start,
      to: new Date(NOON - 60_000).toISOString(),
      firstDay: "2026-10-25",
      lastDay,
      granularity,
    },
    kpis: {
      revenueCents: { current: sum("revenueCents"), previous: 500 },
      orders: { current: sum("orders"), previous: 5 },
      averageOrderCents: { current: 100, previous: 100 },
      conversionRate: { current: sum("orders") / sum("sessions"), previous: 0.1 },
    },
    series,
    statuses: [],
    topProducts: [],
    countries: [],
    lowStockVariants: 0,
    asOf: new Date(NOON - 60_000).toISOString(),
  };
}

const hourly = () =>
  overview("hour", [point("2026-10-31T11:00:00.000Z", 10, 1000, 100), point("2026-10-31T12:00:00.000Z", 5, 500, 50)]);
const daily = () =>
  overview("day", [point("2026-10-30T00:00:00.000Z", 100, 10_000, 1000), point("2026-10-31T00:00:00.000Z", 15, 1500, 150)]);

describe("applyLiveKpi", () => {
  it("adds the difference to the KPIs and the current hour", () => {
    const next = applyLiveKpi(hourly(), { day: "2026-10-31", orders: 17, revenueCents: 1900, sessions: 170 }, NOON);
    expect(next.kpis.orders.current).toBe(17);
    expect(next.kpis.revenueCents.current).toBe(1900);
    expect(next.kpis.averageOrderCents.current).toBe(112);
    expect(next.kpis.conversionRate.current).toBeCloseTo(0.1);
    expect(next.series.map((p) => p.orders)).toEqual([10, 7]);
    expect(next.series[1].revenueCents).toBe(900);
    expect(next.kpis.orders.previous).toBe(5);
  });

  it("is idempotent: the same event twice counts once", () => {
    const kpi = { day: "2026-10-31", orders: 17, revenueCents: 1900, sessions: 170 };
    const once = applyLiveKpi(hourly(), kpi, NOON);
    expect(applyLiveKpi(once, kpi, NOON)).toBe(once);
  });

  it("ignores an event older than the data it would change", () => {
    const base = hourly();
    expect(applyLiveKpi(base, { day: "2026-10-31", orders: 12, revenueCents: 1200, sessions: 120 }, NOON)).toBe(base);
  });

  it("adds to today's point in a longer range and keeps the whole range's totals", () => {
    const next = applyLiveKpi(daily(), { day: "2026-10-31", orders: 16, revenueCents: 1600, sessions: 160 }, NOON);
    expect(next.series.map((p) => p.orders)).toEqual([100, 16]);
    expect(next.kpis.orders.current).toBe(116);
    expect(next.kpis.revenueCents.current).toBe(11_600);
    expect(next.kpis.conversionRate.current).toBeCloseTo(116 / 1160);
  });

  it("leaves a range that does not hold today alone", () => {
    const old = overview("day", [point("2026-10-29T00:00:00.000Z", 9, 900, 90)], "2026-10-29");
    expect(applyLiveKpi(old, { day: "2026-10-31", orders: 99, revenueCents: 9900, sessions: 990 }, NOON)).toBe(old);
  });

  it("opens a new hour and lets the finished one reach the chart", () => {
    const base = hourly();
    expect(completeSeries(base)).toHaveLength(1);
    const later = Date.parse("2026-10-31T13:00:05.000Z");
    const next = applyLiveKpi(base, { day: "2026-10-31", orders: 16, revenueCents: 1600, sessions: 155 }, later);
    expect(next.series.map((p) => p.start)).toEqual([
      "2026-10-31T11:00:00.000Z",
      "2026-10-31T12:00:00.000Z",
      "2026-10-31T13:00:00.000Z",
    ]);
    expect(next.series[2]).toMatchObject({ orders: 1, revenueCents: 100, sessions: 5, previousOrders: null });
    expect(completeSeries(next)).toHaveLength(2);
  });

  it("keeps the server's conversion when rounded hours sum above the day", () => {
    const next = applyLiveKpi(hourly(), { day: "2026-10-31", orders: 16, revenueCents: 1600, sessions: 148 }, NOON);
    expect(next.kpis.conversionRate.current).toBeCloseTo(16 / 148);
    expect(next.series[1].sessions).toBe(50);
  });
});
