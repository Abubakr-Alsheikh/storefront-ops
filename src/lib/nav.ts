/** The dashboard's pages, in sidebar order. */
export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/inventory", label: "Inventory", icon: "inventory" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function titleForPath(pathname: string): string {
  return NAV_ITEMS.find((item) => isActivePath(item.href, pathname))?.label ?? "";
}
