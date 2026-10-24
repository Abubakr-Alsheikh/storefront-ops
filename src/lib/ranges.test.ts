import { describe, expect, it } from "vitest";
import { resolveRange } from "./ranges";

const utc = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;

describe("resolveRange", () => {
  // Saturday 24 October 2026, 15:20 in Lisbon (UTC+1).
  const now = utc("2026-10-24T14:20:00Z");

  it("runs today from local midnight to now, against yesterday until the same time", () => {
    const r = resolveRange("today", now);
    expect(r.label).toBe("Today");
    expect(r.previousLabel).toBe("yesterday until now");
    expect(r.current).toEqual({ from: utc("2026-10-23T23:00:00Z"), to: now });
    expect(r.previous).toEqual({
      from: utc("2026-10-22T23:00:00Z"),
      to: utc("2026-10-23T14:20:00Z"),
    });
    expect(r.days).toBe(1);
    expect(r.granularity).toBe("hour");
    expect(r.firstDay).toBe("2026-10-24");
  });

  it("makes 7 days include today and compares with the 7 days before", () => {
    const r = resolveRange("7d", now);
    expect(r.label).toBe("Last 7 days");
    expect(r.previousLabel).toBe("the 7 days before");
    expect(r.firstDay).toBe("2026-10-18");
    expect(r.lastDay).toBe("2026-10-24");
    expect(r.current.from).toBe(utc("2026-10-17T23:00:00Z"));
    expect(r.previous.from).toBe(utc("2026-10-10T23:00:00Z"));
    expect(r.previous.to).toBe(utc("2026-10-17T14:20:00Z"));
    expect(r.granularity).toBe("day");
  });

  it("keeps the wall-clock cut when the previous period crosses DST", () => {
    // Monday 26 October, after the clocks went back: 15:20 is 15:20 UTC.
    const later = utc("2026-10-26T15:20:00Z");
    const r = resolveRange("7d", later);
    expect(r.current.from).toBe(utc("2026-10-19T23:00:00Z")); // 20 Oct, 00:00 WEST
    expect(r.previous.to).toBe(utc("2026-10-19T14:20:00Z")); // 15:20 WEST
    expect(r.current.to - r.current.from).toBe(r.previous.to - r.previous.from + HOUR);
  });

  it("covers 30 and 90 days", () => {
    expect(resolveRange("30d", now).firstDay).toBe("2026-09-25");
    const r = resolveRange("90d", now);
    expect(r.days).toBe(90);
    expect(r.firstDay).toBe("2026-07-27");
  });

  it("resolves a custom range of whole past days", () => {
    const r = resolveRange("custom", now, { from: "2026-10-03", to: "2026-10-09" });
    expect(r.label).toBe("3 Oct – 9 Oct");
    expect(r.previousLabel).toBe("the 7 days before");
    expect(r.current).toEqual({
      from: utc("2026-10-02T23:00:00Z"),
      to: utc("2026-10-09T23:00:00Z"),
    });
    expect(r.previous).toEqual({
      from: utc("2026-09-25T23:00:00Z"),
      to: utc("2026-10-02T23:00:00Z"),
    });
  });

  it("treats a one-day custom range like a day, by the hour", () => {
    const r = resolveRange("custom", now, { from: "2026-10-12", to: "2026-10-12" });
    expect(r.label).toBe("12 Oct");
    expect(r.previousLabel).toBe("the day before");
    expect(r.granularity).toBe("hour");
  });

  it("cuts a custom range that ends today at now", () => {
    const r = resolveRange("custom", now, { from: "2026-10-20", to: "2026-10-24" });
    expect(r.current.to).toBe(now);
  });

  it("rejects ranges it cannot answer", () => {
    expect(() => resolveRange("custom", now)).toThrow(RangeError);
    expect(() => resolveRange("custom", now, { from: "2026-10-10", to: "2026-10-09" })).toThrow(
      RangeError,
    );
    expect(() => resolveRange("custom", now, { from: "2026-10-20", to: "2026-10-25" })).toThrow(
      RangeError,
    );
    expect(() => resolveRange("custom", now, { from: "2026-07-26", to: "2026-07-30" })).toThrow(
      RangeError,
    );
    expect(() => resolveRange("custom", now, { from: "2026-07-27", to: "2026-07-30" })).not.toThrow();
  });
});
