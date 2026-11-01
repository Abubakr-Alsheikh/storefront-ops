/** What the command palette offers before anything is typed. Kept in this browser only. */

export type RecentKind = "order" | "customer" | "product";

export interface RecentItem {
  kind: RecentKind;
  href: string;
  label: string;
  detail: string;
}

const KEY = "storefront-recent";
const MAX = 5;

/** The list with `item` first, each page at most once. */
export function addRecent(list: readonly RecentItem[], item: RecentItem): RecentItem[] {
  return [item, ...list.filter((other) => other.href !== item.href)].slice(0, MAX);
}

/** Whatever storage holds, this returns a list that is safe to render. */
export function parseRecent(raw: string | null): RecentItem[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (item): item is RecentItem =>
          ["order", "customer", "product"].includes(item?.kind) &&
          typeof item.href === "string" &&
          item.href.startsWith("/") &&
          typeof item.label === "string" &&
          typeof item.detail === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function readRecent(): RecentItem[] {
  try {
    return parseRecent(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function rememberRecent(item: RecentItem) {
  try {
    localStorage.setItem(KEY, JSON.stringify(addRecent(readRecent(), item)));
  } catch {
    // Storage may be refused; the palette then just has no recent items.
  }
}
