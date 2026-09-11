"use client";

// Review: every card that is due, across every deck, one after another.
//
// 🔴🔴 THIS EXISTS BECAUSE THE STUDY PAGE DOES NOT. Reviewing used to be reachable only through a
// deck — the Study tab's rows, a canvas output, a Library shelf — so when the Study page was removed
// there was no longer any way to simply sit down and do the cards that are due. The sidebar's
// "Review due cards (N)" row opens this, and the number on that row is counted by the same rule this
// page reviews by (lib/space/due-cards.ts).
//
// 🔴🔴 IT IS A DOOR ONTO THE EXISTING PLAYER, NOT A SECOND REVIEW SCREEN. Every pixel below the
// header is `ReviewSession`, which is what the canvas and the Study tab have always mounted, in the
// two-button shape the owner chose on 2026-09-07 (`simple`, plus the Track learning switch) and
// without a dialog of its own (`surface="bare"`), because this page already owns the screen. A second
// review screen is how two surfaces start disagreeing about what a review looks like, and only one of
// them would get the next fix.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import { CHROME } from "@/components/workspace/learn/reader-chrome";
import { REVIEW_DEFAULTS } from "@/components/workspace/study/deck-review";
import { ReviewSession } from "@/components/workspace/study/review-session";
import { dueCardsForReview, nextDueAfter, REVIEW_DECK_ID } from "@/lib/space/due-cards";
import { type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

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

  // One list, used twice: the number in the header and the cards the player is handed. Computing the
  // count separately is exactly how a header comes to disagree with the screen under it.
  const due = useMemo(() => (now === 0 ? [] : dueCardsForReview(cards, now)), [cards, now]);
  const waiting = useMemo(() => (now === 0 ? null : nextDueAfter(cards, now)), [cards, now]);
  const waitingSentence = nextDueSentence(waiting, now);

  // 🔴 WAIT FOR THE LOAD BEFORE MOUNTING THE PLAYER, the same rule `DeckReview` follows: handed an
  // empty list mid-fetch it would say the sitting is finished, which is the most misleading thing
  // this screen could claim. `idle` is before the first fetch has even been issued.
  const loading = now === 0 || (status !== "loaded" && status !== "error" && cards.length === 0);

  // 🔴 BACK IF THERE IS A BACK, CHAT OTHERWISE — the pattern /deck already uses. `router.back()`
  // alone paints nothing at all on a direct load or a pasted link, which is the failure mode of
  // every control that changes state and leaves the screen as it was.
  const close = () => (window.history.length > 1 ? router.back() : router.push("/ai"));

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <div className={cn("shrink-0 border-b border-(--ui-stroke-tertiary)", CHROME.header)}>
        <button aria-label="Close" className={CHROME.button} onClick={close} title="Close" type="button">
          <Codicon name="close" size={CHROME.icon} />
        </button>
        <span className={cn(CHROME.crumb, "min-w-0 flex-1")}>
          Review
          {!loading && status !== "error" && (
            <span className="text-(--ui-text-quaternary)">
              &nbsp;/&nbsp;{due.length} card{due.length === 1 ? "" : "s"} due
            </span>
          )}
        </span>
      </div>

      {loading ? (
        <p className="grid min-h-0 flex-1 place-items-center px-6 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
          Opening your cards…
        </p>
      ) : status === "error" ? (
        <p className="grid min-h-0 flex-1 place-items-center px-6 text-center text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
          {error ?? "Your cards could not be loaded."}
        </p>
      ) : due.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
          <div>
            <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">Nothing is due right now.</p>
            {waitingSentence && <p className="mt-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{waitingSentence}</p>}
          </div>
        </div>
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
