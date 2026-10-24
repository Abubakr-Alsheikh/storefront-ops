import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createPgliteDb, rows } from "./client";

const handle = await createPgliteDb();
afterAll(() => handle.close());

describe("PGlite database", () => {
  it("runs the migrations and loads pg_trgm", async () => {
    const tables = await rows<{ table_name: string }>(
      handle.db,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      "customers",
      "daily_country_stats",
      "daily_stats",
      "daily_status_stats",
      "daily_variant_stats",
      "order_events",
      "order_items",
      "orders",
      "products",
      "restock_runs",
      "sim_state",
      "stock_adjustments",
      "variants",
    ]);
    const [trgm] = await rows<{ similarity: number }>(handle.db, sql`select similarity('silva', 'silvia') as similarity`);
    expect(trgm.similarity).toBeGreaterThan(0.3);
  });

  it("numbers orders from 100001 and derives search_text", async () => {
    await handle.db.execute(sql`insert into customers (id, name, email, country, city, created_at)
      values (1, 'Ana Silva', 'ana.silva.1@example.com', 'PT', 'Lisboa', now())`);
    const [order] = await rows<{ id: number; search_text: string }>(
      handle.db,
      sql`insert into orders (sim_key, customer_id, customer_name, customer_email, country, city, status,
        payment_method, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, item_count,
        is_returning, placed_at, plan_paid_at, plan_outcome)
      values ('1:0', 1, 'Ana Silva', 'ana.silva.1@example.com', 'PT', 'Lisboa', 'paid', 'card',
        2400, 0, 490, 540, 2890, 1, false, now(), now(), 'complete')
      returning id, search_text`,
    );
    expect(order).toEqual({ id: 100001, search_text: "100001 ana silva ana.silva.1@example.com" });
  });

  it("rejects an unknown status", async () => {
    await expect(handle.db.execute(sql`update orders set status = 'lost'`)).rejects.toThrow();
  });
});
