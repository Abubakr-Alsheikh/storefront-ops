import type { Metadata } from "next";
import { Suspense } from "react";
import { InventoryFallback, InventoryScreen } from "@/components/inventory/InventoryScreen";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryFallback />}>
      <InventoryScreen />
    </Suspense>
  );
}
