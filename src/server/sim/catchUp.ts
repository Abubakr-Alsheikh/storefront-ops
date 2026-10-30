import { eq, sql } from "drizzle-orm";
import { SIM_VERSION } from "@/lib/sim/config";
import type { Db } from "../db/client";
import { simState } from "../db/schema";
import { advanceLifecycles, materialiseRange } from "./materialise";

/** A catch-up covers at most this much; older gaps are the nightly job's. */
export const CATCH_UP_CAP_MS = 26 * 3_600_000;

export class NotSeededError extends Error {
  constructor() {
    super("The database has no simulator state. Run `npm run db:seed`.");
    this.name = "NotSeededError";
  }
}

export class SimVersionMismatchError extends Error {
  readonly stored: number;

  constructor(stored: number) {
    super(`The database was written by simulator v${stored}, this code is v${SIM_VERSION}. Reseed it.`);
    this.name = "SimVersionMismatchError";
    this.stored = stored;
  }
}

export interface SimStateRow {
  simVersion: number;
  materialisedUntil: Date;
}

export async function readSimState(db: Db): Promise<SimStateRow | null> {
  const [row] = await db
    .select({ simVersion: simState.simVersion, materialisedUntil: simState.materialisedUntil })
    .from(simState)
    .where(eq(simState.id, 1));
  return row ?? null;
}

/** Moves the high-water mark forward, never back, even when catch-ups race. */
export async function markMaterialised(db: Db, toMs: number): Promise<void> {
  await db
    .update(simState)
    .set({
      materialisedUntil: sql`GREATEST(${simState.materialisedUntil}, ${new Date(toMs).toISOString()}::timestamptz)`,
    })
    .where(eq(simState.id, 1));
}

export interface CatchUpResult {
  from: number;
  to: number;
  inserted: number;
  moved: number;
}

/**
 * Writes every order placed since the last catch-up (capped at 26 hours
 * unless the caller is the nightly job), then moves lifecycles forward to
 * `now`. Safe to run concurrently.
 */
export async function catchUp(
  db: Db,
  now: number = Date.now(),
  { capMs = CATCH_UP_CAP_MS, advance = true }: { capMs?: number; advance?: boolean } = {},
): Promise<CatchUpResult> {
  const state = await readSimState(db);
  if (!state) throw new NotSeededError();
  if (state.simVersion !== SIM_VERSION) throw new SimVersionMismatchError(state.simVersion);

  const from = Math.max(state.materialisedUntil.getTime(), now - capMs);
  const inserted = from < now ? await materialiseRange(db, from, now, now) : 0;
  // The live feed ticks every 2 s; statuses move on a scale of hours, so it
  // advances them far less often than it inserts orders.
  const moved = advance ? await advanceLifecycles(db, now) : 0;
  await markMaterialised(db, now);
  return { from, to: now, inserted, moved };
}
