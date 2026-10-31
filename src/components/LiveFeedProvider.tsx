"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api, unwrap } from "@/lib/api/client";
import { LIVE_LIST_SIZE, queryKeys } from "@/lib/api/queryKeys";
import type { OrderRow, OrdersPage } from "@/lib/contracts/orders";
import type { Overview } from "@/lib/contracts/overview";
import { applyLiveKpi } from "@/lib/live/applyKpi";
import { LiveFeed } from "@/lib/live/feed";

const STREAM_PATH = "/api/stream/orders";

function knownNewest(client: QueryClient): number | null {
  const pages = client.getQueriesData<OrdersPage>({ queryKey: queryKeys.orders.all });
  let newest: number | null = null;
  for (const [, page] of pages) {
    const number = page?.newest ?? null;
    if (number !== null && (newest === null || number > newest)) newest = number;
  }
  return newest;
}

function addToLatest(client: QueryClient, orders: OrderRow[]) {
  client.setQueryData<OrdersPage>(queryKeys.orders.latest(LIVE_LIST_SIZE), (page) => {
    if (!page) return page;
    const held = new Set(page.rows.map((row) => row.number));
    const fresh = orders.filter((order) => !held.has(order.number)).reverse();
    if (!fresh.length) return page;
    return { ...page, rows: [...fresh, ...page.rows].slice(0, LIVE_LIST_SIZE) };
  });
}

function createFeed(client: QueryClient) {
  return new LiveFeed({
    openStream: (after) => new EventSource(after === null ? STREAM_PATH : `${STREAM_PATH}?after=${after}`),
    fetchLatest: async () => (await unwrap(api.orders.$get({ query: { limit: "50" } }))).rows,
    knownNewest: () => knownNewest(client),
    onOrders: (orders) => addToLatest(client, orders),
    onKpi: (kpi) => {
      const now = Date.now();
      for (const query of client.getQueryCache().findAll({ queryKey: queryKeys.overviewAll })) {
        const data = query.state.data as Overview | undefined;
        if (!data) continue;
        const next = applyLiveKpi(data, kpi, now);
        // The old timestamp stays: it says when the server last answered, and useOverview times its refresh from it.
        if (next !== data) client.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
      }
    },
  });
}

/**
 * The page is often idle right after `load`, with hydration barely done. Waiting
 * a little longer keeps the first stream, and the re-render its first KPIs can
 * cause, out of the page's start-up.
 */
const START_DELAY_MS = 3000;

function afterLoadAndIdle(run: () => void): () => void {
  let cancelIdle = () => {};
  const idle = () => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 3000 });
      cancelIdle = () => cancelIdleCallback(id);
    } else {
      run();
    }
  };
  let delay: ReturnType<typeof setTimeout> | undefined;
  const wait = () => {
    delay = setTimeout(idle, START_DELAY_MS);
  };
  if (document.readyState === "complete") wait();
  else window.addEventListener("load", wait, { once: true });
  return () => {
    window.removeEventListener("load", wait);
    clearTimeout(delay);
    cancelIdle();
  };
}

const LiveFeedContext = createContext<LiveFeed | null>(null);

/** One stream per tab, closed while the tab is hidden, so idle tabs cost no compute. */
export function LiveFeedProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [feed] = useState(() => createFeed(client));

  useEffect(() => {
    let started = false;
    const sync = () => {
      if (!started) return;
      if (document.hidden) feed.pause();
      else feed.start();
    };
    const cancel = afterLoadAndIdle(() => {
      started = true;
      sync();
    });
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", sync);
      feed.pause();
    };
  }, [feed]);

  return <LiveFeedContext value={feed}>{children}</LiveFeedContext>;
}

export function useLiveFeed(): LiveFeed {
  const feed = use(LiveFeedContext);
  if (!feed) throw new Error("useLiveFeed needs a LiveFeedProvider");
  return feed;
}

export function useLiveState() {
  const feed = useLiveFeed();
  return useSyncExternalStore(feed.subscribe, feed.getState, () => "connecting" as const);
}

/** Orders received so far; changes each time a batch lands. */
export function useLiveReceived(): number {
  const feed = useLiveFeed();
  return useSyncExternalStore(feed.subscribe, feed.getReceived, () => 0);
}

/** Orders that arrived after the given number. */
export function useNewOrderCount(after: number | null | undefined): number {
  const feed = useLiveFeed();
  return useSyncExternalStore(
    feed.subscribe,
    () => (after ? feed.countNewerThan(after) : 0),
    () => 0,
  );
}
