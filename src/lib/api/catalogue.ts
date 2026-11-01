"use client";

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { CustomerRow, CustomersPage, InventoryList, InventoryRow } from "@/lib/contracts/catalogue";
import { inventoryCopy } from "@/lib/data/copy/catalogue";
import { ERROR_MESSAGES } from "@/lib/data/copy/overview";
import type { CustomerSort, InventorySort } from "@/lib/domain";
import { replaceRow, restocked } from "@/lib/inventoryList";
import type { Segment } from "@/lib/segments";
import { showToast } from "@/lib/toast";
import { ApiClientError, api, unwrap, writeOptions } from "./client";
import { queryKeys } from "./queryKeys";

export interface InventoryApiQuery {
  q?: string;
  collection?: string;
  state?: "low" | "out";
  sort?: InventorySort;
  dir?: "asc" | "desc";
}

export function useInventory(query: InventoryApiQuery) {
  return useQuery({
    queryKey: queryKeys.inventory.list(query),
    queryFn: ({ signal }) => unwrap(api.inventory.$get({ query }, { init: { signal } })),
    placeholderData: keepPreviousData,
  });
}

/** Stock changes at once in every cached list, and goes back on failure. */
export function useRestock() {
  const client = useQueryClient();
  const write = (row: InventoryRow) =>
    client.setQueriesData<InventoryList>({ queryKey: queryKeys.inventory.all }, (list) => (list ? replaceRow(list, row) : list));
  return useMutation({
    mutationFn: ({ row, quantity }: { row: InventoryRow; quantity: number }) =>
      unwrap(api.inventory[":sku"].restock.$post({ param: { sku: row.sku }, json: { quantity } }, writeOptions())),
    onMutate: async ({ row, quantity }) => {
      await client.cancelQueries({ queryKey: queryKeys.inventory.all });
      const snapshot = client.getQueriesData({ queryKey: queryKeys.inventory.all });
      write(restocked(row, quantity));
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      context?.snapshot.forEach(([key, value]) => client.setQueryData(key, value));
      showToast("error", ERROR_MESSAGES[error instanceof ApiClientError ? error.code : "internal"]);
    },
    onSuccess: (row, { quantity }) => {
      write(row);
      showToast("success", inventoryCopy.added(quantity, row.sku));
    },
    // The overview's low-stock count just moved.
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.overviewAll }),
  });
}

export interface CustomersApiQuery {
  q?: string;
  segment?: Segment;
  sort?: CustomerSort;
  dir?: "asc" | "desc";
}

const PAGE_SIZE = 100;
const OVERSCAN_ROWS = 50;
/** A dragged scrollbar passes thousands of rows; only ask once it slows down. */
const RANGE_SETTLE_MS = 60;

function fetchCustomers(query: CustomersApiQuery, pageIndex: number, signal: AbortSignal) {
  return unwrap(
    api.customers.$get({ query: { ...query, offset: String(pageIndex * PAGE_SIZE), limit: String(PAGE_SIZE) } }, { init: { signal } }),
  );
}

/** The customer list: the scrollbar stands for every match, and only pages near the viewport load. */
export function useCustomersWindow(query: CustomersApiQuery) {
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const first = useQuery({
    queryKey: queryKeys.customers.page(query, 0),
    queryFn: ({ signal }) => fetchCustomers(query, 0, signal),
    placeholderData: keepPreviousData,
  });

  const pageIndexes: number[] = [];
  for (let i = Math.max(1, range[0]); i <= range[1]; i++) pageIndexes.push(i);
  const pages = useQueries({
    queries: pageIndexes.map((pageIndex) => ({
      queryKey: queryKeys.customers.page(query, pageIndex),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchCustomers(query, pageIndex, signal),
    })),
  });

  const loaded = new Map<number, CustomersPage>();
  if (first.data) loaded.set(0, first.data);
  pages.forEach((page, i) => {
    if (page.data) loaded.set(pageIndexes[i], page.data);
  });

  const getRow = (index: number): CustomerRow | undefined => loaded.get(Math.floor(index / PAGE_SIZE))?.rows[index % PAGE_SIZE];

  const onRange = useCallback((firstRow: number, lastRow: number) => {
    const next: [number, number] = [
      Math.max(0, Math.floor((firstRow - OVERSCAN_ROWS) / PAGE_SIZE)),
      Math.floor((lastRow + OVERSCAN_ROWS) / PAGE_SIZE),
    ];
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRange((current) => (current[0] === next[0] && current[1] === next[1] ? current : next));
    }, RANGE_SETTLE_MS);
  }, []);

  return { total: first.data?.total, getRow, onRange, isPending: first.isPending, isStale: first.isPlaceholderData, error: first.error, refetch: first.refetch };
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: ({ signal }) => unwrap(api.customers[":id"].$get({ param: { id: String(id) } }, { init: { signal } })),
  });
}
