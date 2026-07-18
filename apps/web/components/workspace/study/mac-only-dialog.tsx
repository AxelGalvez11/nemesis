"use client";

// Shared "build on your Mac for now" notice — opened by all three Cards-tab
// toolbar actions (New deck / Import / New section) until cloud deck sync
// ships (library-study spec build-plan C3).

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";

interface MacOnlyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MacOnlyDialog({ open, onOpenChange }: MacOnlyDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Decks build on your Mac for now</DialogTitle>
          <DialogDescription>
            Deck creation and import land with cloud sync. Until then, build decks in the Mac app — they sync to your
            phone today.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
