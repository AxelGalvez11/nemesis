"use client";

// DEV-ONLY PREVIEW — the flashcard review, which is the one artifact that is NOT a reader.
//
// 🔴 IT HAD NO HARNESS, AND THAT IS WHY IT NEEDED ONE. Every other artifact surface can be looked
// at without a model call; this one could only be reached by making a real deck on a real canvas,
// so the owner's requirement — *"flashcards should be different. They should be one that can be
// full screen just like an Anki with an x on it"* — could be argued from the class names and not
// SEEN. It is a `100dvh` dialog either way; now that is checkable.

import { useState } from "react";

import { REVIEW_DEFAULTS } from "@/components/workspace/study/deck-review";
import { ReviewSession } from "@/components/workspace/study/review-session";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import type { StudyCard, StudyDeck } from "@/lib/workspace/study-cloud-store";

const NOW = "2026-08-25T09:00:00.000Z";

const DECK: StudyDeck = {
  createdAt: NOW,
  description: "",
  id: "preview-deck",
  name: "Cardiac action potentials",
  sourcePath: null,
  updatedAt: NOW,
};

const card = (id: string, front: string, back: string): StudyCard => ({
  back,
  cardType: "basic",
  createdAt: NOW,
  deckId: DECK.id,
  dueAt: NOW,
  flag: 0,
  front,
  id,
  intervalDays: 0,
  lapses: 0,
  payload: null,
  quality: 0,
  repetitions: 0,
  sourcePath: null,
  suspended: false,
  tags: [],
  updatedAt: NOW,
});

const CARDS: StudyCard[] = [
  card("c1", "What carries phase 0 of the ventricular action potential?", "A fast inward sodium current."),
  card("c2", "Why does the plateau last so long?", "Calcium moving in balances potassium moving out."),
  card("c3", "What sets the resting membrane potential?", "A high resting potassium conductance."),
];

export default function FlashcardsPreview() {
  const [open, setOpen] = useState(true);
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <main data-workspace className="grid min-h-dvh place-items-center bg-(--ui-bg-editor)">
        {!open && (
          <button
            className="rounded-full bg-(--ui-action) px-4 py-1.5 text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor)"
            onClick={() => setOpen(true)}
            type="button"
          >
            Reopen the review
          </button>
        )}
        <ReviewSession cards={CARDS} deck={DECK} onOpenChange={setOpen} open={open} settings={REVIEW_DEFAULTS} />
      </main>
    </WorkspacePreviewProvider>
  );
}
