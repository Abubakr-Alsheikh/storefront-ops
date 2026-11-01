import { Kbd } from "@/components/ui/primitives";
import { SHORTCUTS } from "@/lib/data/copy/shell";

/** Every keyboard shortcut in the app; the `?` sheet and Settings both show this. */
export function ShortcutList() {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {SHORTCUTS.map(({ keys, action }) => (
        <div key={action} className="flex items-center justify-between gap-4">
          <dt className="min-w-0 text-ink-muted">{action}</dt>
          <dd className="flex shrink-0 gap-1">
            {keys.map((key) => <Kbd key={key}>{key}</Kbd>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
