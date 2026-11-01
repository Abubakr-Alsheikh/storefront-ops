"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Dialog as RadixDialog } from "radix-ui";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { NAV_ICONS, SearchIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, ApiClientError, unwrap } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import { COUNTRIES } from "@/lib/data/countries";
import { ERROR_MESSAGES } from "@/lib/data/copy/overview";
import { shellCopy } from "@/lib/data/copy/shell";
import { formatMoney } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/nav";
import { readRecent, rememberRecent, type RecentItem } from "@/lib/recent";

const ITEM =
  "flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-base text-ink data-[selected=true]:bg-surface-2";
const GROUP =
  "mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-muted";
const META = "ml-auto flex shrink-0 items-center gap-2 pl-2 text-xs text-ink-muted tabular-nums max-sm:hidden";
const SEARCH_DEBOUNCE_MS = 200;

export interface PaletteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
  /** Opened from the keyboard there is no trigger, so focus returns by hand. */
  returnFocus: RefObject<Element | null>;
}

function useDebounced(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

function Row({ value, label, meta, onSelect }: { value: string; label: ReactNode; meta?: ReactNode; onSelect: () => void }) {
  return (
    <Command.Item value={value} className={ITEM} onSelect={onSelect}>
      <span className="min-w-0 truncate">{label}</span>
      {meta ? <span className={META}>{meta}</span> : null}
    </Command.Item>
  );
}

/** Pages, recent items and live search over orders, customers and products. */
function PaletteBody({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [text, setText] = useState("");
  const [recent] = useState<RecentItem[]>(readRecent);
  const typed = text.trim();
  const q = useDebounced(typed);
  const { data, error, isFetching } = useQuery({
    queryKey: queryKeys.search(q),
    queryFn: ({ signal }) => unwrap(api.search.$get({ query: { q } }, { init: { signal } })),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
  const results = typed && q ? data : undefined;
  const needle = typed.toLowerCase();
  const pages = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(needle));
  const go = (item: RecentItem) => {
    rememberRecent(item);
    onNavigate(item.href);
  };
  const waiting = Boolean(typed) && (typed !== q || isFetching);
  const nothing = pages.length === 0 && !results?.orders.length && !results?.customers.length && !results?.products.length;
  const code = error instanceof ApiClientError ? error.code : "internal";

  return (
    // The server already filtered its results; cmdk must not filter them again.
    <Command label={shellCopy.search} shouldFilter={false}>
      <div className="flex h-12 items-center gap-2 border-b border-line px-3">
        <SearchIcon className="shrink-0 text-ink-muted" />
        <Command.Input
          value={text}
          onValueChange={setText}
          placeholder={shellCopy.search}
          className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        {!typed && recent.length ? (
          <Command.Group heading={shellCopy.recentGroup} className={GROUP}>
            {recent.map((item) => (
              <Row key={item.href} value={`recent ${item.href}`} label={item.label} meta={item.detail} onSelect={() => go(item)} />
            ))}
          </Command.Group>
        ) : null}
        {pages.length ? (
          <Command.Group heading={shellCopy.pagesGroup} className={GROUP}>
            {pages.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              return (
                <Command.Item key={item.href} value={`page ${item.href}`} className={ITEM} onSelect={() => onNavigate(item.href)}>
                  <Icon className="text-ink-muted" />
                  {item.label}
                </Command.Item>
              );
            })}
          </Command.Group>
        ) : null}
        {results?.orders.length ? (
          <Command.Group heading={shellCopy.ordersGroup} className={GROUP}>
            {results.orders.map((order) => (
              <Row
                key={order.number}
                value={`order ${order.number}`}
                label={<><span className="font-mono"><span className="text-ink-muted">#</span>{order.number}</span> · {order.customerName}</>}
                meta={<>{formatMoney(order.totalCents)} <StatusBadge status={order.status} /></>}
                onSelect={() => go({ kind: "order", href: `/orders/${order.number}`, label: `#${order.number}`, detail: order.customerName })}
              />
            ))}
          </Command.Group>
        ) : null}
        {results?.customers.length ? (
          <Command.Group heading={shellCopy.customersGroup} className={GROUP}>
            {results.customers.map((customer) => (
              <Row
                key={customer.id}
                value={`customer ${customer.id}`}
                label={customer.name}
                meta={COUNTRIES[customer.country].name}
                onSelect={() => go({ kind: "customer", href: `/customers/${customer.id}`, label: customer.name, detail: COUNTRIES[customer.country].name })}
              />
            ))}
          </Command.Group>
        ) : null}
        {results?.products.length ? (
          <Command.Group heading={shellCopy.productsGroup} className={GROUP}>
            {results.products.map((product) => (
              <Row
                key={product.productId}
                value={`product ${product.productId}`}
                label={product.name}
                meta={product.collection}
                onSelect={() => go({ kind: "product", href: `/inventory?q=${encodeURIComponent(product.name)}`, label: product.name, detail: product.collection })}
              />
            ))}
          </Command.Group>
        ) : null}
        <p aria-live="polite" className="px-2 py-1 text-sm text-ink-muted empty:hidden">
          {error && typed ? ERROR_MESSAGES[code] : waiting ? shellCopy.searching : nothing && typed ? shellCopy.noResults(typed) : null}
        </p>
      </Command.List>
    </Command>
  );
}

export default function PaletteDialog({ open, onOpenChange, onNavigate, returnFocus }: PaletteDialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
          }}
          className="fixed top-[20vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-160 -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface text-ink shadow-float"
        >
          <RadixDialog.Title className="sr-only">{shellCopy.search}</RadixDialog.Title>
          {/* Mounted only while open: every opening starts with an empty field and fresh recents. */}
          <PaletteBody onNavigate={onNavigate} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
