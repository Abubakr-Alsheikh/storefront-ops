import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return <EmptyState title={stubCopy.title}>{stubCopy.orders}</EmptyState>;
}
