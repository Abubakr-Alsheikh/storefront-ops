import { formatDayMonth } from "@/lib/format";
import {
  addZonedDays,
  dayKeyFromNumber,
  dayNumberFromKey,
  startOfDayNumber,
  zonedParts,
  type DayKey,
} from "@/lib/tz";

/**
 * Date ranges for the overview. A range is whole local days ending today,
 * cut at `now`; its previous period is the same span the same number of days
 * earlier, cut at the same wall-clock time, so a partial today is compared
 * with an equally partial day.
 */

export const RANGE_KEYS = ["today", "7d", "30d", "90d", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** Orders older than this many days are trimmed nightly. */
export const RETENTION_DAYS = 90;

/** A half-open span of UTC milliseconds, `[from, to)`. */
export interface Period {
  from: number;
  to: number;
}

export interface ResolvedRange {
  key: RangeKey;
  /** "Last 7 days", "3 Oct – 9 Oct". */
  label: string;
  /** Completes "compared with …": "the 7 days before". */
  previousLabel: string;
  current: Period;
  previous: Period;
  /** Local days in the range, including a partial today. */
  days: number;
  firstDay: DayKey;
  lastDay: DayKey;
  /** Hourly buckets for a single day, daily otherwise. */
  granularity: "hour" | "day";
}

const PRESET_DAYS: Record<Exclude<RangeKey, "custom">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const PRESET_LABELS: Record<Exclude<RangeKey, "custom">, [string, string]> = {
  today: ["Today", "yesterday until now"],
  "7d": ["Last 7 days", "the 7 days before"],
  "30d": ["Last 30 days", "the 30 days before"],
  "90d": ["Last 90 days", "the 90 days before"],
};

export interface CustomDays {
  from: DayKey;
  to: DayKey;
}

/**
 * Resolves a range at instant `now`. Custom ranges are inclusive local dates
 * inside the retention window; anything else throws a RangeError, which the
 * API reports as `bad_request`.
 */
export function resolveRange(key: RangeKey, now: number, custom?: CustomDays): ResolvedRange {
  const today = zonedParts(now).dayNumber;
  let firstDay: number;
  let lastDay: number;
  let label: string;
  let previousLabel: string;

  if (key === "custom") {
    if (!custom) throw new RangeError("A custom range needs from and to");
    firstDay = dayNumberFromKey(custom.from);
    lastDay = dayNumberFromKey(custom.to);
    if (firstDay > lastDay) throw new RangeError("The range starts after it ends");
    if (lastDay > today) throw new RangeError("The range ends in the future");
    if (firstDay <= today - RETENTION_DAYS) {
      throw new RangeError(`The range starts more than ${RETENTION_DAYS} days ago`);
    }
    const count = lastDay - firstDay + 1;
    const first = formatDayMonth(startOfDayNumber(firstDay));
    const last = formatDayMonth(startOfDayNumber(lastDay));
    label = count === 1 ? first : `${first} – ${last}`;
    previousLabel = count === 1 ? "the day before" : `the ${count} days before`;
  } else {
    lastDay = today;
    firstDay = today - PRESET_DAYS[key] + 1;
    [label, previousLabel] = PRESET_LABELS[key];
  }

  const days = lastDay - firstDay + 1;
  const from = startOfDayNumber(firstDay);
  const to = lastDay === today ? now : startOfDayNumber(lastDay + 1);

  return {
    key,
    label,
    previousLabel,
    current: { from, to },
    previous: { from: addZonedDays(from, -days), to: addZonedDays(to, -days) },
    days,
    firstDay: dayKeyFromNumber(firstDay),
    lastDay: dayKeyFromNumber(lastDay),
    granularity: days === 1 ? "hour" : "day",
  };
}
