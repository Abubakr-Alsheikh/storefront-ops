"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { useLatestOrders, useNow } from "@/lib/api/hooks";
import { LIVE_LIST_SIZE } from "@/lib/api/queryKeys";
import type { OrderRow } from "@/lib/contracts/orders";
import { COUNTRIES } from "@/lib/data/countries";
import { overviewCopy } from "@/lib/data/copy/overview";
import { formatMoney, formatRelative } from "@/lib/format";

/** One row is held back below the clip, to slide up into the gap when a new one lands. */
const VISIBLE = LIVE_LIST_SIZE - 1;
const ROW_PX = 48;

/** The slide moves the list, not its rows: one transform, no layout, no shift counted. */
function useArrivalAnimation(rows: OrderRow[] | undefined) {
  const list = useRef<HTMLUListElement>(null);
  const seen = useRef<number | null>(null);
  const newest = rows?.[0]?.number ?? null;

  useLayoutEffect(() => {
    const previous = seen.current;
    seen.current = newest;
    if (previous === null || newest === null || newest === previous || !list.current || !rows) return;
    const fresh = rows.findIndex((row) => row.number <= previous);
    const count = fresh === -1 ? rows.length : fresh;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      list.current.animate(
        [{ transform: `translateY(-${Math.min(count, VISIBLE) * ROW_PX}px)` }, { transform: "none" }],
        { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
    for (const row of Array.from(list.current.children).slice(0, count)) {
      row.animate([{ backgroundColor: "var(--accent-tint)" }, { backgroundColor: "transparent" }], {
        duration: 1200,
        easing: "ease-in",
      });
    }
  }, [newest, rows]);

  return list;
}

/** The newest orders; the live feed adds to this list as they are placed. */
export function LiveOrders() {
  const { data } = useLatestOrders(LIVE_LIST_SIZE);
  const now = useNow();
  const list = useArrivalAnimation(data?.rows);
  return (
    <section aria-labelledby="live-title" className="flex min-w-0 flex-col rounded-md border border-line bg-surface p-4 xl:col-span-4 xl:p-5">
      <h2 id="live-title" className="mb-3 flex h-8 items-center text-lg font-medium text-ink">{overviewCopy.live}</h2>
      <div className="flex-1">
        {!data ? (
          // Its own key: reused as the list's wrapper, it would count as a layout shift.
          <div key="skeleton" className="flex flex-col gap-1" style={{ height: VISIBLE * ROW_PX }}>
            {Array.from({ length: VISIBLE }, (_, i) => <Skeleton key={i} className="h-11" />)}
          </div>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{overviewCopy.liveEmpty}</p>
        ) : (
          <div key="list" className="-mx-2 overflow-clip" style={{ height: VISIBLE * ROW_PX }}>
            <ul ref={list}>
              {data.rows.map((order, i) => {
                const held = i >= VISIBLE;
                return (
                  <li key={order.number} aria-hidden={held || undefined} className="flex h-12 items-center justify-between gap-3 border-b border-line px-2 last:border-0">
                    <Link href={`/orders/${order.number}`} prefetch={false} tabIndex={held ? -1 : undefined} className="min-w-0 rounded text-sm hover:underline">
                      <span className="block truncate text-ink">
                        <span className="font-mono"><span className="text-ink-muted">#</span>{order.number}</span> · {order.customerName}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">{order.city}, {COUNTRIES[order.country].name}</span>
                    </Link>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block text-sm text-ink">{formatMoney(order.totalCents)}</span>
                      <span className="block text-xs text-ink-muted">
                        {overviewCopy.items(order.itemCount)} · {formatRelative(Date.parse(order.placedAt), now)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <Link href="/orders" className="mt-2 inline-flex h-5 w-fit items-center rounded text-sm font-medium text-accent hover:underline">
        {overviewCopy.openOrders}
      </Link>
    </section>
  );
}
