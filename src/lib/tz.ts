import { site } from "@/lib/site";

/**
 * Wall-clock maths in the store's time zone, DST-safe through `Intl`.
 * Dates are stored in UTC; the shop's day, hour and weekday are Lisbon's.
 *
 * `Intl` is slow next to plain arithmetic, so the zone offset is cached per
 * 15-minute bucket. Zone transitions fall on quarter-hour UTC instants in
 * every zone in use today, so an offset is constant inside a bucket.
 */

export const STORE_TIME_ZONE = site.store.timeZone;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DAY_MS = 24 * HOUR;
const BUCKET = 15 * MINUTE;

/** A calendar date in the store's zone, as `YYYY-MM-DD`. */
export type DayKey = string;

export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Local time minus UTC, in minutes (Lisbon: 0 in winter, 60 in summer). */
  offsetMinutes: number;
  /** Whole days from 1970-01-01 to this local date. */
  dayNumber: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, Map<number, number>>();

function partsFormatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function computeOffsetMinutes(ms: number, timeZone: string): number {
  const values: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(ms)) {
    if (p.type !== "literal") values[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  return Math.round((asUtc - wholeSecond) / MINUTE);
}

/** Offset of the zone from UTC at instant `ms`, in minutes. */
export function tzOffsetMinutes(ms: number, timeZone = STORE_TIME_ZONE): number {
  let cache = offsetCache.get(timeZone);
  if (!cache) {
    cache = new Map();
    offsetCache.set(timeZone, cache);
  }
  const bucket = Math.floor(ms / BUCKET);
  let offset = cache.get(bucket);
  if (offset === undefined) {
    offset = computeOffsetMinutes(bucket * BUCKET, timeZone);
    cache.set(bucket, offset);
  }
  return offset;
}

/** The store's wall-clock reading at instant `ms`. */
export function zonedParts(ms: number, timeZone = STORE_TIME_ZONE): ZonedParts {
  const offsetMinutes = tzOffsetMinutes(ms, timeZone);
  const local = new Date(ms + offsetMinutes * MINUTE);
  const dayNumber = Math.floor(local.getTime() / DAY_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
    weekday: local.getUTCDay(),
    offsetMinutes,
    dayNumber,
  };
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

/**
 * The UTC instant for a wall-clock time in the zone. A time skipped by a
 * spring-forward gap moves forward by the gap (01:30 becomes 02:30); a time
 * repeated by a fall-back resolves to its first occurrence.
 */
export function zonedToUtc(wall: WallClock, timeZone = STORE_TIME_ZONE): number {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
  );
  // Try the offsets in force a day either side; keep the earliest that
  // reads back as the requested wall time.
  const candidates = [
    tzOffsetMinutes(naive - DAY_MS, timeZone),
    tzOffsetMinutes(naive + DAY_MS, timeZone),
  ].sort((a, b) => b - a);
  for (const offset of candidates) {
    const guess = naive - offset * MINUTE;
    if (tzOffsetMinutes(guess, timeZone) === offset) return guess;
  }
  // Inside a gap: neither offset reads back. The pre-gap offset (the
  // smaller one) shifts the time forward past the gap.
  return naive - candidates[candidates.length - 1] * MINUTE;
}

/** Local date of day number `n` (days since 1970-01-01). */
export function dayKeyFromNumber(n: number): DayKey {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Day number of a `YYYY-MM-DD` key. */
export function dayNumberFromKey(key: DayKey): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Not a date: ${key}`);
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (dayKeyFromNumber(ms / DAY_MS) !== key) {
    throw new RangeError(`Not a date: ${key}`);
  }
  return ms / DAY_MS;
}

/** The store's calendar date at instant `ms`. */
export function dayKeyAt(ms: number, timeZone = STORE_TIME_ZONE): DayKey {
  return dayKeyFromNumber(zonedParts(ms, timeZone).dayNumber);
}

/** UTC instant of local midnight at the start of day number `n`. */
export function startOfDayNumber(n: number, timeZone = STORE_TIME_ZONE): number {
  const d = new Date(n * DAY_MS);
  return zonedToUtc(
    { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
    timeZone,
  );
}

/** UTC instant of local midnight at the start of the local day holding `ms`. */
export function startOfZonedDay(ms: number, timeZone = STORE_TIME_ZONE): number {
  return startOfDayNumber(zonedParts(ms, timeZone).dayNumber, timeZone);
}

/**
 * The same wall-clock time `days` local days later (negative goes back).
 * Across a DST change the gap is 23 or 25 hours, not 24.
 */
export function addZonedDays(
  ms: number,
  days: number,
  timeZone = STORE_TIME_ZONE,
): number {
  const p = zonedParts(ms, timeZone);
  const target = new Date((p.dayNumber + days) * DAY_MS);
  return (
    zonedToUtc(
      {
        year: target.getUTCFullYear(),
        month: target.getUTCMonth() + 1,
        day: target.getUTCDate(),
        hour: p.hour,
        minute: p.minute,
        second: p.second,
      },
      timeZone,
    ) +
    (ms % 1000)
  );
}
