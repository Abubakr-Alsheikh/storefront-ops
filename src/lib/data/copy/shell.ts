import type { OrderStatus } from "@/lib/domain";
import { site } from "@/lib/site";

/** Words of the app shell (COPY.md §1-2). */
export const shellCopy = {
  user: { name: "Inês Duarte", role: "Operations", initials: "ID" },
  skipLink: "Skip to content",
  search: "Search or jump to…",
  searchShort: "Search",
  noPages: "No pages match.",
  pagesGroup: "Pages",
  theme: "Theme",
  themes: { light: "Light", dark: "Dark", system: "System" },
  primaryNav: "Primary",
  openNav: "Open navigation",
  closeNav: "Close navigation",
  collapseNav: "Collapse sidebar",
  expandNav: "Expand sidebar",
  close: "Close",
  footer: {
    concept: site.concept,
    builtBy: `Built by ${site.author.name}`,
    source: "Source on GitHub",
    note: `${site.store.name} is fictional. Data resets nightly.`,
  },
} as const;

export const LIVE_STATES = {
  connecting: { label: "Connecting", detail: "Opening the live order feed." },
  live: { label: "Live", detail: "New orders appear as they are placed." },
  reconnecting: { label: "Reconnecting", detail: "The feed dropped. Trying again." },
  polling: { label: "Live (polling)", detail: "Streaming is unavailable, checking every 10 seconds." },
  paused: { label: "Paused", detail: "This tab is in the background. The feed resumes when you return." },
} as const;
export type LiveState = keyof typeof LIVE_STATES;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Placeholders until each screen lands; every one of these goes away by M10. */
export const stubCopy = {
  title: "This screen is next in the build.",
  overview: "KPIs, the revenue chart and the live feed land here.",
  orders: "The full order history, with filters and search, lands here.",
  order: "Line items, totals and the status timeline land here.",
  inventory: "Stock on hand, days of cover and restocking land here.",
  customers: "Customers, segments and lifetime value land here.",
  customer: "This customer's profile and order history land here.",
  settings: "Theme, table density and the demo reset explainer land here.",
} as const;
