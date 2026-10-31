import type { InventoryList, InventoryRow } from "@/lib/contracts/catalogue";
import { stockFigures, type StockState } from "@/lib/stock";

const COUNTED: Partial<Record<StockState, "low" | "out">> = { low: "low", out: "out" };

/**
 * A list with one row replaced, its state counts moved to match. The row keeps
 * its place even when it no longer matches the filter: nothing jumps under the
 * cursor right after a restock, and the next fetch sorts it out.
 */
export function replaceRow(list: InventoryList, next: InventoryRow): InventoryList {
  const before = list.rows.find((row) => row.sku === next.sku);
  if (!before) return list;
  const counts = { ...list.counts };
  const from = COUNTED[before.state];
  const to = COUNTED[next.state];
  if (from) counts[from]--;
  if (to) counts[to]++;
  return { ...list, counts, rows: list.rows.map((row) => (row.sku === next.sku ? next : row)) };
}

/** The row as it should look once `quantity` units arrive. */
export function restocked(row: InventoryRow, quantity: number): InventoryRow {
  return { ...row, ...stockFigures(row.onHand + quantity, row.sold14Days) };
}
