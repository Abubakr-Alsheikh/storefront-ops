"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/overlays";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApiClientError } from "@/lib/api/client";
import { useAddNote, useChangeStatus, useOrder } from "@/lib/api/orderActions";
import type { OrderDetail, TimelineEntry } from "@/lib/contracts/orders";
import { COUNTRIES } from "@/lib/data/countries";
import { orderCopy } from "@/lib/data/copy/orderDetail";
import { PAYMENT_LABELS } from "@/lib/data/copy/orders";
import { ERROR_MESSAGES, overviewCopy } from "@/lib/data/copy/overview";
import type { OrderStatus } from "@/lib/domain";
import { formatDateTime, formatMoney, formatOrdinal, formatRelative } from "@/lib/format";

const NOTE_MAX = 280;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-sm font-medium text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 pt-1 font-medium text-ink" : "flex justify-between gap-4 text-ink"}>
      <dt className={strong ? undefined : "text-ink-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function ConfirmedAction({ action, title, keep, confirm, disabled, onConfirm }: { action: string; title: string; keep: string; confirm: string; disabled: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" disabled={disabled}>{action}</Button>
      </DialogTrigger>
      <DialogContent title={title}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button>{keep}</Button>
          </DialogClose>
          <Button
            variant="destructive-fill"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Actions({ order }: { order: OrderDetail }) {
  const change = useChangeStatus(order.number);
  const money = formatMoney(order.totalCents);
  const button = (status: OrderStatus, primary: boolean) => {
    const label = orderCopy.actions[status] ?? status;
    if (status === "cancelled") {
      return (
        <ConfirmedAction
          key={status}
          action={label}
          title={orderCopy.confirmCancel.title(order.number)}
          keep={orderCopy.confirmCancel.keep}
          confirm={orderCopy.confirmCancel.confirm}
          disabled={change.isPending}
          onConfirm={() => change.mutate(status)}
        />
      );
    }
    if (status === "refunded") {
      return (
        <ConfirmedAction
          key={status}
          action={label}
          title={orderCopy.confirmRefund.title(money, order.customer.name)}
          keep={orderCopy.confirmRefund.keep}
          confirm={orderCopy.confirmRefund.confirm}
          disabled={change.isPending}
          onConfirm={() => change.mutate(status)}
        />
      );
    }
    return (
      <Button key={status} variant={primary ? "primary" : "secondary"} disabled={change.isPending} onClick={() => change.mutate(status)}>
        {label}
      </Button>
    );
  };
  if (!order.allowedTransitions.length) return null;
  return (
    <div>
      <div className="flex flex-wrap gap-2">{order.allowedTransitions.map((status, i) => button(status, i === 0))}</div>
      <p className="mt-2 text-xs text-ink-muted">{orderCopy.demoNotice}</p>
    </div>
  );
}

function entryLabel(entry: TimelineEntry, order: OrderDetail): string {
  if (entry.type === "paid") return `${orderCopy.timelineEntry.paid} · ${PAYMENT_LABELS[order.paymentMethod]}`;
  return orderCopy.timelineEntry[entry.type];
}

function Timeline({ order, now }: { order: OrderDetail; now: number }) {
  const entries = order.timeline.filter((e) => e.type !== "note");
  return (
    <ol className="flex flex-col">
      {entries.map((entry, i) => (
        <li key={`${entry.type}-${entry.at}`} className="relative flex gap-3 pb-3 last:pb-0">
          {i < entries.length - 1 ? <span aria-hidden="true" className="absolute top-3 bottom-0 left-[3px] w-px bg-line-strong" /> : null}
          <span aria-hidden="true" className="relative mt-1.5 size-[7px] shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <p className="text-ink">
              {entryLabel(entry, order)}
              {entry.actor === "visitor" ? <span className="text-ink-muted"> · {orderCopy.visitor}</span> : null}
            </p>
            <p title={formatDateTime(Date.parse(entry.at))} className="text-xs text-ink-muted tabular-nums">
              {formatDateTime(Date.parse(entry.at))} · {formatRelative(Date.parse(entry.at), now)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Notes({ order, now }: { order: OrderDetail; now: number }) {
  const notes = order.timeline.filter((e) => e.type === "note");
  const add = useAddNote(order.number);
  const [text, setText] = useState("");
  const trimmed = text.trim();
  return (
    <>
      {notes.length ? (
        <ul className="mb-3 flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.at} className="rounded-md bg-surface-2 p-2">
              <p className="break-words whitespace-pre-wrap text-ink">{note.message}</p>
              <p className="mt-1 text-xs text-ink-muted tabular-nums">
                {orderCopy.noteFrom(note.actor === "visitor" ? orderCopy.visitor : "Tidewell")} · {formatRelative(Date.parse(note.at), now)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-ink-muted">{orderCopy.noNotes}</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmed || trimmed.length > NOTE_MAX) return;
          setText("");
          // A failed save puts the words back, so nothing typed is lost.
          add.mutate(trimmed, { onError: () => setText(text) });
        }}
      >
        <label className="sr-only" htmlFor={`note-${order.number}`}>{orderCopy.noteLabel}</label>
        <textarea
          id={`note-${order.number}`}
          rows={2}
          maxLength={NOTE_MAX}
          value={text}
          placeholder={orderCopy.notePlaceholder}
          onChange={(event) => setText(event.target.value)}
          className="block w-full resize-y rounded-md border border-line-strong bg-surface-2 p-2 text-sm text-ink placeholder:text-ink-muted"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-ink-muted tabular-nums">{orderCopy.noteCounter(text.length, NOTE_MAX)}</span>
          <Button type="submit" disabled={!trimmed || add.isPending}>{orderCopy.addNote}</Button>
        </div>
      </form>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-5 w-64" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/** The whole order; the side panel and the full page both render this. */
export function OrderDetailView({ number, titleId }: { number: number; titleId?: string }) {
  const { data: order, error, refetch, isFetching, dataUpdatedAt } = useOrder(number);

  if (!order) {
    if (error) {
      const code = error instanceof ApiClientError ? error.code : "internal";
      return code === "not_found" ? (
        <EmptyState title={orderCopy.notFound(number)} action={<Link href="/orders" className="rounded text-sm font-medium text-accent hover:underline">{orderCopy.back}</Link>}>
          {orderCopy.demoNotice}
        </EmptyState>
      ) : (
        <EmptyState title={ERROR_MESSAGES[code]} action={<Button onClick={() => void refetch()} disabled={isFetching}>{overviewCopy.retry}</Button>}>
          {error.message}
        </EmptyState>
      );
    }
    return <DetailSkeleton />;
  }

  const placed = Date.parse(order.placedAt);
  const country = COUNTRIES[order.country].name;
  const ordinal = order.customer.orderOrdinal;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <header>
        <div className="flex flex-wrap items-center gap-2 pr-10">
          <h2 id={titleId} className="text-lg font-medium text-ink">{orderCopy.title(order.number)}</h2>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-xs text-ink-muted tabular-nums">
          {orderCopy.placed} {formatDateTime(placed)} · {formatRelative(placed, dataUpdatedAt)}
        </p>
      </header>

      <Actions order={order} />

      <Section title={orderCopy.items}>
        <ul className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.sku} className="flex items-center gap-3">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-xs text-ink-muted uppercase">
                {item.imageSlot.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">{item.productName}</p>
                <p className="truncate text-xs text-ink-muted">
                  {item.optionLabel} · <span className="font-mono">{item.sku}</span>
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <p className="text-ink">{formatMoney(item.lineTotalCents)}</p>
                <p className="text-xs text-ink-muted">{item.quantity} × {formatMoney(item.unitPriceCents)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={orderCopy.summary}>
        <dl className="flex flex-col gap-1">
          <Line label={orderCopy.subtotal} value={formatMoney(order.subtotalCents)} />
          {order.discountCents ? <Line label={orderCopy.discount} value={`−${formatMoney(order.discountCents)}`} /> : null}
          <Line label={orderCopy.shipping} value={formatMoney(order.shippingCents)} />
          <Line label={orderCopy.vat} value={formatMoney(order.taxCents)} />
          <Line label={orderCopy.total} value={formatMoney(order.totalCents)} strong />
        </dl>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title={orderCopy.customer}>
          <Link href={`/customers/${order.customer.id}`} className="rounded font-medium text-accent hover:underline">{order.customer.name}</Link>
          <p className="break-all text-xs text-ink-muted">{order.customer.email}</p>
          <p className="mt-1 text-xs text-ink-muted">{ordinal <= 1 ? orderCopy.firstOrder : `${formatOrdinal(ordinal)} order`}</p>
        </Section>
        <Section title={orderCopy.address}>
          <address className="text-ink not-italic">
            {order.customer.name}
            <br />
            {order.customer.address.line}
            <br />
            {order.customer.address.postcode} {order.customer.city}
            <br />
            {country}
          </address>
        </Section>
      </div>

      <Section title={orderCopy.payment}>
        <p className="text-ink">
          {PAYMENT_LABELS[order.paymentMethod]}
          {order.discountCode ? <span className="text-ink-muted"> · {orderCopy.code(order.discountCode)}</span> : null}
        </p>
      </Section>

      <Section title={orderCopy.timeline}>
        <Timeline order={order} now={dataUpdatedAt} />
      </Section>

      <Section title={orderCopy.notes}>
        <Notes order={order} now={dataUpdatedAt} />
      </Section>
    </div>
  );
}
