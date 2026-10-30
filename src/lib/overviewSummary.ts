import type { Overview } from "@/lib/contracts/overview";
import { deltaRatio, formatDayMonth, formatDelta, formatMoney, formatTime } from "@/lib/format";

/**
 * The buckets a line chart should plot: an hour or day still in progress is
 * left out, because its partial value reads as a sudden crash. Hours are one
 * hour long and days at least 23 (a DST change). KPIs and the table keep it.
 */
export function completeSeries(overview: Pick<Overview, "series" | "range">): Overview["series"] {
  const { series, range } = overview;
  const last = series[series.length - 1];
  if (!last || series.length < 2) return series;
  const length = range.granularity === "hour" ? 3_600_000 : 23 * 3_600_000;
  return Date.parse(range.to) - Date.parse(last.start) < length ? series.slice(0, -1) : series;
}

/** The one-sentence reading of the revenue chart for screen readers. */
export function revenueSummary(overview: Pick<Overview, "kpis" | "series" | "range">): string {
  const { current, previous } = overview.kpis.revenueCents;
  const peak = completeSeries(overview).reduce<Overview["series"][number] | null>(
    (best, point) => (!best || point.revenueCents > best.revenueCents ? point : best),
    null,
  );
  const when =
    peak && peak.revenueCents > 0
      ? overview.range.granularity === "hour"
        ? `, peaking at ${formatTime(Date.parse(peak.start))}`
        : `, peaking on ${formatDayMonth(Date.parse(peak.start))}`
      : "";
  if (previous === null) return `Revenue totals ${formatMoney(current, { whole: true })}${when}.`;
  const ratio = deltaRatio(current, previous);
  const text = formatDelta(ratio);
  if (text === "No change" || ratio === null) return `Revenue held level against the previous period${when}.`;
  return `Revenue ${ratio > 0 ? "rose" : "fell"} ${text.slice(1)} against the previous period${when}.`;
}
