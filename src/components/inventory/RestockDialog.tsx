"use client";

import { useState } from "react";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlays";
import { Button, Input } from "@/components/ui/primitives";
import type { InventoryRow } from "@/lib/contracts/catalogue";
import { inventoryCopy } from "@/lib/data/copy/catalogue";
import { restocked } from "@/lib/inventoryList";

const MAX_UNITS = 500;

/** Loaded on first use, so the list does not carry the dialog code. */
export default function RestockDialog({ row, onSubmit, onClose }: { row: InventoryRow; onSubmit: (quantity: number) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const quantity = Number(text);
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_UNITS;
  const cover = valid ? restocked(row, quantity).daysOfCover : null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={inventoryCopy.dialogTitle(row.productName, row.optionLabel)}
        // The screen puts focus back on the list itself.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onSubmit(quantity);
            onClose();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            {inventoryCopy.unitsReceived}
            <Input
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_UNITS}
              step={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="px-2 text-sm text-ink tabular-nums"
            />
          </label>
          <p aria-live="polite" className="mt-2 min-h-5 text-sm text-ink-muted tabular-nums">
            {!valid ? inventoryCopy.unitsHelp : cover === null ? inventoryCopy.noRecentSales : inventoryCopy.coverAfter(cover)}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <DialogClose asChild>
              <Button>{inventoryCopy.notNow}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={!valid}>{inventoryCopy.addStock}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
