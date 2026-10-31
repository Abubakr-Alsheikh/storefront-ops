import type { RangeKey } from "@/lib/ranges";

/** Rows in the overview's live list, the one held back below the clip included. */
export const LIVE_LIST_SIZE = 7;

export interface RangeSelection {
  range: RangeKey;
  from?: string;
  to?: string;
}

/** Every query key in one place, so updates and invalidations cannot drift. */
export const queryKeys = {
  overviewAll: ["overview"] as const,
  overview: (selection: RangeSelection) => ["overview", selection] as const,
  orders: {
    all: ["orders"] as const,
    latest: (limit: number) => ["orders", "latest", limit] as const,
    page: (filters: unknown, upTo: number | undefined, pageIndex: number) =>
      ["orders", "page", filters, upTo ?? null, pageIndex] as const,
    grandTotal: ["orders", "grand-total"] as const,
    detail: (number: number) => ["orders", "detail", number] as const,
  },
};
