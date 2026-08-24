"use client";

// Open a real review of one deck, from anywhere in the product.
//
// Owner 2026-08-24, on a deck made by a canvas: "I kinda just want … the cards as an
// artifact that the user can study", and on the review screen itself: "it was supposed
// to be, like, Anki where it had, like, the minimalist design, no flip animation. I
// would like to keep that."
//
// 🔴🔴 THIS MOUNTS THE EXISTING REVIEW SCREEN. IT DOES NOT DRAW A SECOND ONE. Before
// this file, `ReviewSession` could only be reached from the Study tab, so a deck sitting
// in the Library expanded into a scrollable list of front/back text and there was no way
// to actually review it. That is the whole defect. The fix is a DOOR, not a screen: every
// pixel a learner sees here is the same component the Study tab has always rendered, so
// the scheduling, the keyboard shortcuts, the Anki-style counts and the look are
// identical by construction rather than by two teams remembering to match.
//
// 🔴 NO FLIP ANIMATION, AND THAT IS A SETTING WITH AN OWNER BEHIND IT. The Study tab
// persists `StudyReviewSettings` per student; nothing outside that tab has a stored
// preference to read, so this passes the owner's stated default explicitly rather than
// letting a `?? true` somewhere decide. See `REVIEW_DEFAULTS`.
//
// 🔴 MOUNT IT ONLY WHEN A DECK IS CHOSEN. `useCloudStudy()` loads every deck, card and
// review the account owns — the exact cost `canvas-study-bridge.ts` refuses to pay on a
// reading page. Rendering this component is what starts that load, so callers render it
// conditionally (`deckId && <DeckReview …>`), never unconditionally with an `open` flag.
// The load then happens when a learner has already asked to review, which is the one
// moment it is worth paying for.

import { useEffect, useMemo } from "react";

import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

import { ReviewSession } from "./review-session";
import type { StudyReviewSettings } from "./study-chrome";

/** What a review looks like away from the Study tab, where no stored preference exists.
 *
 *  🔴 `flipAnimation: false` IS THE OWNER'S WORDS, not a performance choice. */
export const REVIEW_DEFAULTS: StudyReviewSettings = { flashcardOutline: false, flipAnimation: false };

export function DeckReview({
  deckId,
  onClose,
}: {
  /** The deck to review. The component is expected to be mounted only while this is set. */
  deckId: string;
  onClose: () => void;
}) {
  const { cards, decks, selectDeck, status } = useCloudStudy();

  // The store keys "which deck am I in" globally, and `buildReviewQueue` filters by the
  // deck it is handed — but stats and any later write read the selection, so keep them
  // agreed rather than leaving the store pointing at whatever the Study tab last used.
  useEffect(() => {
    selectDeck(deckId);
  }, [deckId, selectDeck]);

  const deck = useMemo(() => decks.find((row) => row.id === deckId) ?? null, [deckId, decks]);

  // 🔴 WAIT FOR THE LOAD BEFORE MOUNTING THE SESSION. Handing `ReviewSession` an empty
  // card list mid-fetch makes it render its "You're caught up" state, which reads as a
  // finished deck and is the most misleading thing this screen could say. `idle` counts
  // as not-yet-loaded: it is the status before the first fetch has even been issued.
  if (status !== "loaded" && status !== "error" && cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-(--ui-bg-primary)/80">
        <p className="text-sm text-(--ui-text-secondary)">Opening the deck…</p>
      </div>
    );
  }

  return (
    <ReviewSession
      cards={cards}
      deck={deck}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
      settings={REVIEW_DEFAULTS}
    />
  );
}
