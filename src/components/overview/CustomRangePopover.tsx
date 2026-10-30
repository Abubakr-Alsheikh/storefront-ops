"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Button, Input } from "@/components/ui/primitives";
import { cx } from "@/lib/cx";
import { overviewCopy } from "@/lib/data/copy/overview";
import { RETENTION_DAYS } from "@/lib/ranges";
import { dayKeyAt, dayKeyFromNumber, dayNumberFromKey } from "@/lib/tz";
import { SEGMENT, segmentState, useRangeSelection } from "./RangePicker";

function bounds() {
  const max = dayKeyAt(Date.now());
  return { max, min: dayKeyFromNumber(dayNumberFromKey(max) - RETENTION_DAYS + 1) };
}

/** Takes the place of the plain button on first click, already open. */
export default function CustomRangePopover() {
  const [selection, setSelection] = useRangeSelection();
  const [open, setOpen] = useState(true);
  const [from, setFrom] = useState(selection.from ?? "");
  const [to, setTo] = useState(selection.to ?? "");
  const [{ min, max }] = useState(bounds);
  const active = selection.range === "custom";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-pressed={active} className={cx(SEGMENT, segmentState(active))}>
          {overviewCopy.rangeOptions.custom}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (from && to && from <= to) {
              void setSelection({ range: "custom", from, to });
              setOpen(false);
            }
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            {overviewCopy.from}
            <Input type="date" required min={min} max={to || max} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            {overviewCopy.to}
            <Input type="date" required min={from || min} max={max} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button type="submit" variant="primary" className="mt-1">
            {overviewCopy.apply}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
