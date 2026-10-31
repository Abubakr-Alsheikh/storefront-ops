"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { Button } from "./primitives";
import { ChevronIcon } from "./icons";

function Trigger({ label, badge, onClick }: { label: string; badge?: string; onClick?: () => void }) {
  return (
    <Button onClick={onClick} aria-haspopup="dialog" className="font-normal">
      {label}
      {badge ? <span className="font-medium text-accent tabular-nums">{badge}</span> : null}
      <ChevronIcon className="text-ink-muted" />
    </Button>
  );
}

const Inner = dynamic(() => import("./LazyPopoverInner"), {
  ssr: false,
  loading: () => <Trigger label="" />,
});

export interface LazyPopoverProps {
  label: string;
  /** A short note beside the label, such as how many are chosen. */
  badge?: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

/** A button that becomes a Radix popover on first use, so Radix stays out of the first load. */
export function LazyPopover({ label, badge, children, align, className }: LazyPopoverProps) {
  const [used, setUsed] = useState(false);
  if (!used) return <Trigger label={label} badge={badge} onClick={() => setUsed(true)} />;
  return (
    <Inner label={label} badge={badge} align={align} className={className}>
      {children}
    </Inner>
  );
}

export { Trigger as LazyPopoverTrigger };
