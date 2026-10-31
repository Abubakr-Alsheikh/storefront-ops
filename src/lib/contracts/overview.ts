import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/data/countries";
import { ORDER_STATUSES } from "@/lib/domain";
import { RANGE_KEYS } from "@/lib/ranges";
import { dayKey, isoInstant } from "./common";

export const overviewQuery = z
  .object({
    range: z.enum(RANGE_KEYS).default("today"),
    from: dayKey.optional(),
    to: dayKey.optional(),
  })
  .refine((q) => q.range !== "custom" || (q.from && q.to), {
    message: "A custom range needs a start and an end date.",
    path: ["from"],
  });
export type OverviewQuery = z.infer<typeof overviewQuery>;

/** A KPI now and in the previous period; previous is null when that period has no data. */
const kpi = z.object({ current: z.number(), previous: z.number().nullable() });

export const seriesPoint = z.object({
  /** Start of the hour or local day. */
  start: isoInstant,
  revenueCents: z.number().int(),
  orders: z.number().int(),
  sessions: z.number().int(),
  /** The matching bucket of the previous period, null past its end. */
  previousRevenueCents: z.number().int().nullable(),
  previousOrders: z.number().int().nullable(),
  previousSessions: z.number().int().nullable(),
});
export type SeriesPoint = z.infer<typeof seriesPoint>;

export const overview = z.object({
  range: z.object({
    key: z.enum(RANGE_KEYS),
    label: z.string(),
    previousLabel: z.string(),
    from: isoInstant,
    to: isoInstant,
    firstDay: dayKey,
    lastDay: dayKey,
    granularity: z.enum(["hour", "day"]),
  }),
  kpis: z.object({
    revenueCents: kpi,
    orders: kpi,
    averageOrderCents: kpi,
    /** Orders ÷ sessions, as a ratio (0.024 = 2.4%). */
    conversionRate: kpi,
  }),
  series: z.array(seriesPoint),
  statuses: z.array(z.object({ status: z.enum(ORDER_STATUSES), orders: z.number().int() })),
  topProducts: z.array(
    z.object({
      productId: z.number().int(),
      name: z.string(),
      imageSlot: z.string(),
      units: z.number().int(),
      revenueCents: z.number().int(),
    }),
  ),
  countries: z.array(
    z.object({
      country: z.enum(COUNTRY_CODES),
      orders: z.number().int(),
      revenueCents: z.number().int(),
      /** Share of the range's revenue, 0-1. */
      share: z.number(),
    }),
  ),
  /** Variants in the "low" stock state: the same count as the inventory's Low stock filter. */
  lowStockVariants: z.number().int(),
  /** Data is complete up to this instant. */
  asOf: isoInstant,
});
export type Overview = z.infer<typeof overview>;
