import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Preferences } from "@/components/settings/Preferences";
import { ShortcutList } from "@/components/shell/ShortcutList";
import { settingsCopy } from "@/lib/data/copy/settings";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-md border border-line bg-surface p-4 xl:p-5">
      <h2 id={id} className="mb-3 text-lg font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-sm text-ink">{label}</dt>
      <dd className="text-right text-sm text-ink-muted">{value}</dd>
      {help ? <dd className="mt-0.5 w-full text-xs text-ink-muted">{help}</dd> : null}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Section id="settings-appearance" title={settingsCopy.appearance}>
        <Preferences />
      </Section>
      <Section id="settings-store" title={settingsCopy.store}>
        <dl className="flex flex-col gap-3">
          <Fact label={settingsCopy.storeName} value={site.store.name} />
          <Fact label={settingsCopy.timeZone} value={site.store.timeZone} help={settingsCopy.timeZoneHelp} />
          <Fact label={settingsCopy.currency} value={site.store.currency} />
        </dl>
      </Section>
      <Section id="settings-demo" title={settingsCopy.demo}>
        <p className="max-w-[60ch] text-sm text-ink-muted">{settingsCopy.demoBody}</p>
      </Section>
      <Section id="settings-shortcuts" title={settingsCopy.shortcuts}>
        <ShortcutList />
      </Section>
    </div>
  );
}
