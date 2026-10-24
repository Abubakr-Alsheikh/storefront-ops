// Measures the M1 and M2 budgets on an otherwise idle machine:
//   - 90 days of simulated orders in Node: under 3 s
//   - a 1-hour catch-up: under 300 ms locally
//
//   npm run bench:sim
//
// The catch-up runs against a fresh in-memory PGlite seeded with 3 days, and,
// when .pglite/ exists, against a throwaway copy of it (never the original:
// the bench writes orders an hour into the future).

import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { simulateOrders } from "@/lib/sim/orders";
import { createPgliteDb, type DbHandle } from "@/server/db/client";
import { catchUp, readSimState } from "@/server/sim/catchUp";
import { seedDatabase } from "@/server/sim/seed";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const now = Date.now();
let t = performance.now();
const orders = simulateOrders(now - 90 * DAY, now);
console.log(`simulate 90 days      ${orders.length.toLocaleString("en-GB")} orders in ${Math.round(performance.now() - t)} ms`);

async function catchUpHours(label: string, handle: DbHandle) {
  const state = await readSimState(handle.db);
  if (!state) throw new Error("not seeded");
  const start = state.materialisedUntil.getTime();
  const times: number[] = [];
  for (let i = 1; i <= 3; i++) {
    t = performance.now();
    await catchUp(handle.db, start + i * HOUR);
    times.push(Math.round(performance.now() - t));
  }
  console.log(`catch-up 1 h, ${label.padEnd(9)} ${times.join(" / ")} ms (first, then warm)`);
}

const memory = await createPgliteDb();
await seedDatabase(memory.db, { now, days: 3 });
await catchUpHours("3 days", memory);
await memory.close();

if (existsSync(".pglite")) {
  const dir = await mkdtemp(path.join(tmpdir(), "storefront-bench-"));
  try {
    await cp(".pglite", dir, { recursive: true });
    const copy = await createPgliteDb(dir);
    await catchUpHours("90 days", copy);
    await copy.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
