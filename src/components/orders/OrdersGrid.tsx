"use client";

import { columnVisibilityFeature, createColumnHelper, rowSortingFeature, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cx } from "@/lib/cx";
import type { OrderRow } from "@/lib/contracts/orders";
import { COUNTRIES } from "@/lib/data/countries";
import { PAYMENT_LABELS, ordersCopy } from "@/lib/data/copy/orders";
import type { OrderSort, OrderStatus } from "@/lib/domain";
import { formatDayMonth, formatMoney, formatTime } from "@/lib/format";
import type { Density } from "@/lib/theme";

/**
 * The orders grid. Table v9 owns the column model, sort state and visibility;
 * rows do not go through its row model, because 140,000 sparse rows cannot
 * live in an array. Heights are fixed, so the virtualiser never measures and
 * the scrollbar always stands for every matching row.
 */

const features = tableFeatures({ rowSortingFeature, columnVisibilityFeature });
const NO_ROWS: OrderRow[] = [];
const helper = createColumnHelper<typeof features, OrderRow>();

const columns = helper.columns([
  helper.accessor("number", { id: "number", header: ordersCopy.headers.number, sortDescFirst: true }),
  helper.accessor("placedAt", { id: "placed", header: ordersCopy.headers.placed, sortDescFirst: true }),
  helper.accessor("customerName", { id: "customer", header: ordersCopy.headers.customer, sortDescFirst: false }),
  helper.accessor("country", { id: "country", header: ordersCopy.headers.country, sortDescFirst: false }),
  helper.accessor("itemCount", { id: "items", header: ordersCopy.headers.items, sortDescFirst: true }),
  helper.accessor("totalCents", { id: "total", header: ordersCopy.headers.total, sortDescFirst: true }),
  helper.accessor("paymentMethod", { id: "payment", header: ordersCopy.headers.payment, enableSorting: false }),
  helper.accessor("status", { id: "status", header: ordersCopy.headers.status, sortDescFirst: false }),
]);

type ColumnId = "number" | "placed" | "customer" | "country" | "items" | "total" | "payment" | "status";

/** Widths for the CSS grid every row shares. The customer column takes what is left. */
const WIDTHS: Record<ColumnId, string> = {
  number: "88px",
  placed: "128px",
  customer: "minmax(160px, 1fr)",
  country: "116px",
  items: "60px",
  total: "96px",
  payment: "92px",
  status: "104px",
};
const SELECT_WIDTH = "40px";
const RIGHT_ALIGNED = new Set<ColumnId>(["items", "total"]);
const MIN_WIDTHS: Record<ColumnId, number> = { number: 88, placed: 128, customer: 160, country: 116, items: 60, total: 96, payment: 92, status: 104 };

const ROW_HEIGHT: Record<Density, number> = { comfortable: 36, compact: 30 };
const CARD_HEIGHT = 64;
const HEADER_HEIGHT = 32;
const SKELETON_ROWS = 30;

const CELL = "flex min-w-0 items-center px-3";
const STICKY_LEFT = "sticky left-0 z-[1] bg-inherit";
const STICKY_ORDER = "sticky left-10 z-[1] bg-inherit";
const STICKY_RIGHT = "sticky right-0 z-[1] bg-inherit border-l border-line";

const placed = (iso: string) => {
  const ms = Date.parse(iso);
  return `${formatDayMonth(ms)}, ${formatTime(ms)}`;
};

function OrderNumber({ number }: { number: number }) {
  return (
    <span className="font-mono">
      <span className="text-ink-muted">#</span>
      {number}
    </span>
  );
}

function renderCell(id: ColumnId, order: OrderRow) {
  switch (id) {
    case "number":
      return (
        <Link href={`/orders/${order.number}`} prefetch={false} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="rounded hover:underline">
          <OrderNumber number={order.number} />
        </Link>
      );
    case "placed":
      return <span className="truncate tabular-nums">{placed(order.placedAt)}</span>;
    case "customer":
      return <span className="truncate">{order.customerName}</span>;
    case "country":
      return <span className="truncate">{COUNTRIES[order.country].name}</span>;
    case "items":
      return <span className="tabular-nums">{order.itemCount}</span>;
    case "total":
      return <span className="tabular-nums">{formatMoney(order.totalCents)}</span>;
    case "payment":
      return <span className="truncate">{PAYMENT_LABELS[order.paymentMethod]}</span>;
    case "status":
      return <StatusBadge status={order.status} />;
  }
}

interface RowProps {
  index: number;
  start: number;
  height: number;
  order: OrderRow | undefined;
  visible: readonly ColumnId[];
  template: string;
  mobile: boolean;
  selected: boolean;
  cursor: boolean;
  onToggle: (order: OrderRow) => void;
  onOpen: (index: number, number: number) => void;
}

const ROW_BASE = "absolute top-0 left-0 w-full border-b border-line text-sm text-ink";

/** Memoised: rows that stay on screen do not re-render while the list scrolls. */
const Row = memo(function Row({ index, start, height, order, visible, template, mobile, selected, cursor, onToggle, onOpen }: RowProps) {
  const style = { height, transform: `translateY(${start}px)` };
  if (!order) {
    return (
      <div role="row" aria-rowindex={index + 2} aria-busy="true" style={mobile ? style : { ...style, gridTemplateColumns: template }} className={cx(ROW_BASE, "bg-surface", !mobile && "grid")}>
        {mobile ? (
          <div role="gridcell" className="flex h-full flex-col justify-center gap-2 px-4">
            <div className="h-3.5 w-2/3 rounded bg-surface-2" />
            <div className="h-3.5 w-1/3 rounded bg-surface-2" />
          </div>
        ) : (
          <>
            <div role="gridcell" />
            {visible.map((id) => (
              <div key={id} role="gridcell" className={CELL}>
                <div className="h-3.5 w-3/4 rounded bg-surface-2" />
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  const checkbox = (
    <input
      type="checkbox"
      tabIndex={-1}
      className="size-4 accent-accent"
      aria-label={ordersCopy.selectRow(order.number)}
      checked={selected}
      onClick={(event) => event.stopPropagation()}
      onChange={() => onToggle(order)}
    />
  );
  const tone = cx(
    selected ? "bg-accent-tint" : "bg-surface hover:bg-surface-2",
    cursor && "before:absolute before:inset-y-0 before:left-0 before:z-[2] before:w-0.5 before:bg-accent",
  );

  if (mobile) {
    return (
      <div
        id={`order-row-${index}`}
        role="row"
        aria-rowindex={index + 2}
        aria-selected={selected}
        style={style}
        onClick={() => onOpen(index, order.number)}
        className={cx(ROW_BASE, tone, "cursor-pointer")}
      >
        <div role="gridcell" className="flex h-full items-center gap-3 px-4">
          {checkbox}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate"><OrderNumber number={order.number} /> · {order.customerName}</span>
              <span className="shrink-0 tabular-nums">{formatMoney(order.totalCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-ink-muted tabular-nums">{placed(order.placedAt)}</span>
              <StatusBadge status={order.status} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`order-row-${index}`}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      style={{ ...style, gridTemplateColumns: template }}
      onClick={() => onOpen(index, order.number)}
      className={cx(ROW_BASE, tone, "grid cursor-pointer")}
    >
      <div role="gridcell" className={cx("flex items-center justify-center", STICKY_LEFT)}>{checkbox}</div>
      {visible.map((id) => (
        <div
          key={id}
          role="gridcell"
          className={cx(CELL, RIGHT_ALIGNED.has(id) && "justify-end", id === "status" && STICKY_RIGHT, id === "number" && STICKY_ORDER)}
        >
          {renderCell(id, order)}
        </div>
      ))}
    </div>
  );
});

const mediaSubscribe = (notify: () => void) => {
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const useIsMobile = () =>
  useSyncExternalStore(mediaSubscribe, () => window.matchMedia("(max-width: 767px)").matches, () => false);

export interface OrdersGridProps {
  total: number | undefined;
  getRow: (index: number) => OrderRow | undefined;
  ensureRange: (first: number, last: number) => void;
  /** Changes when the result set changes; the list returns to the top. */
  resultKey: string;
  stale: boolean;
  sort: OrderSort;
  dir: "asc" | "desc";
  onSort: (sort: OrderSort, dir: "asc" | "desc") => void;
  hidden: readonly string[];
  density: Density;
  selected: ReadonlyMap<number, OrderStatus>;
  onToggle: (order: OrderRow) => void;
  onClearSelection: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export function OrdersGrid({ total, getRow, ensureRange, resultKey, stale, sort, dir, onSort, hidden, density, selected, onToggle, onClearSelection, searchRef }: OrdersGridProps) {
  const router = useRouter();
  const mobile = useIsMobile();
  const scroller = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);

  const sorting = useMemo(() => [{ id: sort, desc: dir === "desc" }], [sort, dir]);
  const columnVisibility = useMemo(() => Object.fromEntries(hidden.map((id) => [id, false])), [hidden]);
  const table = useTable({
    features,
    columns,
    data: NO_ROWS,
    manualSorting: true,
    enableSortingRemoval: false,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      if (next[0]) onSort(next[0].id as OrderSort, next[0].desc ? "desc" : "asc");
    },
  });
  const leaf = table.getVisibleLeafColumns();
  const visible = useMemo(() => leaf.map((c) => c.id as ColumnId), [leaf]);
  const template = useMemo(() => [SELECT_WIDTH, ...visible.map((id) => WIDTHS[id])].join(" "), [visible]);
  const minWidth = visible.reduce((sum, id) => sum + MIN_WIDTHS[id], 40);

  const rowHeight = mobile ? CARD_HEIGHT : ROW_HEIGHT[density];
  const count = total ?? SKELETON_ROWS;
  // eslint-disable-next-line react-hooks/incompatible-library -- no compiler here; Row is memoised by hand.
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    scrollPaddingStart: mobile ? 0 : HEADER_HEIGHT,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  const firstVisible = items[0]?.index ?? 0;
  const lastVisible = items[items.length - 1]?.index ?? 0;

  useEffect(() => {
    if (total !== undefined) ensureRange(firstVisible, lastVisible);
  }, [ensureRange, firstVisible, lastVisible, total]);

  // Row height changes with density and layout; every row is the same, so only the sizes reset.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  const [seenKey, setSeenKey] = useState(resultKey);
  if (seenKey !== resultKey) {
    setSeenKey(resultKey);
    setCursor(0);
  }
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [resultKey]);

  // Stable, so `memo` on Row holds.
  const openRow = useCallback(
    (index: number, number: number) => {
      setCursor(index);
      router.push(`/orders/${number}`);
    },
    [router],
  );

  // `/` focuses search from anywhere but a text field.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 0) / rowHeight) - 1);
    const moves: Record<string, number> = {
      ArrowDown: cursor + 1,
      ArrowUp: cursor - 1,
      PageDown: cursor + page,
      PageUp: cursor - page,
      Home: 0,
      End: count - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      const clamped = Math.max(0, Math.min(count - 1, next));
      setCursor(clamped);
      virtualizer.scrollToIndex(clamped, { align: "auto" });
      return;
    }
    const order = getRow(cursor);
    if (event.key === "Enter" && order) {
      event.preventDefault();
      router.push(`/orders/${order.number}`);
    } else if (event.key === " " && order) {
      event.preventDefault();
      onToggle(order);
    } else if (event.key === "Escape") {
      onClearSelection();
    }
  }

  const headerGroup = table.getHeaderGroups()[0];

  return (
    <div
      ref={scroller}
      role="grid"
      tabIndex={0}
      aria-label={ordersCopy.gridName}
      aria-rowcount={count + 1}
      aria-busy={stale || total === undefined}
      aria-activedescendant={getRow(cursor) && items.some((i) => i.index === cursor) ? `order-row-${cursor}` : undefined}
      onKeyDown={onKeyDown}
      className={cx("relative h-full overflow-auto rounded-md border border-line bg-surface [overflow-anchor:none]", stale && "opacity-60")}
    >
      {mobile ? null : (
        <div role="rowgroup" className="sticky top-0 z-[3]" style={{ minWidth }}>
          <div role="row" aria-rowindex={1} className="grid border-b border-line bg-surface-2" style={{ gridTemplateColumns: template, height: HEADER_HEIGHT }}>
            <div role="columnheader" className={cx("flex items-center justify-center", STICKY_LEFT)}>
              <span className="sr-only">{ordersCopy.selectHeader}</span>
            </div>
            {headerGroup.headers.map((header) => {
              const id = header.column.id as ColumnId;
              const sorted = header.column.getIsSorted();
              const label = String(header.column.columnDef.header);
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={!header.column.getCanSort() ? undefined : sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                  className={cx("flex min-w-0 items-center", RIGHT_ALIGNED.has(id) && "justify-end", id === "status" && STICKY_RIGHT, id === "number" && STICKY_ORDER)}
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cx("flex h-full min-w-0 items-center gap-1 px-3 text-xs font-medium hover:text-ink", sorted ? "text-ink" : "text-ink-muted")}
                    >
                      <span className="truncate">{label}</span>
                      {sorted ? <span aria-hidden="true">{sorted === "asc" ? "↑" : "↓"}</span> : null}
                    </button>
                  ) : (
                    <span className="truncate px-3 text-xs font-medium text-ink-muted">{label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize(), minWidth: mobile ? undefined : minWidth }}>
        {items.map((item) => (
          <Row
            key={item.index}
            index={item.index}
            start={item.start}
            height={rowHeight}
            order={total === undefined ? undefined : getRow(item.index)}
            visible={visible}
            template={template}
            mobile={mobile}
            selected={(() => {
              const order = getRow(item.index);
              return order ? selected.has(order.number) : false;
            })()}
            cursor={item.index === cursor}
            onToggle={onToggle}
            onOpen={openRow}
          />
        ))}
      </div>
    </div>
  );
}

