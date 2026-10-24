import { VARIANTS, type Variant } from "@/lib/data/catalogue";
import { dayKeyFromNumber, zonedParts, zonedToUtc } from "@/lib/tz";
import { SIM_SEED } from "./config";
import { expectedDailyUnits } from "./orders";
import { rngFor } from "./prng";
import { weekOfDay, weekdayOfDay } from "./rate";

/**
 * The supplier side: opening stock and the weekly restock. Suppliers deliver
 * every Monday at 09:00 Lisbon. Each delivery brings a variant up to its
 * 14-day sales velocity times a cover that changes from week to week, and
 * now and then a supplier misses a week, so some variants run low or out
 * between deliveries. Stock below zero is units on backorder.
 */

/** Local hour of the Monday delivery. */
export const RESTOCK_HOUR = 9;

/** Days of history the restock uses to measure velocity. */
export const VELOCITY_DAYS = 14;

/** Share of variant-weeks where the supplier delivers nothing. */
export const MISSED_DELIVERY_RATE = 0.06;

/** Opening stock covers about four weeks of expected sales, give or take. */
export function openingStock(variant: Variant): number {
  const factor = 0.6 + rngFor(SIM_SEED, "opening-stock", variant.id)();
  return Math.ceil(expectedDailyUnits(variant) * 28 * factor) + 4;
}

/** A week of expected sales: below this a variant counts as low. */
export function reorderPoint(variant: Variant): number {
  return Math.ceil(expectedDailyUnits(variant) * 7);
}

/** Weeks of sales the Monday delivery aims to cover; 0 when the supplier misses the week. */
export function restockCover(variantId: number, week: number): number {
  const rng = rngFor(SIM_SEED, "restock", week, variantId);
  if (rng() < MISSED_DELIVERY_RATE) return 0;
  return 1.2 + rng() * 1.8;
}

/** Cover and expected sales for every variant in `week`, for the restock statement. */
export function restockPlan(week: number) {
  return VARIANTS.map((v) => ({
    variant_id: v.id,
    cover: restockCover(v.id, week),
    expected_daily: expectedDailyUnits(v),
  }));
}

/** Monday deliveries in `(fromMs, toMs]` with their week numbers, oldest first. */
export function restocksBetween(fromMs: number, toMs: number): { at: number; week: number }[] {
  const result: { at: number; week: number }[] = [];
  let day = zonedParts(fromMs).dayNumber;
  day -= (weekdayOfDay(day) + 6) % 7; // back to that week's Monday
  for (;;) {
    const [year, month, date] = dayKeyFromNumber(day).split("-").map(Number);
    const at = zonedToUtc({ year, month, day: date, hour: RESTOCK_HOUR });
    if (at > toMs) break;
    if (at > fromMs) result.push({ at, week: weekOfDay(day) });
    day += 7;
  }
  return result;
}
