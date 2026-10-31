import type { LiveKpi, LiveReady, OrderRow } from "@/lib/contracts/orders";
import type { LiveState } from "@/lib/data/copy/shell";

/**
 * The browser's end of the live feed (DATA.md §8), free of React and the DOM so
 * a test can drive it with a fake stream. A stream lasts 25 seconds, so
 * the feed reopens every one itself from the last order it saw instead of
 * relying on EventSource's own reconnect: that one reports a clean end as an
 * error, and knows no position until the first order event.
 */

/** What the feed needs from an EventSource. */
export interface LiveStream {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

export interface LiveFeedDeps {
  openStream: (after: number | null) => LiveStream;
  /** The newest orders, newest first, for the polling fallback. */
  fetchLatest: () => Promise<OrderRow[]>;
  /** The newest order already on screen, so a first stream starts right after it. */
  knownNewest: () => number | null;
  onOrders: (orders: OrderRow[]) => void;
  onKpi: (kpi: LiveKpi) => void;
}

const REOPEN_MS = 1_000;
const FAILURES_BEFORE_POLLING = 3;
const POLL_MS = 10_000;
/** While polling, try the stream again every this many polls (5 minutes). */
const POLLS_BEFORE_RETRY = 30;
/** A stream ends itself by 25 s. Silence past this means a dead connection. */
const STREAM_TIMEOUT_MS = 40_000;
const SEEN_MAX = 500;
/** Events of one tick arrive together; hand them over as one batch. */
const FLUSH_MS = 50;

export const ANNOUNCE_EVERY_MS = 30_000;

export class LiveFeed {
  #deps: LiveFeedDeps;
  #state: LiveState = "connecting";
  #listeners = new Set<() => void>();
  #stream: LiveStream | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #watchdog: ReturnType<typeof setTimeout> | undefined;
  #flushTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every teardown, so a poll that was in flight knows it is stale. */
  #generation = 0;
  #failures = 0;
  #polls = 0;
  #last: number | null = null;
  #seen = new Set<number>();
  #pending: OrderRow[] = [];
  #arrivals: number[] = [];
  #received = 0;

  constructor(deps: LiveFeedDeps) {
    this.#deps = deps;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getState = () => this.#state;

  /** Orders handed over so far; changes each time a batch lands. */
  getReceived = () => this.#received;

  /** Orders seen with a number above `number`; at most the last 500 count. */
  countNewerThan(number: number): number {
    let count = 0;
    for (const seen of this.#seen) if (seen > number) count++;
    return count;
  }

  /** Orders placed in the last announcement window, and empties the list. */
  takeArrivals(now: number): number {
    // Two seconds of grace: an order reaches the feed on the next server tick.
    const count = this.#arrivals.filter((placedAt) => now - placedAt < ANNOUNCE_EVERY_MS + 2_000).length;
    this.#arrivals = [];
    return count;
  }

  start() {
    this.#teardown();
    this.#failures = 0;
    this.#setState("connecting");
    this.#open();
  }

  pause() {
    this.#teardown();
    this.#setState("paused");
  }

  #setState(state: LiveState) {
    if (state === this.#state) return;
    this.#state = state;
    this.#notify();
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }

  #closeStream() {
    clearTimeout(this.#watchdog);
    this.#stream?.close();
    this.#stream = null;
  }

  #teardown() {
    this.#generation++;
    clearTimeout(this.#timer);
    this.#closeStream();
  }

  #open() {
    this.#last ??= this.#deps.knownNewest();
    const stream = this.#deps.openStream(this.#last);
    this.#stream = stream;
    this.#watchdog = setTimeout(() => this.#failed(), STREAM_TIMEOUT_MS);

    stream.addEventListener("ready", (event) => {
      const ready = parse<LiveReady>(event);
      if (ready) this.#last ??= ready.last;
      this.#failures = 0;
      this.#setState("live");
    });
    stream.addEventListener("order", (event) => {
      const order = parse<OrderRow>(event);
      if (order) this.#receive(order);
    });
    stream.addEventListener("kpi", (event) => {
      const kpi = parse<LiveKpi>(event);
      if (kpi) this.#deps.onKpi(kpi);
    });
    // The server's own goodbye: the state stays as it is, and nobody sees a gap.
    stream.addEventListener("close", () => {
      this.#closeStream();
      this.#timer = setTimeout(() => this.#open(), REOPEN_MS);
    });
    stream.addEventListener("error", () => this.#failed());
  }

  #failed() {
    this.#closeStream();
    this.#failures++;
    if (this.#failures >= FAILURES_BEFORE_POLLING) {
      this.#polls = 0;
      void this.#poll();
    } else {
      this.#setState("reconnecting");
      this.#timer = setTimeout(() => this.#open(), REOPEN_MS * this.#failures);
    }
  }

  async #poll() {
    const generation = this.#generation;
    let state: LiveState = "polling";
    try {
      const latest = await this.#deps.fetchLatest();
      if (generation !== this.#generation) return;
      if (this.#last === null) this.#last = latest[0]?.number ?? 0;
      else for (const order of latest.toReversed()) this.#receive(order);
    } catch {
      if (generation !== this.#generation) return;
      state = "reconnecting";
    }
    this.#setState(state);
    this.#polls++;
    this.#timer =
      this.#polls >= POLLS_BEFORE_RETRY
        ? setTimeout(() => this.#open(), POLL_MS)
        : setTimeout(() => void this.#poll(), POLL_MS);
  }

  #receive(order: OrderRow) {
    if (this.#seen.has(order.number) || (this.#last !== null && order.number <= this.#last)) return;
    this.#seen.add(order.number);
    if (this.#seen.size > SEEN_MAX) {
      for (const oldest of this.#seen) {
        this.#seen.delete(oldest);
        break;
      }
    }
    this.#last = order.number;
    this.#pending.push(order);
    this.#arrivals.push(Date.parse(order.placedAt));
    this.#flushTimer ??= setTimeout(() => this.#flush(), FLUSH_MS);
  }

  #flush() {
    this.#flushTimer = undefined;
    const orders = this.#pending;
    this.#pending = [];
    this.#received += orders.length;
    this.#deps.onOrders(orders);
    this.#notify();
  }
}

function parse<T>(event: { data?: unknown }): T | null {
  try {
    return JSON.parse(String(event.data)) as T;
  } catch {
    return null;
  }
}
