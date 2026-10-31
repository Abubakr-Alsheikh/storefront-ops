import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveKpi, OrderRow } from "@/lib/contracts/orders";
import { LiveFeed, type LiveStream } from "./feed";

class FakeStream implements LiveStream {
  closed = false;
  listeners = new Map<string, (event: { data?: unknown }) => void>();
  constructor(readonly after: number | null) {}
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    this.listeners.get(type)?.({ data: data === undefined ? undefined : JSON.stringify(data) });
  }
}

function order(number: number): OrderRow {
  return {
    number,
    placedAt: new Date(Date.now()).toISOString(),
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    country: "PT",
    city: "Porto",
    itemCount: 1,
    totalCents: 1000,
    paymentMethod: "card",
    status: "paid",
  };
}

function setup(known: number | null = null) {
  const streams: FakeStream[] = [];
  const batches: number[][] = [];
  const kpis: LiveKpi[] = [];
  const fetchLatest = vi.fn<() => Promise<OrderRow[]>>(async () => []);
  const feed = new LiveFeed({
    openStream: (after) => {
      const stream = new FakeStream(after);
      streams.push(stream);
      return stream;
    },
    fetchLatest,
    knownNewest: () => known,
    onOrders: (orders) => batches.push(orders.map((o) => o.number)),
    onKpi: (kpi) => kpis.push(kpi),
  });
  return { feed, streams, batches, kpis, fetchLatest, current: () => streams[streams.length - 1] };
}

describe("LiveFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says connecting until the server is ready, then live", () => {
    const { feed, current } = setup();
    feed.start();
    expect(feed.getState()).toBe("connecting");
    current().emit("ready", { last: 100 });
    expect(feed.getState()).toBe("live");
  });

  it("starts right after the newest order already on screen", () => {
    const { feed, current } = setup(100_500);
    feed.start();
    expect(current().after).toBe(100_500);
  });

  it("loses and repeats nothing across a forced reconnect", () => {
    const { feed, streams, current, batches } = setup();
    feed.start();
    current().emit("ready", { last: 100 });
    current().emit("order", order(101));
    current().emit("order", order(102));
    // The server says goodbye after a replayable tail.
    current().emit("close", {});
    expect(streams[0].closed).toBe(true);
    expect(feed.getState()).toBe("live");
    vi.advanceTimersByTime(1_000);
    expect(streams).toHaveLength(2);
    expect(current().after).toBe(102);
    current().emit("ready", { last: 102 });
    // A replay of what was already seen, then what is new.
    current().emit("order", order(101));
    current().emit("order", order(102));
    current().emit("order", order(103));
    vi.advanceTimersByTime(50);
    expect(batches.flat()).toEqual([101, 102, 103]);
  });

  it("keeps its position when the first stream ends before any order", () => {
    const { feed, current } = setup();
    feed.start();
    current().emit("ready", { last: 100 });
    current().emit("close", {});
    vi.advanceTimersByTime(1_000);
    // Without this, orders placed during the second between streams would vanish.
    expect(current().after).toBe(100);
  });

  it("resumes from the last order after a dropped connection and after a pause", () => {
    const { feed, current } = setup();
    feed.start();
    current().emit("ready", { last: 100 });
    current().emit("order", order(101));
    current().emit("error");
    expect(feed.getState()).toBe("reconnecting");
    vi.advanceTimersByTime(1_000);
    expect(current().after).toBe(101);
    current().emit("ready", { last: 101 });
    expect(feed.getState()).toBe("live");

    feed.pause();
    expect(feed.getState()).toBe("paused");
    expect(current().closed).toBe(true);
    vi.advanceTimersByTime(120_000);
    feed.start();
    expect(current().closed).toBe(false);
    expect(current().after).toBe(101);
  });

  it("opens nothing while paused, even with a reopen scheduled", () => {
    const { feed, streams, current } = setup();
    feed.start();
    current().emit("close", {});
    feed.pause();
    vi.advanceTimersByTime(10_000);
    expect(streams).toHaveLength(1);
  });

  it("treats a silent connection as a failure", () => {
    const { feed, streams } = setup();
    feed.start();
    vi.advanceTimersByTime(60_000);
    expect(streams[0].closed).toBe(true);
    expect(feed.getState()).toBe("reconnecting");
  });

  it("falls back to polling after three failures in a row, without losing its place", async () => {
    const { feed, streams, current, batches, fetchLatest } = setup();
    feed.start();
    current().emit("ready", { last: 100 });
    current().emit("order", order(101));
    current().emit("error");
    await vi.advanceTimersByTimeAsync(1_000);
    current().emit("error");
    await vi.advanceTimersByTimeAsync(2_000);
    fetchLatest.mockResolvedValueOnce([order(103), order(102), order(101)]);
    current().emit("error");
    await vi.advanceTimersByTimeAsync(100);
    expect(streams).toHaveLength(3);
    expect(feed.getState()).toBe("polling");
    expect(batches.flat()).toEqual([101, 102, 103]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it("says so when polling fails too, and tries the stream again later", async () => {
    const { feed, streams, current, fetchLatest } = setup();
    feed.start();
    current().emit("error");
    await vi.advanceTimersByTimeAsync(1_000);
    current().emit("error");
    await vi.advanceTimersByTimeAsync(2_000);
    fetchLatest.mockRejectedValueOnce(new Error("offline"));
    current().emit("error");
    await vi.advanceTimersByTimeAsync(0);
    expect(feed.getState()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(streams.length).toBe(4);
    current().emit("ready", { last: 100 });
    expect(feed.getState()).toBe("live");
  });

  it("hands over one tick's orders as a single batch and counts what is newer", () => {
    const { feed, current, batches } = setup();
    feed.start();
    current().emit("ready", { last: 100 });
    for (const n of [101, 102, 103]) current().emit("order", order(n));
    vi.advanceTimersByTime(50);
    expect(batches).toEqual([[101, 102, 103]]);
    expect(feed.countNewerThan(101)).toBe(2);
    expect(feed.countNewerThan(103)).toBe(0);
    expect(feed.getReceived()).toBe(3);
  });

  it("guards the last 500 numbers without growing past them", () => {
    const { feed, current } = setup();
    feed.start();
    current().emit("ready", { last: 0 });
    for (let n = 1; n <= 700; n++) current().emit("order", order(n));
    expect(feed.countNewerThan(0)).toBe(500);
  });

  it("announces only what arrived in the window, once", () => {
    const { feed, current } = setup();
    feed.start();
    current().emit("ready", { last: 100 });
    current().emit("order", { ...order(101), placedAt: new Date(Date.now() - 3_600_000).toISOString() });
    current().emit("order", order(102));
    expect(feed.takeArrivals(Date.now())).toBe(1);
    expect(feed.takeArrivals(Date.now())).toBe(0);
  });

  it("passes on KPIs and survives a malformed event", () => {
    const { feed, current, kpis } = setup();
    feed.start();
    current().listeners.get("kpi")?.({ data: "{not json" });
    current().emit("kpi", { day: "2026-10-31", orders: 1, revenueCents: 2, sessions: 3 });
    expect(kpis).toHaveLength(1);
  });
});
