import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <EmptyState title={stubCopy.title}>{stubCopy.customers}</EmptyState>;
}
