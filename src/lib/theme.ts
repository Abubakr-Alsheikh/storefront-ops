/**
 * Theme and sidebar preferences. Both live in localStorage and are applied
 * as attributes on <html> by an inline script before first paint, so a
 * returning visitor never sees a flash of the wrong state.
 */

export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

const THEME_KEY = "storefront-theme";
const SIDEBAR_KEY = "storefront-sidebar";

/** Runs in <head> before the page paints. Keep it small and dependency-free. */
export const PREFERENCES_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("${SIDEBAR_KEY}")==="collapsed")d.dataset.sidebar="collapsed"}catch(e){}})()`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the choice still applies to this page.
  }
}

export function getThemeChoice(): ThemeChoice {
  const stored = read(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function setThemeChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  write(THEME_KEY, choice === "system" ? null : choice);
  notify();
}

export function isSidebarCollapsed(): boolean {
  return document.documentElement.dataset.sidebar === "collapsed";
}

export function setSidebarCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  write(SIDEBAR_KEY, collapsed ? "collapsed" : null);
  notify();
}

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

const DENSITY_KEY = "storefront-density";

export function getDensity(): Density {
  return read(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function setDensity(density: Density) {
  write(DENSITY_KEY, density === "compact" ? density : null);
  notify();
}

const HIDDEN_COLUMNS_KEY = "storefront-hidden-columns";
let hiddenColumnsRaw: string | null = null;
let hiddenColumns: readonly string[] = [];

/** Stable while storage is unchanged, as useSyncExternalStore needs. */
export function getHiddenColumns(): readonly string[] {
  const raw = read(HIDDEN_COLUMNS_KEY);
  if (raw !== hiddenColumnsRaw) {
    hiddenColumnsRaw = raw;
    hiddenColumns = raw ? raw.split(",") : [];
  }
  return hiddenColumns;
}

export function setHiddenColumns(columns: readonly string[]) {
  write(HIDDEN_COLUMNS_KEY, columns.length ? columns.join(",") : null);
  notify();
}
