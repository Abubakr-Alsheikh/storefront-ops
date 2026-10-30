import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <EmptyState title={stubCopy.title}>{stubCopy.settings}</EmptyState>;
}
