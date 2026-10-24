/**
 * Stock maths shared by the inventory API and the UI: sales velocity, days
 * of cover and the state badge.
 */

export const STOCK_STATES = ["in_stock", "low", "out"] as const;
export type StockState = (typeof STOCK_STATES)[number];

/** Velocity looks back this many days. */
export const VELOCITY_WINDOW_DAYS = 14;

/** Under this many days of cover a variant is running low. */
export const LOW_COVER_DAYS = 7;

/** Average units sold per day over the window. */
export function velocityPerDay(unitsInWindow: number, windowDays = VELOCITY_WINDOW_DAYS): number {
  return unitsInWindow / windowDays;
}

/** Days until stock runs out at the current pace; null when nothing sells. */
export function daysOfCover(onHand: number, perDay: number): number | null {
  if (onHand <= 0) return 0;
  if (perDay <= 0) return null;
  return onHand / perDay;
}

/**
 * Out when nothing is on the shelf (negative stock is units on backorder),
 * low when cover drops under a week, in stock otherwise.
 */
export function stockState(onHand: number, perDay: number): StockState {
  if (onHand <= 0) return "out";
  const cover = daysOfCover(onHand, perDay);
  return cover !== null && cover < LOW_COVER_DAYS ? "low" : "in_stock";
}
