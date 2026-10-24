// EXPLAIN ANALYZE for the hot five queries (storefront-quality §7), with
// the indexes and then without them, on a throwaway copy of .pglite/.
//
//   npm run db:seed        (once: 90 days of data)
//   npm run explain:hot
//
// Each timing is the median of five warm runs of the exact statement the API
// sends. Prints a Markdown table for PLAN.md and the README.

import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { ordersQuery } from "@/lib/contracts/orders";
import { resolveRange } from "@/lib/ranges";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { ordersPageQuery, ordersTotalQuery, planPage } from "@/server/queries/orders";
import { getOverview } from "@/server/queries/overview";

if (!existsSync(".pglite")) {
  console.error("No .pglite/ database. Run `npm run db:seed` first.");
  process.exit(1);
}

const dir = await mkdtemp(path.join(tmpdir(), "storefront-explain-"));
await cp(".pglite", dir, { recursive: true });
const client = await PGlite.create({ dataDir: dir, extensions: { pg_trgm } });
// The script's drizzle instance is the PGlite flavour of the app's Db.
const db = drizzle({ client, schema }) as unknown as Db;
await client.query("VACUUM ANALYZE");

const [{ max }] = (await client.query<{ max: Date }>("select max(placed_at) as max from orders")).rows;
const now = new Date(max).getTime();

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  "Relation Name"?: string;
  Plans?: PlanNode[];
}

function describe(node: PlanNode, out: string[] = []): string[] {
  if (node["Relation Name"] || node["Index Name"]) {
    out.push(`${node["Node Type"]}${node["Index Name"] ? ` (${node["Index Name"]})` : ` on ${node["Relation Name"]}`}`);
  }
  for (const child of node.Plans ?? []) describe(child, out);
  return out;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function explain(statement: { sql: string; params: unknown[] }) {
  const times: number[] = [];
  let plan: PlanNode | null = null;
  for (let i = 0; i < 6; i++) {
    const result = await client.query<{ "QUERY PLAN": [{ Plan: PlanNode; "Execution Time": number }] }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${statement.sql}`,
      statement.params,
    );
    const [entry] = result.rows[0]["QUERY PLAN"];
    plan = entry.Plan;
    if (i > 0) times.push(entry["Execution Time"]);
  }
  return { ms: median(times), scans: plan ? [...new Set(describe(plan))].join(", ") : "" };
}

const dialect = new PgDialect();
function fromSql(query: SQL) {
  return dialect.sqlToQuery(query);
}

type Case = { name: string; statements: { label: string; statement: { sql: string; params: unknown[] } }[] };

async function pageCase(name: string, raw: Record<string, string>): Promise<Case> {
  const query = ordersQuery.parse(raw);
  const countQuery = ordersTotalQuery(db, query);
  const [{ total }] = await countQuery;
  const plan = planPage(query, total);
  return {
    name,
    statements: [
      { label: plan.reversed ? "page (read from the far end)" : "page", statement: ordersPageQuery(db, plan.query).toSQL() },
      { label: "count", statement: countQuery.toSQL() },
    ],
  };
}

const days30 = resolveRange("30d", now);
const cases: Case[] = [
  await pageCase("Default page (newest 200)", {}),
  await pageCase("Deep page (OFFSET 120000)", { offset: "120000" }),
  await pageCase("Status filter (paid)", { status: "paid" }),
  await pageCase('Search "sil"', { q: "sil" }),
  {
    name: "Overview, 30 days",
    statements: [
      {
        label: "top products (rollup)",
        statement: fromSql(sql`SELECT variant_id, sum(units)::int, sum(revenue_cents)::int FROM daily_variant_stats
          WHERE day BETWEEN ${days30.firstDay}::date AND ${days30.lastDay}::date GROUP BY variant_id`),
      },
      {
        label: "top products (raw join, no rollup)",
        statement: fromSql(sql`SELECT v.product_id, sum(i.quantity)::int u FROM order_items i
          JOIN orders o ON o.id = i.order_id JOIN variants v ON v.id = i.variant_id
          WHERE o.placed_at >= ${new Date(days30.current.from).toISOString()}::timestamptz
          GROUP BY 1 ORDER BY u DESC LIMIT 5`),
      },
      {
        label: "sales by country (rollup)",
        statement: fromSql(sql`SELECT country, sum(orders)::int, sum(revenue_cents)::int FROM daily_country_stats
          WHERE day BETWEEN ${days30.firstDay}::date AND ${days30.lastDay}::date GROUP BY country`),
      },
      {
        label: "sales by country (raw, no rollup)",
        statement: fromSql(sql`SELECT country, count(*), sum(total_cents) FROM orders
          WHERE placed_at >= ${new Date(days30.current.from).toISOString()}::timestamptz GROUP BY 1`),
      },
    ],
  },
];

const ORDER_INDEXES = ["orders_placed_idx", "orders_status_placed_idx", "orders_search_trgm_idx", "orders_open_idx"];

const results = new Map<string, { after: Awaited<ReturnType<typeof explain>>; before?: Awaited<ReturnType<typeof explain>> }>();
for (const c of cases) {
  for (const s of c.statements) results.set(`${c.name} · ${s.label}`, { after: await explain(s.statement) });
}

// Whole overview call, as the route runs it.
const overviewTimes: number[] = [];
for (let i = 0; i < 6; i++) {
  const t = performance.now();
  const o = await getOverview(db, days30, now);
  if (i > 0) overviewTimes.push(performance.now() - t);
  if (i === 0 && o.kpis.revenueCents.previous === null) console.warn("30-day overview has no previous period");
}
const days90 = resolveRange("90d", now);
const ninety = await getOverview(db, days90, now);

// Before: the same statements without the order indexes.
for (const name of ORDER_INDEXES) await client.query(`DROP INDEX ${name}`);
await client.query("ANALYZE orders");
for (const c of cases.slice(0, 4)) {
  for (const s of c.statements) {
    const key = `${c.name} · ${s.label}`;
    const entry = results.get(key);
    if (entry) entry.before = await explain(s.statement);
  }
}

console.log(`\nData: ${(await client.query<{ n: number }>("select count(*)::int n from orders")).rows[0].n.toLocaleString("en-GB")} orders, now = ${new Date(now).toISOString()}\n`);
console.log("| Query | Without indexes | With indexes | Plan (with indexes) |");
console.log("|---|---:|---:|---|");
for (const [key, r] of results) {
  console.log(`| ${key} | ${r.before ? `${r.before.ms.toFixed(1)} ms` : "n/a"} | ${r.after.ms.toFixed(1)} ms | ${r.after.scans} |`);
}
console.log(`\nWhole GET /api/overview?range=30d (all statements, in process): median ${median(overviewTimes).toFixed(1)} ms`);
console.log(`90-day overview previous period: revenue ${ninety.kpis.revenueCents.previous === null ? "missing" : "present"}`);

await client.close();
await rm(dir, { recursive: true, force: true });
