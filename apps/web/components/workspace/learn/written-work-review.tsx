"use client";

// Showing a learner what Nemesis read off their page, and letting them fix it, BEFORE anything is
// judged.
//
// 🔴 THIS IS THE STEP THAT STOPS UNCERTAIN HANDWRITING BECOMING A FAILURE THEY DID NOT EARN, and
// it is the owner's single most important requirement for this path. Everything else here is
// convenience; this is the safety property. `writtenSubmissionGate` decides when it appears, and
// there is deliberately no way to skip past it from the sheet: the submit control renders inside
// this component, not beside it.
//
// 🔴 IT SHOWS EVERY MARK SEPARATELY, NOT ONE BLOCK OF TEXT. Handing back a flattened paragraph to
// edit would technically let someone correct a misreading and would in practice mean nobody ever
// did: the point of uncertainty is that the learner cannot see WHICH part we were unsure of. Each
// row says what it is, and the parts we could not read at all say so in their own words rather
// than sitting in the text as something they appear to have written.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { WrittenMark, WrittenMarkKind, WrittenWork } from "@/lib/handwriting/written-work";
import { CONFIDENT_ENOUGH_TO_JUDGE, type LearnerReading } from "@/lib/learn/written-response";
import { cn } from "@/lib/utils";

interface WrittenWorkReviewProps {
  work: WrittenWork;
  /** Why this step appeared, in the gate's own words. */
  reason: string;
  /** The learner is done correcting. Submitting is the caller's to do. */
  onConfirm: (reading: LearnerReading) => void;
  onCancel: () => void;
  busy: boolean;
}

/** What each row is, in plain words, so a learner knows which of their marks they are looking at.
 *  Structural rather than subject matter: the same five words serve a derivation and a diagram. */
const ROW_LABEL: Record<WrittenMarkKind, string> = {
  annotation: "Note",
  connector: "Arrow or line",
  figure: "Drawing",
  label: "Label",
  line: "Line",
};

/** A mark Nemesis was unsure of, or could not read at all. Drawn differently so the learner's eye
 *  goes to the parts that actually need them, rather than to a wall of identical rows. */
function needsAttention(mark: WrittenMark): boolean {
  return !mark.legible || mark.confidence === null || mark.confidence < CONFIDENT_ENOUGH_TO_JUDGE;
}

export function WrittenWorkReview({ work, reason, onConfirm, onCancel, busy }: WrittenWorkReviewProps) {
  // 🔴 SEEDED FROM WHAT WAS READ, AND AN UNREAD MARK SEEDS EMPTY. Its `text` is a description of a
  // gap ("two lines under the diagram"), and putting that in the box would invite the learner to
  // press confirm on words they never wrote.
  const [values, setValues] = useState<string[]>(() => work.marks.map((mark) => (mark.legible ? mark.text : "")));
  const [finalAnswerIndex, setFinalAnswerIndex] = useState<number | null>(work.finalAnswerIndex);

  const setAt = (index: number, value: string) =>
    setValues((previous) => previous.map((held, at) => (at === index ? value : held)));

  return (
    <div className="flex max-h-[min(70vh,620px)] flex-col gap-3 overflow-hidden rounded-[26px] bg-(--ui-bg-elevated) p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
      <div className="flex items-start gap-2">
        <Codicon className="mt-[3px] shrink-0 text-(--ui-text-quaternary)" name="eye" size="16px" />
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">{reason}</p>
      </div>

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
        {work.marks.map((mark, index) => (
          <div
            className={cn(
              "flex flex-col gap-1 rounded-2xl px-3 py-2 ring-1",
              needsAttention(mark) ? "bg-(--ui-bg-tertiary) ring-(--ui-action)/40" : "ring-(--ui-stroke-tertiary)",
            )}
            key={index}
          >
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
                {ROW_LABEL[mark.kind]}
              </span>
              {mark.struckThrough && (
                <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                  you crossed this out
                </span>
              )}
              {!mark.legible && (
                <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                  not read: {mark.text}
                </span>
              )}
            </div>
            {/* §46.3-exempt: iOS Safari zooms the whole viewport in on focus for any text input
                under 16px, and there is no way back out of that zoom that reads as intentional.
                This is a real input a learner types corrections into on a phone, so the same
                platform threshold the composer's own textarea is exempt for applies here. It is a
                platform constraint, not a typographic choice, and must not be "fixed" onto the
                scale by a later tidy-up. */}
            <input
              aria-label={`${ROW_LABEL[mark.kind]} ${index + 1}`}
              className="w-full bg-transparent text-[16px] leading-[26px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
              disabled={busy}
              onChange={(event) => setAt(index, event.target.value)}
              placeholder={mark.legible ? "Leave empty to remove this" : "Type what this says, or leave it empty"}
              value={values[index] ?? ""}
            />
            <label className="flex items-center gap-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
              <input
                checked={finalAnswerIndex === index}
                disabled={busy}
                name="written-work-final-answer"
                onChange={() => setFinalAnswerIndex(index)}
                type="radio"
              />
              This is my final answer
            </label>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
          disabled={busy || finalAnswerIndex === null}
          onClick={() => setFinalAnswerIndex(null)}
          type="button"
        >
          No final answer on this page
        </button>
        <div className="flex items-center gap-2">
          <button
            aria-label="Back to my page"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            disabled={busy}
            onClick={onCancel}
            title="Back to my page"
            type="button"
          >
            <Codicon name="close" size="18px" />
          </button>
          {/* 🔴 THE ONLY WAY OUT OF THIS STEP THAT SUBMITS ANYTHING. The sheet has no submit
              control of its own while a review is open, so there is no path from an uncertain
              reading to a durable verdict that does not pass through a person reading it back. */}
          <button
            className="flex h-[36px] items-center justify-center gap-1.5 rounded-full bg-(--ui-action) px-4 text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={busy || values.every((value) => !value.trim())}
            onClick={() => onConfirm({ finalAnswerIndex, marks: values })}
            type="button"
          >
            <Codicon name={busy ? "loading" : "check"} size="16px" spinning={busy} />
            {busy ? "Submitting…" : "This is right, submit it"}
          </button>
        </div>
      </div>
    </div>
  );
}
