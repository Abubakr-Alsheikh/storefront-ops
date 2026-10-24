import { SHIPPING_ZONES, type ShippingZone } from "@/lib/data/countries";
import type { EventType, OrderStatus, PlanOutcome } from "@/lib/domain";
import { dayKeyFromNumber, zonedParts, zonedToUtc } from "@/lib/tz";
import { randBetween, randInt, type Rng } from "./prng";
import { weekdayOfDay } from "./rate";

/**
 * When a simulated order will be packed, shipped and delivered, decided the
 * moment it is placed. The warehouse works Lisbon hours, the carrier collects
 * once a day, and parcels arrive Monday to Saturday.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Warehouse opening hours by weekday (0 = Sunday), local time. */
const WAREHOUSE_HOURS: readonly ([number, number] | null)[] = [
  null,
  [8, 18],
  [8, 18],
  [8, 18],
  [8, 18],
  [8, 18],
  [9, 13],
];

/** Carrier collection time by weekday, local hours. */
const PICKUP_HOUR: readonly (number | null)[] = [null, 17, 17, 17, 17, 17, 12];

export const CANCEL_RATE = 0.025;
export const REFUND_RATE = 0.03;

export interface LifecyclePlan {
  paidAt: number;
  packedAt: number | null;
  shippedAt: number | null;
  deliveredAt: number | null;
  cancelledAt: number | null;
  refundedAt: number | null;
  outcome: PlanOutcome;
}

/** Local whole hours already converted to UTC, keyed `day * 24 + hour`. */
const localHourCache = new Map<number, number>();

/** UTC instant of `hour` (fractional allowed) local time on day number `n`. */
function atLocal(dayNumber: number, hour: number): number {
  const whole = Math.floor(hour);
  const key = dayNumber * 24 + whole;
  let base = localHourCache.get(key);
  if (base === undefined) {
    const [year, month, day] = dayKeyFromNumber(dayNumber).split("-").map(Number);
    base = zonedToUtc({ year, month, day, hour: whole });
    localHourCache.set(key, base);
  }
  return base + (hour - whole) * HOUR;
}

/** The working window that holds `ms`, or the next one. `start` is never before `ms`. */
export function workingWindow(ms: number): { start: number; end: number } {
  const first = zonedParts(ms).dayNumber;
  for (let d = first; d < first + 8; d++) {
    const hours = WAREHOUSE_HOURS[weekdayOfDay(d)];
    if (!hours) continue;
    const open = atLocal(d, hours[0]);
    const close = atLocal(d, hours[1]);
    if (close > ms) return { start: Math.max(open, ms), end: close };
  }
  throw new Error("No working window within a week");
}

/** The first carrier collection at or after `ms`. */
export function nextPickup(ms: number): number {
  const first = zonedParts(ms).dayNumber;
  for (let d = first; d < first + 8; d++) {
    const hour = PICKUP_HOUR[weekdayOfDay(d)];
    if (hour === null) continue;
    const pickup = atLocal(d, hour);
    if (pickup >= ms) return pickup;
  }
  throw new Error("No pickup within a week");
}

/** Delivery `days` delivery days (Monday to Saturday) after the day of `shippedAt`. */
function deliveryTime(rng: Rng, shippedAt: number, days: number): number {
  let d = zonedParts(shippedAt).dayNumber;
  let left = days;
  while (left > 0) {
    d++;
    if (weekdayOfDay(d) !== 0) left--;
  }
  return atLocal(d, randBetween(rng, 9, 19));
}

/** Draws the full plan. The caller owns `rng`, so the plan is part of the order's stream. */
export function planLifecycle(rng: Rng, placedAt: number, zone: ShippingZone): LifecyclePlan {
  const roll = rng();
  const outcome: PlanOutcome =
    roll < CANCEL_RATE ? "cancelled" : roll < CANCEL_RATE + REFUND_RATE ? "refunded" : "complete";

  const paidAt = placedAt + randInt(rng, 3, 40) * 1000;

  // Packing starts once payment has settled, inside opening hours.
  const window = workingWindow(paidAt + 20 * MINUTE);
  let packedAt = window.start + randBetween(rng, 10 * MINUTE, 3.5 * HOUR);
  if (packedAt > window.end) {
    const next = workingWindow(window.end + 1);
    packedAt = next.start + randBetween(rng, 5 * MINUTE, 2.5 * HOUR);
  }
  packedAt = Math.round(packedAt);

  if (outcome === "cancelled") {
    const cancelledAt = Math.round(
      paidAt + Math.max(2 * MINUTE, rng() * 0.9 * (packedAt - paidAt)),
    );
    return {
      paidAt,
      packedAt: null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt,
      refundedAt: null,
      outcome,
    };
  }

  const shippedAt = Math.round(nextPickup(packedAt + 30 * MINUTE) + randBetween(rng, 0, 25 * MINUTE));
  const [minDays, maxDays] = SHIPPING_ZONES[zone].transitDays;
  const deliveredAt = Math.round(deliveryTime(rng, shippedAt, randInt(rng, minDays, maxDays)));

  let refundedAt: number | null = null;
  if (outcome === "refunded") {
    const refundWindow = workingWindow(deliveredAt + randBetween(rng, 2 * DAY, 14 * DAY));
    refundedAt = Math.round(
      refundWindow.start + rng() * Math.min(3 * HOUR, refundWindow.end - refundWindow.start),
    );
  }

  return { paidAt, packedAt, shippedAt, deliveredAt, cancelledAt: null, refundedAt, outcome };
}

/** Status of a planned order at instant `now`. Orders arrive paid. */
export function statusAt(plan: LifecyclePlan, now: number): OrderStatus {
  if (plan.cancelledAt !== null && now >= plan.cancelledAt) return "cancelled";
  if (plan.refundedAt !== null && now >= plan.refundedAt) return "refunded";
  if (plan.deliveredAt !== null && now >= plan.deliveredAt) return "delivered";
  if (plan.shippedAt !== null && now >= plan.shippedAt) return "shipped";
  if (plan.packedAt !== null && now >= plan.packedAt) return "packed";
  return "paid";
}

/**
 * Lifecycle events the plan has produced by `asOf`, oldest first. "Placed"
 * and "paid" are not stored: every order has them, and the timeline reads
 * them from `placed_at` and `plan_paid_at`.
 */
export function elapsedEvents(
  plan: LifecyclePlan,
  asOf: number,
): { type: EventType; at: number }[] {
  const events: { type: EventType; at: number }[] = [];
  const steps: [EventType, number | null][] = [
    ["cancelled", plan.cancelledAt],
    ["packed", plan.packedAt],
    ["shipped", plan.shippedAt],
    ["delivered", plan.deliveredAt],
    ["refunded", plan.refundedAt],
  ];
  for (const [type, at] of steps) {
    if (at !== null && at <= asOf) events.push({ type, at });
  }
  return events;
}
