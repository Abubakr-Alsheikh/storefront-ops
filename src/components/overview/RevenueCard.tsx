"use client";

import { useState } from "react";
import { Button, Skeleton } from "@/components/ui/primitives";
import type { Overview } from "@/lib/contracts/overview";
import { overviewCopy } from "@/lib/data/copy/overview";
import { formatDayMonth, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { completeSeries, revenueSummary } from "@/lib/overviewSummary";
import { RevenueChart } from "./RevenueChart";

const BODY = "h-60 md:h-75";
const TH = "h-8 px-2 text-xs font-medium text-ink-muted first:pl-0 last:pr-0";
const TD = "h-8 px-2 first:pl-0 last:pr-0";

function RevenueTable({ overview }: { overview: Overview }) {
  const hourly = overview.range.granularity === "hour";
  return (
    <div tabIndex={0} role="region" aria-label={overviewCopy.revenue} className={`${BODY} overflow-y-auto`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line">
            <th scope="col" className={`${TH} text-left`}>{hourly ? overviewCopy.hour : overviewCopy.date}</th>
            <th scope="col" className={`${TH} text-right`}>{overviewCopy.thisPeriod}</th>
            <th scope="col" className={`${TH} text-right`}>{overviewCopy.previousPeriod}</th>
            <th scope="col" className={`${TH} text-right`}>{overviewCopy.orders}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {overview.series.map((point) => {
            const at = Date.parse(point.start);
            return (
              <tr key={point.start} className="border-b border-line last:border-0">
                <td className={TD}>{hourly ? formatTime(at) : formatDayMonth(at)}</td>
                <td className={`${TD} text-right`}>{formatMoney(point.revenueCents)}</td>
                <td className={`${TD} text-right text-ink-muted`}>
                  {point.previousRevenueCents === null ? "" : formatMoney(point.previousRevenueCents)}
                </td>
                <td className={`${TD} text-right`}>{formatNumber(point.orders)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LegendLine({ dashed, children }: { dashed?: boolean; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="16" height="2" aria-hidden="true">
        <line
          x1="0"
          y1="1"
          x2="16"
          y2="1"
          stroke={dashed ? "var(--line-strong)" : "var(--accent)"}
          strokeWidth="2"
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      </svg>
      {children}
    </span>
  );
}

export function RevenueCard({ overview }: { overview?: Overview }) {
  const [asTable, setAsTable] = useState(false);
  const summary = overview ? revenueSummary(overview) : undefined;
  return (
    <section aria-labelledby="revenue-title" className="min-w-0 rounded-md border border-line bg-surface p-4 xl:col-span-8 xl:p-5">
      <div className="mb-3 flex h-8 items-center gap-4">
        <h2 id="revenue-title" className="text-lg font-medium text-ink">{overviewCopy.revenue}</h2>
        <div className="hidden min-w-0 flex-1 items-center gap-4 text-xs text-ink-muted sm:flex">
          <LegendLine>{overviewCopy.thisPeriod}</LegendLine>
          <LegendLine dashed>{overviewCopy.previousPeriod}</LegendLine>
        </div>
        <Button variant="ghost" onClick={() => setAsTable((v) => !v)} className="ml-auto max-sm:ml-auto">
          {asTable ? overviewCopy.viewChart : overviewCopy.viewTable}
        </Button>
      </div>
      {summary ? <p className="sr-only">{summary}</p> : null}
      {!overview ? (
        <Skeleton className={BODY} />
      ) : asTable ? (
        <RevenueTable overview={overview} />
      ) : (
        <div role="img" aria-label={summary} className={BODY}>
          <RevenueChart series={completeSeries(overview)} granularity={overview.range.granularity} />
        </div>
      )}
    </section>
  );
}
