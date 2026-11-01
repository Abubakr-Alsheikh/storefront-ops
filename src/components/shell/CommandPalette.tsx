"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SearchIcon } from "@/components/ui/icons";
import { Button, IconButton, Kbd } from "@/components/ui/primitives";
import { shellCopy } from "@/lib/data/copy/shell";

const PaletteDialog = dynamic(() => import("./PaletteDialog"), { ssr: false });
const ShortcutSheet = dynamic(() => import("./ShortcutSheet"), { ssr: false });

/** Ctrl K on the server and elsewhere, ⌘ K once the browser says it is a Mac. */
const noSubscribe = () => () => {};
function useShortcutLabel() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/mac/i.test(navigator.platform) ? "⌘ K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** The search button and the shortcuts: Ctrl K for search, `?` for the list of them all. */
export function CommandButton() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [sheet, setSheet] = useState(false);
  const router = useRouter();
  const shortcut = useShortcutLabel();
  // Opened from the keyboard there is no trigger, so focus returns by hand.
  const returnFocus = useRef<Element | null>(null);
  const show = () => {
    returnFocus.current = document.activeElement;
    setEverOpened(true);
    setOpen(true);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        returnFocus.current = document.activeElement;
        setEverOpened(true);
        setOpen((current) => !current);
        return;
      }
      const target = event.target as HTMLElement;
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        event.preventDefault();
        returnFocus.current = document.activeElement;
        setSheet(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button onClick={show} className="w-56 justify-start text-ink-muted max-md:hidden">
        <SearchIcon />
        <span className="flex-1 text-left font-normal">{shellCopy.search}</span>
        <Kbd>{shortcut}</Kbd>
      </Button>
      <IconButton label={shellCopy.searchShort} onClick={show} className="md:hidden">
        <SearchIcon />
      </IconButton>

      {sheet ? (
        <ShortcutSheet
          onClose={() => {
            setSheet(false);
            const previous = returnFocus.current;
            requestAnimationFrame(() => {
              if (previous instanceof HTMLElement) previous.focus();
            });
          }}
        />
      ) : null}

      {/* The dialog and cmdk load on first use; the button is all a first paint needs. */}
      {everOpened ? (
        <PaletteDialog
          open={open}
          onOpenChange={setOpen}
          onNavigate={(href) => {
            setOpen(false);
            router.push(href);
          }}
          returnFocus={returnFocus}
        />
      ) : null}
    </>
  );
}
