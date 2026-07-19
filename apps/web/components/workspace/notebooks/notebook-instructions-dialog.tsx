"use client";

// The "+" for Instructions — a centered, zoom-in dialog (Radix handles the micro-animation) with a
// roomy textarea. Seeds from the notebook's current instructions each time it opens; Save writes back
// through the store. Purely presentational otherwise.

import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";

interface NotebookInstructionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: string;
  onSave: (value: string) => void;
}

export function NotebookInstructionsDialog({ open, onOpenChange, initialValue, onSave }: NotebookInstructionsDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const save = () => {
    onSave(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-3 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Instructions</DialogTitle>
        </DialogHeader>
        <p className="text-[0.8rem] text-(--ui-text-tertiary)">
          Tell Nemesis how to help in this notebook — a role to play, a tone, what to focus on. It applies to every chat here.
        </p>
        <textarea
          autoFocus
          className="min-h-44 resize-y rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-3 py-2.5 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. You're my pharmacology tutor — keep answers exam-focused and cite the guideline I added."
          value={value}
        />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button onClick={save} size="sm" type="button" variant="secondary">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
