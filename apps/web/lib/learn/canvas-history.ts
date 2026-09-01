// The rail's rows, projected from the moment spine and the durable entities it points at.
//
// 🔴 THE MOMENT SAYS *WHEN* AND *WHICH*; THIS FILE ASKS THE CANVAS *WHAT*. A `source` moment stores
// a source id and no title, so the title here is read from `canvas.sources` — which means renaming
// a source renames its history row, and detaching one does not leave a lie behind on the rail.
// Copying the title into the moment would have frozen it at the instant it was recorded, and the
// two would drift with nothing in the system comparing them.
//
// 🔴 TITLES ARE DERIVED STRUCTURALLY AND NEVER FROM SUBJECT-MATTER WORDS (CLAUDE.md). The rule for
// "what is this moment called" is first sentence, markdown stripped, capped at a word boundary —
// shape, position and length. A keyword list would have to know what a lecture, a case, a proof or
// a weld procedure looks like, and it would be wrong for every field it was not written for. The
// design test: this must produce a usable title for a law student and a mechanical engineering
// student, and it does, because it never reads the subject.
//
// 🔴 IT IMPORTS NOTHING FROM THE EVIDENCE LAYER, AND THAT IS ASSERTED. Learner state is a
// projection of `learner_evidence`; this is a projection of what happened on one canvas. A history
// row must never be able to state, imply, or alter what someone knows — see `canvas-history.test.ts`.
//
// PURE. No React, no I/O.

import type { CanvasMoment, CanvasMomentKind } from "./canvas-moment";
import type { CanvasQuestion, CanvasResponse, CanvasSource } from "./canvas-model";

export interface CanvasHistoryEntry {
  id: string;
  type: CanvasMomentKind;
  /** Short. The drawer is navigation, not a transcript. */
  title: string;
  /** One more line of context, when there is one worth having. */
  preview?: string;
  createdAt: string;
  /** The moment this row navigates to. 🔴 `id` may be synthesised; this is the real anchor. */
  momentId: string;
}

/** What the projection reads. A narrow slice so nothing here can reach the learner model. */
export interface CanvasHistorySource {
  moments: readonly CanvasMoment[];
  sources: readonly CanvasSource[];
  questions: readonly CanvasQuestion[];
  responses: readonly CanvasResponse[];
  createdAt: string;
}

/** How long a rail label may be. Sized to the peek strip, which must stay narrow. */
export const TITLE_LIMIT = 42;
/** The drawer is wider and can carry a little more. */
export const DRAWER_TITLE_LIMIT = 64;
export const PREVIEW_LIMIT = 72;

/**
 * The first sentence of a passage, as a short label.
 *
 * 🔴 STRUCTURAL ONLY: markdown furniture, then the first sentence boundary, then a word-boundary
 * cut. No word list, no subject knowledge, no language assumption — a sentence ends at `.`, `?`,
 * `!` or a newline in every language this product claims to serve, and where it does not, the
 * length cap still produces something readable.
 *
 * 🔴 THE TRAILING `?` IS DROPPED. Owner's own examples are "Why ACE inhibitors increase potassium"
 * and "Predict the potassium effect" — a label, not the sentence. A column of question marks down
 * the drawer reads as noise once every other row has one.
 */
export function shortTitle(text: string, limit = TITLE_LIMIT): string {
  const bare = text
    // Fenced blocks are not a title. Drop them before anything else looks for a sentence.
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/[*_`~]/g, "");
  // 🔴🔴 THE LINE BREAK IS FOUND BEFORE WHITESPACE IS COLLAPSED, AND THE ORDER IS LOAD-BEARING.
  // Collapsing first turns `\n` into a space, so a heading and the paragraph under it become one
  // run with no boundary left to find — "Ratio decidendi" came back as "Ratio decidendi The rule
  // is". A newline ENDS a title in every field, which is precisely the kind of structural signal
  // this file is allowed to use.
  const firstLine = bare.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const flat = firstLine.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const stop = flat.search(/[.?!]\s|[.?!]$/);
  const sentence = stop === -1 ? flat : flat.slice(0, stop + 1);
  const clean = sentence.replace(/[.?!,;:\s]+$/, "").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  // 🔴 A WORD BOUNDARY ONLY WHEN THERE IS ONE WORTH USING. `space > limit * 0.5` stops a single
  // very long token collapsing the label to two characters plus an ellipsis.
  return `${(space > limit * 0.5 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The verdict line a learner would recognise, without restating what they know. */
function responseNote(response: CanvasResponse | undefined): string | undefined {
  if (!response) return undefined;
  if (response.revealed) return "Answer revealed";
  const verdict = response.evaluation?.verdict;
  if (!verdict) return undefined;
  if (verdict === "not_an_attempt") return undefined;
  if (verdict === "strong") return "Answered in full";
  if (verdict === "understood") return "Answered";
  if (verdict === "partial") return "Partly answered";
  if (verdict === "misconception") return "Showed a specific wrong belief";
  return "Missed";
}

/**
 * The label a moment carries when the thing it points at has gone.
 *
 * 🔴 THE ROW STAYS. A source detached after the fact, or a question dropped in a rewrite, leaves a
 * moment pointing at nothing — and dropping the row would make the record quietly incomplete,
 * which is worse than an unspecific line. `session-transcript.ts` already made this exact call for
 * the same reason ("dropping rows would make the record quietly incomplete").
 */
const GONE: Record<string, string> = {
  question: "A question",
  response: "Your answer",
  source: "Material attached",
  visual: "A diagram",
};

function titleFor(moment: CanvasMoment, canvas: CanvasHistorySource, limit: number): string {
  switch (moment.kind) {
    case "assistant":
    case "user": {
      // 🔴 THE LEARNER'S OWN QUESTION, NOT NEMESIS'S ANSWER. What someone remembers about a turn is
      // what they asked; the answer is what they come back to READ. Falling through to the answer
      // covers a turn that opened without a question.
      const asked = moment.userText ? shortTitle(moment.userText, limit) : "";
      return asked || shortTitle(moment.assistantText ?? "", limit) || "Asked Nemesis";
    }
    case "question": {
      const question = canvas.questions.find((row) => row.id === moment.questionId);
      return question ? shortTitle(question.q, limit) : GONE.question!;
    }
    case "response": {
      const response = canvas.responses.find((row) => row.questionId === moment.responseId);
      const question = canvas.questions.find((row) => row.id === response?.questionId);
      return question ? shortTitle(question.q, limit) : GONE.response!;
    }
    case "correction": {
      const response = canvas.responses.find((row) => row.questionId === moment.responseId);
      const feedback = response?.evaluation?.feedback ?? "";
      const label = shortTitle(feedback, Math.max(12, limit - 12));
      return label ? `Correction: ${label}` : "Correction";
    }
    case "teaching":
      return shortTitle(moment.assistantText ?? moment.teachingAction ?? "", limit) || "Teaching";
    case "visual":
      return shortTitle(moment.assistantText ?? "", limit) || GONE.visual!;
    case "source": {
      const named = (moment.sourceIds ?? [])
        .map((id) => canvas.sources.find((source) => source.id === id)?.title)
        .filter((title): title is string => Boolean(title?.trim()));
      if (!named.length) return GONE.source!;
      if (named.length === 1) return shortTitle(named[0]!, limit);
      return `${shortTitle(named[0]!, Math.max(12, limit - 10))} +${named.length - 1}`;
    }
    case "curriculum":
      return shortTitle(moment.assistantText ?? "", limit) || "Curriculum created";
    case "milestone":
      return shortTitle(moment.assistantText ?? "", limit) || "Milestone";
    default:
      return "Moment";
  }
}

function previewFor(moment: CanvasMoment, canvas: CanvasHistorySource): string | undefined {
  if (moment.kind === "assistant") {
    return moment.assistantText ? shortTitle(moment.assistantText, PREVIEW_LIMIT) || undefined : undefined;
  }
  if (moment.kind === "response" || moment.kind === "correction") {
    return responseNote(canvas.responses.find((row) => row.questionId === moment.responseId));
  }
  return undefined;
}

/**
 * Where the canvas began.
 *
 * 🔴 SYNTHESISED FROM `createdAt`, NEVER STORED. Owner's sketch ends the drawer with "Canvas
 * started", and a recorded moment for it would be a row that says nothing the row above it does
 * not already imply — and would be missing on every canvas that existed before this feature. A
 * derived row is correct on all of them.
 */
export const ORIGIN_MOMENT_ID = "origin";

/**
 * The rail's rows, oldest first.
 *
 * 🔴🔴 OLDEST FIRST, AND BOTH SURFACES RENDER IT EXACTLY AS RETURNED. Owner's screenshot,
 * 2026-08-23: the bright marker sits at the BOTTOM of the rail and the rows above it run back
 * through the session. Time goes downwards, "Now" is last. An earlier version reversed this on
 * both surfaces — newest at the top, which is how a chat sidebar is ordered — and that changes
 * what the column MEANS: downwards-as-time makes it a path the learner walked, upwards-as-time
 * makes it a stack of documents. There is now no reversal anywhere, so there is no second order
 * that could disagree with this one about where a moment sits.
 *
 * 🔴 ORDERED BY `occurredAt` AND THEN BY STORED ORDER. Two moments in the same millisecond are
 * real — an answer and the correction that follows it can share a timestamp — and a sort that is
 * not stable would let them swap between renders, which on a spatial memory reads as the history
 * rewriting itself.
 */
export function buildCanvasHistory(
  canvas: CanvasHistorySource,
  limit = DRAWER_TITLE_LIMIT,
): CanvasHistoryEntry[] {
  const ordered = canvas.moments
    .map((moment, index) => ({ index, moment }))
    .sort((a, b) => a.moment.occurredAt.localeCompare(b.moment.occurredAt) || a.index - b.index)
    .map(({ moment }) => {
      const preview = previewFor(moment, canvas);
      return {
        createdAt: moment.occurredAt,
        id: moment.id,
        momentId: moment.id,
        title: titleFor(moment, canvas, limit),
        type: moment.kind,
        ...(preview ? { preview } : {}),
      };
    });

  // 🔴 NO SYNTHESISED "Canvas started" ROW ANY MORE — owner cut, 2026-08-23, reading the live
  // rail: *"remove the all history and the canvas started, because that's not really necessary
  // for the rail."* The row said nothing the first real moment does not imply, and it spent the
  // rail's scarcest resource — a marker slot — announcing the one event every canvas shares.
  // `ORIGIN_MOMENT_ID` and its `reconstructMoment` branch stay: a rewind stored before the cut
  // may still name it, and an id that resolves to the empty start is the honest answer there.
  return ordered;
}

/** The clock a peek label shows. Local to the learner, for the same reason `groupByDay` is. */
export function momentClock(iso: string, locale?: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/**
 * What the Canvas shows while the learner is looking at an earlier moment.
 *
 * 🔴 READ-ONLY BY CONSTRUCTION, NOT BY DISCIPLINE. This returns a value; it cannot write. The
 * learner model is a projection of `learner_evidence`, which is append-only in the database — so
 * "rewinding must not revert mastery" is not a rule anybody has to keep, it is a thing that cannot
 * happen from here. Owner's own case: wrong at 6:30pm, mastered later, rewind to 6:30pm shows the
 * wrong answer AND the Minimap still says established. Both are true, and they are answers to
 * different questions.
 *
 * 🔴 IT READS THROUGH TO THE LIVE ENTITIES RATHER THAN FROM A SNAPSHOT. A moment stores ids; the
 * question, the answer and the correction come from `canvas.questions` and `canvas.responses` as
 * they are NOW. Storing a copy at record time would have frozen a first draft of a passage that
 * was later rewritten, and shown the learner something the canvas no longer contains.
 */
export interface HistoricalMoment {
  momentId: string;
  occurredAt: string;
  /** The learner's words in this moment were spoken in a voice conversation. */
  spoken?: boolean;
  kind: CanvasMomentKind;
  title: string;
  /** The learner's own question, for a conversational turn. */
  asked?: string;
  /** What Nemesis said. */
  said?: string;
  /** The question that was put to them. */
  question?: string;
  /** What they answered. */
  answer?: string;
  /** The correction they were given. */
  feedback?: string;
  /** Material attached at this moment, by title. */
  sourceTitles?: string[];
  /** The stored text was cut to fit its cap — so the surface can say so instead of implying this
   *  is the whole answer. */
  truncated?: boolean;
  /** Nothing could be reconstructed: the entity this pointed at is gone. */
  missing?: boolean;
}

export function reconstructMoment(
  canvas: CanvasHistorySource,
  momentId: string,
): HistoricalMoment | null {
  if (momentId === ORIGIN_MOMENT_ID) {
    return {
      kind: "milestone",
      momentId,
      occurredAt: canvas.createdAt,
      title: "Canvas started",
    };
  }
  const moment = canvas.moments.find((row) => row.id === momentId);
  if (!moment) return null;

  const response = moment.responseId
    ? canvas.responses.find((row) => row.questionId === moment.responseId)
    : undefined;
  const question = canvas.questions.find(
    (row) => row.id === (moment.questionId ?? response?.questionId),
  );
  const sourceTitles = (moment.sourceIds ?? [])
    .map((id) => canvas.sources.find((source) => source.id === id)?.title)
    .filter((title): title is string => Boolean(title?.trim()));

  const built: HistoricalMoment = {
    kind: moment.kind,
    momentId,
    occurredAt: moment.occurredAt,
    title: titleFor(moment, canvas, DRAWER_TITLE_LIMIT),
    ...(moment.userText ? { asked: moment.userText } : {}),
    ...(moment.userText && moment.spoken ? { spoken: true } : {}),
    ...(moment.assistantText ? { said: moment.assistantText } : {}),
    ...(question ? { question: question.q } : {}),
    ...(response?.text ? { answer: response.text } : {}),
    ...(response?.evaluation?.feedback ? { feedback: response.evaluation.feedback } : {}),
    ...(sourceTitles.length ? { sourceTitles } : {}),
    ...(moment.truncated ? { truncated: true } : {}),
  };

  // 🔴 "NOTHING SURVIVED" IS A REAL ANSWER AND IT IS SAID OUT LOUD. A moment whose question was
  // rewritten away leaves a row on the rail with nothing behind it, and a blank Canvas would read
  // as a bug. The row is kept (see `GONE`) and the surface tells the learner why it is empty.
  const carriesSomething =
    built.asked || built.said || built.question || built.answer || built.feedback || built.sourceTitles;
  return carriesSomething ? built : { ...built, missing: true };
}
