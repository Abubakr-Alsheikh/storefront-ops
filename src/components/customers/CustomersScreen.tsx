"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DataGrid, type DataColumn } from "@/components/ui/DataGrid";
import { FilterChips, type FilterChip } from "@/components/ui/FilterChips";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { SearchBox } from "@/components/ui/SearchBox";
import { SegmentBadge } from "@/components/ui/StatusBadge";
import { ApiClientError } from "@/lib/api/client";
import { useCustomersWindow, type CustomersApiQuery } from "@/lib/api/catalogue";
import type { CustomerRow } from "@/lib/contracts/catalogue";
import { COUNTRIES } from "@/lib/data/countries";
import { SEGMENT_HELP, SEGMENT_LABELS, customersCopy } from "@/lib/data/copy/catalogue";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";
import { ordersCopy } from "@/lib/data/copy/orders";
import { CUSTOMER_SORTS, type CustomerSort } from "@/lib/domain";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { SEGMENTS, type Segment } from "@/lib/segments";
import { getDensity, subscribePreferences } from "@/lib/theme";

const parsers = {
  q: parseAsString,
  segment: parseAsStringLiteral(SEGMENTS),
  sort: parseAsStringLiteral(CUSTOMER_SORTS).withDefault("lifetime"),
  dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc"),
};

const CHIPS: readonly FilterChip<Segment | "all">[] = [
  { value: "all", label: customersCopy.allSegments },
  ...SEGMENTS.map((segment) => ({ value: segment, label: SEGMENT_LABELS[segment] })),
];

const COLUMNS: readonly DataColumn<CustomerRow, CustomerSort>[] = [
  {
    id: "customer",
    header: customersCopy.headers.customer,
    width: "minmax(200px, 1.2fr)",
    minWidth: 200,
    sort: "name",
    render: (row) => (
      // A real link, for opening in a new tab; the row's own click does the same.
      <Link href={`/customers/${row.id}`} prefetch={false} tabIndex={-1} onClick={(event) => event.stopPropagation()} className="min-w-0 truncate rounded hover:underline">
        {row.name}
      </Link>
    ),
  },
  { id: "country", header: customersCopy.headers.country, width: "minmax(112px, 1fr)", minWidth: 112, render: (row) => <span className="truncate">{COUNTRIES[row.country].name}</span> },
  { id: "orders", header: customersCopy.headers.orders, width: "80px", minWidth: 80, right: true, sort: "orders", sortDescFirst: true, render: (row) => <span className="tabular-nums">{formatNumber(row.ordersCount)}</span> },
  { id: "lifetime", header: customersCopy.headers.lifetime, width: "128px", minWidth: 128, right: true, sort: "lifetime", sortDescFirst: true, render: (row) => <span className="tabular-nums">{formatMoney(row.lifetimeCents)}</span> },
  { id: "last_order", header: customersCopy.headers.lastOrder, width: "120px", minWidth: 120, sort: "last_order", sortDescFirst: true, render: (row) => <span className="truncate tabular-nums">{formatDate(Date.parse(row.lastOrderAt))}</span> },
  { id: "segment", header: customersCopy.headers.segment, width: "112px", minWidth: 112, render: (row) => <SegmentBadge segment={row.segment} /> },
];

function Card(row: CustomerRow) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{row.name}</span>
        <span className="shrink-0 tabular-nums">{formatMoney(row.lifetimeCents)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-ink-muted tabular-nums">{customersCopy.orders(row.ordersCount)} · {formatDate(Date.parse(row.lastOrderAt))}</span>
        <SegmentBadge segment={row.segment} />
      </div>
    </>
  );
}

export function CustomersFallback() {
  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-96 flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Skeleton className="h-8 w-full shrink-0 md:w-80" />
        <Skeleton className="h-8 w-full max-w-md md:w-96" />
      </div>
      <div className="flex h-8 shrink-0 items-center">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="min-h-0 flex-1 rounded-md border border-line bg-surface" />
    </div>
  );
}

export function CustomersScreen() {
  const [state, setState] = useQueryStates(parsers);
  const query = useMemo<CustomersApiQuery>(() => {
    const out: CustomersApiQuery = {};
    if (state.q) out.q = state.q;
    if (state.segment) out.segment = state.segment;
    if (state.sort !== "lifetime") out.sort = state.sort;
    if (state.dir !== "desc") out.dir = state.dir;
    return out;
  }, [state]);
  const { total, getRow, onRange, isStale, error, refetch } = useCustomersWindow(query);
  const density = useSyncExternalStore(subscribePreferences, getDensity, () => "comfortable" as const);
  const router = useRouter();
  const open = useCallback((row: CustomerRow) => router.push(`/customers/${row.id}`), [router]);

  const hasFilters = Boolean(state.q || state.segment);
  const clear = () => void setState({ q: null, segment: null });
  const code = error instanceof ApiClientError ? error.code : "internal";

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-96 flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchBox label={customersCopy.searchPlaceholder} value={state.q ?? ""} onCommit={(q) => void setState({ q: q || null })} />
        <FilterChips name={customersCopy.segmentFilter} options={CHIPS} value={state.segment ?? "all"} onChange={(next) => void setState({ segment: next === "all" ? null : next })} />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-3">
        <p aria-live="polite" className="min-w-0 truncate text-sm text-ink-muted tabular-nums">
          {total === undefined ? null : customersCopy.count(total)}
          {state.segment ? <span className="max-md:hidden"> · {SEGMENT_HELP[state.segment]}</span> : null}
        </p>
        {hasFilters ? <Button variant="ghost" compact onClick={clear}>{ordersCopy.clearFilters}</Button> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {error && total === undefined ? (
          <EmptyState title={ERROR_MESSAGES[code]} action={<Button onClick={() => void refetch()}>{overviewCopy.retry}</Button>}>
            {error.message}
          </EmptyState>
        ) : total === 0 && !isStale ? (
          <EmptyState title={customersCopy.empty} action={<Button onClick={clear}>{ordersCopy.clearFilters}</Button>}>
            {customersCopy.emptyHelp}
          </EmptyState>
        ) : (
          <DataGrid
            name={customersCopy.gridName}
            idPrefix="customer"
            columns={COLUMNS}
            total={total}
            getRow={getRow}
            onRange={onRange}
            resultKey={JSON.stringify(query)}
            stale={isStale}
            sort={state.sort}
            dir={state.dir}
            onSort={(sort, dir) => void setState({ sort, dir })}
            density={density}
            renderCard={Card}
            onOpen={open}
          />
        )}
      </div>
    </div>
  );
}
