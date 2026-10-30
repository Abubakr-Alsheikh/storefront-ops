import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Order" };

async function Detail({ params }: { params: PageProps<"/orders/[number]">["params"] }) {
  const { number } = await params;
  return <EmptyState title={`Order #${number}`}>{stubCopy.order}</EmptyState>;
}

export default function OrderDetailPage({ params }: PageProps<"/orders/[number]">) {
  return (
    <Suspense fallback={<Skeleton className="h-22 w-full" />}>
      <Detail params={params} />
    </Suspense>
  );
}
