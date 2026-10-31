"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { OrderDetail, OrderRow, OrdersPage, TimelineEntry } from "@/lib/contracts/orders";
import { orderCopy } from "@/lib/data/copy/orderDetail";
import { ordersCopy } from "@/lib/data/copy/orders";
import { ERROR_MESSAGES } from "@/lib/data/copy/overview";
import { ALLOWED_TRANSITIONS, type OrderStatus } from "@/lib/domain";
import { showToast } from "@/lib/toast";
import { ApiClientError, api, unwrap } from "./client";
import { queryKeys } from "./queryKeys";

/**
 * Optimistic order changes (storefront-data §4): cancel what could overwrite
 * the change, write it into every cached copy at once, restore the snapshot
 * on failure. Rows change in their cached pages; the table never refetches.
 */

/** Set in the browser console to prove rollbacks: localStorage.setItem("storefront-fail-writes", "1"). */
function writeOptions() {
  try {
    if (localStorage.getItem("storefront-fail-writes")) return { headers: { "x-simulate-failure": "1" } };
  } catch {
    // Storage may be refused; writes then go through normally.
  }
  return undefined;
}

function messageFor(error: unknown, number?: number): string {
  const code = error instanceof ApiClientError ? error.code : "internal";
  if (code === "not_found" && number !== undefined) return orderCopy.notFound(number);
  return ERROR_MESSAGES[code];
}

type Snapshot = [readonly unknown[], unknown][];

/** Stops in-flight reads of these rows, then patches every cached page holding them. */
async function patchRows(client: QueryClient, numbers: readonly number[], patch: (row: OrderRow) => OrderRow): Promise<Snapshot> {
  const chosen = new Set(numbers);
  const holds = (data: unknown) => (data as OrdersPage | undefined)?.rows?.some((row) => chosen.has(row.number)) ?? false;
  await client.cancelQueries({ queryKey: queryKeys.orders.all, predicate: (query) => holds(query.state.data) });
  const snapshot = client.getQueriesData({ queryKey: queryKeys.orders.all }) as Snapshot;
  client.setQueriesData<OrdersPage>({ queryKey: queryKeys.orders.all }, (page) =>
    page?.rows ? { ...page, rows: page.rows.map((row) => (chosen.has(row.number) ? patch(row) : row)) } : page,
  );
  return snapshot;
}

function restore(client: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, value]) => client.setQueryData(key, value));
}

export function useOrder(number: number) {
  return useQuery({
    queryKey: queryKeys.orders.detail(number),
    queryFn: ({ signal }) =>
      unwrap(api.orders[":number"].$get({ param: { number: String(number) } }, { init: { signal } })),
  });
}

function withStatus(order: OrderDetail, status: OrderStatus): OrderDetail {
  const entry: TimelineEntry = { type: status, at: new Date().toISOString(), actor: "visitor", message: null };
  return {
    ...order,
    status,
    changedByVisitor: true,
    allowedTransitions: [...ALLOWED_TRANSITIONS[status]],
    timeline: [...order.timeline, entry],
  };
}

export function useChangeStatus(number: number) {
  const client = useQueryClient();
  const detailKey = queryKeys.orders.detail(number);
  return useMutation({
    mutationFn: (status: OrderStatus) =>
      unwrap(
        api.orders[":number"].status.$patch(
          { param: { number: String(number) }, json: { status } },
          writeOptions(),
        ),
      ),
    onMutate: async (status) => {
      const snapshot = await patchRows(client, [number], (row) => ({ ...row, status }));
      client.setQueryData<OrderDetail>(detailKey, (order) => (order ? withStatus(order, status) : order));
      return { snapshot };
    },
    onError: (error, _status, context) => {
      restore(client, context?.snapshot);
      showToast("error", messageFor(error, number));
      // Someone else moved it: show them what it is now, in the panel and the row.
      if (error instanceof ApiClientError && error.code === "conflict") {
        void client
          .fetchQuery({
            queryKey: detailKey,
            queryFn: () => unwrap(api.orders[":number"].$get({ param: { number: String(number) } })),
          })
          .then((order) => patchRows(client, [number], (row) => ({ ...row, status: order.status })));
      }
    },
    onSuccess: (order, status) => {
      client.setQueryData(detailKey, order);
      showToast("success", orderCopy.done[status](number));
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["overview"] }),
  });
}

export function useAddNote(number: number) {
  const client = useQueryClient();
  const detailKey = queryKeys.orders.detail(number);
  return useMutation({
    mutationFn: (message: string) =>
      unwrap(
        api.orders[":number"].notes.$post(
          { param: { number: String(number) }, json: { message } },
          writeOptions(),
        ),
      ),
    onMutate: async (message) => {
      await client.cancelQueries({ queryKey: detailKey });
      const previous = client.getQueryData<OrderDetail>(detailKey);
      const entry: TimelineEntry = { type: "note", at: new Date().toISOString(), actor: "visitor", message };
      client.setQueryData<OrderDetail>(detailKey, (order) =>
        order ? { ...order, changedByVisitor: true, timeline: [...order.timeline, entry] } : order,
      );
      return { previous };
    },
    onError: (error, _message, context) => {
      if (context?.previous) client.setQueryData(detailKey, context.previous);
      showToast("error", messageFor(error, number));
    },
    onSuccess: () => showToast("success", orderCopy.noteAdded),
  });
}

/** Marks orders as shipped at once in every cached page, and undoes it on failure. */
export function useBulkShip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (numbers: number[]) => unwrap(api.orders.bulk.ship.$post({ json: { numbers } }, writeOptions())),
    onMutate: async (numbers) => {
      const snapshot = await patchRows(client, numbers, (row) =>
        row.status === "paid" || row.status === "packed" ? { ...row, status: "shipped" } : row,
      );
      return { snapshot };
    },
    onError: (error, _numbers, context) => {
      restore(client, context?.snapshot);
      showToast("error", messageFor(error));
    },
    onSuccess: ({ shipped }) => {
      showToast("success", ordersCopy.shipped(shipped.length));
      shipped.forEach((number) => void client.invalidateQueries({ queryKey: queryKeys.orders.detail(number) }));
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["overview"] }),
  });
}
