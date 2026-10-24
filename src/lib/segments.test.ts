import { describe, expect, it } from "vitest";
import { segmentOf } from "./segments";

const now = Date.parse("2026-10-24T12:00:00Z");
const daysAgo = (n: number) => now - n * 86_400_000;

describe("segmentOf", () => {
  it("puts the top spenders first, whatever else is true", () => {
    expect(segmentOf({ ordersCount: 1, lifetimeCents: 50_000, lastOrderAt: daysAgo(80) }, 40_000, now)).toBe("vip");
  });

  it("splits repeat customers by how recently they ordered", () => {
    expect(segmentOf({ ordersCount: 3, lifetimeCents: 9_000, lastOrderAt: daysAgo(10) }, 40_000, now)).toBe("returning");
    expect(segmentOf({ ordersCount: 2, lifetimeCents: 9_000, lastOrderAt: daysAgo(61) }, 40_000, now)).toBe("at_risk");
    expect(segmentOf({ ordersCount: 2, lifetimeCents: 9_000, lastOrderAt: daysAgo(60) }, 40_000, now)).toBe("returning");
  });

  it("calls a single recent order new and an old one one-time", () => {
    expect(segmentOf({ ordersCount: 1, lifetimeCents: 3_000, lastOrderAt: daysAgo(30) }, 40_000, now)).toBe("new");
    expect(segmentOf({ ordersCount: 1, lifetimeCents: 3_000, lastOrderAt: daysAgo(31) }, 40_000, now)).toBe("one_time");
  });
});
