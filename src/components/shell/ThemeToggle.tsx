"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon, SystemIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/overlays";
import { IconButton } from "@/components/ui/primitives";
import { shellCopy } from "@/lib/data/copy/shell";
import {
  THEME_CHOICES,
  getThemeChoice,
  setThemeChoice,
  subscribePreferences,
  type ThemeChoice,
} from "@/lib/theme";

const ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon } satisfies Record<ThemeChoice, unknown>;

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribePreferences, getThemeChoice, () => "system" as const);
  const Icon = ICONS[choice];
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={shellCopy.theme}>
          <Icon />
        </IconButton>
      </MenuTrigger>
      <MenuContent aria-label={shellCopy.theme}>
        <MenuRadioGroup value={choice} onValueChange={(value) => setThemeChoice(value as ThemeChoice)}>
          {THEME_CHOICES.map((option) => {
            const OptionIcon = ICONS[option];
            return (
              <MenuRadioItem key={option} value={option}>
                <OptionIcon className="text-ink-muted" />
                {shellCopy.themes[option]}
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
