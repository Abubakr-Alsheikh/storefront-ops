import { cx } from "@/lib/cx";
import { LIVE_STATES, type LiveState } from "@/lib/data/copy/shell";

const DOTS: Record<LiveState, string> = {
  connecting: "border border-ink-muted",
  live: "bg-positive",
  polling: "bg-positive",
  reconnecting: "bg-warning",
  paused: "border border-ink-muted",
};

/** A dot and a label; the label says the state, so colour is never the only signal. */
export function LiveIndicator({ state }: { state: LiveState }) {
  const { label, detail } = LIVE_STATES[state];
  return (
    <span title={detail} className="flex h-8 shrink-0 items-center gap-1.5 px-1 text-xs text-ink-muted">
      <span aria-hidden="true" className="relative flex size-1.5">
        {state === "live" ? <span className="absolute inset-0 animate-live-ring rounded-full bg-positive" /> : null}
        <span className={cx("relative size-1.5 rounded-full", DOTS[state])} />
      </span>
      {label}
      <span className="sr-only">. {detail}</span>
    </span>
  );
}
