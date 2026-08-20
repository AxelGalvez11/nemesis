// Turning one page of observed written work into something the ordinary Nemesis evaluator can
// judge — and refusing to hand it over at all when the reading is not good enough to be judged.
//
// 🔴 THIS IS THE FILE THAT STOPS UNCERTAIN HANDWRITING BECOMING A LEARNER FAILURE (owner spec,
// 2026-08-17, stated as the single most important requirement). The failure mode is quiet and
// entirely plausible: vision half-reads a page, the half it read looks like an incomplete answer,
// the judge honestly returns `partial` or `incorrect`, and a row lands in `learner_evidence`
// saying a person does not understand something they demonstrated perfectly well in ink. Nothing
// is broken, no test fails, and the learner is then taught against a mistake they never made.
//
// So the reading is gated BEFORE anything is judged:
//
//     abstained / nothing readable  ->  blocked   nothing is submitted, no row is written
//     any uncertainty at all        ->  confirm   the learner reads back and corrects first
//     confident throughout          ->  ready     submit as it stands
//
// 🔴 `confirm` IS DELIBERATELY EASY TO REACH AND `ready` IS DELIBERATELY HARD, and the asymmetry
// is the whole design. An unnecessary confirmation costs one press. A missed one costs a durable
// false claim about a person that the teaching policy then acts on for weeks. An unreported
// confidence is therefore treated as a reason to ask, never as a reason to proceed: silence about
// certainty is not certainty.
//
// 🔴 AND NOTHING HERE DECIDES WHETHER ANY OF IT IS CORRECT. This file orders, labels and renders;
// the evaluator that already reads typed and spoken answers decides what it means. There is no
// verdict, no score and no notion of a right answer anywhere below, and a field for one would be a
// bug rather than an unfinished feature.

import {
  finalAnswerMark,
  standingMarks,
  unreadMarks,
  type WrittenMark,
  type WrittenMarkKind,
  type WrittenWork,
} from "@/lib/handwriting/written-work";

import { isAdmissionOfNotKnowing } from "./response-admission";

/**
 * How sure the reading has to be, per mark and overall, before written work may be judged without
 * the learner seeing what was recognised.
 *
 * 🔴 HIGHER THAN EVERY OTHER TRUST FLOOR IN THIS CODEBASE, ON PURPOSE. `canvas-judge.ts` trusts a
 * verdict at 0.4 and `match-elements.ts` trusts a reading at 0.5, and both are right for what they
 * do: those thresholds decide how much weight to give something already recorded. This one decides
 * whether to record anything at all, and the cost either side of it is wildly lopsided. A single
 * misread character turns a correct answer into a wrong one, and handwriting is exactly where that
 * happens.
 */
export const CONFIDENT_ENOUGH_TO_JUDGE = 0.75;

/**
 * Whether this reading may be submitted, and what has to happen first if not.
 *
 * 🔴 A UNION, NOT A BOOLEAN PAIR, because "cannot be submitted at all" and "must be confirmed
 * first" call for opposite surfaces and could otherwise both be true at once. `blocked` has no
 * correction to offer — there is nothing recognised to correct — so the only honest next steps are
 * a better photo or the keyboard.
 */
export type WrittenGate =
  | { kind: "blocked"; reason: string }
  | { kind: "confirm"; reason: string }
  | { kind: "ready" };

const NOTHING_READ = "Nemesis could not read anything on this page. Try a clearer photo, or type your answer.";
const CHECK_BEFORE_SUBMITTING = "Check what Nemesis read before this is marked. Fix anything it got wrong.";

/**
 * May this reading be judged as it stands?
 *
 * 🔴 THE ORDER OF THE CHECKS IS THE SAFETY PROPERTY, NOT A STYLE CHOICE. Blocking comes first
 * because an abstained reading has nothing to confirm; asking comes before proceeding because
 * every remaining doubt has to resolve toward the learner. The final `ready` is reachable only
 * when every question above it has been answered.
 *
 * 🔴 AN UNREAD MARK ALWAYS ASKS. Something is visibly on the page and we do not know what it says.
 * Judging around it means judging an account of their reasoning with a hole in it, and the hole
 * looks exactly like an omission by the learner. They get to fill it in, or to tell us it does not
 * matter, before anyone decides what their work shows.
 *
 * PURE.
 */
export function writtenSubmissionGate(work: WrittenWork): WrittenGate {
  if (work.abstained) {
    return { kind: "blocked", reason: work.abstentionReason?.trim() || NOTHING_READ };
  }

  const standing = standingMarks(work);
  const unread = unreadMarks(work);
  // 🔴 NOTHING READABLE IS BLOCKED, NOT EMPTY-AND-READY. A page whose every mark came back
  // illegible is not a blank page, and submitting it would send an empty account of a page full of
  // working to a judge that can only conclude nothing was produced.
  if (standing.length === 0) {
    return { kind: "blocked", reason: NOTHING_READ };
  }

  // 🔴🔴 A DRAWING CANNOT BE PROOFREAD, SO IT IS NOT SENT TO BE PROOFREAD. Owner call, 2026-08-19:
  // a chemistry structure came back as "A curved angle open to the right" with a box asking them to
  // fix anything Nemesis got wrong. There is nothing to fix. For a `line`, a `label` or an
  // `annotation`, `text` is what the LEARNER WROTE and a misreading is correctable by retyping it —
  // that is the misread-handwriting failure this gate exists to prevent, and it is untouched. For a
  // `figure` or a `connector`, `text` is the model's own DESCRIPTION of a shape (the type says so:
  // "something drawn with no legible text of its own"). Handing that back asks the learner to edit
  // our prose about their drawing, which improves no reading and mostly teaches them to press
  // Confirm without looking — which would blunt the gate on the pages where it does matter.
  //
  // 🔴 THIS NARROWS THE GATE, IT DOES NOT WEAKEN THE PROPERTY. "Uncertain handwriting must not
  // become a failure they did not earn" is about text. A page whose marks are entirely non-textual
  // has no handwriting to be uncertain about; the reading either found a shape or it did not, and
  // "did not" is still `blocked` above via `standing.length === 0`.
  const textual = work.marks.filter((mark) => TEXTUAL_KINDS.has(mark.kind));

  if (unread.some((mark) => TEXTUAL_KINDS.has(mark.kind))) {
    return { kind: "confirm", reason: CHECK_BEFORE_SUBMITTING };
  }

  // Nothing on this page is the learner's own words. There is no reading for them to correct.
  if (textual.length === 0) return { kind: "ready" };

  // 🔴 `null` IS NOT A PASS. A model that did not say how sure it was has not told us it was sure,
  // and defaulting silence to confidence is the exact shape of every absent-is-zero defect this
  // codebase keeps finding. The cost of being wrong here is a manufactured learner failure.
  if (work.legibility === null || work.legibility < CONFIDENT_ENOUGH_TO_JUDGE) {
    return { kind: "confirm", reason: CHECK_BEFORE_SUBMITTING };
  }

  // 🔴 EVERY TEXTUAL MARK, INCLUDING THE STRUCK-OUT ONES. A misread retraction is still a
  // misreading, and the judge is shown crossed-out work as part of how someone reasoned.
  for (const mark of textual) {
    if (mark.confidence === null || mark.confidence < CONFIDENT_ENOUGH_TO_JUDGE) {
      return { kind: "confirm", reason: CHECK_BEFORE_SUBMITTING };
    }
  }

  return { kind: "ready" };
}

/** The kinds whose `text` is the learner's own words rather than a description of a shape. See the
 *  narrowing note inside `writtenSubmissionGate`. */
const TEXTUAL_KINDS: ReadonlySet<WrittenMarkKind> = new Set<WrittenMarkKind>(["annotation", "label", "line"]);

/**
 * Was this reading taken against the question that is open now?
 *
 * 🔴 THE SHEET IS REACHABLE WHILE NOTHING IS BEING ASKED, WHICH IS THE WHOLE POINT OF IT AND ALSO
 * WHY THIS EXISTS. The composer's small pad could clear itself on every prompt change, because a
 * drawing made for question A is never wanted for question B. Scratch work cannot do that: someone
 * working a problem out over several minutes must not lose it because the page moved on. So the
 * ink survives, and the guard moves here instead: a reading is bound to the prompt that was open
 * when it was taken, and submitting it against a different one would file a page of working as the
 * answer to a question it was not an answer to.
 *
 * 🔴 A NULL ON EITHER SIDE IS NOT A MATCH. Nothing was being asked when the reading was taken, or
 * nothing is being asked now; either way there is no question for this work to answer.
 *
 * PURE.
 */
export function answersTheSameQuestion(readForPromptId: string | null, activePromptId: string | null): boolean {
  return readForPromptId !== null && activePromptId !== null && readForPromptId === activePromptId;
}

/** What to tell a learner whose reading no longer matches what is being asked. */
export const STALE_READING = "The question moved on while this was being read. Read your work again to answer this one.";

/**
 * A page of written work as it is going to be judged.
 *
 * 🔴 A DIFFERENT TYPE FROM `WrittenWork` BECAUSE IT IS A DIFFERENT KIND OF CLAIM. `WrittenWork` is
 * what a machine saw. This is what is being submitted, which after a correction step is partly
 * what a person SAID they wrote. Keeping one type for both would mean a learner's own words
 * arriving in a field documented as "what the model read", and every later reader of that field
 * would be entitled to treat them as a machine reading.
 */
export interface ConfirmedWriting {
  marks: readonly WrittenMark[];
  /** Index into `marks`, or null when nothing on the page is presented as a conclusion. */
  finalAnswerIndex: number | null;
  relations: readonly string[];
  /**
   * A person read the recognition back and stands behind it.
   *
   * 🔴 THIS IS WHAT LETS THE JUDGE STOP FORGIVING OCR. Told that every handwritten answer "may
   * contain transcription errors", a judge reads a genuine algebraic slip as a misread character
   * and returns `understood` — which destroys precisely the distinction between a careless error
   * and a correct one that this whole path exists to make. Once the learner has confirmed the
   * text, it is their text, and a mistake in it is theirs.
   */
  confirmed: boolean;
}

/** The reading as recognised, submitted without a correction step. Only reachable when
 *  `writtenSubmissionGate` returned `ready`. PURE. */
export function writingAsRead(work: WrittenWork): ConfirmedWriting {
  return {
    confirmed: false,
    finalAnswerIndex: work.finalAnswerIndex,
    marks: work.marks,
    relations: work.relations,
  };
}

/** What the learner said the page actually says, once they have been shown the recognition. */
export interface LearnerReading {
  /**
   * One entry per observed mark, in the same order.
   *
   * An empty entry means different things for the two kinds of mark, and both are real:
   *   a mark that WAS read  ->  the learner is deleting it. Vision saw something that is not there.
   *   a mark that was NOT read  ->  they left the gap alone. It stays a gap.
   */
  marks: readonly string[];
  /** Which mark they say is their final answer, or null for none. */
  finalAnswerIndex: number | null;
}

/**
 * The learner's own reading of their page.
 *
 * 🔴 A CORRECTED MARK LOSES ITS CONFIDENCE RATHER THAN GAINING A HIGH ONE, and that is not a
 * technicality. `confidence` means "how sure the model is that this is what was written", and once
 * a person has typed what it says there is no model reading left to be sure about. Writing 1.0
 * there would file a learner's own sentence as a machine reading of maximum certainty, which is
 * both false and unrecoverable after the fact. `confirmed` above is where the trust actually
 * lives.
 *
 * 🔴 AND A DELETED MARK IS DROPPED RATHER THAN BLANKED. A mark with empty text is not an
 * observation of anything, and leaving one in the list would render as a numbered step that says
 * nothing.
 *
 * PURE.
 */
export function writingAsConfirmed(work: WrittenWork, reading: LearnerReading): ConfirmedWriting {
  const marks: WrittenMark[] = [];
  // Where each surviving mark ended up, so the learner's chosen final answer still points at the
  // thing they chose after deletions shift every index after it. Recomputing the index from the
  // text later, or leaving it pointing at the old position, are the two ways this silently starts
  // marking the wrong line as someone's conclusion.
  const moved = new Map<number, number>();

  work.marks.forEach((mark, index) => {
    const said = (reading.marks[index] ?? mark.text).trim();
    if (!said) {
      // Nothing to keep for a mark that WAS read and has been deleted. A mark that was NOT read
      // survives as the gap it always was, still carrying its description of what is there.
      if (mark.legible) return;
      moved.set(index, marks.length);
      marks.push(mark);
      return;
    }
    moved.set(index, marks.length);
    marks.push(
      said === mark.text && mark.legible
        ? mark
        : { ...mark, confidence: null, legible: true, text: said },
    );
  });

  const chosen = reading.finalAnswerIndex;
  const finalAnswerIndex = chosen === null || chosen === undefined ? null : (moved.get(chosen) ?? null);

  return { confirmed: true, finalAnswerIndex, marks, relations: work.relations };
}

/** Plain words for a mark's shape, for a judge reading prose rather than a schema. `line` has no
 *  prefix: it is the ordinary case and labelling it would put a tag on every line of an ordinary
 *  derivation. */
const KIND_PREFIX: Record<WrittenMark["kind"], string> = {
  annotation: "note: ",
  connector: "arrow or line: ",
  figure: "drawing: ",
  label: "label: ",
  line: "",
};

/**
 * The page handed over as plain text, exactly as if it had been typed, or null when it genuinely
 * needs structure.
 *
 * 🔴 THIS IS NOT A COSMETIC SHORTCUT — IT KEEPS TWO NON-ATTEMPT RULES ALIVE THROUGH THE WRITTEN
 * DOOR. `isAdmissionOfNotKnowing` and `isEchoOfTheCue` (response-admission.ts) both run on the
 * submitted text before the judge sees it, and both require that NOTHING substantive is left over
 * once the admission or the cue is removed. A learner who writes "idk" by hand and gets it
 * rendered under a heading has just had their admission turned into an attempt, judged
 * `incorrect`, and stored as negative evidence — the precise defect those two rules exist to
 * prevent, arriving through a door neither was watching.
 *
 * 🔴 AND THE ADMISSION CHECK IS NOT COVERED BY THE SINGLE-LINE CASE. "I don't know how to start
 * this" is one sentence to a person and frequently two marks to a vision model, because it was
 * written across two lines. One mark renders plain and is caught; two render structured and are
 * not, and the section headings alone are enough substantive text to defeat the rule. So the
 * standing marks are also joined and tested as a whole, which is what closes the gap for a
 * multi-line admission.
 *
 * 🔴 STRUCTURAL, NOT SUBJECT MATTER. `isAdmissionOfNotKnowing` recognises a learner reporting
 * their own state, which reads identically for a law student and a machinist. Nothing here knows
 * what any page is about.
 */
function plainRendering(writing: ConfirmedWriting): string | null {
  const standing = writing.marks.filter((mark) => mark.legible && !mark.struckThrough);

  const only = writing.marks.length === 1 ? writing.marks[0] : null;
  if (only && only.legible && !only.struckThrough && only.kind === "line" && writing.relations.length === 0) {
    return only.text;
  }

  // 🔴 THE JOINED TEXT, REGARDLESS OF WHAT ELSE IS ON THE PAGE. If everything readable amounts to
  // "I do not know", that is the answer however many marks it took and whatever was crossed out or
  // unread beside it. The direction of error is deliberate: an admission read as an attempt writes
  // a wrong verdict, while an attempt read as an admission writes no verdict at all.
  const said = standing.map((mark) => mark.text).join(" ").trim();
  return said && isAdmissionOfNotKnowing(said) ? said : null;
}

/**
 * The labels the rendering uses.
 *
 * 🔴 NEUTRAL AND THIRD-PERSON-FREE, BECAUSE THE LEARNER READS THIS BACK AS THEIR OWN WORDS.
 * `use-policy-runtime.ts` sets `feedback.answer` to whatever was submitted, and
 * `canvas-policy-view.tsx` prints it inside `<LearnerUtterance>` — the bubble that says "this is
 * what you said". Headings written for the judge ("Their work, in the order they wrote it") are
 * addressed to a third party ABOUT the learner, and shown to the learner they read as Nemesis
 * narrating them to themselves.
 *
 * The judge loses nothing: `evaluationMessages` already wraps the whole thing in its own frame
 * (*"They wrote by hand: …"*), so the person is supplied there and a label only has to name what
 * the section IS.
 *
 * 🔴 AND NEITHER GUARD WOULD HAVE CAUGHT IT. `canvas-learner-copy.test.ts` scans only
 * `components/workspace/learn/` and its own header says `lib/learn/*.ts` literals are deliberately
 * out of scope; this file's em-dash test reads dashes, not voice.
 */
const WORKING_HEADING = "Working, in order:";
const STRUCK_PREFIX = "[crossed out]";
const LAYOUT_PREFIX = "Layout:";
const FINAL_ANSWER_PREFIX = "Final answer as marked:";
const NO_FINAL_ANSWER = "No final answer marked on the page.";
const UNREAD_PREFIX = "Not read by Nemesis";
const CONFIRMED_NOTE = "Read back and confirmed by the writer.";

/**
 * The written page as the text an evaluator reads.
 *
 * 🔴 THE ORDER, THE RETRACTIONS, THE CONCLUSION AND THE GAPS ARE ALL STATED SEPARATELY, because
 * every one of the distinctions this path exists to make needs a different one of them:
 *
 *   correct method, slipped arithmetic  needs the steps IN ORDER and the conclusion apart from them
 *   right answer, invalid reasoning     needs the conclusion apart from the steps
 *   partial derivation                  needs to see that no conclusion was reached at all
 *   a wrong turn they caught            needs the crossed-out line kept AND marked as retracted
 *   our failure to read, not their gap  needs unread parts named as unread, never as content
 *
 * Flatten any of those into one blob and the corresponding distinction stops being expressible,
 * whatever the judge is told.
 *
 * 🔴 UNREAD MARKS ARE NEVER RENDERED AS CONTENT. Their `text` is a description of a gap ("two
 * lines under the diagram") and printing it in the numbered working would put words in a learner's
 * mouth that nobody read.
 *
 * PURE.
 */
export function renderWriting(writing: ConfirmedWriting): string {
  const plain = plainRendering(writing);
  if (plain !== null) return plain;

  const unread: string[] = [];
  const body: string[] = [];
  let step = 0;
  const finalAnswer = writing.finalAnswerIndex === null ? null : (writing.marks[writing.finalAnswerIndex] ?? null);

  writing.marks.forEach((mark) => {
    if (!mark.legible) {
      unread.push(mark.text);
      return;
    }
    if (mark.struckThrough) {
      // Unnumbered and in place: a line someone crossed out is part of how they got where they
      // got, and is not one of the steps they are standing behind.
      body.push(`   ${STRUCK_PREFIX} ${KIND_PREFIX[mark.kind]}${mark.text}`);
      return;
    }
    step += 1;
    body.push(`${step}. ${KIND_PREFIX[mark.kind]}${mark.text}`);
  });

  const sections: string[] = [];
  if (body.length > 0) sections.push(`${WORKING_HEADING}\n${body.join("\n")}`);
  if (writing.relations.length > 0) sections.push(`${LAYOUT_PREFIX} ${writing.relations.join("; ")}`);
  sections.push(
    finalAnswer && finalAnswer.legible ? `${FINAL_ANSWER_PREFIX} ${finalAnswer.text}` : NO_FINAL_ANSWER,
  );
  if (unread.length > 0) {
    sections.push(`${UNREAD_PREFIX} (${unread.length}): ${unread.join("; ")}.`);
  }
  if (writing.confirmed) sections.push(CONFIRMED_NOTE);

  return sections.join("\n\n");
}
