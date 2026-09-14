"use client";

// One deck, opened from the Flashcards tab (docs/space/PLAN.md, "Notes, Flashcards and Nemesis AI", M17).
//
// 🔴 A DOOR ONTO THE EXISTING PLAYER, the rule /review was built on: under the bar, every card is drawn by
// `ReviewSession`, so a deck and the review screen cannot start disagreeing about what a card looks like. The frame
// around it is the design system's (study-frame.tsx), per /design/COMPONENTS.md.

import { Layers, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { StudyLoading, StudyNotice, StudyTopBar } from "@/components/space/study-frame";
import { REVIEW_DEFAULTS } from "@/components/workspace/study/deck-review";
import { ReviewSession } from "@/components/workspace/study/review-session";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

export function FlashcardDeck({ deckId, onClose }: { deckId: string; onClose?: () => void }) {
  const router = useRouter();
  const { cards, decks, error, status } = useCloudStudy();
  // 🔴 BACK IF THERE IS A BACK, NOTES OTHERWISE. `router.back()` alone paints nothing on a pasted link, and Notes is
  // where the app opens (components/space/space-landing.ts).
  const close = onClose ?? (() => (window.history.length > 1 ? router.back() : router.push("/home")));
  const deck = decks.find((candidate) => candidate.id === deckId) ?? null;
  const count = cards.filter((card) => card.deckId === deckId && !card.suspended).length;
  // 🔴 WAIT FOR THE LOAD BEFORE SAYING ANYTHING ABOUT THE DECK, the rule /review and DeckReview follow: "this deck is
  // not here" or "no cards yet" said mid-fetch is the most misleading thing this screen could tell someone.
  const loading = status !== "loaded" && status !== "error";

  return (
    <main className="flex h-full min-h-0 flex-col" style={{ background: "var(--bg-page)" }}>
      <StudyTopBar
        crumbs={deck ? ["Flashcards", deck.name] : ["Flashcards"]}
        detail={deck && count ? `${count} card${count === 1 ? "" : "s"}` : undefined}
        onClose={close}
      />
      {loading ? (
        <StudyLoading />
      ) : status === "error" ? (
        <StudyNotice
          action={{ label: "Try again", onClick: () => window.location.reload() }}
          icon={TriangleAlert}
          sentence={error ?? "Check your connection and try again."}
          title="Your cards could not be loaded"
        />
      ) : !deck ? (
        <StudyNotice
          action={{ label: "Close", onClick: close }}
          icon={Layers}
          sentence="It may have been deleted, or it belongs to another account."
          title="This deck is not here"
        />
      ) : count === 0 ? (
        <StudyNotice
          action={{ label: "Close", onClick: close }}
          icon={Layers}
          sentence="Ask Nemesis AI to make flashcards from a note, and they will show up here."
          title="No cards in this deck yet"
        />
      ) : (
        // 🔴 A FLEX CHILD WITH A FLOOR. The player is `h-full` inside, so it needs a parent with a height to fill.
        <div className="min-h-0 flex-1">
          <ReviewSession
            cards={cards}
            deck={deck}
            onOpenChange={(next) => {
              if (!next) close();
            }}
            open
            settings={REVIEW_DEFAULTS}
            simple
            surface="bare"
          />
        </div>
      )}
    </main>
  );
}
