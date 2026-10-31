"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { cx } from "@/lib/cx";
import type { Density } from "@/lib/theme";
import { useIsMobile } from "./useIsMobile";

/**
 * A virtualised grid for the inventory and customer lists: fixed row heights,
 * sticky first and last columns, cards below md, arrow-key cursor, Enter opens.
 * Rows may arrive late: `getRow` returning undefined draws a skeleton.
 */

export interface DataColumn<T, S extends string> {
  id: string;
  header: string;
  /** A CSS grid track. */
  width: string;
  minWidth: number;
  right?: boolean;
  sort?: S;
  sortDescFirst?: boolean;
  render: (row: T) => ReactNode;
}

const ROW_HEIGHT: Record<Density, number> = { comfortable: 36, compact: 30 };
const HEADER_HEIGHT = 32;
const CARD_HEIGHT = 64;
const SKELETON_ROWS = 30;
const CELL = "flex min-w-0 items-center px-3";
const STICKY_LEFT = "sticky left-0 z-[1] bg-inherit";
const STICKY_RIGHT = "sticky right-0 z-[1] bg-inherit border-l border-line";

function stickyClass(index: number, count: number) {
  if (index === 0) return STICKY_LEFT;
  return index === count - 1 ? STICKY_RIGHT : undefined;
}

const ROW_BASE = "absolute top-0 left-0 w-full border-b border-line text-sm text-ink";

interface RowProps<T, S extends string> {
  index: number;
  start: number;
  height: number;
  row: T | undefined;
  columns: readonly DataColumn<T, S>[];
  template: string;
  mobile: boolean;
  cursor: boolean;
  idPrefix: string;
  renderCard: (row: T) => ReactNode;
  onOpen: (row: T, index: number) => void;
}

function RowInner<T, S extends string>({ index, start, height, row, columns, template, mobile, cursor, idPrefix, renderCard, onOpen }: RowProps<T, S>) {
  const style = mobile ? { height, transform: `translateY(${start}px)` } : { height, transform: `translateY(${start}px)`, gridTemplateColumns: template };
  if (row === undefined) {
    return (
      <div role="row" aria-rowindex={index + 2} aria-busy="true" style={style} className={cx(ROW_BASE, "bg-surface", !mobile && "grid")}>
        {mobile ? (
          <div key="skeleton" role="gridcell" className="flex h-full flex-col justify-center gap-2.5 px-4">
            <div className="h-3.5 w-2/3 rounded bg-surface-2" />
            <div className="h-3.5 w-1/3 rounded bg-surface-2" />
          </div>
        ) : (
          columns.map((column) => (
            <div key={column.id} role="gridcell" className={CELL}>
              <div className="h-3.5 w-3/4 rounded bg-surface-2" />
            </div>
          ))
        )}
      </div>
    );
  }
  const tone = cx("cursor-pointer bg-surface hover:bg-surface-2", cursor && "before:absolute before:inset-y-0 before:left-0 before:z-[2] before:w-0.5 before:bg-accent");
  return (
    <div id={`${idPrefix}-row-${index}`} role="row" aria-rowindex={index + 2} style={style} onClick={() => onOpen(row, index)} className={cx(ROW_BASE, tone, !mobile && "grid")}>
      {mobile ? (
        <div key="card" role="gridcell" className="flex h-full min-w-0 flex-col justify-center gap-1 px-4">
          {renderCard(row)}
        </div>
      ) : (
        columns.map((column, i) => (
          <div key={column.id} role="gridcell" className={cx(CELL, column.right && "justify-end", stickyClass(i, columns.length))}>
            {column.render(row)}
          </div>
        ))
      )}
    </div>
  );
}

/** Memoised: rows that stay on screen do not re-render while the list scrolls. */
const Row = memo(RowInner) as typeof RowInner;

export interface DataGridProps<T, S extends string> {
  name: string;
  idPrefix: string;
  columns: readonly DataColumn<T, S>[];
  /** Undefined while the first answer is on its way. */
  total: number | undefined;
  getRow: (index: number) => T | undefined;
  /** Called with the visible rows, for lists fetched in pages. */
  onRange?: (first: number, last: number) => void;
  /** Changes when the result set changes; the list returns to the top. */
  resultKey: string;
  stale: boolean;
  sort: S;
  dir: "asc" | "desc";
  onSort: (sort: S, dir: "asc" | "desc") => void;
  density: Density;
  renderCard: (row: T) => ReactNode;
  onOpen: (row: T, index: number) => void;
  ref?: Ref<HTMLDivElement>;
}

export function DataGrid<T, S extends string>({ name, idPrefix, columns, total, getRow, onRange, resultKey, stale, sort, dir, onSort, density, renderCard, onOpen, ref }: DataGridProps<T, S>) {
  const mobile = useIsMobile();
  const scroller = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(0);
  const template = columns.map((column) => column.width).join(" ");
  const minWidth = columns.reduce((sum, column) => sum + column.minWidth, 0);
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
    if (total !== undefined) onRange?.(firstVisible, lastVisible);
  }, [onRange, firstVisible, lastVisible, total]);

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
    const row = getRow(cursor);
    if (event.key === "Enter" && row !== undefined) {
      event.preventDefault();
      onOpen(row, cursor);
    }
  }

  return (
    <div
      ref={(element) => {
        scroller.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      role="grid"
      tabIndex={0}
      aria-label={name}
      aria-rowcount={count + 1}
      aria-busy={stale || total === undefined}
      aria-activedescendant={getRow(cursor) !== undefined && items.some((i) => i.index === cursor) ? `${idPrefix}-row-${cursor}` : undefined}
      onKeyDown={onKeyDown}
      className={cx("relative h-full overflow-auto rounded-md border border-line bg-surface [overflow-anchor:none]", stale && "opacity-60")}
    >
      {mobile ? null : (
        <div role="rowgroup" className="sticky top-0 z-[3]" style={{ minWidth }}>
          <div role="row" aria-rowindex={1} className="grid border-b border-line bg-surface-2" style={{ gridTemplateColumns: template, height: HEADER_HEIGHT }}>
            {columns.map((column, i) => {
              const sorted = column.sort !== undefined && column.sort === sort;
              return (
                <div
                  key={column.id}
                  role="columnheader"
                  aria-sort={column.sort === undefined ? undefined : !sorted ? "none" : dir === "asc" ? "ascending" : "descending"}
                  className={cx("flex min-w-0 items-center", column.right && "justify-end", stickyClass(i, columns.length))}
                >
                  {column.sort === undefined ? (
                    <span className="truncate px-3 text-xs font-medium text-ink-muted">{column.header}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSort(column.sort as S, sorted ? (dir === "asc" ? "desc" : "asc") : column.sortDescFirst ? "desc" : "asc")}
                      className={cx("flex h-full min-w-0 items-center gap-1 px-3 text-xs font-medium hover:text-ink", sorted ? "text-ink" : "text-ink-muted")}
                    >
                      <span className="truncate">{column.header}</span>
                      {sorted ? <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span> : null}
                    </button>
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
            row={total === undefined ? undefined : getRow(item.index)}
            columns={columns}
            template={template}
            mobile={mobile}
            cursor={item.index === cursor}
            idPrefix={idPrefix}
            renderCard={renderCard}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
