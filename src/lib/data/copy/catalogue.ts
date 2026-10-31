import { formatCover, formatNumber } from "@/lib/format";
import type { Segment } from "@/lib/segments";
import type { StockState } from "@/lib/stock";

/** Words of the inventory and customer screens (COPY.md §6). */

export const STOCK_LABELS: Record<StockState, string> = {
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export const SEGMENT_LABELS: Record<Segment, string> = {
  vip: "VIP",
  at_risk: "At risk",
  returning: "Returning",
  new: "New",
  one_time: "One-time",
};

export const SEGMENT_HELP: Record<Segment, string> = {
  vip: "VIP: top 5% by lifetime value",
  at_risk: "At risk: two or more orders, none in 60 days",
  returning: "Returning: two or more orders",
  new: "New: first order in the last 30 days",
  one_time: "One-time: a single order, more than 30 days ago",
};

export const inventoryCopy = {
  gridName: "Inventory",
  searchPlaceholder: "Search by product, variant or SKU",
  allStates: "All",
  allCollections: "All collections",
  collection: "Collection",
  count: (matching: number, total: number) =>
    matching === total ? `${formatNumber(total)} SKUs` : `${formatNumber(matching)} of ${formatNumber(total)} SKUs`,
  headers: { product: "Product", variant: "Variant", sku: "SKU", onHand: "On hand", sold: "Sold (14 days)", cover: "Days of cover", state: "State" },
  onHand: (n: number) => `${formatNumber(n)} on hand`,
  noRecentSales: "No sales in 14 days",
  restock: "Restock",
  dialogTitle: (product: string, variant: string) => `Restock ${product} · ${variant}`,
  unitsReceived: "Units received",
  unitsHelp: "From 1 to 500 units.",
  addStock: "Add stock",
  notNow: "Not now",
  coverAfter: (days: number) => `Days of cover after restock: ${formatCover(days)}`,
  added: (n: number, sku: string) => `${formatNumber(n)} ${n === 1 ? "unit" : "units"} added to ${sku}`,
  empty: "No products match these filters.",
  emptyHelp: "Widen the filters to see more of the catalogue.",
};

export const customersCopy = {
  gridName: "Customers",
  searchPlaceholder: "Search by name or email",
  allSegments: "All",
  segmentFilter: "Segment",
  count: (n: number) => `${formatNumber(n)} ${n === 1 ? "customer" : "customers"}`,
  headers: { customer: "Customer", country: "Country", orders: "Orders", lifetime: "Lifetime value", lastOrder: "Last order", segment: "Segment" },
  orders: (n: number) => `${formatNumber(n)} ${n === 1 ? "order" : "orders"}`,
  empty: "No customers match these filters.",
  emptyHelp: "Check the name or try another segment.",
  back: "Back to customers",
  since: (monthYear: string) => `Customer since ${monthYear}`,
  stats: { orders: "Orders", lifetime: "Lifetime value", average: "Average order" },
  ordersTitle: "Orders",
  notFound: (id: number) => `Customer ${id} does not exist.`,
  notFoundHelp: "Customers leave the demo when their last order passes 90 days.",
};
