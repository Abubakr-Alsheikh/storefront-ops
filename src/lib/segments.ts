/**
 * Customer segments (DATA.md §6). The thresholds live here once; the SQL in
 * `src/server/queries/customers.ts` is built from the same constants, and a
 * route test checks that both agree.
 */

export const SEGMENTS = ["vip", "at_risk", "returning", "new", "one_time"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** VIP: lifetime value in the top 5%. */
export const VIP_SHARE = 0.05;
/** At risk: two or more orders, none in this many days. */
export const AT_RISK_DAYS = 60;
/** New: a single order placed within this many days. */
export const NEW_DAYS = 30;

const DAY_MS = 86_400_000;

export interface SegmentInput {
  ordersCount: number;
  lifetimeCents: number;
  lastOrderAt: number;
}

/**
 * The one segment a customer belongs to, checked in priority order: VIP,
 * At risk, Returning, New, then One-time (a single order more than 30 days ago).
 */
export function segmentOf(customer: SegmentInput, vipThresholdCents: number, now: number): Segment {
  if (customer.lifetimeCents >= vipThresholdCents) return "vip";
  const quietDays = (now - customer.lastOrderAt) / DAY_MS;
  if (customer.ordersCount >= 2) return quietDays > AT_RISK_DAYS ? "at_risk" : "returning";
  return quietDays <= NEW_DAYS ? "new" : "one_time";
}
