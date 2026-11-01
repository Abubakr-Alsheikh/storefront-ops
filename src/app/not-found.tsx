import type { Metadata } from "next";
import { PageNotFound } from "@/components/shell/PageNotFound";

export const metadata: Metadata = { title: "Page not found" };

/** An address outside the dashboard, so no shell around it. */
export default function NotFound() {
  return (
    <main id="content" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-6">
      <h1 className="sr-only">Page not found</h1>
      <PageNotFound />
    </main>
  );
}
