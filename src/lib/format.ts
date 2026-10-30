import { site } from "@/lib/site";
import { STORE_TIME_ZONE } from "@/lib/tz";

/**
 * Formatting at the edge. Money arrives as integer cents and dates as UTC
 * milliseconds; this file is the only place they become text. British
 * English, euros, and the store's time zone.
 */

const LOCALE = "en-GB";
const MINUS = "−";

const money2 = new Intl.NumberFormat(LOCALE, { style: "currency", currency: site.store.currency });
const money0 = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: site.store.currency,
  maximumFractionDigits: 0,
});
const moneyCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: site.store.currency,
  notation: "compact",
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "short" });

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: STORE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: STORE_TIME_ZONE,
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: STORE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface MoneyOptions {
  /** "€4.8k" for KPI cards and chart axes. */
  compact?: boolean;
  /** Drop the cents: "€4,812". */
  whole?: boolean;
}

/** Integer cents to euros: 481250 → "€4,812.50". */
export function formatMoney(cents: number, options: MoneyOptions = {}): string {
  const euros = cents / 100;
  const text = options.compact
    ? moneyCompact.format(euros)
    : options.whole
      ? money0.format(euros)
      : money2.format(euros);
  return text.replace("-", MINUS);
}

/** KPI cards drop the cents from €10,000 up: "€48,120", "€82.85". */
export function formatKpiMoney(cents: number): string {
  return formatMoney(cents, { whole: cents >= 1_000_000 });
}

/** 125000 → "125,000". */
export function formatNumber(value: number): string {
  return integer.format(value).replace("-", MINUS);
}

/** A ratio as a percentage: 0.0243 → "2.4%". */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`.replace("-", MINUS);
}

/** Change from `previous` to `current` as a ratio, or null when there is nothing to compare with. */
export function deltaRatio(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** "+12.4%", "−3.1%", "No change", or "No comparison" when the previous period is empty. */
export function formatDelta(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "No comparison";
  const rounded = Math.round(ratio * 1000) / 10;
  if (rounded === 0) return "No change";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(1)}%`;
}

/** Order numbers always carry their hash: "#100123". */
export function formatOrderNumber(number: number): string {
  return `#${number}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function formatOrdinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "24 Oct 2026" in the store's time zone. */
export function formatDate(ms: number): string {
  return dateFormat.format(ms);
}

/** "24 Oct" in the store's time zone. */
export function formatDayMonth(ms: number): string {
  return dayMonthFormat.format(ms);
}

/** "14:05" in the store's time zone. */
export function formatTime(ms: number): string {
  return timeFormat.format(ms);
}

/** "24 Oct 2026, 14:05" in the store's time zone. */
export function formatDateTime(ms: number): string {
  return `${formatDate(ms)}, ${formatTime(ms)}`;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "4 min ago", "2 hr ago", "yesterday", "3 days ago", then the
 * date once it is more than a week old. Times a little in the future (clock
 * skew) read as "just now".
 */
export function formatRelative(ms: number, now: number): string {
  const elapsed = now - ms;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), "day");
  return formatDayMonth(ms);
}
