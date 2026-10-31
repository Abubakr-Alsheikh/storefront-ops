"use client";

import { useRouter } from "next/navigation";
import { Dialog, SheetContent } from "@/components/ui/overlays";
import { orderCopy } from "@/lib/data/copy/orderDetail";
import { OrderDetailView } from "./OrderDetailView";

/** The order over the table: closing goes back, and focus returns to the grid's row. */
export function OrderPanel({ number }: { number: number }) {
  const router = useRouter();
  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <SheetContent
        side="right"
        title={orderCopy.title(number)}
        className="w-full animate-[panel-in_240ms_ease-out] lg:w-[520px]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLElement>("[role=grid]")?.focus();
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 xl:p-5">
          <OrderDetailView number={number} />
        </div>
      </SheetContent>
    </Dialog>
  );
}
