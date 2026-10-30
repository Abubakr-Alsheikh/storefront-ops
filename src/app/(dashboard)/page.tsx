import type { Metadata } from "next";
import { Suspense } from "react";
import { OverviewBody, OverviewHeaderFallback, OverviewScreen } from "@/components/overview/OverviewScreen";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-w-0 flex-col gap-4">
          <OverviewHeaderFallback />
          <OverviewBody />
        </div>
      }
    >
      <OverviewScreen />
    </Suspense>
  );
}
