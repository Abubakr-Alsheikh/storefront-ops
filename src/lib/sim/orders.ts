import { VARIANTS, productById, type ProductTypeKey, type Variant } from "@/lib/data/catalogue";
import { COUNTRIES, SHIPPING_ZONES, type CountryCode } from "@/lib/data/countries";
import type { PaymentMethod } from "@/lib/domain";
import { zonedParts } from "@/lib/tz";
import {
  CUSTOMER_EPOCH_HOUR,
  HOUR_MS,
  MAX_ORDERS_PER_HOUR,
  SIM_SEED,
} from "./config";
import { customerById, firstOrderHour, newCustomerId, type SimCustomer } from "./customers";
import { planLifecycle, type LifecyclePlan } from "./lifecycle";
import { poisson, randInt, rngFor, weightedPicker, type Rng } from "./prng";
import { BASE_DAILY_ORDERS, hourRate, isSaleDay } from "./rate";

/**
 * The order simulator. Every order, past or live, comes from here.
 *
 * Each UTC hour has two seeded streams. The hour stream decides how many
 * orders arrive, when, and which are from returning customers. Each order
 * then has its own stream for everything else. Splitting them lets a
 * returning customer be drawn from an earlier hour's new customers by
 * replaying only that hour's cheap header.
 */

export interface SimLineItem {
  variantId: number;
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface SimOrder {
  /** `${hour}:${index}`, the idempotency key for every insert. */
  simKey: string;
  placedAt: number;
  customer: SimCustomer;
  /** False when this is the customer's first order. */
  isReturning: boolean;
  country: CountryCode;
  paymentMethod: PaymentMethod;
  items: SimLineItem[];
  /** Units across all lines. */
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  shippingCents: number;
  /** VAT included in the total, at the destination country's rate. */
  taxCents: number;
  totalCents: number;
  plan: LifecyclePlan;
}

/** Share of orders placed by someone who has ordered before. */
export const RETURNING_SHARE = 0.32;

/** How far back a returning customer's first order can be. */
const MAX_LOOKBACK_HOURS = 120 * 24;

/** Orders during a sale mostly carry the sale code. */
const SALE_CODE = { code: "TIDE15", rate: 0.15, uptake: 0.85 };
/** Some first orders use the newsletter welcome code. */
const WELCOME_CODE = { code: "WELCOME10", rate: 0.1, uptake: 0.09 };

/** Stools and side tables ship as bulky parcels. */
const BULKY_TYPES = new Set<ProductTypeKey>(["stool", "side-table"]);
const BULKY_SURCHARGE_CENTS = 1500;

// ---------------------------------------------------------------------------
// Hour headers

interface HourPlan {
  /** Arrival offsets inside the hour in ms, ascending. */
  offsets: number[];
  returning: boolean[];
  /** Index among the hour's new customers, or -1 for a returning order. */
  newIndex: number[];
  newCount: number;
}

const hourCache = new Map<number, HourPlan>();
const HOUR_CACHE_LIMIT = 20_000;

function planHour(hour: number): HourPlan {
  const cached = hourCache.get(hour);
  if (cached) return cached;

  const rng = rngFor(SIM_SEED, "hour", hour);
  const count = Math.min(poisson(rng, hourRate(hour)), MAX_ORDERS_PER_HOUR);
  const offsets = Array.from({ length: count }, () => Math.floor(rng() * HOUR_MS));
  offsets.sort((a, b) => a - b);

  const canReturn = hour > CUSTOMER_EPOCH_HOUR;
  const returning: boolean[] = [];
  const newIndex: number[] = [];
  let newCount = 0;
  for (let i = 0; i < count; i++) {
    const isReturning = rng() < RETURNING_SHARE && canReturn;
    returning.push(isReturning);
    newIndex.push(isReturning ? -1 : newCount++);
  }

  const plan = { offsets, returning, newIndex, newCount };
  if (hourCache.size >= HOUR_CACHE_LIMIT) hourCache.clear();
  hourCache.set(hour, plan);
  return plan;
}

/** Number of orders placed in UTC hour `hour`. */
export function ordersInHour(hour: number): number {
  return planHour(hour).offsets.length;
}

/**
 * A returning customer: someone who placed a first order in an earlier hour,
 * most often within the last two weeks.
 */
function pickReturningCustomer(rng: Rng, hour: number): number {
  const maxBack = Math.min(MAX_LOOKBACK_HOURS, hour - CUSTOMER_EPOCH_HOUR);
  for (let attempt = 0; attempt < 6; attempt++) {
    const back =
      rng() < 0.55
        ? Math.ceil(-Math.log(1 - rng()) * 240) // recent: mean 10 days
        : randInt(rng, 1, MAX_LOOKBACK_HOURS); // anyone in the last 120 days
    if (back > maxBack) continue;
    const source = planHour(hour - back);
    if (source.newCount > 0) {
      return newCustomerId(hour - back, Math.floor(rng() * source.newCount));
    }
  }
  // Quiet hours have no new customers; walk back to the nearest one that does.
  for (let back = 1; back <= maxBack; back++) {
    const source = planHour(hour - back);
    if (source.newCount > 0) return newCustomerId(hour - back, 0);
  }
  return newCustomerId(hour - 1, 0);
}

// ---------------------------------------------------------------------------
// Order details

const pickVariant = weightedPicker(VARIANTS, VARIANTS.map((v) => v.popularity));

const LINE_COUNTS = [1, 2, 3, 4, 5];
const LINE_WEIGHTS = [62, 24, 9, 3, 2];
const pickLineCount = weightedPicker(LINE_COUNTS, LINE_WEIGHTS);

type QuantityProfile = "single" | "set" | "pair" | "default";
const QUANTITY_MIX: Record<QuantityProfile, readonly [number[], number[]]> = {
  single: [[1], [1]],
  set: [[1, 2, 4, 6], [52, 22, 21, 5]],
  pair: [[1, 2, 4], [64, 28, 8]],
  default: [[1, 2, 3], [88, 10, 2]],
};
const QUANTITY_PICKERS: Record<QuantityProfile, (rng: Rng) => number> = {
  // A single never draws, so it leaves the order's stream untouched.
  single: () => 1,
  set: weightedPicker(...QUANTITY_MIX.set),
  pair: weightedPicker(...QUANTITY_MIX.pair),
  default: weightedPicker(...QUANTITY_MIX.default),
};

function weightedMean(values: readonly number[], weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / total;
}
const QUANTITY_PROFILE: Partial<Record<ProductTypeKey, QuantityProfile>> = {
  "dinner-plate": "set",
  "side-plate": "set",
  "cereal-bowl": "set",
  "pasta-bowl": "set",
  mug: "pair",
  "espresso-cups": "pair",
  "pillar-candle": "pair",
  "taper-candles": "pair",
  stool: "pair",
  "side-table": "single",
  throw: "single",
  tablecloth: "single",
  "serving-platter": "single",
};

type PaymentMix = readonly [PaymentMethod, number][];
const PAYMENT_MIX: Record<CountryCode | "default", PaymentMix> = {
  PT: [["card", 34], ["mbway", 36], ["paypal", 14], ["apple_pay", 16]],
  DE: [["card", 30], ["paypal", 34], ["klarna", 22], ["apple_pay", 14]],
  AT: [["card", 30], ["paypal", 34], ["klarna", 22], ["apple_pay", 14]],
  NL: [["card", 38], ["paypal", 20], ["klarna", 24], ["apple_pay", 18]],
  BE: [["card", 38], ["paypal", 20], ["klarna", 24], ["apple_pay", 18]],
  SE: [["card", 40], ["klarna", 34], ["apple_pay", 18], ["paypal", 8]],
  DK: [["card", 40], ["klarna", 34], ["apple_pay", 18], ["paypal", 8]],
  ES: [["card", 50], ["paypal", 26], ["apple_pay", 18], ["klarna", 6]],
  FR: [["card", 50], ["paypal", 26], ["apple_pay", 18], ["klarna", 6]],
  IT: [["card", 50], ["paypal", 26], ["apple_pay", 18], ["klarna", 6]],
  IE: [["card", 50], ["paypal", 26], ["apple_pay", 18], ["klarna", 6]],
  PL: [["card", 50], ["paypal", 26], ["apple_pay", 18], ["klarna", 6]],
  default: [["card", 50], ["paypal", 26], ["apple_pay", 18], ["klarna", 6]],
};
const paymentPickers = Object.fromEntries(
  Object.entries(PAYMENT_MIX).map(([country, mix]) => [
    country,
    weightedPicker(
      mix.map(([method]) => method),
      mix.map(([, weight]) => weight),
    ),
  ]),
) as Record<CountryCode | "default", (rng: Rng) => PaymentMethod>;

function typeOf(variant: Variant): ProductTypeKey {
  const product = productById(variant.productId);
  if (!product) throw new Error(`Variant ${variant.sku} has no product`);
  return product.type;
}

function pickItems(rng: Rng): { items: SimLineItem[]; bulkyUnits: number } {
  const lines = pickLineCount(rng);
  const chosen = new Map<number, SimLineItem>();
  let bulkyUnits = 0;
  for (let line = 0; line < lines; line++) {
    let variant = pickVariant(rng);
    // One retry keeps most baskets free of repeats without looping.
    if (chosen.has(variant.id)) variant = pickVariant(rng);
    if (chosen.has(variant.id)) continue;
    const type = typeOf(variant);
    const quantity = QUANTITY_PICKERS[QUANTITY_PROFILE[type] ?? "default"](rng);
    if (BULKY_TYPES.has(type)) bulkyUnits += quantity;
    chosen.set(variant.id, {
      variantId: variant.id,
      sku: variant.sku,
      quantity,
      unitPriceCents: variant.priceCents,
    });
  }
  return { items: [...chosen.values()], bulkyUnits };
}

const totalPopularity = VARIANTS.reduce((sum, v) => sum + v.popularity, 0);
const meanLines = weightedMean(LINE_COUNTS, LINE_WEIGHTS);

/**
 * Units of a variant the shop expects to sell on an average day, from the
 * popularity weights alone. Sizes the opening stock before any history exists.
 */
export function expectedDailyUnits(variant: Variant): number {
  const [values, weights] = QUANTITY_MIX[QUANTITY_PROFILE[typeOf(variant)] ?? "default"];
  return (
    BASE_DAILY_ORDERS *
    meanLines *
    (variant.popularity / totalPopularity) *
    weightedMean(values, weights)
  );
}

/** When customer `id` placed their first order: the moment they became a customer. */
export function firstOrderAt(customerId: number): number {
  const hour = firstOrderHour(customerId);
  const header = planHour(hour);
  const index = header.newIndex.indexOf(customerId - newCustomerId(hour, 0));
  // An id past the hour's last new customer never ordered; use the hour itself.
  return hour * HOUR_MS + (index >= 0 ? header.offsets[index] : 0);
}

function buildOrder(hour: number, index: number, header: HourPlan): SimOrder {
  const rng = rngFor(SIM_SEED, "order", hour, index);
  const placedAt = hour * HOUR_MS + header.offsets[index];
  const isReturning = header.returning[index];
  const customer = customerById(
    isReturning ? pickReturningCustomer(rng, hour) : newCustomerId(hour, header.newIndex[index]),
  );
  const country = customer.country;
  const paymentMethod = (paymentPickers[country] ?? paymentPickers.default)(rng);

  const { items, bulkyUnits } = pickItems(rng);
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const offer = isSaleDay(zonedParts(placedAt).dayNumber)
    ? rng() < SALE_CODE.uptake
      ? SALE_CODE
      : null
    : !isReturning && rng() < WELCOME_CODE.uptake
      ? WELCOME_CODE
      : null;
  const discountCents = offer ? Math.round(subtotalCents * offer.rate) : 0;

  const zone = COUNTRIES[country].zone;
  const rule = SHIPPING_ZONES[zone];
  const goodsCents = subtotalCents - discountCents;
  const shippingCents =
    (goodsCents >= rule.freeFromCents ? 0 : rule.shippingCents) +
    bulkyUnits * BULKY_SURCHARGE_CENTS;

  const totalCents = goodsCents + shippingCents;
  const vat = COUNTRIES[country].vatRate;
  const taxCents = Math.round((totalCents * vat) / (1 + vat));

  return {
    simKey: `${hour}:${index}`,
    placedAt,
    customer,
    isReturning,
    country,
    paymentMethod,
    items,
    itemCount,
    subtotalCents,
    discountCents,
    discountCode: offer?.code ?? null,
    shippingCents,
    taxCents,
    totalCents,
    plan: planLifecycle(rng, placedAt, zone),
  };
}

/**
 * Every order placed in the window `(fromMs, toMs]`, sorted by `placedAt`
 * (ties keep their in-hour index). Back-to-back windows never overlap or
 * leave a gap: `(a, b]` plus `(b, c]` equals `(a, c]`.
 */
export function simulateOrders(fromMs: number, toMs: number): SimOrder[] {
  const orders: SimOrder[] = [];
  if (!(toMs > fromMs)) return orders;
  const firstHour = Math.floor(fromMs / HOUR_MS);
  const lastHour = Math.floor(toMs / HOUR_MS);
  for (let hour = firstHour; hour <= lastHour; hour++) {
    const header = planHour(hour);
    const start = hour * HOUR_MS;
    for (let i = 0; i < header.offsets.length; i++) {
      const placedAt = start + header.offsets[i];
      if (placedAt <= fromMs) continue;
      if (placedAt > toMs) break;
      orders.push(buildOrder(hour, i, header));
    }
  }
  return orders;
}

