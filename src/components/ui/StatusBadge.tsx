import type { ReactNode } from "react";
import { STATUS_LABELS } from "@/lib/data/copy/shell";
import type { OrderStatus } from "@/lib/domain";
import { cx } from "@/lib/cx";

export type BadgeTone = "accent" | "positive" | "negative" | "warning" | "neutral";

const TONES: Record<BadgeTone, string> = {
  accent: "bg-accent-tint text-accent",
  positive: "bg-positive-tint text-positive",
  negative: "bg-negative-tint text-negative",
  warning: "bg-warning-tint text-warning",
  neutral: "bg-surface-2 text-ink-muted",
};

export interface BadgeProps {
  tone: BadgeTone;
  /** A leading shape, so colour is never the only signal. */
  glyph?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone, glyph, children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-2xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {glyph}
      {children}
    </span>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 8 8" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const STATUS_GLYPHS: Record<OrderStatus, ReactNode> = {
  paid: <circle cx="4" cy="4" r="2.5" fill="currentColor" stroke="none" />,
  packed: (
    <>
      <circle cx="4" cy="4" r="3" />
      <path d="M4 1a3 3 0 0 1 0 6z" fill="currentColor" stroke="none" />
    </>
  ),
  shipped: <path d="M1 4h6M4.5 1.5 7 4 4.5 6.5" />,
  delivered: <path d="m1 4.5 2 2 4-5" />,
  cancelled: (
    <>
      <circle cx="4" cy="4" r="3" />
      <path d="m2 6 4-4" />
    </>
  ),
  refunded: <path d="M3 1 1 3l2 2M1 3h3.5a2 2 0 0 1 0 4H3" />,
};

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  paid: "accent",
  packed: "warning",
  shipped: "accent",
  delivered: "positive",
  cancelled: "neutral",
  refunded: "negative",
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status]} glyph={<Glyph>{STATUS_GLYPHS[status]}</Glyph>} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
