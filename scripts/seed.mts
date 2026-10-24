// Seeds the database with the catalogue and 90 days of simulated orders.
//
//   npm run db:seed                       local PGlite in .pglite/
//   npm run db:seed -- --force            wipe and reseed
//   npm run db:seed -- --days=3 --now=2026-10-26T10:30:00Z
//
// With DATABASE_URL in .env.local it seeds Neon instead, after migrating.

import { sql } from "drizzle-orm";
import { createNeonDb, createPgliteDb, rows } from "@/server/db/client";
import { seedDatabase } from "@/server/sim/seed";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [key, value] = a.replace(/^--/, "").split("=");
    return [key, value ?? "true"] as const;
  }),
);

const days = Number(args.get("days") ?? 90);
const now = args.has("now") ? Date.parse(args.get("now") ?? "") : Date.now();
if (!Number.isFinite(now) || !(days > 0)) {
  console.error("Usage: npm run db:seed -- [--force] [--days=90] [--now=ISO]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
const handle = url ? await createNeonDb(url) : await createPgliteDb(".pglite");
console.log(`Database: ${handle.kind}${url ? "" : " (.pglite/)"}`);
await handle.migrate();

const report = await seedDatabase(handle.db, {
  now,
  days,
  force: args.has("force"),
  onProgress: (message) => console.log(message),
});

const counts = await rows<{ table: string; n: number }>(
  handle.db,
  sql`select 'orders' as table, count(*)::int as n from orders
    union all select 'order_items', count(*)::int from order_items
    union all select 'order_events', count(*)::int from order_events
    union all select 'customers', count(*)::int from customers
    union all select 'stock_adjustments', count(*)::int from stock_adjustments
    union all select 'daily_stats', count(*)::int from daily_stats`,
);
const [check] = await rows<{ orders: number; revenue: string; size: string }>(
  handle.db,
  sql`select count(*)::int as orders, sum(total_cents)::text as revenue,
    pg_size_pretty(pg_database_size(current_database())) as size from orders`,
);

console.log(`\nSeeded ${report.orders.toLocaleString("en-GB")} orders in ${(report.ms / 1000).toFixed(1)} s`);
for (const c of counts) console.log(`  ${c.table.padEnd(18)} ${c.n.toLocaleString("en-GB")}`);
console.log(`  sum(total_cents)   ${check.revenue}`);
console.log(`  database size      ${check.size}`);

await handle.close();
