import type { DbHandle } from "./db/client";
import { NotSeededError, SimVersionMismatchError, catchUp, readSimState } from "./sim/catchUp";
import { seedDatabase } from "./sim/seed";

/**
 * Keeps reads close to real time (DATA.md §4): before a read, if the data is
 * more than a minute old, run a catch-up. A memo skips the state check for a
 * few seconds, and concurrent requests share one catch-up.
 *
 * Locally (PGlite) an empty database is seeded and a database written by an
 * older simulator is reseeded, so `npm run dev` needs no setup. On Neon both
 * cases are left alone and reported by /api/health.
 *
 * After a quiet spell a catch-up can take many seconds on Neon (thousands of
 * status moves on cold pages). A read waits for it only briefly, then serves
 * what is stored; the catch-up carries on, and its writes are idempotent if
 * the function instance goes away first. `asOf` in the response stays honest.
 */

/** How long a read on Neon waits for a catch-up. */
const NEON_READ_DEADLINE_MS = 1200;

const STALE_AFTER_MS = 60_000;
const RECHECK_AFTER_MS = 5_000;

let lastCheck = 0;
let running: Promise<void> | null = null;

async function freshen(handle: DbHandle, now: number): Promise<void> {
  const state = await readSimState(handle.db);
  if (state && now - state.materialisedUntil.getTime() < STALE_AFTER_MS) return;
  try {
    await catchUp(handle.db, now);
  } catch (error) {
    const local = handle.kind === "pglite";
    if (local && (error instanceof NotSeededError || error instanceof SimVersionMismatchError)) {
      console.info(`[storefront] ${error.message} Seeding 90 days locally, this takes about a minute.`);
      await seedDatabase(handle.db, { now, force: error instanceof SimVersionMismatchError });
      return;
    }
    throw error;
  }
}

export async function ensureFresh(
  handle: DbHandle,
  now: number,
  // Locally a catch-up is quick, and the first read must wait for the seed.
  deadlineMs = handle.kind === "neon" ? NEON_READ_DEADLINE_MS : Infinity,
): Promise<void> {
  if (now - lastCheck >= RECHECK_AFTER_MS) {
    lastCheck = now;
    running ??= freshen(handle, now)
      .catch((error) => {
        // A failed catch-up must not fail the read: serve what is there.
        console.error("[storefront] catch-up failed", error);
        lastCheck = 0;
      })
      .finally(() => {
        running = null;
      });
  }
  if (!running) return;
  if (deadlineMs === Infinity) return running;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    running,
    new Promise((resolve) => {
      timer = setTimeout(resolve, deadlineMs);
    }),
  ]);
  clearTimeout(timer);
}

/** Forgets the memo; for tests, which run several clocks in one process. */
export function resetFreshness() {
  lastCheck = 0;
  running = null;
}
