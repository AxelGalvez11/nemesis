"use client";

// One row in the history card: a line of text, and a filled shape when it is the one you are on.
//
// 🔴 ONE LINE. NO DOT, NO CLOCK, NO PREVIEW, NO KIND BADGE. The first version had a ● / ○ mark, a
// second line of context and a hover timestamp; the owner's screenshot has none of them, and it is
// right — a list of ten rows each carrying three pieces of information is a table, and a table is
// something you study rather than something you glance at. What a learner needs to find the moment
// again is the sentence they typed.
//
// 🔴 THE ACTIVE ROW IS A FILLED SHAPE, NOT A COLOURED ONE. Monochrome is the house rule, so the
// only thing available to say "this one" is contrast and fill — which is also what the screenshot
// does, and what survives both themes without a palette.

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";

export function CanvasHistoryRow({
  active,
  entry,
  innerRef,
  onSelect,
}: {
  active: boolean;
  entry: CanvasHistoryEntry;
  /** Set on the active row only, so the card can scroll it into view when it opens. */
  innerRef?: React.Ref<HTMLButtonElement>;
  onSelect: () => void;
}) {
  return (
    <button
      // 🔴 `aria-current`, NOT `aria-selected`. This is a set of destinations with one of them
      // showing, which is what `current` means; `selected` belongs to a listbox the learner is
      // choosing FROM, and a screen reader announces the two differently.
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150 focus-visible:outline-none",
        active
          ? "bg-(--ui-bg-tertiary)"
          : "hover:bg-(--ui-bg-tertiary) focus-visible:bg-(--ui-bg-tertiary)",
      )}
      onClick={onSelect}
      ref={innerRef}
      type="button"
    >
      {/* 🔴 THE TEXT IS IN A SPAN AND THE SIZE LIVES ON THE SPAN. `[data-workspace] button { font:
          inherit }` sits in `@layer base` (desktop-chrome.css) so a utility still wins — but a
          span is the shape the rest of this feature already uses, and it keeps the button free to
          be a box.

          🔴🔴 STILL `--canvas-text-small` (14px), AND THAT IS A CONSTRAINT RATHER THAN A CHOICE.
          Owner asked why this is not as compact as ChatGPT's list; part of the honest answer is
          that ChatGPT's rows are about 13px and §46.3 declares five sizes — 12, 14, 16, 18, 24 —
          with `canvas-shell.test.ts` failing the build on anything else. 13px would be a sixth
          step nobody chose. So the row got tighter by 11px of padding instead, which is where the
          bulk was: 42px tall became 31px without inventing a font size. */}
      <span
        className={cn(
          "block truncate text-[length:var(--canvas-text-small)] leading-snug",
          active ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary)",
        )}
      >
        {entry.title}
      </span>
    </button>
  );
}
