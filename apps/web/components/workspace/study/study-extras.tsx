"use client";

// The two things the Library still had to send people to the old Study tab for.
//
// Owner's build order, workstream F: "the Library becomes the only door. The genuinely good parts
// of the old tab move in — importing Anki decks, the hide-part-of-an-image cards, the progress
// stats."
//
// 🔴🔴 THE SAME PATTERN AS `deck-review.tsx`, AND FOR THE SAME REASON: these are DOORS onto the
// screens that already exist, not new screens. `AnkiImportDialog` and `StatsTab` are mounted
// unchanged. A Library that drew its own import wizard would be a second importer to keep in step
// with the first, and the first one already knows about media files, deck trees and the ten
// things an .apkg can be malformed in.
//
// 🔴 MOUNTED ON DEMAND, NEVER ALWAYS. Both reach `useCloudStudy()`, which loads every deck, card
// and review on the account. The Library must not pay that on arrival — the caller renders these
// only once a learner has pressed the thing, which is the one moment it is worth paying for.

import { useCallback, useMemo } from "react";

import { parseTestContent } from "@/lib/workspace/study-artifact-content";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";
import type { AttemptedTest } from "@/lib/workspace/study-stats";

import { AnkiImportDialog } from "./anki-import-dialog";
import { StatsTab } from "./stats-tab";

/** Import an Anki deck, from the Library. The dialog is the Study tab's own, unmodified. */
export function LibraryAnkiImport({ onClose }: { onClose: () => void }) {
  return (
    <AnkiImportDialog
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    />
  );
}

/**
 * What the learner has actually reviewed and sat.
 *
 * 🔴 TEST ATTEMPTS LIVE INSIDE THE ARTIFACT'S PAYLOAD, so they have to be parsed out — the Study
 * page does exactly this, and doing it differently here would make the two pages disagree about
 * how much work someone had done.
 */
export function LibraryProgress({ onClose }: { onClose: () => void }) {
  const { artifacts, reviews } = useCloudStudy();
  const tests: AttemptedTest[] = useMemo(
    () =>
      artifacts
        .filter((item) => item.kind === "test")
        .map((item) => ({ attempts: parseTestContent(item.content)?.attempts ?? [], title: item.title })),
    [artifacts],
  );
  // 🔴 "Go to cards" CLOSES THIS RATHER THAN NAVIGATING. Its old destination was the Study tab's
  // own cards section, which is a retired surface; the deck list is directly behind this overlay,
  // so closing IS going to cards. A button that navigated to a redirecting route would look like
  // it did nothing.
  const backToDecks = useCallback(() => onClose(), [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-(--ui-bg-primary)">
      <header className="flex items-center justify-between border-b border-(--ui-stroke-tertiary) px-6 py-3">
        <h2 className="text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">Progress</h2>
        <button
          aria-label="Close progress"
          className="rounded-lg bg-transparent px-2 py-1 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <StatsTab onStartReview={backToDecks} reviews={reviews} tests={tests} />
      </div>
    </div>
  );
}
