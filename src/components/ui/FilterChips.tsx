import { cx } from "@/lib/cx";
import { formatNumber } from "@/lib/format";

export interface FilterChip<T extends string> {
  value: T;
  label: string;
  /** Holds its width while undefined, so the row does not move when the number lands. */
  count?: number | undefined;
}

/** One choice out of a few. Below md it scrolls sideways in its own row. */
export function FilterChips<T extends string>({ name, options, value, onChange }: { name: string; options: readonly FilterChip<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div role="group" aria-label={name} className="inline-flex h-8 gap-0.5 rounded-md bg-surface-2 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cx("h-7 shrink-0 rounded px-2 text-sm font-medium whitespace-nowrap tabular-nums", value === option.value ? "bg-surface text-ink" : "text-ink-muted hover:text-ink")}
          >
            {option.label}
            {"count" in option ? (
              <span className="ml-1.5 inline-block min-w-[3ch] text-left text-xs font-normal text-ink-muted">{option.count === undefined ? null : formatNumber(option.count)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
