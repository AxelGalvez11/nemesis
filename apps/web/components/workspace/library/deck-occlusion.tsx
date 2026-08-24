"use client";

// The door to image occlusion, on the deck the cards will land in.
//
// Owner 2026-08-24: *"What about image occlusion? Can I do image occlusion?"*
//
// 🔴🔴 THE ANSWER WAS "NO", AND NOT BECAUSE IT WAS UNBUILT. `OcclusionEditor`, `OcclusionCardView`,
// the `image_occlusion` card type, the mask-suggesting API and its migration have all shipped and
// all work. Their only door was `cards-tab.tsx`, which is mounted by exactly one page — `/study` —
// and `/study` has been retired behind `RetiredSurfaceGuard` for weeks. A whole authoring surface
// went dark when the page above it was retired, and nothing failed loudly enough to notice: this
// codebase's most expensive recurring defect, one more time.
//
// 🔴 A DECK ROW, NOT A FOURTH SHELF, AND THAT DISTINCTION IS THE OWNER'S OWN. The same day they
// said *"I mainly just want buttons for slides, flash cards, and documents"* and had the Anki and
// Progress buttons taken off the top of this page. So this is not a new top-level control — it is
// an action ON a deck that already exists, sitting beside Share and Move, and it cannot be reached
// without first having a deck for the cards to go into. That is also what makes it correct rather
// than merely permitted: an occlusion card IS a card in a deck, and asking which deck first is the
// question the old dialog had to ask anyway.
//
// 🔴 THE EDITOR IS MOUNTED UNMODIFIED. It carries its own image picker, its own mask drawing, its
// own save, and its own knowledge of what a malformed PNG can be. A second implementation here
// would be a second place for "what is a valid mask" to be decided — the rule `one-study-door.ts`
// already holds for the Anki importer and the stats page.

import { useCallback } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { OcclusionEditor } from "@/components/workspace/study/occlusion-editor";

export function DeckOcclusion({
  deckId,
  deckName,
  onClose,
}: {
  deckId: string;
  deckName: string;
  /** Closes the dialog. Called on cancel and after a save, because both end the task. */
  onClose: () => void;
}) {
  // 🔴 ONE HANDLER FOR BOTH OUTCOMES, DELIBERATELY. The editor reports cancel and save separately
  // and the Library does the same thing with each: close. Writing two identical closures would
  // invite one of them to drift into "close and refresh", which is the shelves' effect and not
  // this dialog's business.
  const close = useCallback(() => onClose(), [onClose]);
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Image cards for {deckName}</DialogTitle>
          <DialogDescription>
            Drop in a diagram, drag boxes over the parts you want hidden, and each box becomes its
            own card in this deck.
          </DialogDescription>
        </DialogHeader>
        {/* 🔴 `tags` IS EMPTY AND `sourcePath` IS NULL BECAUSE NEITHER HAS AN HONEST VALUE HERE.
            The retired dialog collected tags in a field beside this editor; the Library has no such
            field, and inventing one would be adding a control the owner did not ask for. An empty
            tags string is what the editor already treats as "no tags". */}
        <OcclusionEditor deckId={deckId} onCancel={close} onSaved={close} sourcePath={null} tags="" />
      </DialogContent>
    </Dialog>
  );
}
