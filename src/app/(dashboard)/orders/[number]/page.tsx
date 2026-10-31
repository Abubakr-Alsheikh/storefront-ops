import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderDetailView } from "@/components/orders/OrderDetailView";
import { Skeleton } from "@/components/ui/primitives";
import { orderCopy } from "@/lib/data/copy/orderDetail";

export const metadata: Metadata = { title: "Order" };

async function Detail({ params }: { params: PageProps<"/orders/[number]">["params"] }) {
  const { number } = await params;
  if (!/^\d{6,10}$/.test(number)) notFound();
  return <OrderDetailView number={Number(number)} />;
}

export default function OrderPage({ params }: PageProps<"/orders/[number]">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/orders" className="mb-3 inline-flex min-h-6 items-center rounded text-sm font-medium text-accent hover:underline">
        {orderCopy.back}
      </Link>
      <div className="rounded-md border border-line bg-surface p-4 xl:p-5">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Detail params={params} />
        </Suspense>
      </div>
    </div>
  );
}
