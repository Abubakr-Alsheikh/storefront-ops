"use client";

import { useState } from "react";
import { MenuIcon } from "@/components/ui/icons";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlays";
import { IconButton } from "@/components/ui/primitives";
import { shellCopy } from "@/lib/data/copy/shell";
import { SidebarBody } from "./Sidebar";

/** Takes the place of the plain button on first click, already open. */
export default function NavDrawerSheet() {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton label={shellCopy.openNav} className="lg:hidden">
          <MenuIcon />
        </IconButton>
      </DialogTrigger>
      <SheetContent side="left" title={shellCopy.primaryNav} className="w-58 max-w-[85vw]">
        <SidebarBody onNavigate={() => setOpen(false)} rail={false} />
      </SheetContent>
    </Dialog>
  );
}
