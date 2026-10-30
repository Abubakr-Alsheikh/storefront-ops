"use client";

import { Dialog as RadixDialog, DropdownMenu as RadixMenu, Popover as RadixPopover, Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { shellCopy } from "@/lib/data/copy/shell";
import { cx } from "@/lib/cx";
import { CheckIcon, CloseIcon } from "./icons";
import { IconButton } from "./primitives";

/**
 * Radix behaviour (focus trap, escape, typeahead, portals) restyled to the
 * tokens. Only floating layers get the one allowed shadow.
 */

const FLOATING = "rounded-md border border-line bg-surface text-ink shadow-float";
const BACKDROP = "fixed inset-0 z-40 bg-scrim";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({ className, align = "start", sideOffset = 4, ...props }: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        className={cx(FLOATING, "z-50 p-3 text-sm", className)}
        {...props}
      />
    </RadixPopover.Portal>
  );
}

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({ className, align = "end", sideOffset = 4, ...props }: ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cx(FLOATING, "z-50 min-w-36 p-1 text-sm", className)}
        {...props}
      />
    </RadixMenu.Portal>
  );
}

const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded px-2 outline-none select-none data-[highlighted]:bg-surface-2";

export const MenuRadioGroup = RadixMenu.RadioGroup;

export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof RadixMenu.RadioItem>) {
  return (
    <RadixMenu.RadioItem className={cx(MENU_ITEM, "pr-7 relative", className)} {...props}>
      {children}
      <RadixMenu.ItemIndicator className="absolute right-2 text-accent">
        <CheckIcon />
      </RadixMenu.ItemIndicator>
    </RadixMenu.RadioItem>
  );
}

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

/** A centred confirm or form dialog. */
export function DialogContent({ title, description, className, children, ...props }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={BACKDROP} />
      <RadixDialog.Content
        className={cx(FLOATING, "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-4", className)}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <RadixDialog.Title className="text-lg font-medium">{title}</RadixDialog.Title>
        {description ? <RadixDialog.Description className="mt-1 text-sm text-ink-muted">{description}</RadixDialog.Description> : null}
        <div className="mt-4">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export interface SheetContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, "title"> {
  /** Named for screen readers; visually hidden unless shown by the caller. */
  title: string;
  side?: "left" | "right";
}

/** A full-height layer: the navigation drawer, and the order panel in M8. */
export function SheetContent({ title, side = "right", className, children, ...props }: SheetContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={BACKDROP} />
      <RadixDialog.Content
        aria-describedby={undefined}
        className={cx(
          "fixed inset-y-0 z-50 flex flex-col bg-surface text-ink shadow-float",
          side === "left" ? "left-0 border-r border-line" : "right-0 border-l border-line",
          className,
        )}
        {...props}
      >
        <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
        <RadixDialog.Close asChild>
          <IconButton label={shellCopy.close} className="absolute top-3 right-3 z-10">
            <CloseIcon />
          </IconButton>
        </RadixDialog.Close>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cx("inline-flex gap-1 rounded-md bg-surface-2 p-0.5", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cx(
        "h-7 rounded px-2 text-sm font-medium text-ink-muted transition-colors duration-[120ms] data-[state=active]:bg-surface data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}
