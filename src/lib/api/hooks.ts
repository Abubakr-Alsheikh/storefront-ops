"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, unwrap } from "./client";
import { queryKeys, type RangeSelection } from "./queryKeys";

/** The API serves stored data while a long catch-up runs; ask again soon if so. */
const STALE_ANSWER_MS = 60_000;
const RETRY_STALE_MS = 5_000;
const REFRESH_MS = 60_000;

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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return query.state.dataUpdatedAt - Date.parse(data.asOf) > STALE_ANSWER_MS ? RETRY_STALE_MS : REFRESH_MS;
    },
  });
}

/** The newest orders. M9 feeds this list from the live stream; until then it refreshes. */
export function useLatestOrders(limit: number) {
  return useQuery({
    queryKey: queryKeys.orders.latest(limit),
    queryFn: ({ signal }) =>
      unwrap(api.orders.$get({ query: { limit: String(limit) } }, { init: { signal } })),
    refetchInterval: 30_000,
  });
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
