"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";

function subscribe(notify: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

/** Below md, tables show cards. */
export const useIsMobile = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
