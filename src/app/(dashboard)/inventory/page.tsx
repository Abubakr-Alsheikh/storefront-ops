import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return <EmptyState title={stubCopy.title}>{stubCopy.inventory}</EmptyState>;
}
