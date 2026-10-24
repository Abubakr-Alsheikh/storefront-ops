import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/data/countries";
import { ORDER_STATUSES } from "@/lib/domain";
import { SEGMENTS } from "@/lib/segments";
import { STOCK_STATES } from "@/lib/stock";
import { isoInstant, positiveIntParam, queryInt, querySearch, sortDir } from "./common";
import { orderRow } from "./orders";

// --- Inventory --------------------------------------------------------------

export const INVENTORY_SORTS = ["cover", "product", "on_hand", "sold"] as const;

export const inventoryQuery = z.object({
  q: querySearch,
  collection: querySearch,
  state: z.enum(["all", "low", "out"]).default("all"),
  sort: z.enum(INVENTORY_SORTS).default("cover"),
  dir: sortDir.default("asc"),
});
export type InventoryQuery = z.infer<typeof inventoryQuery>;

export const inventoryRow = z.object({
  variantId: z.number().int(),
  sku: z.string(),
  productId: z.number().int(),
  productName: z.string(),
  collection: z.string(),
  optionLabel: z.string(),
  imageSlot: z.string(),
  priceCents: z.number().int(),
  /** Negative means units on backorder. */
  onHand: z.number().int(),
  sold14Days: z.number().int(),
  /** Null when the variant sold nothing in 14 days. */
  daysOfCover: z.number().nullable(),
  state: z.enum(STOCK_STATES),
});
export type InventoryRow = z.infer<typeof inventoryRow>;

export const inventoryList = z.object({
  rows: z.array(inventoryRow),
  /** Counts over the whole catalogue, unaffected by filters. */
  counts: z.object({ all: z.number().int(), low: z.number().int(), out: z.number().int() }),
});
export type InventoryList = z.infer<typeof inventoryList>;

export const skuParam = z.object({ sku: z.string().regex(/^[A-Z]{3}-[A-Z]{3}-\d{2}$/) });

export const RESTOCK_MAX = 500;
export const restockBody = z.object({ quantity: z.number().int().min(1).max(RESTOCK_MAX) });
export type RestockBody = z.infer<typeof restockBody>;

// --- Customers --------------------------------------------------------------

export const CUSTOMER_SORTS = ["lifetime", "orders", "last_order", "name"] as const;

export const customersQuery = z.object({
  q: querySearch,
  segment: z.enum(SEGMENTS).optional(),
  sort: z.enum(CUSTOMER_SORTS).default("lifetime"),
  dir: sortDir.default("desc"),
  offset: queryInt(0).default(0),
  limit: queryInt(1, 200).default(100),
});
export type CustomersQuery = z.infer<typeof customersQuery>;

export const customerRow = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  country: z.enum(COUNTRY_CODES),
  city: z.string(),
  ordersCount: z.number().int(),
  lifetimeCents: z.number().int(),
  lastOrderAt: isoInstant,
  segment: z.enum(SEGMENTS),
});
export type CustomerRow = z.infer<typeof customerRow>;

export const customersPage = z.object({
  rows: z.array(customerRow),
  total: z.number().int(),
  offset: z.number().int(),
  /** Lifetime value at which a customer becomes VIP. */
  vipThresholdCents: z.number().int(),
});
export type CustomersPage = z.infer<typeof customersPage>;

export const customerIdParam = z.object({ id: positiveIntParam });

export const customerDetail = customerRow.extend({
  customerSince: isoInstant,
  averageOrderCents: z.number().int(),
  orders: z.array(orderRow),
});
export type CustomerDetail = z.infer<typeof customerDetail>;

// --- Search (command palette) ----------------------------------------------

export const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });

export const searchResults = z.object({
  orders: z.array(
    z.object({
      number: z.number().int(),
      customerName: z.string(),
      totalCents: z.number().int(),
      status: z.enum(ORDER_STATUSES),
      placedAt: isoInstant,
    }),
  ),
  customers: z.array(
    z.object({ id: z.number().int(), name: z.string(), email: z.string(), country: z.enum(COUNTRY_CODES) }),
  ),
  products: z.array(
    z.object({ productId: z.number().int(), name: z.string(), collection: z.string(), imageSlot: z.string() }),
  ),
});
export type SearchResults = z.infer<typeof searchResults>;

// --- Health -----------------------------------------------------------------

export const health = z.object({
  ok: z.boolean(),
  db: z.enum(["neon", "pglite"]),
  simVersion: z.number().int(),
  /** The version that wrote the data; differs from simVersion after a simulator change. */
  storedSimVersion: z.number().int().nullable(),
  materialisedUntil: isoInstant.nullable(),
});
export type Health = z.infer<typeof health>;
