import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  ACTORS,
  EVENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PLAN_OUTCOMES,
} from "../../lib/domain";

/**
 * The Storefront Ops schema (DATA.md §3). Money is integer cents; every
 * timestamp is timestamptz in UTC. Vocabularies are text columns with CHECK
 * constraints, which are easier to migrate than Postgres enums.
 *
 * The order number shown on screen is `orders.id`, an identity that starts
 * at 100001 and grows in insertion order.
 */

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** `column IN ('a', 'b', …)` for a CHECK constraint. */
function oneOf(column: string, values: readonly string[]) {
  return sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(", ")})`);
}

export const STOCK_REASONS = ["restock", "correction"] as const;

export const products = pgTable("products", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  collection: text("collection").notNull(),
  type: text("type").notNull(),
  imageSlot: text("image_slot").notNull(),
});

export const variants = pgTable(
  "variants",
  {
    id: integer("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    sku: text("sku").notNull().unique(),
    optionLabel: text("option_label").notNull(),
    priceCents: integer("price_cents").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    leadTimeDays: integer("lead_time_days").notNull(),
    openingStock: integer("opening_stock").notNull(),
    /** All-time units sold; never recomputed from items, which are trimmed. */
    unitsSold: integer("units_sold").notNull().default(0),
    /** opening_stock + sum(adjustments) - units_sold. Negative means units on backorder. */
    stockOnHand: integer("stock_on_hand").notNull(),
    reorderPoint: integer("reorder_point").notNull(),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => variants.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (t) => [
    index("stock_adjustments_variant_idx").on(t.variantId),
    check("stock_adjustments_reason_check", oneOf("reason", STOCK_REASONS)),
    check("stock_adjustments_actor_check", oneOf("actor", ACTORS)),
  ],
);

/**
 * One row per weekly supplier restock. A catch-up claims the week with
 * `ON CONFLICT DO NOTHING` in the same statement that writes the restocks,
 * so two concurrent catch-ups can never restock the same week twice.
 */
export const restockRuns = pgTable("restock_runs", {
  /** Monday-based week number (src/lib/sim/rate.ts weekOfDay). */
  week: integer("week").primaryKey(),
  ranAt: at("ran_at").notNull(),
});

export const customers = pgTable(
  "customers",
  {
    /** The simulator's customer id (DATA.md §2), not a sequence. */
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    country: text("country").notNull(),
    city: text("city").notNull(),
    /** When the first order arrived. */
    createdAt: at("created_at").notNull(),
    // Aggregates over the orders still in the database, kept by the catch-up
    // in the same statement as the orders and rebuilt by the nightly reset.
    ordersCount: integer("orders_count").notNull().default(0),
    lifetimeCents: integer("lifetime_cents").notNull().default(0),
    lastOrderAt: at("last_order_at"),
    searchText: text("search_text")
      .notNull()
      .generatedAlwaysAs(sql`lower(name || ' ' || email)`),
  },
  (t) => [
    // Ascending on purpose: see the note on the orders indexes.
    index("customers_lifetime_idx").on(t.lifetimeCents, t.id),
    index("customers_last_order_idx").on(t.lastOrderAt, t.id),
    index("customers_search_trgm_idx").using("gin", t.searchText.op("gin_trgm_ops")),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity({ startWith: 100001 }),
    simKey: text("sim_key").notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    country: text("country").notNull(),
    city: text("city").notNull(),
    status: text("status").notNull(),
    paymentMethod: text("payment_method").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull(),
    discountCode: text("discount_code"),
    shippingCents: integer("shipping_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    itemCount: integer("item_count").notNull(),
    isReturning: boolean("is_returning").notNull(),
    placedAt: at("placed_at").notNull(),
    planPaidAt: at("plan_paid_at").notNull(),
    planPackedAt: at("plan_packed_at"),
    planShippedAt: at("plan_shipped_at"),
    planDeliveredAt: at("plan_delivered_at"),
    planCancelledAt: at("plan_cancelled_at"),
    planRefundedAt: at("plan_refunded_at"),
    planOutcome: text("plan_outcome").notNull(),
    visitorTouchedAt: at("visitor_touched_at"),
    searchText: text("search_text")
      .notNull()
      .generatedAlwaysAs(
        sql`lower(id::text || ' ' || customer_name || ' ' || customer_email)`,
      ),
  },
  (t) => [
    // Ascending on purpose. Drizzle writes `.desc()` as DESC NULLS LAST, which
    // a plain `ORDER BY placed_at DESC` (NULLS FIRST) cannot use; Postgres
    // scans an ascending index backward for DESC and forward for ASC.
    index("orders_placed_idx").on(t.placedAt, t.id),
    index("orders_status_placed_idx").on(t.status, t.placedAt, t.id),
    index("orders_customer_placed_idx").on(t.customerId, t.placedAt, t.id),
    index("orders_country_idx").on(t.country),
    index("orders_search_trgm_idx").using("gin", t.searchText.op("gin_trgm_ops")),
    // Lifecycle advance: only open orders and the few delivered ones that will be refunded.
    index("orders_open_idx")
      .on(t.status)
      .where(sql`status IN ('paid', 'packed', 'shipped')`),
    index("orders_refund_due_idx")
      .on(t.planRefundedAt)
      .where(sql`status = 'delivered' AND plan_refunded_at IS NOT NULL`),
    index("orders_visitor_touched_idx")
      .on(t.visitorTouchedAt)
      .where(sql`visitor_touched_at IS NOT NULL`),
    check("orders_status_check", oneOf("status", ORDER_STATUSES)),
    check("orders_payment_check", oneOf("payment_method", PAYMENT_METHODS)),
    check("orders_outcome_check", oneOf("plan_outcome", PLAN_OUTCOMES)),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => variants.id),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_variant_idx").on(t.variantId),
  ],
);

/**
 * Status changes and notes. "Placed" and "paid" happen to every order, so
 * they are not stored; the timeline reads them from the order row.
 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message"),
    actor: text("actor").notNull(),
    createdAt: at("created_at").notNull(),
  },
  (t) => [
    index("order_events_order_idx").on(t.orderId, t.createdAt),
    check("order_events_type_check", oneOf("type", EVENT_TYPES)),
    check("order_events_actor_check", oneOf("actor", ACTORS)),
  ],
);

export const dailyStats = pgTable("daily_stats", {
  /** Local date in Lisbon. */
  day: date("day", { mode: "string" }).primaryKey(),
  orders: integer("orders").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  sessions: integer("sessions").notNull().default(0),
  units: integer("units").notNull().default(0),
  newCustomers: integer("new_customers").notNull().default(0),
  refundsCents: integer("refunds_cents").notNull().default(0),
});

/**
 * Rollups the overview and inventory read instead of scanning orders. Every
 * catch-up batch upserts them in the statement that inserts the orders.
 */
export const dailyVariantStats = pgTable(
  "daily_variant_stats",
  {
    day: date("day", { mode: "string" }).notNull(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => variants.id),
    units: integer("units").notNull().default(0),
    /** Line revenue: quantity × unit price, before discount and shipping. */
    revenueCents: integer("revenue_cents").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.variantId] })],
);

export const dailyCountryStats = pgTable(
  "daily_country_stats",
  {
    day: date("day", { mode: "string" }).notNull(),
    country: text("country").notNull(),
    orders: integer("orders").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.country] })],
);

/** Current status of the orders placed each day; moves with every status change. */
export const dailyStatusStats = pgTable(
  "daily_status_stats",
  {
    day: date("day", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    orders: integer("orders").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.status] })],
);

export const simState = pgTable(
  "sim_state",
  {
    id: integer("id").primaryKey(),
    simVersion: integer("sim_version").notNull(),
    /** Orders placed at or before this instant are in the database. */
    materialisedUntil: at("materialised_until").notNull(),
    /**
     * Exact count of rows in `orders`, moved in the statements that insert
     * and trim them, so the unfiltered table total costs no scan.
     */
    ordersTotal: integer("orders_total").notNull().default(0),
  },
  (t) => [check("sim_state_singleton", sql`${t.id} = 1`)],
);
