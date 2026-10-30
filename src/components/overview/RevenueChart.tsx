"use client";

import { useRef, useState } from "react";
import { areaPath, labelIndexes, linePath, nearestIndex, niceTicks } from "@/lib/chart";
import type { SeriesPoint } from "@/lib/contracts/overview";
import { cx } from "@/lib/cx";
import { overviewCopy } from "@/lib/data/copy/overview";
import { deltaRatio, formatDayMonth, formatDelta, formatMoney, formatTime } from "@/lib/format";

/**
 * The revenue chart, drawn by hand. Recharts cost 85 KB and over 200 ms of
 * blocked main thread on a phone (M6 notes). The plot is an SVG stretched over
 * a 0-100 box with non-scaling strokes; labels, crosshair and tooltip are HTML
 * placed by percentage, so nothing needs measuring and both themes come from
 * the tokens.
 */

function Tooltip({ point, granularity, position }: { point: SeriesPoint; granularity: "hour" | "day"; position: number }) {
  const at = Date.parse(point.start);
  const previous = point.previousRevenueCents;
  return (
    <div
      style={{ left: `${position * 100}%` }}
      className={cx(
        "pointer-events-none absolute top-1 z-10 w-44 rounded-md border border-line bg-surface p-2 text-xs text-ink shadow-float",
        position > 0.5 ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
      )}
    >
      <p className="font-medium">{granularity === "hour" ? formatTime(at) : formatDayMonth(at)}</p>
      <p className="mt-1 flex justify-between gap-2 tabular-nums">
        <span className="text-ink-muted">{overviewCopy.thisPeriod}</span>
        {formatMoney(point.revenueCents)}
      </p>
      {previous !== null ? (
        <>
          <p className="flex justify-between gap-2 tabular-nums">
            <span className="text-ink-muted">{overviewCopy.previousPeriod}</span>
            {formatMoney(previous)}
          </p>
          <p className="mt-1 text-right font-medium tabular-nums">{formatDelta(deltaRatio(point.revenueCents, previous))}</p>
        </>
      ) : null}
    </div>
  );
}

export function RevenueChart({ series, granularity }: { series: SeriesPoint[]; granularity: "hour" | "day" }) {
  const plot = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const current = series.map((p) => p.revenueCents);
  const previous = series.map((p) => p.previousRevenueCents);
  const ticks = niceTicks(Math.max(0, ...current, ...previous.map((v) => v ?? 0)));
  const top = ticks[ticks.length - 1];
  const last = Math.max(1, series.length - 1);

  function onPointer(event: React.PointerEvent<HTMLDivElement>) {
    const box = plot.current?.getBoundingClientRect();
    if (box?.width) setActive(nearestIndex((event.clientX - box.left) / box.width, series.length));
  }

  const point = active === null ? null : series[active];
  const position = active === null ? 0 : active / last;

  return (
    <div className="relative h-full text-2xs text-ink-muted tabular-nums">
      <div ref={plot} onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setActive(null)} className="absolute top-2 right-2 bottom-6 left-12 touch-pan-y">
        {ticks.map((tick) => (
          <div key={tick} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(tick / top) * 100}%` }}>
            <span className="absolute right-full mr-2 -translate-y-1/2 whitespace-nowrap">{formatMoney(tick, { compact: true })}</span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <path d={areaPath(current, top)} fill="var(--accent)" fillOpacity="0.12" />
          <path d={linePath(previous, top)} fill="none" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={linePath(current, top)} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {point ? (
          <>
            <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${position * 100}%` }} />
            <div
              className="absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface bg-accent"
              style={{ left: `${position * 100}%`, bottom: `${(point.revenueCents / top) * 100}%` }}
            />
            <Tooltip point={point} granularity={granularity} position={position} />
          </>
        ) : null}
        <div className="absolute inset-x-0 top-full h-6">
          {labelIndexes(series.length, 6).map((i, n) => {
            const at = Date.parse(series[i].start);
            return (
              <span
                key={series[i].start}
                className={cx("absolute top-1.5 whitespace-nowrap", i > 0 && "-translate-x-1/2", n % 2 === 1 && "max-sm:hidden")}
                style={{ left: `${(i / last) * 100}%` }}
              >
                {granularity === "hour" ? formatTime(at) : formatDayMonth(at)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
