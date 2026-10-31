import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderPanel } from "@/components/orders/OrderPanel";

async function Panel({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  if (!/^\d{6,10}$/.test(number)) notFound();
  return <OrderPanel number={Number(number)} />;
}

/** A soft navigation from the table opens this; a hard load gets the full page. */
export default function InterceptedOrder({ params }: { params: Promise<{ number: string }> }) {
  return (
    <Suspense fallback={null}>
      <Panel params={params} />
    </Suspense>
  );
}
