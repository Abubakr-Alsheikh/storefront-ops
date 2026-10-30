"use client";

import { useSyncExternalStore } from "react";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/overlays";
import { IconButton } from "@/components/ui/primitives";
import { shellCopy } from "@/lib/data/copy/shell";
import { THEME_CHOICES, getThemeChoice, setThemeChoice, subscribePreferences, type ThemeChoice } from "@/lib/theme";
import { THEME_ICONS } from "./ThemeToggle";

/** Takes the place of the plain button on first click, already open. */
export default function ThemeMenu() {
  const choice = useSyncExternalStore(subscribePreferences, getThemeChoice, () => "system" as const);
  const Icon = THEME_ICONS[choice];
  return (
    <Menu defaultOpen>
      <MenuTrigger asChild>
        <IconButton label={shellCopy.theme}>
          <Icon />
        </IconButton>
      </MenuTrigger>
      <MenuContent aria-label={shellCopy.theme}>
        <MenuRadioGroup value={choice} onValueChange={(value) => setThemeChoice(value as ThemeChoice)}>
          {THEME_CHOICES.map((option) => {
            const OptionIcon = THEME_ICONS[option];
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
