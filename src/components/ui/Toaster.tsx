"use client";

import { useSyncExternalStore } from "react";
import { shellCopy } from "@/lib/data/copy/shell";
import { dismissToast, getNoToasts, getToasts, subscribeToasts } from "@/lib/toast";
import { CheckIcon, CloseIcon } from "./icons";
import { IconButton } from "./primitives";

/**
 * Lives outside any dialog. `aria-live` keeps it readable while a modal panel
 * hides the rest of the page from screen readers, and pointer-events are
 * restored because Radix turns them off on the body.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getNoToasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className="pointer-events-auto flex items-start gap-2 rounded-md border border-line bg-surface p-3 text-sm text-ink shadow-float"
        >
          {toast.tone === "error" ? (
            <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rotate-45 bg-negative" />
          ) : (
            <CheckIcon className="mt-0.5 shrink-0 text-positive" />
          )}
          <span className="min-w-0 flex-1">{toast.message}</span>
          <IconButton label={shellCopy.close} onClick={() => dismissToast(toast.id)} className="-my-1.5 -mr-1.5">
            <CloseIcon />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
