"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { OrdersGrid } from "@/components/orders/OrdersGrid";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { SegmentBadge } from "@/components/ui/StatusBadge";
import { useIsMobile } from "@/components/ui/useIsMobile";
import { useCustomer } from "@/lib/api/catalogue";
import { ApiClientError } from "@/lib/api/client";
import type { OrderRow } from "@/lib/contracts/orders";
import { COUNTRIES } from "@/lib/data/countries";
import { customersCopy } from "@/lib/data/copy/catalogue";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";
import type { OrderSort } from "@/lib/domain";
import { formatMoney, formatNumber } from "@/lib/format";
import { compareOrders } from "@/lib/orderSort";
import { getDensity, subscribePreferences } from "@/lib/theme";
import { site } from "@/lib/site";

const HIDDEN = ["customer", "country"];
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = { comfortable: 36, compact: 30 };
const CARD_HEIGHT = 64;
const MAX_LIST_HEIGHT = 480;
const NO_RANGE = () => {};

const monthYear = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: site.store.timeZone }).format(Date.parse(iso));

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4 xl:p-5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 text-kpi font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function CustomerOrders({ orders }: { orders: OrderRow[] }) {
  const [sort, setSort] = useState<OrderSort>("placed");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const density = useSyncExternalStore(subscribePreferences, getDensity, () => "comfortable" as const);
  const mobile = useIsMobile();
  const sorted = useMemo(() => [...orders].sort(compareOrders(sort, dir)), [orders, sort, dir]);
  const height = mobile ? sorted.length * CARD_HEIGHT : HEADER_HEIGHT + sorted.length * ROW_HEIGHT[density];
  return (
    // The border is drawn inside the grid, so it adds its 2 px here.
    <div style={{ height: Math.min(MAX_LIST_HEIGHT, height + 2) }}>
      <OrdersGrid
        total={sorted.length}
        getRow={(index) => sorted[index]}
        ensureRange={NO_RANGE}
        resultKey={`${sort}|${dir}`}
        stale={false}
        sort={sort}
        dir={dir}
        onSort={(nextSort, nextDir) => {
          setSort(nextSort);
          setDir(nextDir);
        }}
        hidden={HIDDEN}
        density={density}
      />
    </div>
  );
}

export function CustomerDetailView({ id }: { id: number }) {
  const { data: customer, error, refetch, isFetching } = useCustomer(id);

  if (!customer) {
    if (error) {
      const code = error instanceof ApiClientError ? error.code : "internal";
      return code === "not_found" ? (
        <EmptyState title={customersCopy.notFound(id)} action={<Link href="/customers" className="rounded text-sm font-medium text-accent hover:underline">{customersCopy.back}</Link>}>
          {customersCopy.notFoundHelp}
        </EmptyState>
      ) : (
        <EmptyState title={ERROR_MESSAGES[code]} action={<Button onClick={() => void refetch()} disabled={isFetching}>{overviewCopy.retry}</Button>}>
          {error.message}
        </EmptyState>
      );
    }
    return <CustomerDetailFallback />;
  }

  return (
    <div key="customer" className="flex flex-col gap-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-ink">{customer.name}</h2>
          <SegmentBadge segment={customer.segment} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {customersCopy.since(monthYear(customer.customerSince))} · {customer.city}, {COUNTRIES[customer.country].name}
        </p>
        <p className="text-sm break-all text-ink-muted">{customer.email}</p>
      </header>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={customersCopy.stats.orders} value={formatNumber(customer.ordersCount)} />
        <Stat label={customersCopy.stats.lifetime} value={formatMoney(customer.lifetimeCents)} />
        <Stat label={customersCopy.stats.average} value={formatMoney(customer.averageOrderCents)} />
      </dl>
      <section aria-labelledby="customer-orders-title" className="flex min-w-0 flex-col gap-2">
        <h3 id="customer-orders-title" className="text-lg font-medium text-ink">{customersCopy.ordersTitle}</h3>
        <CustomerOrders orders={customer.orders} />
      </section>
    </div>
  );
}

export function CustomerDetailFallback() {
  return (
    <div key="skeleton" aria-hidden="true" className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-1 h-5 w-72 max-w-full" />
        <Skeleton className="mt-0 h-5 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-23 w-full" />)}
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
