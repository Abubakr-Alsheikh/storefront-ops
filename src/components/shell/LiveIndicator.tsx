"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveFeed, useLiveReceived, useLiveState } from "@/components/LiveFeedProvider";
import { cx } from "@/lib/cx";
import { LIVE_STATES, liveAnnouncement, type LiveState } from "@/lib/data/copy/shell";
import { ANNOUNCE_EVERY_MS } from "@/lib/live/feed";

const DOTS: Record<LiveState, string> = {
  connecting: "border border-ink-muted",
  live: "bg-positive",
  polling: "bg-positive",
  reconnecting: "bg-warning",
  paused: "border border-ink-muted",
};

/** A screen reader hears the feed at most once every 30 seconds, and only when there is news. */
function useAnnouncement(state: LiveState): string {
  const feed = useLiveFeed();
  const [message, setMessage] = useState("");
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    let announced: LiveState = "live";
    const timer = setInterval(() => {
      const now = current.current;
      // Connecting and paused only happen on arrival and in a hidden tab: nobody is listening for them.
      const changed = now !== announced && now !== "connecting" && now !== "paused";
      if (changed) announced = now;
      setMessage(liveAnnouncement(changed ? now : null, feed.takeArrivals(Date.now())));
    }, ANNOUNCE_EVERY_MS);
    return () => clearInterval(timer);
  }, [feed]);
  return message;
}

/** A dot and a label; the label says the state, so colour is never the only signal. */
export function LiveIndicator() {
  const state = useLiveState();
  const received = useLiveReceived();
  const message = useAnnouncement(state);
  const { label, detail } = LIVE_STATES[state];
  return (
    // A fixed width: when the label changes, nothing beside it moves.
    <span title={detail} className="flex h-8 w-24 shrink-0 items-center gap-1.5 px-1 text-xs whitespace-nowrap text-ink-muted">
      <span aria-hidden="true" className="relative flex size-1.5">
        {/* One pulse per arrival, restarted by its key. An endless pulse cost frames while scrolling the table. */}
        {state === "live" ? <span key={received} className="absolute inset-0 animate-live-ring rounded-full bg-positive" /> : null}
        <span className={cx("relative size-1.5 rounded-full", DOTS[state])} />
      </span>
      {label}
      <span className="sr-only">. {detail}</span>
      <span aria-live="polite" className="sr-only">{message}</span>
    </span>
  );
}
