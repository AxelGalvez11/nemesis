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
      {/* 🔴 CHATGPT WORK'S ROW, MEASURED 2026-09-06 (docs/chatgpt-work-chat-reference.md §3) — a
          16px/20 tertiary button "Worked for 2m 14s" with a 16px chevron 4px after it, in a row
          that closes with a hairline (`pb-2 border-b`); pressing it opens the log in place. No
          shimmer: the work is over. */}
      <div className="border-b border-(--ui-stroke-secondary) pb-[8px]">
        <button
          aria-expanded={open}
          className="flex items-center gap-[4px] text-[length:var(--canvas-text-body)] leading-[20px] text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-secondary)"
          onClick={() => setOpen((was) => !was)}
          type="button"
        >
          <span>{workedForLabel(seconds)}</span>
          <Icon aria-hidden className="shrink-0" name={open ? "chevron-down" : "chevron-right"} size={16} />
        </button>
      </div>
      {open ? (
        <ul className="m-0 mt-[16px] flex list-none flex-col gap-[16px] p-0 text-[length:var(--canvas-text-body)] leading-[24px] text-(--ui-text-tertiary)">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
