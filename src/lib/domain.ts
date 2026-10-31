/**
 * Domain vocabularies shared by the simulator, the database schema and the
 * API contracts. Display labels live with the copy, not here.
 */

/** paid → packed → shipped → delivered, plus cancelled (before packing) and refunded (after delivery). */
export const ORDER_STATUSES = [
  "paid",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["card", "paypal", "mbway", "klarna", "apple_pay"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Columns the orders API can sort by (a whitelist; DATA.md §7). */
export const ORDER_SORTS = ["placed", "number", "customer", "total", "items", "status", "country"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

/** Rows in one page of the orders table and API. */
export const ORDERS_PAGE_SIZE = 200;

/** How a simulated order's life ends. */
export const PLAN_OUTCOMES = ["complete", "cancelled", "refunded"] as const;
export type PlanOutcome = (typeof PLAN_OUTCOMES)[number];

/** Timeline entries on an order. */
export const EVENT_TYPES = [
  "placed",
  "paid",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "note",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Who made a change: the simulator or a demo visitor. Visitor changes are reverted nightly. */
export const ACTORS = ["system", "visitor"] as const;
export type Actor = (typeof ACTORS)[number];

/**
 * Status changes a person may make: one step forward, cancel only before
 * packing, refund only after delivery. The simulator follows the same graph.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  paid: ["packed", "cancelled"],
  packed: ["shipped"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Bulk "Mark as shipped" applies to these; anything else is skipped. */
export const SHIPPABLE_STATUSES: readonly OrderStatus[] = ["paid", "packed"];
