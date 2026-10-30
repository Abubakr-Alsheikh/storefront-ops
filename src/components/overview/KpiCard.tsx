import { Skeleton } from "@/components/ui/primitives";
import { cx } from "@/lib/cx";
import { overviewCopy } from "@/lib/data/copy/overview";
import { deltaRatio, formatDelta } from "@/lib/format";

export interface KpiCardProps {
  label: string;
  /** Absent while loading: the card keeps its exact size. */
  value?: string;
  current?: number;
  previous?: number | null;
  series?: number[];
  previousSeries?: (number | null)[];
}

const CARD = "w-65 shrink-0 snap-start rounded-md border border-line bg-surface p-4 md:w-auto xl:p-5";

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M5 8.5v-7M2 4.5l3-3 3 3" : "M5 1.5v7M2 5.5l3 3 3-3"} />
    </svg>
  );
}

function Delta({ current, previous }: { current: number; previous: number | null | undefined }) {
  const ratio = previous === null || previous === undefined ? null : deltaRatio(current, previous);
  const text = formatDelta(ratio);
  const moved = ratio !== null && text !== "No change";
  return (
    <p
      title={moved ? overviewCopy.vsPrevious : undefined}
      className={cx(
        "flex h-5 items-center gap-1 text-xs font-medium tabular-nums",
        // Every KPI here is better when higher; the sign and arrow say the same as the colour.
        moved ? (ratio > 0 ? "text-positive" : "text-negative") : "text-ink-muted",
      )}
    >
      {moved ? <Arrow up={ratio > 0} /> : null}
      {text}
      {moved ? <span className="sr-only"> {overviewCopy.vsPrevious}</span> : null}
    </p>
  );
}

/** A 32 px line with no axes: this period in accent, the previous one dashed. */
function Sparkline({ series, previous }: { series: number[]; previous: (number | null)[] }) {
  if (series.length < 2) return <div className="h-8" />;
  const known = previous.filter((v): v is number => v !== null);
  const all = [...series, ...known];
  const min = Math.min(...all);
  const span = Math.max(...all) - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * 100;
  const y = (v: number) => 30 - ((v - min) / span) * 28;
  const path = (values: (number | null)[]) =>
    values.reduce<string>((d, v, i) => (v === null ? d : `${d}${d ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`), "");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      {known.length > 1 ? (
        <path d={path(previous)} fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ) : null}
      <path d={path(series)} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiCard({ label, value, current, previous, series, previousSeries }: KpiCardProps) {
  return (
    <div className={CARD}>
      <p className="text-xs text-ink-muted">{label}</p>
      {value === undefined || current === undefined ? (
        <>
          <Skeleton className="mt-1 h-7 w-28 xl:h-8" />
          <Skeleton className="mt-0.5 h-5 w-16" />
          <Skeleton className="mt-2 h-8 w-full" />
        </>
      ) : (
        <>
          <p className="mt-1 text-kpi text-ink tabular-nums">{value}</p>
          <div className="mt-0.5">
            <Delta current={current} previous={previous} />
          </div>
          <div className="mt-2">
            <Sparkline series={series ?? []} previous={previousSeries ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
