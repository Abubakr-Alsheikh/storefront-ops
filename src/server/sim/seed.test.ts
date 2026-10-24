import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { TEST_NOW, seededTestDb } from "@/test/db";
import { createPgliteDb, rows, type Db } from "../db/client";
import { AlreadySeededError, seedDatabase } from "./seed";

async function fingerprint(db: Db) {
  const [orders] = await rows(
    db,
    sql`select count(*)::int as n, sum(total_cents)::text as revenue,
      md5(string_agg(id || ':' || sim_key || ':' || status || ':' || total_cents, ',' order by id)) as digest
      from orders`,
  );
  const [stock] = await rows(
    db,
    sql`select md5(string_agg(id || ':' || stock_on_hand, ',' order by id)) as digest from variants`,
  );
  const [stats] = await rows(
    db,
    sql`select md5(string_agg(day || ':' || orders || ':' || revenue_cents || ':' || sessions, ',' order by day)) as digest
      from daily_stats`,
  );
  return { orders, stock, stats };
}

describe("seedDatabase", () => {
  it("is deterministic: two fresh seeds are identical", async () => {
    const a = await seededTestDb();
    const b = await seededTestDb();
    const fa = await fingerprint(a.db);
    expect(fa.orders.n).toBeGreaterThan(4000);
    expect(await fingerprint(b.db)).toEqual(fa);
    await Promise.all([a.close(), b.close()]);
  }, 60_000);

  it("refuses to seed twice unless forced", async () => {
    const handle = await createPgliteDb();
    await seedDatabase(handle.db, { now: TEST_NOW, days: 1 });
    await expect(seedDatabase(handle.db, { now: TEST_NOW, days: 1 })).rejects.toBeInstanceOf(
      AlreadySeededError,
    );
    const before = await fingerprint(handle.db);
    await seedDatabase(handle.db, { now: TEST_NOW, days: 1, force: true });
    expect(await fingerprint(handle.db)).toEqual(before);
    await handle.close();
  }, 60_000);
});
