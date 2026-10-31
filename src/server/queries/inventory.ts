import { sql } from "drizzle-orm";
import type { InventoryList, InventoryQuery, InventoryRow } from "@/lib/contracts/catalogue";
import { productById } from "@/lib/data/catalogue";
import { VELOCITY_WINDOW_DAYS, stockFigures } from "@/lib/stock";
import { dayKeyFromNumber, zonedParts } from "@/lib/tz";
import { rows, type Db } from "../db/client";
import { notFound } from "../errors";

/**
 * Inventory with 14-day velocity from the daily variant rollup (whole days
 * before today). The catalogue has about 420 variants, so filtering and
 * sorting happen here, with the same stock rules the UI uses.
 */

async function loadInventory(db: Db, now: number): Promise<InventoryRow[]> {
  const today = zonedParts(now).dayNumber;
  const from = dayKeyFromNumber(today - VELOCITY_WINDOW_DAYS);
  const to = dayKeyFromNumber(today - 1);
  const list = await rows<{ id: number; sku: string; product_id: number; option_label: string; price_cents: number; stock_on_hand: number; sold: number }>(
    db,
    sql`
    SELECT v.id, v.sku, v.product_id, v.option_label, v.price_cents, v.stock_on_hand,
      coalesce(s.sold, 0)::int AS sold
    FROM variants v
    LEFT JOIN (
      SELECT variant_id, sum(units) AS sold FROM daily_variant_stats
      WHERE day BETWEEN ${from}::date AND ${to}::date
      GROUP BY variant_id
    ) s ON s.variant_id = v.id
    ORDER BY v.id`,
  );
  return list.map((v) => {
    const product = productById(v.product_id);
    return {
      variantId: v.id,
      sku: v.sku,
      productId: v.product_id,
      productName: product?.name ?? "Unknown product",
      collection: product?.collection ?? "",
      optionLabel: v.option_label,
      imageSlot: product?.imageSlot ?? "",
      priceCents: v.price_cents,
      sold14Days: v.sold,
      ...stockFigures(v.stock_on_hand, v.sold),
    };
  });
}

const SORTERS: Record<InventoryQuery["sort"], (a: InventoryRow, b: InventoryRow) => number> = {
  // No sales means unlimited cover: those sort last when ascending.
  cover: (a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity),
  product: (a, b) => a.productName.localeCompare(b.productName, "en-GB") || a.optionLabel.localeCompare(b.optionLabel, "en-GB"),
  on_hand: (a, b) => a.onHand - b.onHand,
  sold: (a, b) => a.sold14Days - b.sold14Days,
};

export async function listInventory(db: Db, query: InventoryQuery, now: number): Promise<InventoryList> {
  const all = await loadInventory(db, now);
  const counts = {
    all: all.length,
    low: all.filter((r) => r.state === "low").length,
    out: all.filter((r) => r.state === "out").length,
  };
  const q = query.q?.toLowerCase();
  const filtered = all.filter(
    (r) =>
      (query.state === "all" || r.state === query.state) &&
      (!query.collection || r.collection === query.collection) &&
      (!q || r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.optionLabel.toLowerCase().includes(q)),
  );
  const sorter = SORTERS[query.sort];
  const sign = query.dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => sign * sorter(a, b) || a.variantId - b.variantId);
  const collections = new Map<string, string>();
  for (const r of all) {
    const name = productById(r.productId)?.collectionName;
    if (name) collections.set(r.collection, name);
  }
  return {
    rows: filtered,
    counts,
    collections: [...collections].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "en-GB")),
  };
}

/** The overview's "running low" callout, which links to the Low stock filter: both must agree. */
export async function countLowStock(db: Db, now: number): Promise<number> {
  return (await loadInventory(db, now)).filter((r) => r.state === "low").length;
}

export async function restock(db: Db, sku: string, quantity: number, now: number): Promise<InventoryRow> {
  const [result] = await rows<{ id: number | null }>(
    db,
    sql`
    WITH target AS (SELECT id FROM variants WHERE sku = ${sku}),
    added AS (
      INSERT INTO stock_adjustments (variant_id, delta, reason, actor, created_at)
      SELECT id, ${quantity}, 'restock', 'visitor', ${new Date(now).toISOString()}::timestamptz FROM target
      RETURNING variant_id, delta
    ),
    updated AS (
      UPDATE variants v SET stock_on_hand = v.stock_on_hand + a.delta
      FROM added a WHERE v.id = a.variant_id
      RETURNING v.id
    )
    SELECT (SELECT id FROM updated) AS id`,
  );
  if (result.id === null) throw notFound(`No variant has SKU ${sku}.`);
  const row = (await loadInventory(db, now)).find((r) => r.variantId === result.id);
  if (!row) throw notFound(`No variant has SKU ${sku}.`);
  return row;
}
