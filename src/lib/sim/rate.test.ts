import { describe, expect, it } from "vitest";
import { dayNumberFromKey, startOfDayNumber, zonedParts } from "@/lib/tz";
import { HOUR_MS } from "./config";
import {
  BASE_DAILY_ORDERS,
  DAILY_NOISE,
  HOUR_CURVE,
  SALE_FACTOR,
  WEEKDAY_FACTOR,
  conversionRate,
  dailyNoise,
  dayVolume,
  hourRate,
  hourSessions,
  isSaleDay,
  weekOfDay,
  weekdayOfDay,
} from "./rate";

const day = dayNumberFromKey;

/** Expected orders for each UTC hour of local day `n`, keyed by local hour. */
function hoursOfDay(n: number) {
  const start = startOfDayNumber(n) / HOUR_MS;
  const end = startOfDayNumber(n + 1) / HOUR_MS;
  const hours: { utcHour: number; localHour: number; rate: number }[] = [];
  for (let h = start; h < end; h++) {
    hours.push({
      utcHour: new Date(h * HOUR_MS).getUTCHours(),
      localHour: zonedParts(h * HOUR_MS).hour,
      rate: hourRate(h),
    });
  }
  return hours;
}

function peak(hours: ReturnType<typeof hoursOfDay>) {
  return hours.reduce((best, h) => (h.rate > best.rate ? h : best));
}

describe("curves", () => {
  it("normalises the hour curve and the weekday factors", () => {
    expect(HOUR_CURVE).toHaveLength(24);
    expect(HOUR_CURVE.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(WEEKDAY_FACTOR.reduce((a, b) => a + b, 0) / 7).toBeCloseTo(1, 10);
  });

  it("is quiet overnight, bumps at lunch and peaks in the evening", () => {
    const quiet = Math.max(...HOUR_CURVE.slice(2, 7));
    const lunch = Math.max(HOUR_CURVE[12], HOUR_CURVE[13]);
    const evening = Math.max(...HOUR_CURVE.slice(19, 23));
    expect(quiet).toBeLessThan(HOUR_CURVE[10] / 3);
    expect(lunch).toBeGreaterThan(HOUR_CURVE[11]);
    expect(lunch).toBeGreaterThan(HOUR_CURVE[15]);
    expect(HOUR_CURVE.indexOf(Math.max(...HOUR_CURVE))).toBeGreaterThanOrEqual(19);
    expect(evening).toBe(Math.max(...HOUR_CURVE));
  });

  it("gives one order every 20-30 seconds at the evening peak", () => {
    for (const key of ["2026-09-07", "2026-09-10", "2026-09-13"]) {
      const n = day(key);
      if (isSaleDay(n)) continue;
      const secondsPerOrder = 3600 / peak(hoursOfDay(n)).rate;
      expect(secondsPerOrder).toBeGreaterThanOrEqual(20);
      expect(secondsPerOrder).toBeLessThanOrEqual(30);
    }
  });
});

describe("DST", () => {
  // Clocks go back on 25 October 2026 and forward on 29 March 2026.
  it.each([
    ["2026-10-24", "2026-10-26"],
    ["2026-03-28", "2026-03-30"],
  ])("keeps the peak in the Lisbon evening on both sides of %s → %s", (before, after) => {
    const summer = before.startsWith("2026-10") ? before : after;
    const winter = before.startsWith("2026-10") ? after : before;
    const s = peak(hoursOfDay(day(summer)));
    const w = peak(hoursOfDay(day(winter)));
    expect(s.localHour).toBe(21);
    expect(w.localHour).toBe(21);
    // Same local hour, one UTC hour apart.
    expect(s.utcHour).toBe(20);
    expect(w.utcHour).toBe(21);
  });

  it("covers a 25-hour and a 23-hour day without gaps", () => {
    const back = hoursOfDay(day("2026-10-25"));
    const forward = hoursOfDay(day("2026-03-29"));
    expect(back).toHaveLength(25);
    expect(forward).toHaveLength(23);
    expect(new Set(back.map((h) => h.localHour)).size).toBe(24);
    expect(new Set(forward.map((h) => h.localHour)).size).toBe(23);
  });
});

describe("days", () => {
  it("knows weekdays and Monday-based weeks", () => {
    expect(weekdayOfDay(day("2026-10-24"))).toBe(6); // Saturday
    expect(weekdayOfDay(day("2026-10-25"))).toBe(0); // Sunday
    expect(weekOfDay(day("2026-10-19"))).toBe(weekOfDay(day("2026-10-25")));
    expect(weekOfDay(day("2026-10-26"))).toBe(weekOfDay(day("2026-10-25")) + 1);
  });

  it("keeps daily noise inside its band", () => {
    for (let n = day("2026-01-01"); n < day("2027-01-01"); n++) {
      const noise = dailyNoise(n);
      expect(noise).toBeGreaterThanOrEqual(1 - DAILY_NOISE);
      expect(noise).toBeLessThan(1 + DAILY_NOISE);
    }
  });

  it("runs a two-day sale in one week out of three", () => {
    const first = day("2026-01-05"); // a Monday
    let saleDays = 0;
    let weeksWithSale = 0;
    for (let w = 0; w < 51; w++) {
      let inWeek = 0;
      for (let d = 0; d < 7; d++) if (isSaleDay(first + w * 7 + d)) inWeek++;
      expect([0, 2]).toContain(inWeek);
      if (inWeek) weeksWithSale++;
      saleDays += inWeek;
    }
    expect(weeksWithSale).toBe(17);
    expect(saleDays).toBe(34);
  });

  it("lifts volume on sale days", () => {
    let n = day("2026-09-01");
    while (!isSaleDay(n)) n++;
    expect(dayVolume(n) / (BASE_DAILY_ORDERS * WEEKDAY_FACTOR[weekdayOfDay(n)])).toBeCloseTo(
      SALE_FACTOR * dailyNoise(n),
      10,
    );
  });
});

describe("sessions and conversion", () => {
  it("keeps conversion between 2.1% and 2.9%", () => {
    for (let n = day("2026-01-01"); n < day("2027-01-01"); n++) {
      expect(conversionRate(n)).toBeGreaterThanOrEqual(0.021);
      expect(conversionRate(n)).toBeLessThanOrEqual(0.029);
    }
  });

  it("derives sessions from the expected order rate", () => {
    const h = Date.parse("2026-09-08T19:00:00Z") / HOUR_MS;
    const n = zonedParts(h * HOUR_MS).dayNumber;
    const ratio = hourSessions(h) / (hourRate(h) / conversionRate(n));
    expect(ratio).toBeGreaterThanOrEqual(0.96);
    expect(ratio).toBeLessThanOrEqual(1.04);
    expect(Number.isInteger(hourSessions(h))).toBe(true);
  });
});
