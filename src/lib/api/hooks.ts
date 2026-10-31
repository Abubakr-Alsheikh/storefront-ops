"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, unwrap } from "./client";
import { queryKeys, type RangeSelection } from "./queryKeys";

/** The API serves stored data while a long catch-up runs; ask again soon if so. */
const STALE_ANSWER_MS = 60_000;
const RETRY_STALE_MS = 5_000;
const REFRESH_MS = 60_000;
const RELATIVE_TIME_TICK_MS = 30_000;

export function useOverview(selection: RangeSelection) {
  return useQuery({
    queryKey: queryKeys.overview(selection),
    queryFn: ({ signal }) =>
      unwrap(
        api.overview.$get(
          { query: { range: selection.range, from: selection.from, to: selection.to } },
          { init: { signal } },
        ),
      ),
    placeholderData: keepPreviousData,
    // Every cache write restarts this timer, and the live feed writes often: ask
    // for the time left since the last real answer, or a busy feed would starve it.
    refetchInterval: (query) => {
      const { data, dataUpdatedAt } = query.state;
      if (!data) return false;
      if (dataUpdatedAt - Date.parse(data.asOf) > STALE_ANSWER_MS) return RETRY_STALE_MS;
      return Math.max(RETRY_STALE_MS, dataUpdatedAt + REFRESH_MS - Date.now());
    },
  });
}

/** The newest orders. The live feed writes new ones straight into this query. */
export function useLatestOrders(limit: number) {
  return useQuery({
    queryKey: queryKeys.orders.latest(limit),
    queryFn: ({ signal }) =>
      unwrap(api.orders.$get({ query: { limit: String(limit) } }, { init: { signal } })),
  });
}

/** The clock, for "2 min ago" labels that must not freeze between orders. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** True once `active` has lasted over 1.5 s, for the cold-start hint. */
export function useSlowHint(active: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), 1500);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);
  return slow;
}
