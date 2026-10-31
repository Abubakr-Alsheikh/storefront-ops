import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomersFallback, CustomersScreen } from "@/components/customers/CustomersScreen";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersFallback />}>
      <CustomersScreen />
    </Suspense>
  );
}
