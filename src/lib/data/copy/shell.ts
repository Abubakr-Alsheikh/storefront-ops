import type { OrderStatus } from "@/lib/domain";
import { site } from "@/lib/site";

/** Words of the app shell (COPY.md §1-2). */
export const shellCopy = {
  user: { name: "Inês Duarte", role: "Operations", initials: "ID" },
  skipLink: "Skip to content",
  search: "Search or jump to…",
  searchShort: "Search",
  pagesGroup: "Pages",
  recentGroup: "Recent",
  ordersGroup: "Orders",
  customersGroup: "Customers",
  productsGroup: "Products",
  searching: "Searching…",
  noResults: (q: string) => `Nothing matches “${q}”.`,
  shortcutsTitle: "Keyboard shortcuts",
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

/** What a screen reader hears from the feed; empty when nothing changed. */
export function liveAnnouncement(state: LiveState | null, orders: number): string {
  const parts: string[] = state ? [LIVE_STATES[state].detail] : [];
  if (orders) parts.push(`${orders} new ${orders === 1 ? "order" : "orders"} in the last 30 seconds.`);
  return parts.join(" ");
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const notFoundCopy = {
  title: "This page does not exist.",
  help: "The link may be old, or the address mistyped.",
  back: "Back to overview",
};

export const SHORTCUTS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ["Ctrl", "K"], action: "Search or jump to a page" },
  { keys: ["/"], action: "Search this list" },
  { keys: ["↑", "↓"], action: "Move through a table" },
  { keys: ["Enter"], action: "Open the highlighted row" },
  { keys: ["Space"], action: "Select the highlighted order" },
  { keys: ["Esc"], action: "Close a dialog or clear the selection" },
  { keys: ["?"], action: "Show these shortcuts" },
];
