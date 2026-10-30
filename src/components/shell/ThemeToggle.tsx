"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon, SystemIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/primitives";
import { shellCopy } from "@/lib/data/copy/shell";
import { getThemeChoice, subscribePreferences, type ThemeChoice } from "@/lib/theme";

export const THEME_ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon } satisfies Record<ThemeChoice, unknown>;

function ThemeButton({ onClick }: { onClick?: () => void }) {
  const choice = useSyncExternalStore(subscribePreferences, getThemeChoice, () => "system" as const);
  const Icon = THEME_ICONS[choice];
  return (
    <IconButton label={shellCopy.theme} aria-haspopup="menu" onClick={onClick}>
      <Icon />
    </IconButton>
  );
}

const ThemeMenu = dynamic(() => import("./ThemeMenu"), { ssr: false, loading: () => <ThemeButton /> });

/** A plain button until first used, so the menu's code is not part of the first load. */
export function ThemeToggle() {
  const [used, setUsed] = useState(false);
  return used ? <ThemeMenu /> : <ThemeButton onClick={() => setUsed(true)} />;
}
