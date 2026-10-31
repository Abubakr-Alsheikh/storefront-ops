import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CustomerDetailFallback, CustomerDetailView } from "@/components/customers/CustomerDetailView";
import { customersCopy } from "@/lib/data/copy/catalogue";

export const metadata: Metadata = { title: "Customer" };

async function Detail({ params }: { params: PageProps<"/customers/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2_147_483_647) notFound();
  return <CustomerDetailView id={Number(id)} />;
}

export default function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/customers" className="mb-3 inline-flex min-h-6 items-center rounded text-sm font-medium text-accent hover:underline">
        {customersCopy.back}
      </Link>
      <Suspense fallback={<CustomerDetailFallback />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}
