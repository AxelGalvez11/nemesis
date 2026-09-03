"use client";

// The bar under an artifact opened from the Library: ask a question about the thing you are
// reading, and land in a new conversation that is already holding it.
//
// 🔴🔴 MEASURED ON THE REFERENCE, 2026-09-01, in the owner's signed-in Chrome at 1470x836: a
// 604x52 pill at radius 28, centred in the pane, 25px clear of the bottom, reading "Ask about this
// file". It FLOATS over the artifact rather than taking a row from it — theirs does, and a bar that
// pushed the page up would reflow a document every time it appeared. Whatever scrolls behind it
// gains matching room below so the last line is never parked underneath.
//
// 🔴🔴 ONE COPY SINCE 2026-09-03, AND IT WAS THREE. The document reader and the deck page each
// carried their own hand-typed version of the markup above, and the flashcard panel carried none —
// which is what the owner was looking at when he said *"it should be the same, like basically the
// one that has for the document."* Three copies of a measured control drift the first time one is
// adjusted; a component cannot.
//
// 🔴 THE HOST DECIDES WHETHER TO DRAW IT. Only the Library passes an `onAsk`. Docked beside a
// conversation the bar would be the second composer on screen, with the wrong one nearer.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

export function ReaderAsk({ className, label, onAsk }: {
  /** For a host with its own stacking or printing rules — `/deck` hides this bar when printing. */
  className?: string;
  /** What this bar is asking about, for a screen reader — the artifact's own title. */
  label: string;
  /** Called with the trimmed question. The host attaches the artifact and opens the canvas. */
  onAsk: (question: string) => void;
}) {
  const [question, setQuestion] = useState("");

  return (
    <form
      className={cn("pointer-events-none absolute inset-x-0 bottom-[25px] flex justify-center px-[24px]", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const asked = question.trim();
        if (!asked) return;
        onAsk(asked);
      }}
    >
      <div className="pointer-events-auto flex h-[52px] w-full max-w-[604px] items-center gap-[8px] rounded-[28px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) pl-[20px] pr-[6px] shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <input
          aria-label={`Ask about ${label}`}
          // 🔴 §46.3-exempt: this shares the reference's own 16px, which is also the iOS zoom
          // threshold for an input — not a step on the canvas type scale.
          className="min-w-0 flex-1 bg-transparent text-[16px] leading-[26px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about this file"
          value={question}
        />
        <button
          aria-label="Ask"
          className="grid size-[40px] shrink-0 place-items-center rounded-full bg-(--ui-action) text-(--ui-action-glyph) transition-opacity disabled:opacity-30"
          disabled={question.trim() === ""}
          type="submit"
        >
          <Codicon name="arrow-up" size="20px" />
        </button>
      </div>
    </form>
  );
}

/** The room an ask bar floats over needs this much clearance, or the last line hides behind it. */
export const ASK_CLEARANCE = "pb-[101px]";
