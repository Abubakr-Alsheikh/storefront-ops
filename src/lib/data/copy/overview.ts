import type { ClientErrorCode } from "@/lib/api/client";
import type { RangeKey } from "@/lib/ranges";

/** Words of the overview (COPY.md §3) and the shared error messages (COPY.md §7). */
export const overviewCopy = {
  rangeName: "Date range",
  rangeOptions: { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days", custom: "Custom" } satisfies Record<RangeKey, string>,
  from: "From",
  to: "To",
  apply: "Apply",
  comparedWith: "compared with",
  kpis: {
    revenue: "Revenue",
    orders: "Orders",
    averageOrder: "Average order value",
    conversion: "Conversion rate",
  },
  vsPrevious: "vs previous period",
  revenue: "Revenue",
  thisPeriod: "This period",
  previousPeriod: "Previous period",
  viewTable: "View as table",
  viewChart: "View as chart",
  hour: "Hour",
  date: "Date",
  orders: "Orders",
  statuses: "Orders by status",
  topProducts: "Top products",
  product: "Product",
  units: "Units",
  countries: "Sales by country",
  country: "Country",
  share: "Share",
  live: "Live orders",
  liveEmpty: "No orders yet today. The first one usually lands within a minute.",
  openOrders: "Open all orders",
  reviewInventory: "Review inventory",
  noData: "No orders in this range.",
  lowStock: (n: number) => `${n} ${n === 1 ? "SKU is" : "SKUs are"} running low`,
  items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
  retry: "Try again",
  waking: "Waking the database. This takes a second after a quiet spell.",
} as const;

export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  network: "You are offline or the server cannot be reached. Your changes were not saved.",
  bad_request: "That change is not allowed.",
  not_found: "That record does not exist. It may be older than 90 days.",
  conflict: "Someone else changed this order a moment ago. The latest version is shown.",
  rate_limited: "Too many changes in a minute. Wait a few seconds and try again.",
  internal: "Something went wrong on our side. Try again; if it keeps happening, reload the page.",
};
