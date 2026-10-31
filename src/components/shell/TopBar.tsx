"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { titleForPath } from "@/lib/nav";
import { CommandButton } from "./CommandPalette";
import { LiveIndicator } from "./LiveIndicator";
import { NavDrawer, RailToggle } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

function PageTitle() {
  return <h1 className="truncate text-xl font-semibold text-ink">{titleForPath(usePathname())}</h1>;
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas px-4 md:px-6 xl:px-8">
      <NavDrawer />
      <RailToggle />
      <div className="min-w-0 flex-1">
        <Suspense fallback={null}>
          <PageTitle />
        </Suspense>
      </div>
      <LiveIndicator />
      <CommandButton />
      <ThemeToggle />
    </header>
  );
}
