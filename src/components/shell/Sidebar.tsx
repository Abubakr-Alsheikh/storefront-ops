"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import { NAV_ICONS, MenuIcon, RailIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/primitives";
import { cx } from "@/lib/cx";
import { shellCopy } from "@/lib/data/copy/shell";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";
import { site } from "@/lib/site";
import { isSidebarCollapsed, setSidebarCollapsed, subscribePreferences } from "@/lib/theme";

const LINK = "relative flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-[120ms]";

function NavLink({ item, active, onNavigate, rail }: { item: (typeof NAV_ITEMS)[number]; active: boolean; onNavigate?: () => void; rail: boolean }) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={rail ? item.label : undefined}
      onClick={onNavigate}
      className={cx(
        LINK,
        rail && "lg:rail:justify-center",
        active ? "bg-surface-2 font-medium text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-1.5 -left-2 w-0.5 rounded-r bg-accent" /> : null}
      <Icon className="shrink-0" />
      <span className={cx(rail && "lg:rail:sr-only")}>{item.label}</span>
    </Link>
  );
}

function ActiveNav({ onNavigate, rail }: { onNavigate?: () => void; rail: boolean }) {
  const pathname = usePathname();
  return NAV_ITEMS.map((item) => (
    <li key={item.href}>
      <NavLink item={item} active={isActivePath(item.href, pathname)} onNavigate={onNavigate} rail={rail} />
    </li>
  ));
}

/** Deep links with an unknown param suspend usePathname; the links still work meanwhile. */
function NavFallback({ rail }: { rail: boolean }) {
  return NAV_ITEMS.map((item) => (
    <li key={item.href}>
      <NavLink item={item} active={false} rail={rail} />
    </li>
  ));
}

export function SidebarBody({ onNavigate, rail }: { onNavigate?: () => void; rail: boolean }) {
  const hideInRail = rail && "lg:rail:hidden";
  return (
    <>
      <div className={cx("flex h-14 shrink-0 flex-col justify-center border-b border-line px-4", rail && "lg:rail:px-0 lg:rail:items-center")}>
        <span className={cx("text-sm font-semibold text-ink", hideInRail)}>{site.name}</span>
        <span className={cx("text-xs text-ink-muted", hideInRail)}>{site.store.name}</span>
        {/* The rail keeps one mark, in the same type as the product name. */}
        <span aria-hidden="true" className={cx("hidden text-sm font-semibold text-ink", rail && "lg:rail:block")}>SO</span>
      </div>

      <nav aria-label={shellCopy.primaryNav} className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          <Suspense fallback={<NavFallback rail={rail} />}>
            <ActiveNav onNavigate={onNavigate} rail={rail} />
          </Suspense>
        </ul>
      </nav>

      <div className={cx("flex items-center gap-2 border-t border-line px-4 py-3", rail && "lg:rail:justify-center lg:rail:px-0")}>
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded bg-accent-tint text-2xs font-medium text-accent"
        >
          {shellCopy.user.initials}
        </span>
        <span className={cx("min-w-0", rail && "lg:rail:sr-only")}>
          <span className="block truncate text-sm font-medium text-ink">{shellCopy.user.name}</span>
          <span className="block truncate text-xs text-ink-muted">{shellCopy.user.role}</span>
        </span>
      </div>

      <div className={cx("border-t border-line px-4 py-3 text-xs text-ink-muted", hideInRail)}>
        <p className="font-medium text-ink">{shellCopy.footer.concept}</p>
        <p className="mt-1">
          <a href={site.author.url} className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-ink">{shellCopy.footer.builtBy}</a>
        </p>
        <p>
          <a href={site.repo} className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-ink">{shellCopy.footer.source}</a>
        </p>
        <p className="mt-1">{shellCopy.footer.note}</p>
      </div>
    </>
  );
}

/** The fixed sidebar from `lg`: 232 px, or a 56 px icon rail. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-58 shrink-0 flex-col border-r border-line bg-surface lg:flex lg:rail:w-14">
      <SidebarBody rail />
    </aside>
  );
}

export function RailToggle() {
  const collapsed = useSyncExternalStore(subscribePreferences, isSidebarCollapsed, () => false);
  const label = collapsed ? shellCopy.expandNav : shellCopy.collapseNav;
  return (
    <IconButton
      label={label}
      aria-pressed={collapsed}
      onClick={() => setSidebarCollapsed(!collapsed)}
      className="max-lg:hidden"
    >
      <RailIcon />
    </IconButton>
  );
}

const NavDrawerSheet = dynamic(() => import("./NavDrawerSheet"), {
  ssr: false,
  loading: () => <NavButton />,
});

function NavButton({ onClick }: { onClick?: () => void }) {
  return (
    <IconButton label={shellCopy.openNav} aria-haspopup="dialog" onClick={onClick} className="lg:hidden">
      <MenuIcon />
    </IconButton>
  );
}

/** Below `lg` the same navigation opens as a drawer, loaded on first use. */
export function NavDrawer() {
  const [used, setUsed] = useState(false);
  return used ? <NavDrawerSheet /> : <NavButton onClick={() => setUsed(true)} />;
}
