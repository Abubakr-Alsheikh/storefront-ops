"use client";

import { useSyncExternalStore } from "react";
import { FilterChips } from "@/components/ui/FilterChips";
import { ordersCopy } from "@/lib/data/copy/orders";
import { settingsCopy } from "@/lib/data/copy/settings";
import { shellCopy } from "@/lib/data/copy/shell";
import { DENSITIES, THEME_CHOICES, getDensity, getThemeChoice, setDensity, setThemeChoice, subscribePreferences } from "@/lib/theme";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  );
}

export function Preferences() {
  const theme = useSyncExternalStore(subscribePreferences, getThemeChoice, () => "system" as const);
  const density = useSyncExternalStore(subscribePreferences, getDensity, () => "comfortable" as const);
  return (
    <div className="flex flex-col gap-3">
      <Field label={shellCopy.theme}>
        <FilterChips
          name={shellCopy.theme}
          value={theme}
          onChange={setThemeChoice}
          options={THEME_CHOICES.map((value) => ({ value, label: shellCopy.themes[value] }))}
        />
      </Field>
      <Field label={settingsCopy.density}>
        <FilterChips
          name={settingsCopy.density}
          value={density}
          onChange={setDensity}
          options={DENSITIES.map((value) => ({ value, label: ordersCopy.density[value] }))}
        />
      </Field>
    </div>
  );
}
