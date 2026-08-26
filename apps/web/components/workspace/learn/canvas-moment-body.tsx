"use client";

// One recorded moment, drawn as the exchange it was.
//
// 🔴🔴 IT IS ONE COMPONENT BECAUSE THERE ARE NOW TWO SURFACES THAT SHOW A MOMENT, AND THE RULE IS
// ABOUT RECOGNITION. `learner-utterance.tsx` states it at the level below this one: §46.2 asks that
// a learner "be able to distinguish instantly: This came from me / This came from Nemesis", and
// that only holds if their words look the same every time they appear — *"Two call sites styling it
// independently is the failure mode, and it starts the day the second call site is written."* This
// file exists because that day arrived: the rewound single moment (`canvas-history-view.tsx`) and
// the whole conversation (`canvas-conversation-view.tsx`) draw the same object, and a copy in each
// would drift the first time one of them was adjusted.
//
// 🔴 THE ORDER IS THE ORDER IT HAPPENED IN, WHICH IS WHAT MAKES IT READ AS A CONVERSATION RATHER
// THAN AS A RECORD: what they said, then what came back.
//
// 🔴 THE UPPERCASE STAGE DIRECTIONS ARE GONE AND MUST NOT COME BACK. "YOU ASKED" over the learner's
// own sentence and "NEMESIS" over the answer are labels a chat interface does not need: the bubble
// says whose words those are, which is the entire argument `LearnerUtterance` was written on.
// `Question` and `Correction` keep theirs, because those come from the POLICY lane and are not chat
// answers — an unlabelled correction reads as a second answer.
//
// 🔴 IT WRITES NOTHING, AND THAT IS STRUCTURAL RATHER THAN CAREFUL. There is no session, no policy,
// no `update()` and no handler in this file's reach. Learner state is a projection of an
// append-only table, so reading history can no more roll back mastery than looking at a photograph
// can. Asserted by name in `canvas-history-surface.test.ts`.

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { cn } from "@/lib/utils";

import type { HistoricalMoment } from "@/lib/learn/canvas-history";

import { LearnerUtterance } from "./learner-utterance";

export function CanvasMomentBody({
  learnerSide = "start",
  moment,
}: {
  /**
   * Which edge of the column the learner's bubble sits against.
   *
   * 🔴 THIS IS LAYOUT, NOT TREATMENT, AND THE DISTINCTION IS WHY IT IS ALLOWED TO EXIST. §46.2's
   * rule — the one this whole file was extracted to keep — is that the learner's words must LOOK
   * the same everywhere: same ground, same tint, same size, same radius. All of that is inside
   * `LearnerUtterance` and none of it is reachable from here. Where the bubble sits on the line is
   * the container's business, and the two containers genuinely differ:
   *
   *   `start`  — a rewound moment, alone on a sheet. There is no other side to contrast with, and
   *              a lone bubble pushed to the right edge would read as misaligned rather than as
   *              authored.
   *   `end`    — inside a run of turns, where alternating sides is what makes turn-taking legible
   *              at a glance. It is also the reference the owner named for this surface: *"pretty
   *              much just be like a regular conversation in ChatGPT"*, where the person's message
   *              is right-aligned and the assistant's answer is full-width prose.
   *
   * 🔴 IF THIS EVER GROWS A SECOND APPEARANCE PROP, IT HAS BECOME THE THING THIS FILE PREVENTS.
   * One prop about position is a container talking about its own layout; a prop about colour,
   * size or shape is two treatments arriving one field at a time.
   */
  learnerSide?: "start" | "end";
  moment: HistoricalMoment;
}) {
  const said = (children: React.ReactNode) => (
    <div className={cn("flex", learnerSide === "end" && "justify-end")}>{children}</div>
  );
  return (
    <div className="space-y-5">
      {moment.missing && (
        <p className="text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-tertiary)">
          {/* 🔴 NAMES THE CAUSE. "Nothing to show" reads as a bug; this reads as a fact about the
              canvas, which is what it is. */}
          This moment is on the record, but what it pointed at is no longer on this Canvas.
        </p>
      )}

      {/* 🔴 `via={null}`, DELIBERATELY. `LearnerUtterance`'s default is `"typed"`, and a moment on
          the record does not keep how the words arrived — stamping every stored sentence as typed
          would put a claim in the DOM that nothing established, which is exactly the quiet
          fabrication that prop's own documentation refuses. */}
      {moment.asked && said(<LearnerUtterance via={null}>{moment.asked}</LearnerUtterance>)}
      {moment.said && <MomentBody text={moment.said} />}
      {moment.question && <MomentBody label="Question" text={moment.question} />}
      {moment.answer && said(<LearnerUtterance via={null}>{moment.answer}</LearnerUtterance>)}
      {moment.feedback && <MomentBody label="Correction" text={moment.feedback} />}

      {moment.sourceTitles?.length && (
        <div>
          <MomentLabel>Attached</MomentLabel>
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
  );
}

export function MomentLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-tertiary)">
      {children}
    </span>
  );
}

/**
 * Anything Nemesis produced.
 *
 * 🔴 THE SAME RENDERER THE LIVE REPLY USES, so a recorded answer keeps its formatting and its maths
 * instead of turning into a wall of raw markdown.
 *
 * 🔴 THE LABEL IS OPTIONAL, AND ITS ABSENCE IS THE COMMON CASE — see the file header.
 */
export function MomentBody({ label, text }: { label?: string; text: string }) {
  return (
    <div>
      {label && <MomentLabel>{label}</MomentLabel>}
      <AssistantMarkdown
        className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
        singleDollarMath
        text={text}
      />
    </div>
  );
}
