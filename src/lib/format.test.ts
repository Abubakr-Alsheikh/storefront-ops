import { describe, expect, it } from "vitest";
import {
  deltaRatio,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatDelta,
  formatKpiMoney,
  formatMoney,
  formatNumber,
  formatOrderNumber,
  formatOrdinal,
  formatPercent,
  formatRelative,
  formatTime, formatCover } from "./format";

const utc = (iso: string) => Date.parse(iso);

describe("money and numbers", () => {
  it("formats integer cents as euros", () => {
    expect(formatMoney(481250)).toBe("€4,812.50");
    expect(formatMoney(0)).toBe("€0.00");
    expect(formatMoney(5)).toBe("€0.05");
    expect(formatMoney(481250, { whole: true })).toBe("€4,813");
    expect(formatMoney(481250, { compact: true })).toBe("€4.8k");
    expect(formatMoney(1_234_567_00, { compact: true })).toBe("€1.2m");
    expect(formatKpiMoney(8285)).toBe("€82.85");
    expect(formatKpiMoney(4812000)).toBe("€48,120");
  });

  it("uses a true minus sign for negatives", () => {
    expect(formatMoney(-1500)).toBe("−€15.00");
    expect(formatNumber(-3)).toBe("−3");
  });

  it("groups thousands and rounds percentages", () => {
    expect(formatNumber(125000)).toBe("125,000");
    expect(formatPercent(0.0243)).toBe("2.4%");
    expect(formatPercent(0.0243, 2)).toBe("2.43%");
  });

  it("formats order numbers and ordinals", () => {
    expect(formatOrderNumber(100123)).toBe("#100123");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(formatOrdinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});

describe("deltas", () => {
  it("computes the change against the previous period", () => {
    expect(deltaRatio(112, 100)).toBeCloseTo(0.12);
    expect(deltaRatio(90, 100)).toBeCloseTo(-0.1);
    expect(deltaRatio(10, 0)).toBeNull();
  });

  it("shows sign, one decimal and a true minus", () => {
    expect(formatDelta(0.124)).toBe("+12.4%");
    expect(formatDelta(-0.031)).toBe("−3.1%");
    expect(formatDelta(0.0004)).toBe("No change");
    expect(formatDelta(-0.0004)).toBe("No change");
    expect(formatDelta(null)).toBe("No comparison");
  });
});

describe("dates in Lisbon", () => {
  it("formats in the store's time zone, not the machine's", () => {
    // 23:30 UTC in July is already the next day in Lisbon.
    const ms = utc("2026-07-14T23:30:00Z");
    expect(formatDate(ms)).toBe("15 Jul 2026");
    expect(formatDayMonth(ms)).toBe("15 Jul");
    expect(formatTime(ms)).toBe("00:30");
    expect(formatDateTime(ms)).toBe("15 Jul 2026, 00:30");
  });

  it("follows the clocks across DST", () => {
    expect(formatTime(utc("2026-10-24T20:00:00Z"))).toBe("21:00");
    expect(formatTime(utc("2026-10-25T20:00:00Z"))).toBe("20:00");
  });
});

describe("relative time", () => {
  const now = utc("2026-10-24T12:00:00Z");
  const ago = (ms: number) => formatRelative(now - ms, now);

  it("reads like a person would say it", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(-5_000)).toBe("just now");
    expect(ago(4 * 60_000)).toBe("4 min ago");
    expect(ago(2 * 3_600_000)).toBe("2 hr ago");
    expect(ago(30 * 3_600_000)).toBe("yesterday");
    expect(ago(3 * 86_400_000)).toBe("3 days ago");
  });

  it("switches to the date after a week", () => {
    expect(ago(10 * 86_400_000)).toBe("14 Oct");
  });
});

describe("formatCover", () => {
  it("keeps tenths under ten days and whole days above", () => {
    expect(formatCover(0)).toBe("0.0");
    expect(formatCover(0.2)).toBe("0.2");
    expect(formatCover(9.94)).toBe("9.9");
    expect(formatCover(10)).toBe("10");
    expect(formatCover(1234.6)).toBe("1,235");
  });
});
