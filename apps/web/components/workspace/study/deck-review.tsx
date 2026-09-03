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
// 🔴🔴 ON THE CANVAS IT OPENS IN THE RIGHT-HAND PANEL, WHICH REVERSES AN EARLIER ORDER.
// Owner, 2026-08-30: *"the tests and the flashcards could appear in the sidebar… because that way,
// users could ask questions as well, have the chat on the side, and they could also full screen if
// they want."* In August the instruction had been the opposite — *"full screen just like an Anki
// with an x on it"* — and full screen is still one button away in the panel's header. What changed
// is which of the two is the front door: reviewing a deck you are in the middle of discussing
// should not hide the discussion.
//
// 🔴🔴 EVERY DOOR OPENS THE PANEL, INCLUDING THE LIBRARY. This once shipped with the Library
// passing `surface="full"`, reasoned as "a shelf has no conversation to dock beside". The owner
// rejected it on sight (2026-08-31): he had asked for flashcards in the sidebar like the test, and
// a deck that behaves differently depending on which door you came through reads as the ask not
// having been done. `full` is kept for a caller mounted outside the workspace shell, where there
// is no dock to claim — no such caller exists in the app today, and `artifact-chrome.test.ts`
// watches for one appearing.
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

import { useEffect, useMemo, type ReactNode } from "react";

import type { DockItem } from "@/components/workspace/learn/document-dock";
import { StudyPanel } from "@/components/workspace/learn/study-panel";
import { deckAsMarkdown } from "@/lib/workspace/deck-export";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

import { ReviewSession } from "./review-session";
import type { StudyReviewSettings } from "./study-chrome";

/** What a review looks like away from the Study tab, where no stored preference exists.
 *
 *  🔴 `flipAnimation: false` IS THE OWNER'S WORDS, not a performance choice. */
export const REVIEW_DEFAULTS: StudyReviewSettings = { flashcardOutline: false, flipAnimation: false };

export function DeckReview({
  actions,
  activeKey,
  items,
  onCloseKey,
  onSelectKey,
  widthSlot,
  crumb = "Flashcards",
  deckId,
  onAsk,
  onClose,
  initialMode = "docked",
  surface = "panel",
}: {
  /** Header controls the host supplies — the Library passes Download, so the deck's toolbar
   *  matches the document's. See StudyPanel's own note on the slot. */
  actions?: ReactNode;
  /** The one pane's tabs, threaded straight to `StudyPanel`; see its own note. */
  items?: readonly DockItem[];
  activeKey?: string | null;
  onSelectKey?: (key: string) => void;
  onCloseKey?: (key: string) => void;
  widthSlot?: "study" | "reader";
  /** The muted first half of the header path: the surface you came from. The Library says
   *  "Library", exactly as it does over a document, so two artifacts opened from one shelf do not
   *  disagree about where they came from. */
  crumb?: string;
  /** The deck to review. The component is expected to be mounted only while this is set. */
  deckId: string;
  /**
   * Ask a question about this deck, in a new conversation. Absent draws no bar.
   *
   * 🔴 THE DECK TRAVELS WITH THE QUESTION. "What does this mean?" is nothing on its own, and the
   * cards are the only thing here that could answer it — so this hands back the deck as markdown
   * for the host to attach, the same shape the document reader and `/deck` use.
   */
  onAsk?: (question: string, material: { name: string; text: string }) => void;
  onClose: () => void;
  /** Where the panel LANDS — see StudyPanel's own note. The Library opens full screen; a canvas
   *  docks, so the conversation the deck came out of stays on screen beside it. */
  initialMode?: "docked" | "full";
  /** `panel` docks beside a conversation; `full` takes the screen, for surfaces with no
   *  conversation to sit beside. */
  surface?: "panel" | "full";
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
  const loading = status !== "loaded" && status !== "error" && cards.length === 0;

  if (surface === "full") {
    if (loading) {
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

  return (
    <StudyPanel
      actions={actions}
      activeKey={activeKey}
      items={items}
      onCloseKey={onCloseKey}
      onSelectKey={onSelectKey}
      widthSlot={widthSlot}
      crumb={crumb}
      initialMode={initialMode}
      onAsk={
        onAsk &&
        ((question) =>
          onAsk(question, {
            name: `${deck?.name ?? "Flashcards"}.md`,
            // 🔴 THE STORE KEYS CARDS GLOBALLY — every deck on the account is in `cards`, so an
            // unfiltered hand-off would send somebody's whole library as the answer to a question
            // about one deck.
            text: deckAsMarkdown(deck?.name ?? "Flashcards", cards.filter((row) => row.deckId === deckId)),
          }))
      }
      onClose={onClose}
      open
      title={deck?.name ?? "Flashcards"}
    >
      {loading ? (
        <p className="p-6 text-sm text-(--ui-text-secondary)">Opening the deck…</p>
      ) : (
        <ReviewSession
          cards={cards}
          deck={deck}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
          open
          settings={REVIEW_DEFAULTS}
          surface="bare"
        />
      )}
    </StudyPanel>
  );
}
