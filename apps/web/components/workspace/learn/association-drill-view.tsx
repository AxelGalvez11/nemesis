"use client";

// The association drill, rendered.
//
// 🔴 THIS COMPONENT HAS NO INPUT OF ITS OWN. The learner answers in the persistent composer,
// the same one they use for everything else on the canvas. A drill that grew its own answer box
// would be the second answer surface on the page, which is the exact thing the composer work
// removed — and it would be a third one on the day a different knowledge type needs a box too.
//
// 🔴 AND THERE IS NO REVEAL CONTROL. Not a "show answer" button, not a tap-to-flip card. Shown
// the answer, almost everyone thinks "yes, that one" and the retrieval that would have built the
// memory never happens. The only way to see the answer is to say you cannot produce it, which
// is recorded as a failed retrieval — honest, and better evidence than a peek.
//
// The three states are three genuinely different cognitive moments, and they are allowed to
// look different. Encoding is reading. Retrieval is production. A contrast is two things held
// against each other. There is no requirement that the surface stay visually constant when the
// cognitive task changes.

import { answerFor, cueFor } from "@/lib/learn/association-drill";
import type { DrillStep } from "@/lib/learn/association-drill";
import { cn } from "@/lib/utils";

interface AssociationDrillViewProps {
  step: DrillStep;
  /** How many productions are still owed. A count, never a percentage. */
  remaining: number;
  /** Feedback on the previous attempt, shown briefly and without ceremony. */
  lastResult: { correct: boolean; expected: string; said: string } | null;
  onAdmit: () => void;
  /** Encoding is reading, so it ends when the learner says it does. */
  onEncoded: () => void;
}

export function AssociationDrillView({
  step,
  remaining,
  lastResult,
  onAdmit,
  onEncoded,
}: AssociationDrillViewProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 pb-40 pt-4">
      <div className="w-full max-w-(--canvas-column)">
        {step.kind === "encode" && <Encode step={step} onEncoded={onEncoded} />}
        {step.kind === "contrast" && <Contrast step={step} />}
        {step.kind === "retrieve" && <Retrieve remaining={remaining} step={step} onAdmit={onAdmit} />}

        {/* Correct answers get no explanation and no celebration — the brief asks for speed, and
            a paragraph of praise after "Zestril" is friction pretending to be encouragement. */}
        {lastResult && step.kind !== "encode" && (
          <p
            className={cn(
              "mt-6 text-[length:var(--canvas-text-small)]",
              lastResult.correct ? "text-(--ui-text-quaternary)" : "text-(--ui-text-secondary)",
            )}
            data-selectable-text="true"
          >
            {lastResult.correct ? (
              "Correct."
            ) : (
              <>
                <span className="text-(--ui-text-quaternary)">You said {lastResult.said || "nothing"} — it&apos;s </span>
                <span className="font-medium text-(--ui-text-primary)">{lastResult.expected}</span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** Read this set, then it goes away. The only moment answers are on screen. */
function Encode({ step, onEncoded }: { step: DrillStep; onEncoded: () => void }) {
  return (
    <div>
      {step.grouped && step.pairs[0]?.groupLabel && (
        <p className="text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
          {step.pairs[0].groupLabel}
        </p>
      )}
      <p className="mt-3 text-[length:var(--canvas-text-body)] text-(--ui-text-tertiary)">Read these, then they disappear.</p>

      <dl className="mt-5 space-y-2.5" data-selectable-text="true">
        {step.pairs.map((pair) => (
          <div className="flex items-baseline gap-3" key={pair.id}>
            <dt className="min-w-[9rem] text-[length:var(--canvas-text-lead)] text-(--ui-text-primary)">{pair.left}</dt>
            <dd className="text-[length:var(--canvas-text-lead)] text-(--ui-text-secondary)">{pair.right}</dd>
          </div>
        ))}
      </dl>

      <button
        className="mt-8 rounded-full bg-(--ui-text-primary) px-5 py-2.5 text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor)"
        onClick={onEncoded}
        type="button"
      >
        I&apos;ve read these
      </button>
    </div>
  );
}

/** Two items the learner is swapping, held against each other.
 *
 *  Shown together and only briefly: the point is the contrast itself, which is what a list of
 *  ten interleaved items can never make. Both are tested immediately afterwards. */
function Contrast({ step }: { step: DrillStep }) {
  return (
    <div>
      <p className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-secondary)" data-selectable-text="true">
        These two are getting mixed up. They are not interchangeable:
      </p>

      <div className="mt-5 space-y-3" data-selectable-text="true">
        {step.pairs.map((pair) => (
          <div className="flex items-baseline gap-3" key={pair.id}>
            <span className="min-w-[9rem] text-[length:var(--canvas-text-lead)] font-medium text-(--ui-text-primary)">{pair.left}</span>
            <span className="text-[length:var(--canvas-text-lead)] text-(--ui-text-primary)">{pair.right}</span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
        Both come back straight away.
      </p>
    </div>
  );
}

/** Produce the answer. The ordinary step, and the one that must stay fast. */
function Retrieve({
  step,
  remaining,
  onAdmit,
}: {
  step: DrillStep;
  remaining: number;
  onAdmit: () => void;
}) {
  const pair = step.pairs[0];
  if (!pair) return null;

  return (
    <div>
      {/* The heading is shown only while it is still a scaffold. Once initial learning is done
          it is withdrawn, because "which ARB is Diovan?" answers itself when everything on
          screen is an ARB. */}
      {step.grouped && pair.groupLabel && (
        <p className="text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">{pair.groupLabel}</p>
      )}

      <p
        className="mt-3 text-[length:var(--canvas-text-title)] font-medium leading-tight text-(--ui-text-primary)"
        data-selectable-text="true"
      >
        {cueFor(pair, step.direction)}
      </p>

      <div className="mt-8 flex items-center gap-5">
        <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{remaining} to go</span>
        {/* 🔴 Quiet, and deliberately not the obvious control. "I don't know" is genuinely
            better evidence than a reveal, but it must not become the fast path through the
            drill. */}
        <button
          className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) underline-offset-2 hover:text-(--ui-text-secondary) hover:underline"
          onClick={onAdmit}
          type="button"
        >
          I don&apos;t know
        </button>
      </div>
    </div>
  );
}

/** What the composer should say it wants, for this step. */
export function drillPlaceholder(step: DrillStep): string {
  if (step.kind === "encode") return "Read them, then continue…";
  const pair = step.pairs[0];
  if (!pair) return "Answer…";
  return step.direction === "forward" ? "The name it goes by…" : "The one it matches…";
}

/** The answer the current step expects, for grading. */
export function drillExpected(step: DrillStep): string {
  const pair = step.pairs[0];
  return pair ? answerFor(pair, step.direction) : "";
}
