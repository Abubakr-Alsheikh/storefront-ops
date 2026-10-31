"use client";

import type { ReactNode } from "react";
import { ChevronIcon } from "./icons";
import { Popover, PopoverContent, PopoverTrigger } from "./overlays";
import { Button } from "./primitives";

export default function LazyPopoverInner({
  label,
  badge,
  align = "start",
  className,
  children,
}: {
  label: string;
  badge?: string;
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button className="font-normal">
          {label}
          {badge ? <span className="font-medium text-accent tabular-nums">{badge}</span> : null}
          <ChevronIcon className="text-ink-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} aria-label={label} className={className}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
