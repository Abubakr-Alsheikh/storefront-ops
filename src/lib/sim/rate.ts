import { startOfDayNumber, zonedParts } from "@/lib/tz";
import { HOUR_MS, SIM_SEED } from "./config";
import { hash32, rngFor } from "./prng";

/**
 * How many orders the shop expects in each UTC hour. The rate is
 * base volume × weekday × Lisbon hour-of-day × daily noise × sale, and the
 * simulator draws the actual count from a Poisson with that mean.
 */

/** Orders on an average non-sale day. */
export const BASE_DAILY_ORDERS = 1400;

/** Order volume multiplier while a sale runs. */
export const SALE_FACTOR = 2.2;

/** Sales last this many local days. */
export const SALE_LENGTH_DAYS = 2;

/** Daily noise is uniform in ±DAILY_NOISE. */
export const DAILY_NOISE = 0.02;

/**
 * Relative order volume per Lisbon hour (index 0 = 00:00-01:00): quiet
 * overnight, a lunch bump, the main peak 19:00-23:00. Normalised to sum to 1.
 */
const RAW_HOUR_CURVE = [
  3.5, 2.0, 1.0, 0.6, 0.5, 0.6, 1.0, 2.0, 3.0, 3.8, 4.2, 4.6,
  5.6, 5.8, 4.8, 4.2, 4.2, 4.6, 5.4, 7.5, 9.5, 10.0, 8.5, 6.0,
];
const curveTotal = RAW_HOUR_CURVE.reduce((a, b) => a + b, 0);
export const HOUR_CURVE: readonly number[] = RAW_HOUR_CURVE.map((w) => w / curveTotal);

/**
 * Relative volume per weekday (0 = Sunday). Sunday evening browsing is the
 * busiest; Friday and Saturday are the quietest. Normalised to average 1.
 */
const RAW_WEEKDAY = [1.04, 1.03, 1.0, 0.99, 0.98, 0.96, 0.96];
const weekdayMean = RAW_WEEKDAY.reduce((a, b) => a + b, 0) / RAW_WEEKDAY.length;
export const WEEKDAY_FACTOR: readonly number[] = RAW_WEEKDAY.map((w) => w / weekdayMean);

/** Weekday (0 = Sunday) of local day number `n`; 1970-01-01 was a Thursday. */
export function weekdayOfDay(dayNumber: number): number {
  return (((dayNumber + 4) % 7) + 7) % 7;
}

/** Monday-based week number of local day number `n`. */
export function weekOfDay(dayNumber: number): number {
  return Math.floor((dayNumber + 3) / 7);
}

/** One week in three carries a sale. */
const SALE_EVERY_WEEKS = 3;
const SALE_PHASE = 1;

/**
 * First day number of the sale in week `week`, or null if the week has none.
 * Every third week has one, starting on a seeded day from Monday to Saturday,
 * so the two days stay inside the week.
 */
export function saleStartInWeek(week: number): number | null {
  if (((week % SALE_EVERY_WEEKS) + SALE_EVERY_WEEKS) % SALE_EVERY_WEEKS !== SALE_PHASE) {
    return null;
  }
  const mondayDay = week * 7 - 3;
  return mondayDay + (hash32(SIM_SEED, "sale", week) % (8 - SALE_LENGTH_DAYS));
}

export function isSaleDay(dayNumber: number): boolean {
  const start = saleStartInWeek(weekOfDay(dayNumber));
  return start !== null && dayNumber >= start && dayNumber < start + SALE_LENGTH_DAYS;
}

/** Deterministic noise for one local day, in [1 - DAILY_NOISE, 1 + DAILY_NOISE). */
export function dailyNoise(dayNumber: number): number {
  const u = rngFor(SIM_SEED, "day-noise", dayNumber)();
  return 1 - DAILY_NOISE + 2 * DAILY_NOISE * u;
}

/** Expected orders for a whole local day, before the hour curve splits it. */
export function dayVolume(dayNumber: number): number {
  return (
    BASE_DAILY_ORDERS *
    WEEKDAY_FACTOR[weekdayOfDay(dayNumber)] *
    dailyNoise(dayNumber) *
    (isSaleDay(dayNumber) ? SALE_FACTOR : 1)
  );
}

/** Expected number of orders in UTC hour `hour` (hours since the Unix epoch). */
export function hourRate(hour: number): number {
  const local = zonedParts(hour * HOUR_MS);
  return dayVolume(local.dayNumber) * HOUR_CURVE[local.hour];
}

/** Sales lift conversion a little as well as traffic. */
const SALE_CONVERSION_LIFT = 1.08;

/**
 * Share of sessions that end in an order on local day `n`: 2.15%-2.65% on a
 * normal day, up to about 2.9% during a sale.
 */
export function conversionRate(dayNumber: number): number {
  const u = rngFor(SIM_SEED, "conversion", dayNumber)();
  const base = 0.0215 + 0.005 * u;
  return isSaleDay(dayNumber) ? base * SALE_CONVERSION_LIFT : base;
}

/**
 * Store sessions in UTC hour `hour`. Derived from the expected order rate, not
 * the drawn count, so hourly conversion wobbles the way a real shop's does.
 */
export function hourSessions(hour: number): number {
  const local = zonedParts(hour * HOUR_MS);
  const expected = hourRate(hour) / conversionRate(local.dayNumber);
  const jitter = 0.96 + 0.08 * rngFor(SIM_SEED, "sessions", hour)();
  return Math.round(expected * jitter);
}

/**
 * Sessions on local day `n` up to instant `toMs`, with the current hour
 * counted pro rata. It only rises as `toMs` grows, so a catch-up can store it
 * with GREATEST() and never double-count.
 */
export function daySessionsUntil(dayNumber: number, toMs: number): number {
  const startHour = startOfDayNumber(dayNumber) / HOUR_MS;
  const endHour = startOfDayNumber(dayNumber + 1) / HOUR_MS;
  let total = 0;
  for (let h = startHour; h < endHour; h++) {
    const elapsed = (toMs - h * HOUR_MS) / HOUR_MS;
    if (elapsed <= 0) break;
    total += hourSessions(h) * Math.min(1, elapsed);
  }
  return Math.round(total);
}
