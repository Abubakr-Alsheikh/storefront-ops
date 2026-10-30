import { describe, expect, it } from "vitest";
import type { Overview } from "@/lib/contracts/overview";
import { completeSeries, revenueSummary } from "./overviewSummary";

function overview(current: number, previous: number | null, granularity: "hour" | "day" = "day") {
  const point = (start: string, revenueCents: number) => ({
    start,
    revenueCents,
    orders: 1,
    sessions: 10,
    previousRevenueCents: null,
    previousOrders: null,
    previousSessions: null,
  });
  return {
    kpis: { revenueCents: { current, previous } } as Overview["kpis"],
    range: { granularity, to: "2026-10-27T23:00:00.000Z" } as Overview["range"],
    series: [point("2026-10-23T23:00:00.000Z", 100), point("2026-10-24T23:00:00.000Z", 900), point("2026-10-25T23:00:00.000Z", 300)],
  };
}

describe("completeSeries", () => {
  const point = (start: string) => ({ start }) as Overview["series"][number];

  it("leaves out an hour or day still in progress", () => {
    const hours = [point("2026-10-30T10:00:00.000Z"), point("2026-10-30T11:00:00.000Z")];
    const hourly = (to: string) => ({ series: hours, range: { granularity: "hour", to } as Overview["range"] });
    expect(completeSeries(hourly("2026-10-30T11:20:00.000Z"))).toEqual([hours[0]]);
    expect(completeSeries(hourly("2026-10-30T12:00:00.000Z"))).toEqual(hours);

    const days = [point("2026-10-29T00:00:00.000Z"), point("2026-10-30T00:00:00.000Z")];
    const daily = (to: string) => ({ series: days, range: { granularity: "day", to } as Overview["range"] });
    expect(completeSeries(daily("2026-10-30T15:00:00.000Z"))).toEqual([days[0]]);
    expect(completeSeries(daily("2026-10-31T00:00:00.000Z"))).toEqual(days);
  });

  it("keeps a lone bucket: an empty chart would say less", () => {
    const one = [point("2026-10-30T00:00:00.000Z")];
    expect(completeSeries({ series: one, range: { granularity: "hour", to: "2026-10-30T00:10:00.000Z" } as Overview["range"] })).toEqual(one);
  });
});

describe("revenueSummary", () => {
  it("says which way revenue moved and when it peaked", () => {
    expect(revenueSummary(overview(112_400, 100_000))).toBe(
      "Revenue rose 12.4% against the previous period, peaking on 25 Oct.",
    );
    expect(revenueSummary(overview(90_000, 100_000))).toBe(
      "Revenue fell 10.0% against the previous period, peaking on 25 Oct.",
    );
    expect(revenueSummary(overview(100_000, 100_000))).toBe(
      "Revenue held level against the previous period, peaking on 25 Oct.",
    );
  });

  it("reads hours by the clock and copes with no comparison", () => {
    expect(revenueSummary(overview(481_200, null, "hour"))).toBe("Revenue totals €4,812, peaking at 00:00.");
  });
});
