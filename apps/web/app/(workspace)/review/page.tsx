"use client";

// Review: every card that is due, across every deck, one after another.
//
// 🔴🔴 THIS EXISTS BECAUSE THE STUDY PAGE DOES NOT. Reviewing used to be reachable only through a
// deck (the Study tab's rows, a canvas output, a Library shelf), so when the Study page was removed
// there was no longer any way to simply sit down and do the cards that are due. The Flashcards tab's
// "Review due cards (N)" row opens this, and the number on that row is counted by the same rule this
// page reviews by (lib/space/due-cards.ts).
//
// 🔴🔴 IT IS A DOOR ONTO THE EXISTING PLAYER, NOT A SECOND REVIEW SCREEN. Every card below the bar
// is drawn by `ReviewSession`, which is what the canvas and a single deck mount, in the two-button
// shape the owner chose on 2026-09-07 (`simple`, plus the Track learning switch) and without a
// dialog of its own (`surface="bare"`), because this page already owns the screen. A second review
// screen is how two surfaces start disagreeing about what a review looks like, and only one of them
// would get the next fix.
//
// 🔴 THE FRAME IS THE DESIGN SYSTEM'S (components/space/study-frame.tsx): the same bar and notices a
// deck opens with from the Flashcards tab, so the two study screens beside the sidebar cannot
// disagree about their chrome.

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { StudyLoading, StudyNotice, StudyTopBar } from "@/components/space/study-frame";
import { REVIEW_DEFAULTS } from "@/components/workspace/study/deck-review";
import { ReviewSession } from "@/components/workspace/study/review-session";
import { dueCardsForReview, nextDueAfter, REVIEW_DECK_ID } from "@/lib/space/due-cards";
import { type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";

/**
 * The whole collection, presented to the player as one deck. See `REVIEW_DECK_ID`: the queue filters
 * by deck id and returns nothing without one, so reviewing everything means handing it one deck.
 *
 * 🔴 THE NAME IS FOR SCREEN READERS AND NOTHING ELSE. `surface="bare"` draws no deck name at all
 * (the dialog shell is what carried it), and the learner can see which screen they are on.
 */
const ALL_DECKS: StudyDeck = {
  id: REVIEW_DECK_ID,
  name: "Review",
  description: "",
  sourcePath: null,
  createdAt: "",
  updatedAt: "",
};

/** How long until the next card, in words. Rounded UP, so it never promises a card early. */
function nextDueSentence(nextAt: number | null, now: number): string | null {
  if (nextAt === null) return null;
  const minutes = Math.max(1, Math.ceil((nextAt - now) / 60_000));
  if (minutes < 60) return `The next card is due in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `The next card is due in ${hours} hour${hours === 1 ? "" : "s"}.`;
  const days = Math.ceil(hours / 24);
  return `The next card is due in ${days} day${days === 1 ? "" : "s"}.`;
}

export default function ReviewPage() {
  const router = useRouter();
  // The session is read the way every page under (workspace) reads it: the layout gates the whole
  // route group, and this store takes the signed-in account from the same AuthProvider. A visit
  // without a session never reaches this component; it is sent to sign-in by the layout.
  const { cards, error, status } = useCloudStudy();

  /**
   * The clock the due rule reads.
   *
   * 🔴 ZERO UNTIL THE BROWSER TAKES OVER, which is deliberate rather than defensive. Picking the time
   * during render would have the server prerender one number and the client hydrate a different one.
   * Zero is the same on both sides and reads as "not ready yet", which is true.
   *
   * 🔴 AND IT TICKS, because the queue is time-dependent: a card finishing a ten-minute step has to
   * arrive on its own. Thirty seconds is the interval the player's own queue already re-runs on.
   */
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // One list, used twice: the number in the bar and the cards the player is handed. Computing the
  // count separately is exactly how a bar comes to disagree with the screen under it.
  const due = useMemo(() => (now === 0 ? [] : dueCardsForReview(cards, now)), [cards, now]);
  const waiting = useMemo(() => (now === 0 ? null : nextDueAfter(cards, now)), [cards, now]);
  const waitingSentence = nextDueSentence(waiting, now);

  // 🔴 WAIT FOR THE LOAD BEFORE MOUNTING THE PLAYER, the same rule `DeckReview` follows: handed an
  // empty list mid-fetch it would say the sitting is finished, which is the most misleading thing
  // this screen could claim. `idle` is before the first fetch has even been issued.
  const loading = now === 0 || (status !== "loaded" && status !== "error" && cards.length === 0);

  // 🔴 BACK IF THERE IS A BACK, NOTES OTHERWISE. `router.back()` alone paints nothing at all on a
  // direct load or a pasted link, and Notes is where the app opens (components/space/space-landing.ts).
  const close = () => (window.history.length > 1 ? router.back() : router.push("/home"));

  return (
    <main className="flex h-full min-h-0 flex-col" style={{ background: "var(--bg-page)" }}>
      <StudyTopBar
        crumbs={["Flashcards", "Review"]}
        detail={loading || status === "error" ? undefined : `${due.length} card${due.length === 1 ? "" : "s"} due`}
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
      ) : due.length === 0 ? (
        <StudyNotice
          action={{ label: "Close", onClick: close }}
          icon={CircleCheck}
          sentence={waitingSentence ?? "When a card is due, it shows up here."}
          title="Nothing is due right now"
        />
      ) : (
        // 🔴 A FLEX CHILD WITH A FLOOR. The player is `h-full` inside, so it needs a parent that has
        // a height to fill rather than one that grows to whatever the card happens to be.
        <div className="min-h-0 flex-1">
          <ReviewSession
            cards={due}
            deck={ALL_DECKS}
            onOpenChange={(next) => {
              if (!next) close();
            }}
            open
            // 🔴 THE OWNER'S STATED DEFAULTS, from the one place they are written down. The Study
            // tab persisted its own per-learner settings; nothing outside it has a stored
            // preference to read, and inventing numbers here would be a second set to keep in step.
            settings={REVIEW_DEFAULTS}
            simple
            surface="bare"
          />
        </div>
      )}
    </main>
  );
}
