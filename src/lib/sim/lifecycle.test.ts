import { describe, expect, it } from "vitest";
import { zonedParts } from "@/lib/tz";
import { nextPickup, planLifecycle, statusAt, workingWindow, type LifecyclePlan } from "./lifecycle";
import { rngFor } from "./prng";

const utc = (iso: string) => Date.parse(iso);
const local = (ms: number) => zonedParts(ms);

describe("warehouse calendar", () => {
  it("keeps a time inside opening hours where it is", () => {
    // Tuesday 10:00 WEST.
    const ms = utc("2026-10-20T09:00:00Z");
    expect(workingWindow(ms)).toEqual({ start: ms, end: utc("2026-10-20T17:00:00Z") });
  });

  it("moves an evening order to the next morning, and Saturday afternoon to Monday", () => {
    expect(workingWindow(utc("2026-10-20T19:00:00Z")).start).toBe(utc("2026-10-21T07:00:00Z"));
    // Saturday closes at 13:00; Sunday is shut; Monday 26 Oct is after the clocks change.
    expect(workingWindow(utc("2026-10-24T13:30:00Z")).start).toBe(utc("2026-10-26T08:00:00Z"));
  });

  it("hands parcels to the carrier at 17:00 on weekdays and 12:00 on Saturdays", () => {
    expect(nextPickup(utc("2026-10-20T10:00:00Z"))).toBe(utc("2026-10-20T16:00:00Z"));
    expect(nextPickup(utc("2026-10-23T16:30:00Z"))).toBe(utc("2026-10-24T11:00:00Z"));
    expect(nextPickup(utc("2026-10-24T11:30:00Z"))).toBe(utc("2026-10-26T17:00:00Z"));
  });
});

describe("planLifecycle", () => {
  const start = utc("2026-09-01T00:00:00Z");
  const plans: LifecyclePlan[] = [];
  const placed: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const placedAt = start + i * 397_000; // spread over about 18 days
    placed.push(placedAt);
    plans.push(planLifecycle(rngFor("lifecycle", i), placedAt, i % 2 ? "europe" : "domestic"));
  }

  it("moves forward in time, step by step", () => {
    plans.forEach((p, i) => {
      expect(p.paidAt).toBeGreaterThan(placed[i]);
      if (p.outcome === "cancelled") {
        expect(p.cancelledAt).toBeGreaterThan(p.paidAt);
        expect(p.packedAt).toBeNull();
        expect(p.shippedAt).toBeNull();
        return;
      }
      expect(p.packedAt).toBeGreaterThan(p.paidAt);
      expect(p.shippedAt).toBeGreaterThan(p.packedAt ?? Infinity);
      expect(p.deliveredAt).toBeGreaterThan(p.shippedAt ?? Infinity);
      if (p.outcome === "refunded") expect(p.refundedAt).toBeGreaterThan(p.deliveredAt ?? Infinity);
      else expect(p.refundedAt).toBeNull();
    });
  });

  it("packs in opening hours, ships at a collection, delivers Monday to Saturday", () => {
    for (const p of plans) {
      if (p.packedAt === null || p.shippedAt === null || p.deliveredAt === null) continue;
      const packed = local(p.packedAt);
      expect(packed.weekday).not.toBe(0);
      expect(packed.hour).toBeGreaterThanOrEqual(8);
      expect(packed.hour).toBeLessThan(packed.weekday === 6 ? 13 : 18);

      const shipped = local(p.shippedAt);
      expect(shipped.hour).toBe(shipped.weekday === 6 ? 12 : 17);
      expect(shipped.minute).toBeLessThan(26);

      const delivered = local(p.deliveredAt);
      expect(delivered.weekday).not.toBe(0);
      expect(delivered.hour).toBeGreaterThanOrEqual(9);
      expect(delivered.hour).toBeLessThan(19);
    }
  });

  it("cancels about 2.5% and refunds about 3%", () => {
    const share = (o: string) => plans.filter((p) => p.outcome === o).length / plans.length;
    expect(share("cancelled")).toBeGreaterThan(0.015);
    expect(share("cancelled")).toBeLessThan(0.035);
    expect(share("refunded")).toBeGreaterThan(0.02);
    expect(share("refunded")).toBeLessThan(0.04);
  });
});

describe("statusAt", () => {
  const plan: LifecyclePlan = {
    paidAt: 10,
    packedAt: 20,
    shippedAt: 30,
    deliveredAt: 40,
    cancelledAt: null,
    refundedAt: 50,
    outcome: "refunded",
  };

  it("follows the plan", () => {
    expect(statusAt(plan, 0)).toBe("paid");
    expect(statusAt(plan, 19)).toBe("paid");
    expect(statusAt(plan, 20)).toBe("packed");
    expect(statusAt(plan, 30)).toBe("shipped");
    expect(statusAt(plan, 40)).toBe("delivered");
    expect(statusAt(plan, 50)).toBe("refunded");
  });

  it("never moves backward as time passes", () => {
    const rank = ["paid", "packed", "shipped", "delivered", "refunded"];
    let last = 0;
    for (let t = 0; t <= 60; t++) {
      const r = rank.indexOf(statusAt(plan, t));
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it("cancels from paid", () => {
    const cancelled: LifecyclePlan = {
      ...plan,
      packedAt: null,
      shippedAt: null,
      deliveredAt: null,
      refundedAt: null,
      cancelledAt: 15,
      outcome: "cancelled",
    };
    expect(statusAt(cancelled, 14)).toBe("paid");
    expect(statusAt(cancelled, 15)).toBe("cancelled");
    expect(statusAt(cancelled, 1e12)).toBe("cancelled");
  });
});
