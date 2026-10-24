import { createPgliteDb, type DbHandle } from "@/server/db/client";
import { seedDatabase } from "@/server/sim/seed";

/**
 * Monday 26 October 2026, 10:30 in Lisbon, the day after the clocks went
 * back. A 3-day seed ending here crosses the DST change and the Monday
 * 09:00 supplier delivery.
 */
export const TEST_NOW = Date.parse("2026-10-26T10:30:00Z");
export const TEST_DAYS = 3;

/** A fresh in-memory database, migrated and seeded with a short history. */
export async function seededTestDb(now = TEST_NOW, days = TEST_DAYS): Promise<DbHandle> {
  const handle = await createPgliteDb();
  await seedDatabase(handle.db, { now, days });
  return handle;
}
