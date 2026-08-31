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

/** Verbatim from the probe run. Fourteen masks, all named by vision; `targetId` picks the one hidden. */
const OCCLUSION_PAYLOAD = "{\"height\":1259,\"image\":\"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/1280px-Diagram_of_the_human_heart_%28cropped%29.svg.png\",\"kind\":\"occlusion\",\"mode\":\"hide-all\",\"shapes\":[{\"h\":76,\"id\":\"m0\",\"label\":\"Superior Vena Cava\",\"w\":187,\"x\":72,\"y\":181},{\"h\":34,\"id\":\"m1\",\"label\":\"Aorta\",\"w\":93,\"x\":612,\"y\":203},{\"h\":74,\"id\":\"m2\",\"label\":\"Pulmonary Artery\",\"w\":182,\"x\":974,\"y\":240},{\"h\":74,\"id\":\"m3\",\"label\":\"Pulmonary Vein\",\"w\":184,\"x\":1042,\"y\":363},{\"h\":73,\"id\":\"m4\",\"label\":\"Left Atrium\",\"w\":110,\"x\":691,\"y\":472},{\"h\":71,\"id\":\"m5\",\"label\":\"Mitral Valve\",\"w\":95,\"x\":1069,\"y\":583},{\"h\":73,\"id\":\"m6\",\"label\":\"Right Atrium\",\"w\":110,\"x\":344,\"y\":592},{\"h\":71,\"id\":\"m7\",\"label\":\"Aortic Valve\",\"w\":100,\"x\":1107,\"y\":721},{\"h\":72,\"id\":\"m8\",\"label\":\"Pulmonary Valve\",\"w\":187,\"x\":45,\"y\":777},{\"h\":73,\"id\":\"m9\",\"label\":\"Left Ventricle\",\"w\":146,\"x\":810,\"y\":781},{\"h\":73,\"id\":\"m10\",\"label\":\"Right Ventricle\",\"w\":146,\"x\":559,\"y\":878},{\"h\":73,\"id\":\"m11\",\"label\":\"Tricuspid Valve\",\"w\":154,\"x\":77,\"y\":906},{\"h\":35,\"id\":\"m12\",\"label\":\"Inferior Vena Cava\",\"w\":316,\"x\":207,\"y\":1157},{\"h\":35,\"id\":\"m13\",\"label\":\"Pericardium\",\"w\":205,\"x\":991,\"y\":1157}],\"targetId\":\"m5\",\"width\":1280}";

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
  // Never graded, so the FSRS pair is zero and the first answer seeds both, and the card starts at
  // the top of the learning steps. See study-scheduler.ts.
  difficulty: 0,
  stability: 0,
  lastReviewedAt: null,
  state: "new",
  remainingSteps: 0,
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

/**
 * 🔴🔴 THESE THREE CARDS WERE NOT WRITTEN BY HAND. Every one came out of the real chain on
 * 2026-08-30 and is pasted verbatim: `scripts/cards-deck-probe.ts` called the shipped
 * `CARDS_SYSTEM` against DeepSeek on heart material, `readCardsJson` parsed the reply, and
 * `occlusionCards()` built the image card from a vision read production had already performed and
 * cached in `figure_occlusion_cache` (fourteen boxes on a licensed Commons diagram).
 *
 * 🔴 SO THIS BOARD ANSWERS "CAN IT ACTUALLY DO THIS", which is a different question from "does the
 * component render". A hand-typed cloze would prove the renderer and nothing about the writer.
 */
const CARDS: StudyCard[] = [
  // Written by the model. A pathway question whose answer happens to be a part name — deliberately
  // NOT dropped by `dropCardsCoveredByFigure`, because the picture cannot ask what follows what.
  card("c1", "Which valve does blood pass from the right atrium to the right ventricle?", "The tricuspid valve."),
  // Written by the model, unprompted, on material where the fact only means anything in context.
  { ...card("c2", "Consideration must be sufficient but need not be {{c1::adequate}}.", "Consideration must be sufficient but need not be adequate."), cardType: "cloze" },
  // Built by `occlusionCards()` from the cached vision read. Mask m5 is the one hidden.
  {
    ...card("c3", "What is the covered part?", "Mitral Valve"),
    cardType: "image_occlusion",
    payload: JSON.parse(OCCLUSION_PAYLOAD) as StudyCard["payload"],
  },
];

export default function FlashcardsPreview() {
  const [open, setOpen] = useState(true);
  // 🔴 ONE CARD AT A TIME, PICKED. Grading cannot advance this board: `ReviewSession` takes the
  // cards as props but grades through `useCloudStudy`, whose preview lane holds a different
  // collection entirely. Handing it one card is what makes all three states reachable here.
  const [at, setAt] = useState(0);
  const shown = CARDS.slice(at, at + 1);
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
        <div className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 gap-2">
          {["basic", "cloze", "image occlusion"].map((label, index) => (
            <button
              aria-pressed={at === index}
              className="rounded-full bg-(--ui-bg-elevated) px-3 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) aria-pressed:bg-(--ui-action) aria-pressed:text-(--ui-action-glyph)"
              key={label}
              onClick={() => { setAt(index); setOpen(true); }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <ReviewSession cards={shown} deck={DECK} onOpenChange={setOpen} open={open} settings={REVIEW_DEFAULTS} />
      </main>
    </WorkspacePreviewProvider>
  );
}
