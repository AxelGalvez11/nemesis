"use client";

// The Canvas while the learner is looking at something that already happened.
//
// 🔴 IT REPLACES THE LIVE SURFACE RATHER THAN JOINING IT, AND IT IS NOT A REGION IN
// `composeSurface`. That function decides which LIVE things may share the sheet — a reply, a
// teaching screen, a document — and its whole subject is competition for attention between things
// that are all happening now. History is not competing with them; it is a different mode of the
// whole Canvas. Adding it as a region would have made every existing rule in that file answer a
// question it was not written for.
//
// 🔴 READ-ONLY, AND NOTHING HERE CAN WRITE. There is no composer, no Continue, no answer sink.
// `reconstructMoment` returns a value and the learner model is a projection of an append-only
// table, so "rewinding does not roll back mastery" holds by construction rather than by care.
//
// 🔴 THE BANNER IS RESTRAINED AND PERMANENT WHILE IT APPLIES. Owner: *"Clearly see that I am
// viewing history."* One line, one control, no colour, no icon — but never absent, because the one
// genuinely dangerous state for this feature is a learner who thinks an old answer is the new one.

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { cn } from "@/lib/utils";

import type { HistoricalMoment } from "@/lib/learn/canvas-history";
import { momentClock } from "@/lib/learn/canvas-history";

export function CanvasHistoryView({
  moment,
  onReturn,
}: {
  moment: HistoricalMoment;
  onReturn: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pt-8">
      {/* ── the banner ──────────────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-(--ui-stroke-secondary) pb-3">
        <span className="min-w-0 truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          Viewing earlier moment
          {momentClock(moment.occurredAt) && ` · ${momentClock(moment.occurredAt)}`}
        </span>
        <button
          className="shrink-0 rounded-md px-2 py-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors duration-150 hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--ui-stroke-primary)"
          onClick={onReturn}
          type="button"
        >
          Return to now
        </button>
      </div>

      {/* ── what happened ───────────────────────────────────────────────────────────────── */}
      <div className="canvas-swap space-y-5">
        {moment.missing && (
          <p className="text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-tertiary)">
            {/* 🔴 NAMES THE CAUSE. "Nothing to show" reads as a bug; this reads as a fact about the
                canvas, which is what it is. */}
            This moment is on the record, but what it pointed at is no longer on this Canvas.
          </p>
        )}

        {moment.asked && <Said label="You asked" text={moment.asked} />}
        {moment.said && <Body label="Nemesis" text={moment.said} />}
        {moment.question && <Body label="Question" text={moment.question} />}
        {moment.answer && <Said label="You answered" text={moment.answer} />}
        {moment.feedback && <Body label="Correction" text={moment.feedback} />}

        {moment.sourceTitles?.length && (
          <div>
            <Label>Attached</Label>
            <ul className="space-y-1">
              {moment.sourceTitles.map((title) => (
                <li
                  className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
                  key={title}
                >
                  {title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {moment.truncated && (
          <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            {/* 🔴 SAID PLAINLY RATHER THAN HIDDEN BY AN ELLIPSIS. A clipped answer that looks whole
                is worse than a short one that admits it — see MAX_ASSISTANT_TEXT. */}
            Only the start of this was kept.
          </p>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-tertiary)">
      {children}
    </span>
  );
}

/** The learner's own words. Set apart, because whose words they are is the point. */
function Said({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p
        className={cn(
          "border-l border-(--ui-stroke-secondary) pl-3",
          "text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)",
        )}
      >
        {text}
      </p>
    </div>
  );
}

/** Anything Nemesis produced. 🔴 THE SAME RENDERER THE LIVE REPLY USES, so a rewound answer keeps
 *  its formatting and its maths instead of turning into a wall of raw markdown. */
function Body({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <AssistantMarkdown
        className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
        singleDollarMath
        text={text}
      />
    </div>
  );
}
