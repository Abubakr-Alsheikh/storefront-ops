import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { stubCopy } from "@/lib/data/copy/shell";

export const metadata: Metadata = { title: "Customer" };

async function Detail({ params }: { params: PageProps<"/customers/[id]">["params"] }) {
  const { id } = await params;
  return <EmptyState title={`Customer ${id}`}>{stubCopy.customer}</EmptyState>;
}

export default function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-22 w-full" />}>
      <Detail params={params} />
    </Suspense>
  );
}
