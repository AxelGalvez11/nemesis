// What a vision model SAW on a page of a learner's own written or drawn work — the structure of
// it, not the meaning of it.
//
// 🔴 THE OBSERVER IS NOT THE GRADER (owner spec, 2026-08-17). Nowhere below is there a field for
// "correct", a mark, a score, or a verdict, and that is not something to fill in later. The model
// reports what is on the page: the lines of working in the order they were written, what was
// crossed out, what is a label and what is an arrow, which single thing the page presents as its
// final result, what it could not read, and how sure it is of each reading. What any of that MEANS
// is decided by the same Nemesis evaluator that already judges typed and spoken answers.
//
// 🔴 A SIBLING OF `HandwritingObservation` (types.ts), NOT A REPLACEMENT FOR IT, BECAUSE THE TWO
// ANSWER DIFFERENT QUESTIONS. That one answers *"what text is on this page"* so it can be dropped
// into the composer as ordinary editable text. This one answers *"what working is on this page, in
// what order, ending where"* so an evaluator can tell a correct method with a slipped digit from a
// wrong method that happens to land on the right number. A flat transcription cannot express that
// difference at all: once the page is one string, step three and the final answer are the same
// kind of thing.
//
// 🔴 FIELD-AGNOSTIC BY CONSTRUCTION. There is no vocabulary here for equations, reactions, forces,
// or citations. A `line` is a line of working whether it is an algebraic rearrangement, a step of
// a chemical mechanism, a paragraph of legal reasoning or a stage of a fault diagnosis; a `label`
// names a part of a drawing whether that drawing is a free-body diagram, a cell, a circuit or a
// map. The structure a learner puts on paper — order, retraction, annotation, connection,
// conclusion — is the same structure in every discipline, which is exactly why it is the thing
// worth capturing and subject-matter words are not.
//
// 🔴 ABSENT IS NULL, NEVER ZERO, THROUGHOUT. "The model did not say how sure it was" is a
// different fact from "the model was not sure"; "the page presents no final answer" is a different
// fact from "the final answer is empty"; "we could not read this mark" is a different fact from
// "the learner wrote nothing here". Each of those pairs is one manufactured learner failure apart.

import { jsonFrom } from "@nemesis/shared";

import { readWithVision, type VisionEnv } from "@/lib/vision/gemini";

/**
 * What kind of thing one mark on the page is.
 *
 * 🔴 STRUCTURAL, NEVER SUBJECT MATTER. Every value has to read sensibly for a mechanical
 * engineering student sketching a free-body diagram, a chemistry student drawing a mechanism, and
 * a law student laying out an argument — so the vocabulary is about SHAPE (is it a line of
 * working, a name attached to a picture, an aside, a drawn thing, a join between two things) and
 * never about what field the page came from.
 *
 * 🔴 AND THE LIST IS DELIBERATELY SHORT. A finer taxonomy ("equation", "inequality", "citation")
 * would be a subject-matter list wearing a structural name, and it would push the model into
 * classifying content rather than reporting layout.
 */
export type WrittenMarkKind =
  /** A line of working, a sentence, a calculation, a step. The default and the common case. */
  | "line"
  /** A short name written against a part of a drawing. */
  | "label"
  /** A note the learner added beside their own work rather than as part of it. */
  | "annotation"
  /** Something drawn with no legible text of its own: a shape, a sketch, a diagram. */
  | "figure"
  /** An arrow or line joining two things. */
  | "connector";

const MARK_KINDS: readonly WrittenMarkKind[] = ["line", "label", "annotation", "figure", "connector"];

/** One discrete thing on the page. */
export interface WrittenMark {
  /**
   * What was read, verbatim, when `legible` is true.
   *
   * 🔴 WHEN `legible` IS FALSE THIS IS A DESCRIPTION OF WHAT IS THERE AND UNREAD — "two lines
   * under the diagram" — AND IS NEVER RENDERED AS SOMETHING THE LEARNER WROTE. That distinction is
   * the whole reason an unread mark exists as a value at all rather than being dropped: a page
   * whose middle step could not be read is not a page with a missing step, and an evaluator shown
   * the second when the truth is the first will record a learner as having skipped working they
   * actually did.
   */
  text: string;
  kind: WrittenMarkKind;
  /**
   * 0-1, how sure the model is THIS MARK was read correctly. Null when it did not report one.
   *
   * 🔴 A FACT ABOUT THE READING, NEVER ABOUT THE LEARNER, and null is NOT a synonym for confident.
   * `writtenSubmissionGate` treats an unreported confidence as a reason to show the learner what
   * was recognised before anything is judged, for exactly the reason this comment exists: silence
   * about certainty is not certainty.
   */
  confidence: number | null;
  /**
   * The learner struck this through themselves.
   *
   * 🔴 KEPT RATHER THAN DISCARDED, AND MARKED RATHER THAN MIXED IN. Crossed-out working is a real
   * observation about how someone reasoned — a wrong turn they noticed and corrected is different
   * evidence from never having taken it. But it is emphatically NOT their claim, and rendering it
   * beside live working would hand the evaluator a retracted line as though the learner still
   * stood behind it.
   */
  struckThrough: boolean;
  /** False when something is visibly there and the model could not read it. See `text`. */
  legible: boolean;
}

/**
 * One page of written or drawn work, as one vision call reported it.
 *
 * 🔴 `abstained` MUST STAY CHEAP AND COMMON, exactly as it is for `HandwritingObservation`. A
 * photograph too dark to read has to become an abstention, never a confident short reading — a
 * learner must never be recorded as having produced two steps because the other four were in
 * shadow.
 */
export interface WrittenWork {
  /**
   * Every mark on the page, in the order it reads.
   *
   * 🔴 THE ORDER IS THE SIGNAL, WHICH IS WHY THIS IS A LIST AND NOT A SET. "Correct method,
   * arithmetic slip at step three" and "wrong method that reached the right number" are the same
   * bag of lines and different sequences; an unordered collection cannot express the difference,
   * and an evaluator handed one has been quietly asked to guess.
   */
  marks: readonly WrittenMark[];
  /**
   * Which mark the page presents as its final result, as an index into `marks`. Null when the page
   * presents none, which is the ordinary shape of a labelled diagram or an unfinished derivation.
   *
   * 🔴 AN INDEX, NOT A SECOND COPY OF THE TEXT, SO THE TWO CANNOT DISAGREE. A standalone
   * `finalAnswer` string is one model slip away from naming something that is not on the page at
   * all, and nothing downstream could tell. An out-of-range index is read as null by the parser
   * for the same reason.
   *
   * 🔴 AND IDENTIFYING IT IS AN OBSERVATION, NOT A JUDGEMENT. The page says which line is the
   * conclusion by boxing it, underlining it, putting it last, or introducing it with a word that
   * means "therefore". Reporting that is reading layout. Deciding whether the conclusion is RIGHT
   * is the evaluator's, and nothing here can express it.
   */
  finalAnswerIndex: number | null;
  /**
   * Plain-language spatial observations: which mark sits above which, what an arrow runs between.
   * Empty when nothing on the page is spatially meaningful, which is the common case for a page of
   * plain working.
   */
  relations: readonly string[];
  /** 0-1, how sure the model is of the reading AS A WHOLE. Null when it did not report one. */
  legibility: number | null;
  /** True when the model could not read this image with any confidence worth reporting. */
  abstained: boolean;
  /** A short plain reason, only when `abstained`. Null otherwise. */
  abstentionReason: string | null;
  /** Which model produced this. */
  model: string;
}

/**
 * The instruction the vision model is given.
 *
 * 🔴 EXPORTED SO A TEST CAN ASSERT THE "DO NOT GRADE" INSTRUCTION IS ACTUALLY STATED, rather than
 * trusting it was written once and never checked — the same reason `HANDWRITING_OBSERVATION_PROMPT`
 * and `OCCLUSION_VISION_PROMPT` are exported.
 *
 * 🔴 IT NEVER MENTIONS WHAT THE ANSWER SHOULD BE, WHAT SUBJECT THIS IS, OR WHAT A GOOD PAGE LOOKS
 * LIKE. Telling a model what to expect leads the witness: one told the working should reach a
 * particular result tends to report reaching it. This asks for layout and nothing else.
 */
export const WRITTEN_WORK_PROMPT = [
  "You are looking at a photo or scan of work a learner did by hand: writing, working, a drawing,",
  "or any mixture of those.",
  "",
  "Report only what is visibly on the page. Do not grade it, do not say whether any of it is",
  "correct, do not correct it, and do not say what it means. You are a pair of eyes, not a teacher.",
  "",
  "Return ONLY JSON, no prose and no code fence, in exactly this shape:",
  '{"marks":[{"text":"...","kind":"line","confidence":0.9,"struckThrough":false,"legible":true}],'
    + '"finalAnswerIndex":null,"relations":["..."],"legibility":0.8,'
    + '"abstained":false,"abstentionReason":null}',
  "",
  "marks: every distinct thing on the page, in the order a person would read it. Give each one",
  "its own entry, and keep them in that order: the order the work was written in is the single",
  "most useful thing you can report.",
  '  "kind" is one of:',
  '    "line"       a line of working, a calculation, a step, a sentence. Use this by default.',
  '    "label"      a short name written against a part of a drawing.',
  '    "annotation" a note written beside the work rather than as part of it.',
  '    "figure"     something drawn with no legible text of its own. Describe it in a few plain',
  "                 words, for example \"a rectangle with a circle inside it\".",
  '    "connector"  an arrow or line joining two things.',
  '  "struckThrough" is true when the learner crossed this out themselves. Report it, do not drop',
  "  it: work someone tried and rejected is worth knowing about.",
  '  "legible" is false when something is clearly there and you cannot read it. Then put a short',
  "  plain description of WHERE it is and how much of it there is in \"text\", for example \"two",
  "  lines of working below the diagram\", and never a guess at what it says.",
  '  "confidence" is 0 to 1 and describes only how sure you are of THIS reading.',
  "",
  "finalAnswerIndex: the position in marks of the one thing the page presents as its final result,",
  "or null if it presents none. Judge this from the layout alone: boxed, underlined, circled,",
  "written last, or introduced by a word meaning \"therefore\". Never from whether it looks right.",
  "",
  "relations: plain observations about how marks sit relative to each other, such as which is",
  "above, below, connected to, or pointing at which. An empty array is correct when nothing on the",
  "page is spatially meaningful.",
  "",
  "legibility: 0 to 1, how sure you are of the reading as a whole.",
  "",
  "If the image is too blurred, too dark, cut off, or shows no writing or drawing at all, set",
  '"abstained" to true, give a short plain reason, and leave marks empty. Guessing at handwriting',
  "you cannot make out is worse than saying you could not read it, and much worse here than",
  "anywhere: someone is going to be taught based on what you report.",
].join("\n");

/** How many marks or relations a reply may report before the rest are dropped. No page of
 *  hand-written work has hundreds of distinguishable parts — past this the model is inventing, the
 *  same reasoning `MAX_SUGGESTED_BOXES` already applies to occlusion boxes. */
const MAX_MARKS = 60;
const MAX_RELATIONS = 20;
/** A defensive cap so one runaway field cannot blow up storage or a surface that renders it. */
const MAX_MARK_TEXT = 400;
const MAX_REASON_TEXT = 300;

/**
 * 0-1 or nothing.
 *
 * 🔴 REFUSES RATHER THAN CLAMPS, exactly as `finiteConfidence` does in vision.ts. A confidence
 * outside 0-1 is evidence the model answered on a different scale (a percentage, a 1-10 score) or
 * hallucinated the field. Coercing 95 down to 1 would assert near-total certainty nobody reported,
 * and here that certainty is what decides whether a learner is shown the reading before it is
 * judged. The honest value is "we do not know how sure it was", which the gate treats as a reason
 * to ask.
 */
function confidenceOf(value: unknown): number | null {
  // 🔴 A NUMBER OR NOTHING. `Number(null)`, `Number("")` and `Number(false)` are all 0, so the
  // looser `typeof value === "number" ? value : Number(value)` form — which this codebase's older
  // sibling in vision.ts still uses — reads an explicitly reported `null` as a confidence of ZERO.
  // That is not a rounding error: it turns "the model said nothing about how sure it was" into
  // "the model said it was certainly wrong", and the two must stay distinguishable because only
  // one of them is an observation.
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function markKind(value: unknown): WrittenMarkKind {
  return MARK_KINDS.includes(value as WrittenMarkKind) ? (value as WrittenMarkKind) : "line";
}

function parseMarks(value: unknown): WrittenMark[] {
  if (!Array.isArray(value)) return [];
  const out: WrittenMark[] = [];
  for (const row of value) {
    if (out.length >= MAX_MARKS) break;
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const text = cleanString(record.text, MAX_MARK_TEXT);
    // A mark that names nothing at all is not an observation — of content OR of a gap. An unread
    // mark still has to say what is there and unread, or nothing downstream can tell the learner
    // which part of their page went missing.
    if (!text) continue;
    out.push({
      confidence: confidenceOf(record.confidence),
      kind: markKind(record.kind),
      // 🔴 `!== false` RATHER THAN `=== true`, AND THIS ONE IS THE OPPOSITE WAY ROUND FROM
      // `struckThrough` ON PURPOSE. A model that omits `legible` read the mark — omission is the
      // ordinary shape of the ordinary case, and defaulting it to "unreadable" would put every
      // well-formed reply through a correction step it does not need. `struckThrough` defaults the
      // other way because omitting it means nothing was crossed out, and inventing a retraction
      // the learner never made would delete working they still stand behind.
      legible: record.legible !== false,
      struckThrough: record.struckThrough === true,
      text,
    });
  }
  return out;
}

function parseRelations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const row of value) {
    if (out.length >= MAX_RELATIONS) break;
    const text = cleanString(row, MAX_MARK_TEXT);
    if (text) out.push(text);
  }
  return out;
}

/**
 * Which mark is the conclusion, if the reply named one that exists.
 *
 * 🔴 AN INDEX PAST THE END IS NULL, NOT A CLAMP TO THE LAST MARK. The two are one silent lie
 * apart: a model that returns `finalAnswerIndex: 7` for a five-mark page has told us nothing
 * usable, and quietly promoting the last line to "this is their answer" would make the evaluator
 * judge a conclusion the page never presented. It also has to survive the caps above, which can
 * legitimately shorten `marks` after the model chose its index.
 */
function finalAnswerIndexOf(value: unknown, markCount: number): number | null {
  // 🔴 A NUMBER OR NOTHING, AND THIS ONE IS THE WORST PLACE IN THE FILE TO GET IT WRONG. Coercing,
  // `Number(null)` is 0 — a valid index — so a model correctly reporting "this page presents no
  // final answer" would have its FIRST LINE recorded as the learner's conclusion, and an evaluator
  // would then judge an opening rearrangement as the answer to the question. Caught by this file's
  // own test rather than in production.
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  if (value < 0 || value >= markCount) return null;
  return value;
}

const UNREADABLE_REPLY_REASON = "Nemesis could not understand the reading it got back for this page.";

function abstention(model: string, reason: string): WrittenWork {
  return {
    abstained: true,
    abstentionReason: reason,
    finalAnswerIndex: null,
    legibility: null,
    marks: [],
    model,
    relations: [],
  };
}

/**
 * Turn whatever text the model returned into one page of observed work, defaulting to abstention
 * on anything that does not parse cleanly.
 *
 * 🔴 REFUSES RATHER THAN GUESSES. A malformed reply becomes an abstention, never a coerced or
 * half-invented reading: accepting garbage here would let a parsing bug look, to everything
 * downstream, exactly like a real "could not read this" — and a real abstention is a fact about
 * the photo while a parsing bug is a fact about this function.
 *
 * 🔴 AND A MODEL THAT DECLARED `abstained: true` IS BELIEVED COMPLETELY — whatever marks it also
 * sent are DISCARDED rather than kept as "abstained, but here is a partial reading". A model
 * unsure enough to abstain is not a source to selectively quote from, and a partial reading
 * treated as a whole one is precisely how a page of six steps is recorded as a page of two.
 *
 * PURE.
 */
export function parseWrittenWork(text: string, model: string): WrittenWork {
  const payload = jsonFrom(text);
  // `typeof [] === "object"`, so valid JSON of the wrong shape would otherwise be read as a record
  // whose every field is undefined — a confident, empty, `abstained: false` reading of a page that
  // was never parsed. Same guard, same reason, as parseHandwritingObservation's.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return abstention(model, UNREADABLE_REPLY_REASON);
  }

  const record = payload as Record<string, unknown>;
  if (record.abstained === true) {
    return abstention(model, cleanString(record.abstentionReason, MAX_REASON_TEXT) || "The page could not be read clearly enough.");
  }

  const marks = parseMarks(record.marks);
  return {
    abstained: false,
    abstentionReason: null,
    finalAnswerIndex: finalAnswerIndexOf(record.finalAnswerIndex, marks.length),
    legibility: confidenceOf(record.legibility),
    marks,
    model,
    relations: parseRelations(record.relations),
  };
}

/** The mark the page presents as its result, or null. Derived so it can never disagree with
 *  `marks`. PURE. */
export function finalAnswerMark(work: WrittenWork): WrittenMark | null {
  if (work.finalAnswerIndex === null) return null;
  return work.marks[work.finalAnswerIndex] ?? null;
}

/** Marks that are visibly there and could not be read. Derived rather than counted into a stored
 *  field, so a count and the marks it counts cannot drift apart. PURE. */
export function unreadMarks(work: WrittenWork): readonly WrittenMark[] {
  return work.marks.filter((mark) => !mark.legible);
}

/** Marks that were read and that the learner did not cross out — what they are actually claiming.
 *  PURE. */
export function standingMarks(work: WrittenWork): readonly WrittenMark[] {
  return work.marks.filter((mark) => mark.legible && !mark.struckThrough);
}

export interface WrittenWorkOptions {
  env?: VisionEnv;
  signal?: AbortSignal;
}

/**
 * Read one page of a learner's written or drawn work and report what is on it.
 *
 * 🔴 `null` IS AN INFRASTRUCTURE FAILURE, NEVER AN ABSTENTION — the identical contract
 * `analyzeHandwriting` already keeps. Unconfigured vision, an oversized file or a provider outage
 * returns null, so the surface above can say "try again". A model that ran and could not read the
 * page returns a real `WrittenWork` with `abstained: true`, because "we tried and could not read
 * it" is different information from "we never tried" and no caller may confuse them.
 */
export async function readWrittenWork(
  bytes: Uint8Array,
  mimeType: string,
  options: WrittenWorkOptions = {},
): Promise<WrittenWork | null> {
  const result = await readWithVision(bytes, mimeType, {
    env: options.env,
    prompt: WRITTEN_WORK_PROMPT,
    signal: options.signal,
  });
  if (!result) return null;
  return parseWrittenWork(result.text, result.model);
}
