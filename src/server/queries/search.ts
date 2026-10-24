import { sql } from "drizzle-orm";
import type { SearchResults } from "@/lib/contracts/catalogue";
import type { CountryCode } from "@/lib/data/countries";
import { PRODUCTS } from "@/lib/data/catalogue";
import type { OrderStatus } from "@/lib/domain";
import { rows, type Db } from "../db/client";

const LIMIT = 5;

/** The command palette: up to five orders, customers and products. */
export async function search(db: Db, q: string): Promise<SearchResults> {
  const needle = q.replace(/^#/, "").trim().toLowerCase();
  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const exactNumber = /^\d{6,10}$/.test(needle) ? Number(needle) : null;

  const [orderRows, customerRows] = await Promise.all([
    rows<{ id: number; customer_name: string; total_cents: number; status: string; placed_at: string | Date }>(
      db,
      sql`SELECT id, customer_name, total_cents, status, placed_at FROM orders
        WHERE ${exactNumber === null ? sql`search_text LIKE ${like}` : sql`id = ${exactNumber}`}
        ORDER BY placed_at DESC, id DESC LIMIT ${LIMIT}`,
    ),
    rows<{ id: number; name: string; email: string; country: string }>(
      db,
      sql`SELECT id, name, email, country FROM customers
        WHERE orders_count > 0 AND search_text LIKE ${like}
        ORDER BY lifetime_cents DESC, id DESC LIMIT ${LIMIT}`,
    ),
  ]);

  return {
    orders: orderRows.map((o) => ({
      number: o.id,
      customerName: o.customer_name,
      totalCents: o.total_cents,
      status: o.status as OrderStatus,
      placedAt: new Date(o.placed_at).toISOString(),
    })),
    customers: customerRows.map((c) => ({ ...c, country: c.country as CountryCode })),
    products: PRODUCTS.filter((p) => `${p.name} ${p.collectionName}`.toLowerCase().includes(needle))
      .slice(0, LIMIT)
      .map((p) => ({ productId: p.id, name: p.name, collection: p.collectionName, imageSlot: p.imageSlot })),
  };
}
