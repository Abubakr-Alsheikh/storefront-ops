"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./icons";
import { Input, Kbd } from "./primitives";

const SEARCH_DEBOUNCE_MS = 250;

/** A search field that commits after a pause. `/` focuses it from anywhere but a text field. */
export function SearchBox({ label, value, onCommit }: { label: string; value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [committed, setCommitted] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  // The URL changed from elsewhere (Clear filters, a link): follow it.
  if (value !== committed) {
    setCommitted(value);
    setText(value);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="relative block w-full md:w-80">
      <span className="sr-only">{label}</span>
      <SearchIcon className="pointer-events-none absolute top-2 left-2 text-ink-muted" />
      <Input
        ref={input}
        type="search"
        value={text}
        placeholder={label}
        className="truncate pr-8 pl-8"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            setCommitted(next);
            onCommit(next);
          }, SEARCH_DEBOUNCE_MS);
        }}
      />
      <Kbd aria-hidden="true" className="pointer-events-none absolute top-1.5 right-1.5 max-md:hidden">/</Kbd>
    </label>
  );
}
