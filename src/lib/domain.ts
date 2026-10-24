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

/** How a simulated order's life ends. */
export const PLAN_OUTCOMES = ["complete", "cancelled", "refunded"] as const;
export type PlanOutcome = (typeof PLAN_OUTCOMES)[number];
