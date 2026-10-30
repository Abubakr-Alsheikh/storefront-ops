import type { RangeKey } from "@/lib/ranges";

export interface RangeSelection {
  range: RangeKey;
  from?: string;
  to?: string;
}

/** Every query key in one place, so updates and invalidations cannot drift. */
export const queryKeys = {
  overview: (selection: RangeSelection) => ["overview", selection] as const,
  orders: {
    all: ["orders"] as const,
    latest: (limit: number) => ["orders", "latest", limit] as const,
  },
};
