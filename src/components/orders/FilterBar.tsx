"use client";

import { useState } from "react";
import { LazyPopover } from "@/components/ui/LazyPopover";
import { Button, Input } from "@/components/ui/primitives";
import { SearchBox } from "@/components/ui/SearchBox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { COUNTRIES, COUNTRY_CODES } from "@/lib/data/countries";
import { PAYMENT_LABELS, ordersCopy } from "@/lib/data/copy/orders";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/domain";
import type { OrderFiltersApi } from "./useOrderFilters";

function CheckList<T extends string>({ options, chosen, onChange, render }: { options: readonly T[]; chosen: readonly T[] | null; onChange: (next: T[] | null) => void; render: (option: T) => React.ReactNode }) {
  const set = new Set<T>(chosen ?? []);
  return (
    <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
      {options.map((option) => (
        <li key={option}>
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded px-1 hover:bg-surface-2">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={set.has(option)}
              onChange={(event) => {
                if (event.target.checked) set.add(option);
                else set.delete(option);
                onChange(set.size ? options.filter((o) => set.has(o)) : null);
              }}
            />
            {render(option)}
          </label>
        </li>
      ))}
    </ul>
  );
}

function DateFields({ from, to, onApply }: { from: string | null; to: string | null; onApply: (from: string | null, to: string | null) => void }) {
  const [start, setStart] = useState(from ?? "");
  const [end, setEnd] = useState(to ?? "");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(start || null, end || null);
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        {ordersCopy.from}
        <Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        {ordersCopy.to}
        <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <Button type="submit" variant="primary" className="mt-1">{ordersCopy.apply}</Button>
    </form>
  );
}

const toCents = (euros: string) => (euros === "" ? null : Math.round(Number(euros) * 100));
const toEuros = (cents: number | null) => (cents === null ? "" : String(cents / 100));

function AmountFields({ min, max, onApply }: { min: number | null; max: number | null; onApply: (min: number | null, max: number | null) => void }) {
  const [low, setLow] = useState(toEuros(min));
  const [high, setHigh] = useState(toEuros(max));
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(toCents(low), toCents(high));
      }}
    >
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          {ordersCopy.min} (EUR)
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={low} onChange={(e) => setLow(e.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          {ordersCopy.max} (EUR)
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={high} onChange={(e) => setHigh(e.target.value)} />
        </label>
      </div>
      <Button type="submit" variant="primary" className="mt-1">{ordersCopy.apply}</Button>
    </form>
  );
}

const countBadge = (list: readonly unknown[] | null) => (list?.length ? String(list.length) : undefined);

export function FilterBar({ filters }: { filters: OrderFiltersApi }) {
  const { state, setState } = filters;
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <SearchBox label={ordersCopy.searchPlaceholder} value={state.q ?? ""} onCommit={(q) => void setState({ q: q || null })} />
      {/* Below md the filters scroll sideways in their own row. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:overflow-visible md:px-0">
        <LazyPopover label={ordersCopy.filters.status} badge={countBadge(state.status)} className="w-48">
          <CheckList options={ORDER_STATUSES} chosen={state.status} onChange={(status) => void setState({ status })} render={(s) => <StatusBadge status={s} />} />
        </LazyPopover>
        <LazyPopover label={ordersCopy.filters.date} badge={state.from || state.to ? "1" : undefined} className="w-56">
          <DateFields from={state.from} to={state.to} onApply={(from, to) => void setState({ from, to })} />
        </LazyPopover>
        <LazyPopover label={ordersCopy.filters.country} badge={countBadge(state.country)} className="w-52">
          <CheckList options={COUNTRY_CODES} chosen={state.country} onChange={(country) => void setState({ country })} render={(c) => COUNTRIES[c].name} />
        </LazyPopover>
        <LazyPopover label={ordersCopy.filters.payment} badge={countBadge(state.payment)} className="w-44">
          <CheckList options={PAYMENT_METHODS} chosen={state.payment} onChange={(payment) => void setState({ payment })} render={(p) => PAYMENT_LABELS[p]} />
        </LazyPopover>
        <LazyPopover label={ordersCopy.filters.amount} badge={state.min !== null || state.max !== null ? "1" : undefined} className="w-64">
          <AmountFields min={state.min} max={state.max} onApply={(min, max) => void setState({ min, max })} />
        </LazyPopover>
      </div>
    </div>
  );
}
