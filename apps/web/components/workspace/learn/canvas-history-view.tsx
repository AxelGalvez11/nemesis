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
//
// 🔴🔴 THIS IS THE ONE PLACE THE LEARNER'S OWN WORDS APPEAR AS A BUBBLE, AND THE OWNER DREW THAT
// LINE HIMSELF (2026-08-26): *"the Canvas should pretty much just be like a regular conversation in
// ChatGPT. We're pretty much just gonna hide the messaging bubble except when user goes back with
// the rail. And then it pretty much just makes it easier to navigate."*
//
// The live canvas keeps contract rule 2: one exchange on the surface, the learner's sentence not
// rendered at all, the answer standing alone. That rule is about ATTENTION — what you are looking
// at NOW — and it has nothing to say about a moment you have deliberately gone back to read. There,
// the question is the only thing that makes the answer legible: "it depends on the solvent" means
// nothing without what was asked. So a rewound moment is drawn as the EXCHANGE it was.
//
// 🔴 `LearnerUtterance`, NOT A SECOND TREATMENT OF THE SAME THING. That component's header states
// the rule: §46.2 asks that a learner "be able to distinguish instantly: This came from me / This
// came from Nemesis", and that only holds if their words look the same every time they appear. What
// was here before was a grey left-bordered quote under an uppercase "You asked" label, invented for
// this screen alone, so the learner's words looked one way in the policy lane and another way here.
//
// 🔴 AND THE UPPERCASE LABELS WENT WITH IT. "YOU ASKED" over the learner's own sentence and
// "NEMESIS" over the answer are stage directions: the bubble already says whose words those are,
// which is the entire argument `LearnerUtterance` was written on. `Question` and `Correction` keep
// theirs, because those come from the policy lane and are NOT the same object as a chat answer.

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";

import type { HistoricalMoment } from "@/lib/learn/canvas-history";
import { momentClock } from "@/lib/learn/canvas-history";

import { LearnerUtterance } from "./learner-utterance";

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

        {/* 🔴 THE ORDER IS THE ORDER IT HAPPENED IN, WHICH IS WHAT MAKES IT READ AS A CONVERSATION
            RATHER THAN AS A RECORD: what they said, then what came back. It was already in this
            order; what changed is that their half now looks like theirs.

            🔴 `via={null}`, DELIBERATELY. `LearnerUtterance`'s default is `"typed"`, and a moment on
            the record does not keep how the words arrived — stamping every rewound sentence as
            typed would put a claim in the DOM that nothing established, which is exactly the quiet
            fabrication that prop's own documentation refuses. */}
        {moment.asked && <LearnerUtterance via={null}>{moment.asked}</LearnerUtterance>}
        {moment.said && <Body text={moment.said} />}
        {moment.question && <Body label="Question" text={moment.question} />}
        {moment.answer && <LearnerUtterance via={null}>{moment.answer}</LearnerUtterance>}
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

/**
 * Anything Nemesis produced.
 *
 * 🔴 THE SAME RENDERER THE LIVE REPLY USES, so a rewound answer keeps its formatting and its maths
 * instead of turning into a wall of raw markdown.
 *
 * 🔴 THE LABEL IS OPTIONAL NOW, AND ITS ABSENCE IS THE COMMON CASE. A chat answer sitting under the
 * learner's bubble needs no "NEMESIS" over it for the same reason a chat interface does not print
 * one: the bubble above it already said who the other party was, and everything on this surface
 * that is not in a bubble is Nemesis. A `question` or a `feedback` keeps its label, because those
 * are objects from the policy lane rather than a reply, and without a word for it a correction
 * would read as a second answer.
 */
function Body({ label, text }: { label?: string; text: string }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <AssistantMarkdown
        className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
        singleDollarMath
        text={text}
      />
    </div>
  );
}
