import { beforeEach, describe, expect, it } from "vitest";
import { SIM_VERSION } from "@/lib/sim/config";
import type { DbHandle } from "./db/client";
import { ensureFresh, resetFreshness } from "./freshness";
import { catchUp, readSimState } from "./sim/catchUp";
import { TEST_NOW, seededTestDb } from "@/test/db";

const HOUR = 3_600_000;

/** A database whose state read takes `ms`, like Neon waking from sleep. */
function slowDb(ms: number, materialisedUntil: number): DbHandle {
  const select = () => ({
    from: () => ({
      where: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ simVersion: SIM_VERSION, materialisedUntil: new Date(materialisedUntil) }]), ms),
        ),
    }),
  });
  return { kind: "neon", db: { select } as unknown as DbHandle["db"], migrate: async () => {}, close: async () => {} };
}

beforeEach(() => resetFreshness());

describe("ensureFresh", () => {
  it("does not hold a read past its deadline, and joins the same work", async () => {
    const handle = slowDb(150, TEST_NOW);
    const started = performance.now();
    await ensureFresh(handle, TEST_NOW, 10);
    expect(performance.now() - started).toBeLessThan(120);
    // A second read in the same window waits for the catch-up already running.
    await ensureFresh(handle, TEST_NOW, Infinity);
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
  });

  it("leaves fresh data alone and catches up stale data", async () => {
    const handle = await seededTestDb();
    await ensureFresh(handle, TEST_NOW + 30_000);
    expect((await readSimState(handle.db))?.materialisedUntil.getTime()).toBe(TEST_NOW);
    resetFreshness();
    const later = TEST_NOW + 2 * HOUR;
    await ensureFresh(handle, later);
    expect((await readSimState(handle.db))?.materialisedUntil.getTime()).toBe(later);
    expect((await catchUp(handle.db, later)).inserted).toBe(0);
    await handle.close();
  }, 60_000);
});
