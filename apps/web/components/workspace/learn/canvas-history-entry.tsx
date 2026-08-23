"use client";

// One row in the history drawer: a mark, a short title, and at most one line under it.
//
// 🔴 NAVIGATION, NOT A TRANSCRIPT. Owner: *"Do not put the entire message transcript inside the
// drawer."* So a row carries what is needed to RECOGNISE a moment and nothing more — the answer
// itself belongs on the Canvas, which is where clicking this row puts it.
//
// 🔴 NO KIND BADGE, NO COLOUR PER TYPE, NO ICON PER TYPE. A ten-value legend down the side of a
// drawer is the "colourful timeline" and the "git commit history" the brief rules out twice. The
// only thing the mark encodes is whether this row is the one being viewed.

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";
import { momentClock } from "@/lib/learn/canvas-history";

export function CanvasHistoryRow({
  active,
  entry,
  onSelect,
}: {
  active: boolean;
  entry: CanvasHistoryEntry;
  onSelect: () => void;
}) {
  return (
    <button
      // 🔴 `aria-current`, NOT `aria-selected`. This is a set of destinations with one of them
      // showing, which is what `current` means; `selected` belongs to a listbox the learner is
      // choosing FROM, and a screen reader announces the two differently.
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150",
        "hover:bg-(--ui-bg-tertiary) focus-visible:bg-(--ui-bg-tertiary) focus-visible:outline-none",
      )}
      onClick={onSelect}
      type="button"
    >
      {/* The mark. Filled while this row is the one on screen, hollow otherwise — the brief's own
          ● / ○, which needs no colour to carry the distinction. */}
      <span
        aria-hidden
        className={cn(
          "mt-[0.4em] size-[5px] shrink-0 rounded-full border transition-colors duration-150",
          active
            ? "border-(--ui-text-primary) bg-(--ui-text-primary)"
            : "border-(--ui-text-tertiary) bg-transparent group-hover:border-(--ui-text-secondary)",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[length:var(--canvas-text-small)] leading-snug",
            active ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary)",
          )}
        >
          {entry.title}
        </span>
        {entry.preview && (
          <span className="mt-0.5 block truncate text-[length:var(--canvas-text-meta)] leading-snug text-(--ui-text-tertiary)">
            {entry.preview}
          </span>
        )}
      </span>
      {/* 🔴 THE CLOCK IS THE LAST THING AND THE QUIETEST. The brief bans timestamps from the
          COLLAPSED rail, not from the drawer — and "was that before or after I uploaded the
          lecture" is the question a history drawer exists to answer. */}
      <span
        aria-hidden
        className="mt-[0.15em] shrink-0 text-[length:var(--canvas-text-meta)] tabular-nums leading-snug text-(--ui-text-tertiary) opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {momentClock(entry.createdAt)}
      </span>
    </button>
  );
}
