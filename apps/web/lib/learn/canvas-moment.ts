// When each learner-visible thing happened, and which durable entity it was.
//
// 🔴🔴 AN ORDERING SPINE, NOT A SECOND COPY OF THE CANVAS. Almost everything the History Rail
// shows already survives a reload: `canvas.sources`, `canvas.questions`, `canvas.responses` (with
// the learner's own words AND the correction they were given), `canvas.blocks`. What none of them
// carries is a TIME. Measured, on the model as it stands:
//
//     canvas.responses[].at    ISO string        ✓ set in two places in use-canvas-session.ts
//     canvas.recallResults[].at ISO string       ✓
//     canvas.sources[]          no timestamp     ✗
//     canvas.questions[]        no timestamp     ✗
//     canvas.blocks[]           `readAt` only    ✗ (when it was READ, not when it arrived)
//     canvas.answers[]          no timestamp     ✗
//
// So a history cannot be projected from the durable entities alone — not because the content is
// missing but because nothing can be ordered against anything else. A row here says "at 18:31 the
// learner attached source s3"; the source itself stays where it lives. That is the difference
// between an index and a snapshot, and it is the whole reason this file is small.
//
// 🔴 IT IS NOT `canvas-events.ts`, AND THAT FILE SAYS WHY ITSELF: *"NOT the append-only evidence
// log. It is capped, and it drops the oldest rows when it fills… telemetry for interpreting
// evidence, not a history anything may be reconstructed from"*. It also records tooltip opens and
// text selections — transient system activity the owner explicitly excluded from the rail. Reusing
// it would put "definition_opened" markers on the rail and lose the beginning of a long session.
//
// 🔴 IT IS NOT EVIDENCE EITHER, AND NOTHING HERE MAY BECOME A VERDICT. `learner_evidence` is
// append-only in the DATABASE (no UPDATE policy, no DELETE policy) and is the only thing that says
// what someone knows. This log says what happened on one canvas. Rewinding to 6:30pm must show the
// wrong answer that was given at 6:30pm and must NOT move the learner back to not knowing it —
// history describes what happened, learner state describes what is currently known from ALL
// evidence. Keeping them in two places is what makes that separation structural rather than a rule
// somebody has to remember. See `canvas-history.test.ts`, which asserts this module imports
// nothing from the evidence layer.
//
// 🔴 THERE IS NO `canvasId` FIELD, THOUGH THE BRIEF'S SKETCH HAD ONE. These rows live INSIDE
// `canvas.document`, so the canvas id is the container. Storing it again would be two
// representations of one relationship, which is the defect `learner_evidence`'s own migration
// calls out by name ("two things that can disagree, invisibly").
//
// PURE. No React, no I/O.

/**
 * What kind of learner-visible thing a moment was.
 *
 * 🔴 SYSTEM ACTIVITY IS ABSENT ON PURPOSE — no thinking, searching, reading, saving, tool call or
 * loading state. Owner: those are transient. The test for membership is whether a learner would
 * recognise it as something that HAPPENED to them, not whether the runtime did work.
 */
export type CanvasMomentKind =
  /** The learner said something that produced no answer of its own — it started a lesson instead. */
  | "user"
  /**
   * One conversational turn: what was asked and what came back.
   *
   * 🔴 ONE MOMENT FOR THE PAIR, NOT TWO. A question and its answer are one thing the learner
   * navigates back to ("the bit where I asked about potassium"), and splitting them would double
   * the density of the rail for the single most common interaction on the canvas — which is the
   * opposite of "extremely minimal".
   */
  | "assistant"
  /** A retrieval question was put to the learner. */
  | "question"
  /** The learner answered one. */
  | "response"
  /** A correction was shown. */
  | "correction"
  /** A teaching passage was presented. */
  | "teaching"
  /** A drawing was produced. */
  | "visual"
  /** Material was attached. */
  | "source"
  /** A curriculum was created from the material. */
  | "curriculum"
  /** A curriculum milestone worth marking. */
  | "milestone";

export const CANVAS_MOMENT_KINDS: readonly CanvasMomentKind[] = [
  "user",
  "assistant",
  "question",
  "response",
  "correction",
  "teaching",
  "visual",
  "source",
  "curriculum",
  "milestone",
];

export interface CanvasMoment {
  id: string;
  /** ISO. When it happened, never when the row was written — the rail orders by this. */
  occurredAt: string;
  kind: CanvasMomentKind;
  /**
   * The learner's own words.
   *
   * 🔴 CARRIED HERE ONLY BECAUSE IT EXISTS NOWHERE ELSE. A free-response answer is already on
   * `canvas.responses[].text`, so a `response` moment points at it by id and stores no text. A
   * conversational question was previously held in a React ref, capped at six turns, and dropped
   * on refresh — see `learning-canvas.tsx`. There is no durable entity to point at.
   */
  userText?: string;
  /** What Nemesis said back. Same rule: stored because nothing else stores it. */
  assistantText?: string;
  /** Whether either text above was cut to fit the caps below, so a rewind can say so plainly. */
  truncated?: boolean;
  /** The policy action that produced a teaching passage. */
  teachingAction?: string;
  questionId?: string;
  /** The row in `canvas.responses` this moment refers to. 🔴 A REFERENCE — never a copy. */
  responseId?: string;
  visualIds?: string[];
  sourceIds?: string[];
  curriculumNodeId?: string;
}

/**
 * How many moments a canvas keeps.
 *
 * 🔴 THE DOCUMENT TRAVELS ON EVERY SAVE, which is the same constraint that capped `canvas-events.ts`
 * at 500 — an unbounded array grows until the row does. 80 conversational turns at the caps below
 * is roughly 190KB worst case, and the realistic case is far under it because a Nemesis reply is
 * one short paragraph by contract.
 *
 * 🔴 IF A REAL CANVAS EVER APPROACHES THIS, THE ANSWER IS A TABLE, NOT A BIGGER NUMBER. History in
 * jsonb is right for a first version — it needs no migration and no backend work — and wrong at
 * scale, because every save would carry the whole of it. That move belongs to Nemesis Core.
 */
export const MAX_MOMENTS = 80;

/** A question is one line. Anything longer is a paste, and the rail does not need the paste. */
export const MAX_USER_TEXT = 400;

/**
 * How much of an answer is kept.
 *
 * 🔴 2000 RATHER THAN THE 4000 `learner_evidence.response_text` USES, AND THE ASYMMETRY IS
 * DELIBERATE. That column stores one row per demonstration and is read rarely; this array travels
 * inside a document on every autosave. A Nemesis reply is one short paragraph (contract rule 2), so
 * 2000 characters clears the ordinary answer whole and only bites on an unusual one — where
 * `truncated` makes the surface say so rather than showing a silently clipped answer.
 */
export const MAX_ASSISTANT_TEXT = 2000;

/** Collapse runs of whitespace and trim. Stored text is read back into a narrow drawer. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface NewCanvasMoment {
  kind: CanvasMomentKind;
  userText?: string;
  assistantText?: string;
  teachingAction?: string;
  questionId?: string;
  responseId?: string;
  visualIds?: readonly string[];
  sourceIds?: readonly string[];
  curriculumNodeId?: string;
}

/**
 * Build one moment, applying the caps.
 *
 * Separate from `appendMoment` so the capping is testable without a canvas, and so a caller that
 * wants to inspect a moment before storing it can.
 */
export function makeMoment(input: NewCanvasMoment, occurredAt: string, id: string): CanvasMoment {
  const said = input.userText ? tidy(input.userText) : "";
  const replied = input.assistantText ? tidy(input.assistantText) : "";
  const cutSaid = said.length > MAX_USER_TEXT;
  const cutReplied = replied.length > MAX_ASSISTANT_TEXT;
  return {
    id,
    kind: input.kind,
    occurredAt,
    ...(said ? { userText: said.slice(0, MAX_USER_TEXT) } : {}),
    ...(replied ? { assistantText: replied.slice(0, MAX_ASSISTANT_TEXT) } : {}),
    ...(cutSaid || cutReplied ? { truncated: true } : {}),
    ...(input.teachingAction ? { teachingAction: input.teachingAction } : {}),
    ...(input.questionId ? { questionId: input.questionId } : {}),
    ...(input.responseId ? { responseId: input.responseId } : {}),
    ...(input.visualIds?.length ? { visualIds: [...input.visualIds] } : {}),
    ...(input.sourceIds?.length ? { sourceIds: [...input.sourceIds] } : {}),
    ...(input.curriculumNodeId ? { curriculumNodeId: input.curriculumNodeId } : {}),
  };
}

/**
 * Append one moment to a moment list, dropping the oldest when full.
 *
 * 🔴 TAKES AND RETURNS THE LIST, NOT THE CANVAS. `appendEvent` next door takes the whole canvas and
 * that made it impossible to use from anywhere that holds moments without holding a canvas — which
 * is every one of this feature's tests. The canvas-shaped wrapper is one line at the call site.
 *
 * PURE: nothing here touches evidence, `weakConceptIds`, scheduling, or any verdict. `canvas-
 * history.test.ts` asserts that structurally.
 */
export function appendMoment(
  moments: readonly CanvasMoment[],
  input: NewCanvasMoment,
  occurredAt: string,
  id: string,
): CanvasMoment[] {
  return [...moments, makeMoment(input, occurredAt, id)].slice(-MAX_MOMENTS);
}

/**
 * Whether two consecutive moments are the same thing recorded twice.
 *
 * 🔴 THE RAIL IS A MEMORY, AND A DOUBLED MARKER IS A FALSE MEMORY. React effects run twice in
 * development StrictMode, and a canvas that re-renders on an unrelated state change must not gain
 * a second marker for one answer. Keyed on what a learner would call "the same moment" — same kind
 * and same content — rather than on identity, because the id is generated fresh each time and
 * would make every duplicate look distinct.
 */
export function sameMoment(a: CanvasMoment | undefined, b: NewCanvasMoment): boolean {
  if (!a || a.kind !== b.kind) return false;
  const said = b.userText ? tidy(b.userText).slice(0, MAX_USER_TEXT) : undefined;
  const replied = b.assistantText ? tidy(b.assistantText).slice(0, MAX_ASSISTANT_TEXT) : undefined;
  return (
    a.userText === said
    && a.assistantText === replied
    && a.questionId === b.questionId
    && a.responseId === b.responseId
  );
}

/**
 * The last thing Nemesis actually said, for putting a reopened canvas back where it was.
 *
 * 🔴🔴 THE REPLY LANE HAS NO MEMORY OF ITS OWN, which is the whole defect this exists for. `aside`
 * is React state and starts null, so a canvas whose content was a conversation reopened empty and
 * fell through to the stand-in for "we read your material and found nothing to ask you about" —
 * about a canvas with no material. Owner, 2026-08-25: *"i never want to see this ever."*
 *
 * 🔴 THE LAST ONE, NOT ALL OF THEM. The canvas surface holds ONE reply, not a scrollback, so this
 * answers "where was I" rather than rebuilding a transcript. The whole conversation is still in the
 * History Rail, which is the surface built for reading back through it.
 */
export function lastThingSaid(moments: readonly CanvasMoment[]): string | null {
  for (let at = moments.length - 1; at >= 0; at -= 1) {
    const moment = moments[at];
    // `user` moments started a lesson and have no answer of their own; only `assistant` carries one.
    if (moment?.kind !== "assistant") continue;
    const said = moment.assistantText?.trim();
    if (said) return said;
  }
  return null;
}
