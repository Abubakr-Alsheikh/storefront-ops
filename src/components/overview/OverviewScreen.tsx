"use client";

import Link from "next/link";
import { useDeferredValue } from "react";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ApiClientError } from "@/lib/api/client";
import { useOverview, useSlowHint } from "@/lib/api/hooks";
import type { Overview } from "@/lib/contracts/overview";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";
import { formatKpiMoney, formatNumber, formatPercent } from "@/lib/format";
import { completeSeries } from "@/lib/overviewSummary";
import { KpiCard } from "./KpiCard";
import { LiveOrders } from "./LiveOrders";
import { CountryTable, StatusBreakdown, TopProducts } from "./panels";
import { RangePicker, useRangeSelection } from "./RangePicker";
import { RevenueCard } from "./RevenueCard";

function Kpis({ overview }: { overview?: Overview }) {
  const k = overview?.kpis;
  const s = overview && completeSeries(overview);
  const ratio = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
  return (
    // Below md the cards keep their size and scroll sideways, inside their own row.
    <div
      tabIndex={0}
      role="group"
      aria-label={overviewCopy.kpis.revenue}
      className="relative -mx-4 flex snap-x gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4"
    >
      <KpiCard
        label={overviewCopy.kpis.revenue}
        value={k && formatKpiMoney(k.revenueCents.current)}
        current={k?.revenueCents.current}
        previous={k?.revenueCents.previous}
        series={s?.map((p) => p.revenueCents)}
        previousSeries={s?.map((p) => p.previousRevenueCents)}
      />
      <KpiCard
        label={overviewCopy.kpis.orders}
        value={k && formatNumber(k.orders.current)}
        current={k?.orders.current}
        previous={k?.orders.previous}
        series={s?.map((p) => p.orders)}
        previousSeries={s?.map((p) => p.previousOrders)}
      />
      <KpiCard
        label={overviewCopy.kpis.averageOrder}
        value={k && formatKpiMoney(k.averageOrderCents.current)}
        current={k?.averageOrderCents.current}
        previous={k?.averageOrderCents.previous}
        series={s?.map((p) => ratio(p.revenueCents, p.orders) ?? 0)}
        previousSeries={s?.map((p) => ratio(p.previousRevenueCents, p.previousOrders))}
      />
      <KpiCard
        label={overviewCopy.kpis.conversion}
        value={k && formatPercent(k.conversionRate.current, 2)}
        current={k?.conversionRate.current}
        previous={k?.conversionRate.previous}
        series={s?.map((p) => ratio(p.orders, p.sessions) ?? 0)}
        previousSeries={s?.map((p) => ratio(p.previousOrders, p.previousSessions))}
      />
    </div>
  );
}

/** The whole body; with no data it is the skeleton, the same size as the real thing. */
export function OverviewBody({ overview }: { overview?: Overview }) {
  const low = overview?.lowStockVariants;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Kpis overview={overview} />
      {low === 0 ? null : (
        <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 text-sm">
          {low === undefined ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-2 shrink-0 rotate-45 bg-warning" />
                <span className="truncate">{overviewCopy.lowStock(low)}</span>
              </span>
              <Link href="/inventory?state=low" className="shrink-0 rounded font-medium text-accent hover:underline">
                {overviewCopy.reviewInventory}
              </Link>
            </>
          )}
        </div>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">
        <RevenueCard overview={overview} />
        {overview ? <LiveOrders /> : <LiveSkeleton />}
      </div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatusBreakdown overview={overview} />
        <TopProducts overview={overview} />
        <CountryTable overview={overview} />
      </div>
    </div>
  );
}

function LiveSkeleton() {
  return (
    <section aria-hidden="true" className="flex min-w-0 flex-col rounded-md border border-line bg-surface p-4 xl:col-span-4 xl:p-5">
      <p className="mb-3 flex h-8 items-center text-lg font-medium text-ink">{overviewCopy.live}</p>
      <div className="flex h-72 flex-1 flex-col gap-1">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11" />)}
      </div>
      <div className="mt-2 h-5" />
    </section>
  );
}

function Subtitle({ overview, slow }: { overview?: Overview; slow: boolean }) {
  return (
    <p aria-live="polite" className="min-h-5 w-full text-sm text-ink-muted sm:w-auto">
      {overview ? `${overview.range.label} · ${overviewCopy.comparedWith} ${overview.range.previousLabel}` : slow ? overviewCopy.waking : null}
    </p>
  );
}

export function OverviewHeaderFallback() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="w-full sm:w-auto">
        <Skeleton className="h-5 w-56" />
      </div>
      <Skeleton className="h-8 w-71" />
    </div>
  );
}

export function OverviewScreen() {
  const [selection] = useRangeSelection();
  const { data: latest, error, isPending, refetch, isFetching } = useOverview(selection);
  // A low-priority, time-sliced render: new data never blocks the main thread in one long task.
  const data = useDeferredValue(latest);
  const slow = useSlowHint(isPending);
  const code = error instanceof ApiClientError ? error.code : "internal";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Subtitle overview={data} slow={slow} />
        <RangePicker />
      </div>
      {error && !data ? (
        <EmptyState
          title={ERROR_MESSAGES[code]}
          action={
            <Button onClick={() => void refetch()} disabled={isFetching}>
              {overviewCopy.retry}
            </Button>
          }
        >
          {error.message}
        </EmptyState>
      ) : (
        <OverviewBody overview={data} />
      )}
    </div>
  );
}
