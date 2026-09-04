"use client";

// What is left in the thinking slot once the answer has landed: how long the turn worked, and
// the lines it showed while it did.
//
// 🔴🔴 THE FINISHED STATE THE REFERENCE HAS AND THIS APP NEVER BUILT. `canvas-thinking-preview.tsx`
// records the measurement: *"A finished one reads 'Worked for 59s' in the same slot."* Until
// 2026-09-03 the live line simply vanished when the answer arrived, so the plan lines the model
// wrote were unreadable after the fact. Owner, same day: *"it should give like reasoning preview
// like every model does nowadays, like the reasoning summary."*
//
// 🔴 IT IS NOT A TRANSCRIPT, AND THE OWNER'S 2026-08-21 RULING STILL HOLDS: *"it should not remain
// as a separate reasoning transcript below the answer."* This is one line ABOVE the answer, in the
// slot the live caption occupied, and what it opens is the same handful of learner-facing lines
// the model wrote for the learner, already refused one by one by `turn-preview.ts`. Raw reasoning
// never reaches this file; there is no path for it to.
//
// 🔴 ONLY WHEN THE TURN DID WORK. A greeting that answered in a second has nothing to summarise,
// and a row that says "Worked for 1s" under "hi" teaches the learner the row means nothing. The
// caller decides by whether any line was shown; this component only draws.

import { useState } from "react";

import { Icon } from "@/components/icons";
import { workedForLabel } from "@/lib/learn/worked-for";

export function CanvasThinkingSummary({ lines, seconds }: { lines: readonly string[]; seconds: number }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-2" data-canvas-thinking-summary="">
      {/* 🔴 THE SAME SLOT, THE SAME 16/24 TYPE, AND NO SHIMMER: the work is over. Tertiary rather
          than secondary because a settled fact sits back from the answer it introduces. */}
      <button
        aria-expanded={open}
        className="flex items-center gap-[6px] rounded-[6px] text-[length:var(--canvas-text-body)] leading-[24px] text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-secondary)"
        onClick={() => setOpen((was) => !was)}
        type="button"
      >
        <span>{workedForLabel(seconds)}</span>
        <Icon
          aria-hidden
          className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          name="chevron-right"
          size={16}
        />
      </button>
      {open ? (
        // 🔴🔴 THE LINES BREATHE NOW, AND THEY DID NOT. Owner, 2026-09-03: *"I like the way it says
        // worked for six seconds, but the thing under it just doesn't look well spaced like the
        // other things."* It was `mt-1` and `gap-[2px]` — 4.5px above and 2px between, under a
        // 16/24 row — so two steps read as one blob of grey stuck to the button. Everything else in
        // this conversation is set on a 24 or 26px rhythm; these were on 20 with no air at all.
        //
        // 🔴 AND THEY LINE UP UNDER THE WORDS, NOT UNDER THE ARROW. The row above is text first and
        // its chevron after, so the steps sit flush with "Worked for" — the same rule
        // `canvas-thinking-preview.tsx` states for its own chips, applied to a row whose mark is on
        // the other side.
        <ul className="m-0 mt-[10px] flex list-none flex-col gap-[6px] p-0 text-[length:var(--canvas-text-small)] leading-[22px] text-(--ui-text-tertiary)">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
