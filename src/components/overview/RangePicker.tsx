"use client";

import dynamic from "next/dynamic";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useState } from "react";
import type { RangeSelection } from "@/lib/api/queryKeys";
import { cx } from "@/lib/cx";
import { overviewCopy } from "@/lib/data/copy/overview";
import { RANGE_KEYS } from "@/lib/ranges";

const rangeParsers = {
  range: parseAsStringLiteral(RANGE_KEYS).withDefault("today"),
  from: parseAsString,
  to: parseAsString,
};

/** The range in the URL. A custom range with a date missing falls back to today. */
export function useRangeSelection() {
  const [state, setState] = useQueryStates(rangeParsers);
  const selection: RangeSelection =
    state.range === "custom"
      ? state.from && state.to
        ? { range: "custom", from: state.from, to: state.to }
        : { range: "today" }
      : { range: state.range };
  return [selection, setState] as const;
}

const PRESETS = ["today", "7d", "30d", "90d"] as const;

export const SEGMENT = "h-7 rounded px-2 text-sm font-medium transition-colors duration-[120ms]";
export const segmentState = (active: boolean) =>
  active ? "bg-surface text-ink" : "text-ink-muted hover:text-ink";

const CustomRangePopover = dynamic(() => import("./CustomRangePopover"), {
  ssr: false,
  loading: () => <CustomButton active />,
});

function CustomButton({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx(SEGMENT, segmentState(active))}>
      {overviewCopy.rangeOptions.custom}
    </button>
  );
}

export function RangePicker() {
  const [selection, setSelection] = useRangeSelection();
  const [used, setUsed] = useState(false);
  const custom = selection.range === "custom";

  return (
    <div role="group" aria-label={overviewCopy.rangeName} className="inline-flex h-8 gap-0.5 rounded-md bg-surface-2 p-0.5">
      {PRESETS.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={selection.range === key}
          onClick={() => void setSelection({ range: key === "today" ? null : key, from: null, to: null })}
          className={cx(SEGMENT, segmentState(selection.range === key))}
        >
          {overviewCopy.rangeOptions[key]}
        </button>
      ))}
      {used ? <CustomRangePopover /> : <CustomButton active={custom} onClick={() => setUsed(true)} />}
    </div>
  );
}
