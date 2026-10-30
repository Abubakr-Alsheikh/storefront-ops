import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <EmptyState title={stubCopy.title}>{stubCopy.overview}</EmptyState>;
}
