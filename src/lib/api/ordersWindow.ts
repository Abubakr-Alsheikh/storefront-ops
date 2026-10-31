"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { OrderRow, OrdersPage } from "@/lib/contracts/orders";
import { ORDERS_PAGE_SIZE, type OrderSort } from "@/lib/domain";
import { api, unwrap } from "./client";
import { queryKeys } from "./queryKeys";

/** Filters as the API takes them: strings, comma-separated lists, cents. */
export type OrdersApiQuery = Partial<Record<"status" | "country" | "payment" | "from" | "to" | "min" | "max" | "q", string>> & {
  sort?: OrderSort;
  dir?: "asc" | "desc";
};

/** Rows to load beyond the visible ones, so ordinary scrolling rarely sees a skeleton. */
const OVERSCAN_ROWS = 100;
/** A dragged scrollbar passes thousands of rows; only ask once it slows down. */
const RANGE_SETTLE_MS = 60;

function pageRange(first: number, last: number): [number, number] {
  return [
    Math.max(0, Math.floor((first - OVERSCAN_ROWS) / ORDERS_PAGE_SIZE)),
    Math.floor((last + OVERSCAN_ROWS) / ORDERS_PAGE_SIZE),
  ];
}

function fetchPage(query: OrdersApiQuery, upTo: number | undefined, pageIndex: number, signal: AbortSignal) {
  return unwrap(
    api.orders.$get(
      {
        query: {
          ...query,
          offset: String(pageIndex * ORDERS_PAGE_SIZE),
          limit: String(ORDERS_PAGE_SIZE),
          ...(upTo ? { upTo: String(upTo) } : {}),
        },
      },
      { init: { signal } },
    ),
  );
}

/**
 * The orders table's data (DATA.md §7): the scrollbar stands for every
 * matching row, and only the pages near the viewport are fetched. The first
 * answer says which order is newest; later pages are frozen at that number,
 * so live inserts cannot shift rows between pages.
 */
export function useOrdersWindow(query: OrdersApiQuery) {
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const first = useQuery({
    queryKey: queryKeys.orders.page(query, undefined, 0),
    queryFn: ({ signal }) => fetchPage(query, undefined, 0, signal),
    // The scrollbar must not collapse to nothing while a new filter loads.
    placeholderData: keepPreviousData,
  });
  const upTo = first.isPlaceholderData ? undefined : (first.data?.newest ?? undefined);

  const pageIndexes: number[] = [];
  for (let i = Math.max(1, range[0]); i <= range[1]; i++) pageIndexes.push(i);

  const pages = useQueries({
    queries: pageIndexes.map((pageIndex) => ({
      queryKey: queryKeys.orders.page(query, upTo, pageIndex),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPage(query, upTo, pageIndex, signal),
      enabled: upTo !== undefined,
    })),
  });

  const loaded = new Map<number, OrdersPage>();
  if (first.data) loaded.set(0, first.data);
  pages.forEach((page, i) => {
    if (page.data) loaded.set(pageIndexes[i], page.data);
  });

  const getRow = (index: number): OrderRow | undefined =>
    loaded.get(Math.floor(index / ORDERS_PAGE_SIZE))?.rows[index % ORDERS_PAGE_SIZE];

  /** Called by the virtualiser with the visible rows. */
  const ensureRange = useCallback((firstRow: number, lastRow: number) => {
    const next = pageRange(firstRow, lastRow);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRange((current) => (current[0] === next[0] && current[1] === next[1] ? current : next));
    }, RANGE_SETTLE_MS);
  }, []);

  return {
    total: first.data?.total,
    getRow,
    ensureRange,
    isPending: first.isPending,
    /** Old rows are on screen while a new filter loads. */
    isStale: first.isPlaceholderData,
    error: first.error,
    refetch: first.refetch,
  };
}

/** Every order, for "{matching} of {total} orders". The API answers from a counter. */
export function useOrdersGrandTotal(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orders.grandTotal,
    queryFn: ({ signal }) => unwrap(api.orders.$get({ query: { limit: "1" } }, { init: { signal } })),
    select: (page) => page.total,
    enabled,
  });
}
