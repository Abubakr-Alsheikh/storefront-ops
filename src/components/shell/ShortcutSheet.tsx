"use client";

import { Dialog, DialogContent } from "@/components/ui/overlays";
import { shellCopy } from "@/lib/data/copy/shell";
import { ShortcutList } from "./ShortcutList";

/** Loaded the first time someone presses `?`. */
export default function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={shellCopy.shortcutsTitle}>
        <ShortcutList />
      </DialogContent>
    </Dialog>
  );
}
