import { sql } from "drizzle-orm";
import { PRODUCTS, VARIANTS } from "@/lib/data/catalogue";
import { SIM_VERSION } from "@/lib/sim/config";
import { simulateOrders } from "@/lib/sim/orders";
import { daySessionsUntil } from "@/lib/sim/rate";
import { openingStock, reorderPoint } from "@/lib/sim/supply";
import { dayKeyFromNumber, startOfDayNumber, zonedParts } from "@/lib/tz";
import type { Db } from "../db/client";
import { dailyStats, products, simState, variants } from "../db/schema";
import { readSimState } from "./catchUp";
import { materialiseRange } from "./materialise";

/**
 * The seed (DATA.md §4): catalogue, then `days` whole days of orders up to
 * `now` written through the same path as the live catch-up, then daily stats
 * for the `days` before that straight from the simulator, so the longest
 * range on the overview still has a previous period to compare with.
 */

export class AlreadySeededError extends Error {
  constructor() {
    super("The database is already seeded. Pass { force: true } to wipe and reseed.");
    this.name = "AlreadySeededError";
  }
}

export interface SeedOptions {
  now: number;
  /** Whole local days of orders before today. */
  days?: number;
  /** Wipe an existing database first. */
  force?: boolean;
  onProgress?: (message: string) => void;
}

export interface SeedReport {
  from: number;
  to: number;
  orders: number;
  statsOnlyDays: number;
  ms: number;
}

const TABLES = [
  "order_events",
  "order_items",
  "orders",
  "customers",
  "stock_adjustments",
  "restock_runs",
  "variants",
  "products",
  "daily_stats",
  "sim_state",
];

export async function wipe(db: Db): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}

export async function seedCatalogue(db: Db): Promise<void> {
  await db
    .insert(products)
    .values(
      PRODUCTS.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        collection: p.collection,
        type: p.type,
        imageSlot: p.imageSlot,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(variants)
    .values(
      VARIANTS.map((v) => {
        const opening = openingStock(v);
        return {
          id: v.id,
          productId: v.productId,
          sku: v.sku,
          optionLabel: v.optionLabel,
          priceCents: v.priceCents,
          weightGrams: v.weightGrams,
          leadTimeDays: v.leadTimeDays,
          openingStock: opening,
          unitsSold: 0,
          stockOnHand: opening,
          reorderPoint: reorderPoint(v),
        };
      }),
    )
    .onConflictDoNothing();
}

/** Daily stats for local days `[firstDay, endDay)` computed in memory, no order rows. */
export function simulatedDailyStats(firstDay: number, endDay: number) {
  const from = startOfDayNumber(firstDay);
  const to = startOfDayNumber(endDay);
  const byDay = new Map<number, { orders: number; revenue: number; units: number; newCustomers: number; refunds: number }>();
  for (let d = firstDay; d < endDay; d++) {
    byDay.set(d, { orders: 0, revenue: 0, units: 0, newCustomers: 0, refunds: 0 });
  }
  for (const o of simulateOrders(from - 1, to - 1)) {
    const day = byDay.get(zonedParts(o.placedAt).dayNumber);
    if (day) {
      day.orders++;
      day.revenue += o.totalCents;
      day.units += o.itemCount;
      if (!o.isReturning) day.newCustomers++;
    }
    if (o.plan.refundedAt !== null && o.plan.refundedAt < to) {
      const refundDay = byDay.get(zonedParts(o.plan.refundedAt).dayNumber);
      if (refundDay) refundDay.refunds += o.totalCents;
    }
  }
  return [...byDay].map(([d, s]) => ({
    day: dayKeyFromNumber(d),
    orders: s.orders,
    revenueCents: s.revenue,
    units: s.units,
    newCustomers: s.newCustomers,
    refundsCents: s.refunds,
    sessions: daySessionsUntil(d, startOfDayNumber(d + 1)),
  }));
}

export async function seedDatabase(db: Db, options: SeedOptions): Promise<SeedReport> {
  const started = performance.now();
  const { now, days = 90, force = false } = options;
  const log = options.onProgress ?? (() => {});

  if (await readSimState(db)) {
    if (!force) throw new AlreadySeededError();
    log("Wiping the existing data");
    await wipe(db);
  }

  log("Writing the catalogue");
  await seedCatalogue(db);

  const today = zonedParts(now).dayNumber;
  const firstOrderDay = today - days;
  const from = startOfDayNumber(firstOrderDay);

  // Mark the state first: a catch-up that starts mid-seed then fails fast
  // on the version check instead of finding no state.
  await db
    .insert(simState)
    .values({ id: 1, simVersion: SIM_VERSION, materialisedUntil: new Date(from) })
    .onConflictDoNothing();

  log(`Writing ${days} days of daily stats from the simulator`);
  const history = simulatedDailyStats(firstOrderDay - days, firstOrderDay);
  for (let i = 0; i < history.length; i += 100) {
    await db.insert(dailyStats).values(history.slice(i, i + 100)).onConflictDoNothing();
  }

  log(`Writing orders from ${new Date(from).toISOString()} to ${new Date(now).toISOString()}`);
  let orders = 0;
  // Day by day, so progress shows and the high-water mark moves as it goes.
  for (let d = firstOrderDay; d <= today; d++) {
    const dayFrom = Math.max(from, startOfDayNumber(d));
    const dayTo = Math.min(now, startOfDayNumber(d + 1));
    if (dayFrom >= dayTo) continue;
    orders += await materialiseRange(db, dayFrom, dayTo, now);
    await db
      .update(simState)
      .set({ materialisedUntil: new Date(dayTo) })
      .where(sql`${simState.id} = 1`);
    log(`  ${dayKeyFromNumber(d)}: ${orders.toLocaleString("en-GB")} orders so far`);
  }

  return { from, to: now, orders, statsOnlyDays: history.length, ms: performance.now() - started };
}
