"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SearchIcon } from "@/components/ui/icons";
import { Button, IconButton, Kbd } from "@/components/ui/primitives";
import { shellCopy } from "@/lib/data/copy/shell";

const PaletteDialog = dynamic(() => import("./PaletteDialog"), { ssr: false });

/** Ctrl K on the server and elsewhere, ⌘ K once the browser says it is a Mac. */
const noSubscribe = () => () => {};
function useShortcutLabel() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/mac/i.test(navigator.platform) ? "⌘ K" : "Ctrl K"),
    () => "Ctrl K",
  );
}

/** The search button and the shortcut. */
export function CommandButton() {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
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
