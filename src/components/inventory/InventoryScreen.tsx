"use client";

import dynamic from "next/dynamic";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DataGrid, type DataColumn } from "@/components/ui/DataGrid";
import { FilterChips } from "@/components/ui/FilterChips";
import { Button, EmptyState, Select, Skeleton } from "@/components/ui/primitives";
import { SearchBox } from "@/components/ui/SearchBox";
import { StockBadge } from "@/components/ui/StatusBadge";
import { ApiClientError } from "@/lib/api/client";
import { useInventory, useRestock, type InventoryApiQuery } from "@/lib/api/catalogue";
import type { InventoryRow } from "@/lib/contracts/catalogue";
import { STOCK_LABELS, inventoryCopy } from "@/lib/data/copy/catalogue";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";
import { ordersCopy } from "@/lib/data/copy/orders";
import { INVENTORY_SORTS, type InventorySort } from "@/lib/domain";
import { formatCover, formatNumber } from "@/lib/format";
import { getDensity, subscribePreferences } from "@/lib/theme";

const RestockDialog = dynamic(() => import("./RestockDialog"), { ssr: false });

const parsers = {
  q: parseAsString,
  collection: parseAsString,
  state: parseAsStringLiteral(["all", "low", "out"] as const).withDefault("all"),
  sort: parseAsStringLiteral(INVENTORY_SORTS).withDefault("cover"),
  dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
};

/** No photo yet: the neutral tile with the type's initial (IMAGES.md). */
function ProductTile({ slot }: { slot: string }) {
  return (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-2xs text-ink-muted uppercase">
      {slot.charAt(0)}
    </span>
  );
}

function Cover({ row }: { row: InventoryRow }) {
  if (row.daysOfCover === null) {
    return (
      <span title={inventoryCopy.noRecentSales} className="text-ink-muted">
        <span aria-hidden="true">–</span>
        <span className="sr-only">{inventoryCopy.noRecentSales}</span>
      </span>
    );
  }
  return <span className="tabular-nums">{formatCover(row.daysOfCover)}</span>;
}

const COLUMNS: readonly DataColumn<InventoryRow, InventorySort>[] = [
  {
    id: "product",
    header: inventoryCopy.headers.product,
    width: "minmax(208px, 1.4fr)",
    minWidth: 208,
    sort: "product",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <ProductTile slot={row.imageSlot} />
        <span title={row.productName} className="truncate">{row.productName}</span>
      </span>
    ),
  },
  { id: "variant", header: inventoryCopy.headers.variant, width: "minmax(112px, 1fr)", minWidth: 112, render: (row) => <span title={row.optionLabel} className="truncate">{row.optionLabel}</span> },
  { id: "sku", header: inventoryCopy.headers.sku, width: "112px", minWidth: 112, render: (row) => <span className="font-mono text-xs">{row.sku}</span> },
  { id: "on_hand", header: inventoryCopy.headers.onHand, width: "88px", minWidth: 88, right: true, sort: "on_hand", sortDescFirst: true, render: (row) => <span className="tabular-nums">{formatNumber(row.onHand)}</span> },
  { id: "sold", header: inventoryCopy.headers.sold, width: "120px", minWidth: 120, right: true, sort: "sold", sortDescFirst: true, render: (row) => <span className="tabular-nums">{formatNumber(row.sold14Days)}</span> },
  { id: "cover", header: inventoryCopy.headers.cover, width: "112px", minWidth: 112, right: true, sort: "cover", render: (row) => <Cover row={row} /> },
  { id: "state", header: inventoryCopy.headers.state, width: "120px", minWidth: 120, render: (row) => <StockBadge state={row.state} /> },
  {
    id: "restock",
    header: inventoryCopy.restock,
    width: "96px",
    minWidth: 96,
    // The row's click opens the dialog; this says so. Enter on the row is the keyboard's way.
    render: () => <Button variant="ghost" compact tabIndex={-1}>{inventoryCopy.restock}</Button>,
  },
];

function Card(row: InventoryRow) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{row.productName} · {row.optionLabel}</span>
        <span className="shrink-0 tabular-nums">{inventoryCopy.onHand(row.onHand)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-ink-muted">{row.sku}</span>
        <StockBadge state={row.state} />
      </div>
    </>
  );
}

export function InventoryFallback() {
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

export function InventoryScreen() {
  const [state, setState] = useQueryStates(parsers);
  const query = useMemo<InventoryApiQuery>(() => {
    const out: InventoryApiQuery = {};
    if (state.q) out.q = state.q;
    if (state.collection) out.collection = state.collection;
    if (state.state !== "all") out.state = state.state;
    if (state.sort !== "cover") out.sort = state.sort;
    if (state.dir !== "asc") out.dir = state.dir;
    return out;
  }, [state]);
  const { data, error, refetch, isPlaceholderData } = useInventory(query);
  const restock = useRestock();
  const density = useSyncExternalStore(subscribePreferences, getDensity, () => "comfortable" as const);
  const grid = useRef<HTMLDivElement>(null);
  const [restocking, setRestocking] = useState<InventoryRow | null>(null);

  const hasFilters = Boolean(state.q || state.collection || state.state !== "all");
  const clear = () => void setState({ q: null, collection: null, state: null });
  const rows = data?.rows;
  const code = error instanceof ApiClientError ? error.code : "internal";

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-96 flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchBox label={inventoryCopy.searchPlaceholder} value={state.q ?? ""} onCommit={(q) => void setState({ q: q || null })} />
        <FilterChips
          name={inventoryCopy.headers.state}
          value={state.state}
          onChange={(next) => void setState({ state: next === "all" ? null : next })}
          options={[
            { value: "all", label: inventoryCopy.allStates, count: data?.counts.all },
            { value: "low", label: STOCK_LABELS.low, count: data?.counts.low },
            { value: "out", label: STOCK_LABELS.out, count: data?.counts.out },
          ]}
        />
        <label className="flex items-center gap-2">
          <span className="sr-only">{inventoryCopy.collection}</span>
          <Select className="w-full md:w-44" value={state.collection ?? ""} onChange={(event) => void setState({ collection: event.target.value || null })}>
            <option value="">{inventoryCopy.allCollections}</option>
            {data?.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </Select>
        </label>
      </div>
      <div className="flex h-8 shrink-0 items-center gap-3">
        <p aria-live="polite" className="min-w-0 truncate text-sm text-ink-muted tabular-nums">
          {data ? inventoryCopy.count(data.rows.length, data.counts.all) : null}
        </p>
        {hasFilters ? <Button variant="ghost" compact onClick={clear}>{ordersCopy.clearFilters}</Button> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {error && !data ? (
          <EmptyState title={ERROR_MESSAGES[code]} action={<Button onClick={() => void refetch()}>{overviewCopy.retry}</Button>}>
            {error.message}
          </EmptyState>
        ) : rows?.length === 0 && !isPlaceholderData ? (
          <EmptyState title={inventoryCopy.empty} action={<Button onClick={clear}>{ordersCopy.clearFilters}</Button>}>
            {inventoryCopy.emptyHelp}
          </EmptyState>
        ) : (
          <DataGrid
            ref={grid}
            name={inventoryCopy.gridName}
            idPrefix="inventory"
            columns={COLUMNS}
            total={rows?.length}
            getRow={(index) => rows?.[index]}
            resultKey={JSON.stringify(query)}
            stale={isPlaceholderData}
            sort={state.sort}
            dir={state.dir}
            onSort={(sort, dir) => void setState({ sort, dir })}
            density={density}
            renderCard={Card}
            onOpen={setRestocking}
          />
        )}
      </div>
      {restocking ? (
        <RestockDialog
          row={restocking}
          onSubmit={(quantity) => restock.mutate({ row: restocking, quantity })}
          onClose={() => {
            setRestocking(null);
            // After the dialog is gone: its focus trap would pull focus straight back.
            requestAnimationFrame(() => grid.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
