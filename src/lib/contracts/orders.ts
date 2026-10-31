import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/data/countries";
import {
  ACTORS,
  EVENT_TYPES,
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDERS_PAGE_SIZE,
  PAYMENT_METHODS,
  type OrderSort,
} from "@/lib/domain";
import { dayKey, isoInstant, queryInt, queryList, querySearch, sortDir } from "./common";

export { ORDER_SORTS, type OrderSort };

export const MAX_PAGE_SIZE = ORDERS_PAGE_SIZE;

/**
 * Filters, sort and search for the orders table. The URL state (nuqs) and
 * the API parse with this one schema, so a link and a request always agree.
 */
export const orderFilters = z
  .object({
    status: queryList(ORDER_STATUSES),
    country: queryList(COUNTRY_CODES),
    payment: queryList(PAYMENT_METHODS),
    /** Local dates, inclusive. */
    from: z.preprocess((v) => (v === "" ? undefined : v), dayKey.optional()),
    to: z.preprocess((v) => (v === "" ? undefined : v), dayKey.optional()),
    /** Order total in cents, inclusive. */
    min: queryInt(0),
    max: queryInt(0),
    q: querySearch,
    sort: z.enum(ORDER_SORTS).default("placed"),
    dir: sortDir.default("desc"),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: "The start date is after the end date.",
    path: ["from"],
  })
  .refine((f) => f.min === undefined || f.max === undefined || f.min <= f.max, {
    message: "The minimum amount is above the maximum.",
    path: ["min"],
  });
export type OrderFilters = z.infer<typeof orderFilters>;

export function parseOrderFilters(params: URLSearchParams | Record<string, string | undefined>) {
  const record = params instanceof URLSearchParams ? Object.fromEntries(params) : params;
  return orderFilters.safeParse(record);
}

export const ordersQuery = z.intersection(
  orderFilters,
  z.object({
    offset: queryInt(0).default(0),
    limit: queryInt(1, MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
    /**
     * Freeze the result at this order number: the table sends the newest
     * number it has seen, so live inserts cannot shift its pages until the
     * user asks for the new orders.
     */
    upTo: queryInt(100001),
  }),
);
export type OrdersQuery = z.infer<typeof ordersQuery>;

export const orderRow = z.object({
  number: z.number().int(),
  placedAt: isoInstant,
  customerName: z.string(),
  customerEmail: z.string(),
  country: z.enum(COUNTRY_CODES),
  city: z.string(),
  itemCount: z.number().int(),
  totalCents: z.number().int(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  status: z.enum(ORDER_STATUSES),
});
export type OrderRow = z.infer<typeof orderRow>;

export const ordersPage = z.object({
  rows: z.array(orderRow),
  /** Every order matching the filters, not just this page. */
  total: z.number().int(),
  offset: z.number().int(),
  /**
   * The newest order number overall, on the first page of an unfrozen query.
   * The table sends it back as `upTo` for every later page.
   */
  newest: z.number().int().nullable(),
});
export type OrdersPage = z.infer<typeof ordersPage>;

export const orderLine = z.object({
  sku: z.string(),
  productId: z.number().int(),
  productName: z.string(),
  optionLabel: z.string(),
  imageSlot: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  lineTotalCents: z.number().int(),
});

export const timelineEntry = z.object({
  type: z.enum(EVENT_TYPES),
  at: isoInstant,
  actor: z.enum(ACTORS),
  message: z.string().nullable(),
});
export type TimelineEntry = z.infer<typeof timelineEntry>;

export const orderDetail = orderRow.extend({
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  discountCode: z.string().nullable(),
  shippingCents: z.number().int(),
  taxCents: z.number().int(),
  items: z.array(orderLine),
  customer: z.object({
    id: z.number().int(),
    name: z.string(),
    email: z.string(),
    country: z.enum(COUNTRY_CODES),
    city: z.string(),
    customerSince: isoInstant,
    ordersCount: z.number().int(),
    /** 1 for the customer's first order still on file, 2 for the second… */
    orderOrdinal: z.number().int(),
  }),
  timeline: z.array(timelineEntry),
  allowedTransitions: z.array(z.enum(ORDER_STATUSES)),
  /** A visitor has changed this order since the last nightly reset. */
  changedByVisitor: z.boolean(),
});
export type OrderDetail = z.infer<typeof orderDetail>;

/** `?after=` resumes the live feed when `Last-Event-ID` is not available. */
export const liveFeedQuery = z.object({ after: queryInt(0) });

/** The `kpi` event of the live feed: today's totals so far. */
export const liveKpi = z.object({
  day: dayKey,
  orders: z.number().int(),
  revenueCents: z.number().int(),
  sessions: z.number().int(),
});
export type LiveKpi = z.infer<typeof liveKpi>;

export const orderNumberParam = z.object({
  number: z.coerce.number().int().min(100001).max(2_147_483_647),
});

export const statusChangeBody = z.object({ status: z.enum(ORDER_STATUSES) });
export type StatusChangeBody = z.infer<typeof statusChangeBody>;

export const NOTE_MAX_LENGTH = 280;
export const noteBody = z.object({
  message: z.string().trim().min(1, "The note is empty.").max(NOTE_MAX_LENGTH),
});
export type NoteBody = z.infer<typeof noteBody>;

export const BULK_SHIP_MAX = 100;
export const bulkShipBody = z.object({
  numbers: z
    .array(z.number().int().min(100001))
    .min(1)
    .max(BULK_SHIP_MAX)
    .refine((n) => new Set(n).size === n.length, "Each order can appear once."),
});
export type BulkShipBody = z.infer<typeof bulkShipBody>;

export const bulkShipResult = z.object({
  shipped: z.array(z.number().int()),
  skipped: z.array(z.number().int()),
});
export type BulkShipResult = z.infer<typeof bulkShipResult>;
