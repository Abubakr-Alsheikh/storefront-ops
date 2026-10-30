"use client";

import { Command } from "cmdk";
import { Dialog as RadixDialog } from "radix-ui";
import type { RefObject } from "react";
import { NAV_ICONS, SearchIcon } from "@/components/ui/icons";
import { shellCopy } from "@/lib/data/copy/shell";
import { NAV_ITEMS } from "@/lib/nav";

const ITEM =
  "flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-base text-ink data-[selected=true]:bg-surface-2";

export interface PaletteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
  /** Opened from the keyboard there is no trigger, so focus returns by hand. */
  returnFocus: RefObject<Element | null>;
}

/** The palette lists Pages for now; orders, customers and products join in M11. */
export default function PaletteDialog({ open, onOpenChange, onNavigate, returnFocus }: PaletteDialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
          }}
          className="fixed top-[20vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-160 -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface text-ink shadow-float"
        >
          <RadixDialog.Title className="sr-only">{shellCopy.search}</RadixDialog.Title>
          <Command label={shellCopy.search}>
            <div className="flex h-12 items-center gap-2 border-b border-line px-3">
              <SearchIcon className="shrink-0 text-ink-muted" />
              <Command.Input
                placeholder={shellCopy.search}
                className="h-full w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-2 py-3 text-base text-ink-muted">{shellCopy.noPages}</Command.Empty>
              <Command.Group
                heading={shellCopy.pagesGroup}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-muted"
              >
                {NAV_ITEMS.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      className={ITEM}
                      onSelect={() => {
                        onNavigate(item.href);
                      }}
                    >
                      <Icon className="text-ink-muted" />
                      {item.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
