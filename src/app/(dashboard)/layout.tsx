import { Suspense } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { Toaster } from "@/components/ui/Toaster";
import { shellCopy } from "@/lib/data/copy/shell";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-1.5 focus:text-sm focus:text-ink"
      >
        {shellCopy.skipLink}
      </a>
      <div className="flex min-h-dvh">
        {/* Separate boundaries hydrate separately, in smaller tasks. */}
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="h-14 border-b border-line" />}>
            <TopBar />
          </Suspense>
          <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[1600px] min-w-0 scroll-mt-14 px-4 py-6 outline-none md:px-6 xl:px-8">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </>
  );
}
