import { z } from "zod";

/**
 * Building blocks for the API contracts. Query strings arrive as strings, so
 * these parse them: empty values count as absent, lists are comma-separated.
 */

export const ERROR_CODES = [
  "bad_request",
  "not_found",
  "conflict",
  "rate_limited",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorBody = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});
export type ErrorBody = z.infer<typeof errorBody>;

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** An optional whole number from a query string. */
export function queryInt(min: number, max = Number.MAX_SAFE_INTEGER) {
  return z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());
}

/** An optional `a,b,c` list of allowed values from a query string. */
export function queryList<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (value) => {
      const v = blankToUndefined(value);
      if (v === undefined) return undefined;
      const parts = (Array.isArray(v) ? v : String(v).split(",")).map((p) => String(p).trim());
      return [...new Set(parts.filter(Boolean))];
    },
    z.array(z.enum(values)).min(1).optional(),
  );
}

/** An optional trimmed search string. */
export const querySearch = z.preprocess(
  (value) => {
    const v = blankToUndefined(value);
    return typeof v === "string" ? v.trim() : v;
  },
  z.string().max(100).optional(),
);

/** A local calendar date in the store's time zone. */
export const dayKey = z.iso.date();

/** An instant, as an ISO 8601 string in UTC. */
export const isoInstant = z.iso.datetime();

export const sortDir = z.enum(["asc", "desc"]);
export type SortDir = z.infer<typeof sortDir>;

/** A path id such as an order number. */
export const positiveIntParam = z.coerce.number().int().positive().max(2_147_483_647);
