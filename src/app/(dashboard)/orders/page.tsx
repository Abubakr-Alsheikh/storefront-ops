import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersFallback, OrdersScreen } from "@/components/orders/OrdersScreen";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersFallback />}>
      <OrdersScreen />
    </Suspense>
  );
}
