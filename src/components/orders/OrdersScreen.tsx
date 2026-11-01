"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useNewOrderCount } from "@/components/LiveFeedProvider";
import { LazyPopover } from "@/components/ui/LazyPopover";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ApiClientError } from "@/lib/api/client";
import { useSlowHint } from "@/lib/api/hooks";
import { useBulkShip } from "@/lib/api/orderActions";
import { useOrdersGrandTotal, useOrdersWindow } from "@/lib/api/ordersWindow";
import type { OrderRow } from "@/lib/contracts/orders";
import { cx } from "@/lib/cx";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";
import { ordersCopy } from "@/lib/data/copy/orders";
import { SHIPPABLE_STATUSES, type OrderSort, type OrderStatus } from "@/lib/domain";
import { DENSITIES, getDensity, getHiddenColumns, setDensity, setHiddenColumns, subscribePreferences } from "@/lib/theme";
import { FilterBar } from "./FilterBar";
import { OrdersGrid } from "./OrdersGrid";
import { useOrderFilters } from "./useOrderFilters";

const NONE: readonly string[] = [];
const BULK_MAX = 100;

/** Columns a person may hide; the order number and status always stay. */
const HIDEABLE = ["placed", "customer", "country", "items", "total", "payment"] as const;

function ColumnMenu({ hidden }: { hidden: readonly string[] }) {
  return (
    <LazyPopover label={ordersCopy.columns} align="end" className="w-44">
      <ul className="flex flex-col gap-0.5">
        {HIDEABLE.map((id) => (
          <li key={id}>
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded px-1 hover:bg-surface-2">
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={!hidden.includes(id)}
                onChange={(event) =>
                  setHiddenColumns(event.target.checked ? hidden.filter((c) => c !== id) : [...hidden, id])
                }
              />
              {ordersCopy.headers[id]}
            </label>
          </li>
        ))}
      </ul>
    </LazyPopover>
  );
}

function BulkBar({ selected, onClear }: { selected: ReadonlyMap<number, OrderStatus>; onClear: () => void }) {
  const bulk = useBulkShip();
  const skipped = [...selected.values()].filter((s) => !SHIPPABLE_STATUSES.includes(s)).length;
  const tooMany = selected.size > BULK_MAX;
  return (
    <div className="absolute inset-x-2 bottom-2 z-[4] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface p-2 text-sm shadow-float">
      <span className="font-medium tabular-nums">{ordersCopy.selected(selected.size)}</span>
      <Button
        variant="primary"
        disabled={tooMany || bulk.isPending || selected.size === skipped}
        onClick={() => bulk.mutate([...selected.keys()], { onSuccess: onClear })}
      >
        {ordersCopy.markShipped}
      </Button>
      <Button variant="ghost" onClick={onClear}>{ordersCopy.clearSelection}</Button>
      <span role="status" className="min-w-0 text-xs text-ink-muted">
        {tooMany ? ordersCopy.tooMany : skipped ? ordersCopy.skipped(skipped) : null}
      </span>
    </div>
  );
}

export function OrdersFallback() {
  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-96 flex-col gap-3">
      {/* The same rows as the real screen: search and filters, then the count line. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Skeleton className="h-8 w-full shrink-0 md:w-80" />
        <div className="py-0.5">
          <Skeleton className="h-8 w-full max-w-md md:w-96" />
        </div>
      </div>
      <div className="flex h-8 shrink-0 items-center">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="min-h-0 flex-1 rounded-md border border-line bg-surface" />
    </div>
  );
}

export function OrdersScreen() {
  const filters = useOrderFilters();
  const { state, setState, query, hasFilters } = filters;
  const { total, newest, getRow, ensureRange, isPending, isStale, error, refetch } = useOrdersWindow(query);
  // New orders only belong at the top of the unfiltered, newest-first list; anywhere else they wait.
  const isDefaultView = !hasFilters && state.sort === "placed" && state.dir === "desc";
  const newOrders = useNewOrderCount(isDefaultView ? newest : null);
  const [shown, setShown] = useState(0);
  const showNewOrders = async () => {
    await refetch();
    setShown((n) => n + 1);
  };
  const grandTotal = useOrdersGrandTotal(hasFilters);
  const slow = useSlowHint(isPending);

  const density = useSyncExternalStore(subscribePreferences, getDensity, () => "comfortable" as const);
  const hidden = useSyncExternalStore(subscribePreferences, getHiddenColumns, () => NONE);

  const [selected, setSelected] = useState<ReadonlyMap<number, OrderStatus>>(new Map());
  const toggle = useCallback((order: OrderRow) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(order.number)) next.delete(order.number);
      else next.set(order.number, order.status);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected((c) => (c.size ? new Map() : c)), []);
  const onSort = useCallback((sort: OrderSort, dir: "asc" | "desc") => void setState({ sort, dir }), [setState]);

  const code = error instanceof ApiClientError ? error.code : "internal";
  const resultKey = `${JSON.stringify(query)}|${shown}`;
  const clear = () =>
    void setState({ status: null, country: null, payment: null, from: null, to: null, min: null, max: null, q: null });

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-96 flex-col gap-3">
      <FilterBar filters={filters} />
      <div className="flex h-8 shrink-0 items-center gap-3">
        <p aria-live="polite" className="min-w-0 truncate text-sm text-ink-muted tabular-nums">
          {/* While a new filter loads, `total` is the old answer: "of" would compare it with the wrong thing. */}
          {total === undefined ? (slow ? overviewCopy.waking : null) : ordersCopy.count(total, hasFilters && !isStale ? grandTotal.data : undefined)}
        </p>
        {hasFilters ? <Button variant="ghost" compact onClick={clear}>{ordersCopy.clearFilters}</Button> : null}
        {newOrders > 0 ? <Button compact className="shrink-0 tabular-nums" onClick={() => void showNewOrders()}>{ordersCopy.newOrders(newOrders)}</Button> : null}
        <div className="ml-auto flex items-center gap-2 max-md:hidden">
          <div role="group" aria-label={ordersCopy.density.name} className="inline-flex h-8 gap-0.5 rounded-md bg-surface-2 p-0.5">
            {DENSITIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={density === option}
                onClick={() => setDensity(option)}
                className={cx("h-7 rounded px-2 text-sm font-medium", density === option ? "bg-surface text-ink" : "text-ink-muted hover:text-ink")}
              >
                {ordersCopy.density[option]}
              </button>
            ))}
          </div>
          <ColumnMenu hidden={hidden} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {error && total === undefined ? (
          <EmptyState title={ERROR_MESSAGES[code]} action={<Button onClick={() => void refetch()}>{overviewCopy.retry}</Button>}>
            {error.message}
          </EmptyState>
        ) : total === 0 && !isStale ? (
          <EmptyState
            title={state.q ? ordersCopy.emptySearch(state.q) : ordersCopy.emptyFilters}
            action={<Button onClick={clear}>{ordersCopy.clearFilters}</Button>}
          >
            {state.q ? ordersCopy.emptySearchHelp : ordersCopy.emptyFiltersHelp}
          </EmptyState>
        ) : (
          <OrdersGrid
            total={isPending ? undefined : total}
            getRow={getRow}
            ensureRange={ensureRange}
            resultKey={resultKey}
            stale={isStale}
            sort={state.sort}
            dir={state.dir}
            onSort={onSort}
            hidden={hidden}
            density={density}
            selected={selected}
            onToggle={toggle}
            onClearSelection={clearSelection}
          />
        )}
        {selected.size ? <BulkBar selected={selected} onClear={clearSelection} /> : null}
      </div>
    </div>
  );
}
