// Batch C content model for study_artifacts (owner 2026-07-21): tests carry
// real multiple-choice questions, mindmaps carry a markdown outline. Shapes
// mirror the desktop app's study extras (TestQuestion {q, options, answer,
// why}; outline = headings + nested bullets) so the two lanes stay coherent.
// Pure and dependency-free: LLM-reply parsing, jsonb validation, prompt
// builders, mermaid conversion, and attempt scoring all live here for tests.

import { MATERIAL_CHAR_LIMIT } from "@/lib/workload-cost";
import type { WireMsg } from "@/lib/workspace/chat-api";
import { EXAM_ITEM_RULES } from "@/lib/workspace/item-writing";
import { balanceAnswerPositions } from "@/lib/workspace/test-answer-balance";

export interface TestQuestion {
  q: string;
  options: string[];
  /** 0-based index into `options` — always in bounds after parsing. */
  answer: number;
  why: string;
}

/**
 * A question answered by TYPING, not tapping (owner 2026-08-31: "the test could
 * include type to answer").
 *
 * 🔴 RECALL, NOT RECOGNITION, IS THE POINT — so there are no options to lean on.
 * It exists for material where one exact answer is the skill being tested: a
 * term, a name, a formula, a phrase in a language being learned. Field-agnostic
 * by construction: the shape carries no subject assumptions, only "the answer,
 * written out" plus other spellings that also count.
 *
 * `typedAnswer` rather than `answer` so the union stays unambiguous against
 * TestQuestion's numeric `answer` in stored jsonb — a number means an index, a
 * string under `typedAnswer` (or `answer` in a FRESH generation reply, which
 * `toItem` maps) means typed.
 */
export interface TypedTestQuestion {
  q: string;
  /** The canonical answer, written out in full — shown after the reveal. */
  typedAnswer: string;
  /** Other phrasings and spellings that also count, compared normalised. */
  accept: string[];
  /**
   * The exact written form IS the skill (owner 2026-08-31, on "hablo" vs
   * "habló": strict when it's the point). Grading then keeps accents and marks
   * — a conjugation where the accent distinguishes tense cannot be graded
   * without them. Casing, punctuation and spacing stay forgiven either way.
   */
  strict: boolean;
  why: string;
}

export type TestItem = TestQuestion | TypedTestQuestion;

export function isTypedQuestion(item: TestItem): item is TypedTestQuestion {
  return "typedAnswer" in item;
}

/**
 * The student's own diagnosis of a miss (owner 2026-08-31, from the post-exam
 * report: "Every wrong answer gets classified... That diagnosis determines what
 * happens next"). Self-reported with one tap on the review screen — the student
 * is the only one who knows whether they forgot it or never knew it.
 */
export const MISS_KINDS = ["didnt-know", "forgot", "mixed-up", "couldnt-apply", "misread"] as const;
export type MissKind = (typeof MISS_KINDS)[number];

export const MISS_KIND_LABEL: Record<MissKind, string> = {
  "couldnt-apply": "Couldn't apply it",
  "didnt-know": "Didn't know it",
  forgot: "Forgot it",
  misread: "Misread it",
  "mixed-up": "Mixed two things up",
};

export interface TestMiss {
  questionIndex: number;
  /** The option INDEX picked (choice questions) or the TEXT typed (typed ones). */
  picked: number | string;
  /** The student's one-tap diagnosis, when they gave one. */
  why?: MissKind;
}

export interface TestAttempt {
  at: string;
  score: number;
  total: number;
  missed: TestMiss[];
}

export interface TestContent {
  questions: TestItem[];
  attempts: TestAttempt[];
}

export interface MindmapContent {
  outline: string;
}

const MAX_QUESTIONS = 25;
const MAX_OPTIONS = 6;
const MAX_TEXT = 500;
// 🔴 The material clip is IMPORTED (see the import block above), not redeclared
// here. It used to be declared a second time in this file, 9,000 characters
// spelled out again beside the one in lib/workload-cost.ts, kept honest by a test
// that string-matched this file's SOURCE for the literal. That is a drift alarm,
// not a single source of truth:
// either copy could be edited, and the pricing model and the generator would then
// disagree about how much of a lecture is actually read — while every dollar
// figure downstream kept quoting the other number.
//
// The cap belongs to the cost model, because that is what has to be re-priced
// when it moves. Removing silent dependence on it is Phase 4 work
// (docs/document-intelligence.md §6.4); deduplicating it is the precondition.

function cleanText(value: unknown, maxLength = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compact || null;
}

function toQuestion(value: unknown): TestQuestion | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const q = cleanText(row.q ?? row.question);
  const why = cleanText(row.why ?? row.explanation) ?? "";
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions.map((option) => cleanText(option)).filter((option): option is string => option !== null).slice(0, MAX_OPTIONS);
  const answer = Number(row.answer);
  if (!q || options.length < 2) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  return { answer, options, q, why };
}

/** A typed question, from stored jsonb (`typedAnswer`) or a fresh generation
 *  reply (a STRING under `answer`, with no options). */
function toTypedQuestion(value: unknown): TypedTestQuestion | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const q = cleanText(row.q ?? row.question);
  const why = cleanText(row.why ?? row.explanation) ?? "";
  const typedAnswer = cleanText(row.typedAnswer ?? (typeof row.answer === "string" ? row.answer : null));
  if (!q || !typedAnswer) return null;
  const accept = (Array.isArray(row.accept) ? row.accept : [])
    .map((entry) => cleanText(entry))
    .filter((entry): entry is string => entry !== null)
    .slice(0, MAX_OPTIONS);
  return { accept, q, strict: row.strict === true, typedAnswer, why };
}

/** Either question shape. Options present → choice; a string answer → typed. A
 *  row that is neither is dropped, exactly as malformed choice rows always were. */
function toItem(value: unknown): TestItem | null {
  if (typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).options)) {
    return toQuestion(value);
  }
  return toTypedQuestion(value);
}

function toAttempt(value: unknown): TestAttempt | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const at = typeof row.at === "string" ? row.at : null;
  const score = Number(row.score);
  const total = Number(row.total);
  if (!at || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  const missed = Array.isArray(row.missed)
    ? row.missed.flatMap((miss): TestMiss[] => {
        if (typeof miss !== "object" || miss === null) return [];
        const entry = miss as Record<string, unknown>;
        const questionIndex = Number(entry.questionIndex);
        if (!Number.isInteger(questionIndex)) return [];
        const why = MISS_KINDS.find((kind) => kind === entry.why);
        // A typed miss records the TEXT the student wrote; a choice miss the index.
        if (typeof entry.picked === "string") {
          return [{ picked: entry.picked.slice(0, MAX_TEXT), questionIndex, ...(why ? { why } : {}) }];
        }
        const picked = Number(entry.picked);
        return Number.isInteger(picked) ? [{ picked, questionIndex, ...(why ? { why } : {}) }] : [];
      })
    : [];
  return { at, missed, score, total };
}

/** Validate a study_artifacts.content jsonb value as test content. */
export function parseTestContent(value: unknown): TestContent | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.questions)) return null;
  const questions = row.questions.map(toItem).filter((question): question is TestItem => question !== null);
  if (questions.length === 0) return null;
  const attempts = Array.isArray(row.attempts)
    ? row.attempts.map(toAttempt).filter((attempt): attempt is TestAttempt => attempt !== null)
    : [];
  return { attempts, questions };
}

/** Validate a study_artifacts.content jsonb value as mindmap content. */
export function parseMindmapContent(value: unknown): MindmapContent | null {
  if (typeof value !== "object" || value === null) return null;
  const outline = (value as Record<string, unknown>).outline;
  if (typeof outline !== "string" || !outline.trim()) return null;
  return { outline: outline.trim() };
}

/** Tolerant "find the JSON object in an LLM reply" extractor: strips code
 *  fences and grabs the outermost brace pair. Shared with study-ai-extras. */
export function jsonSlice(raw: string): Record<string, unknown> | null {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse one generation reply into validated questions (capped), then spread the
 *  correct answers across the four positions.
 *
 *  The balancing is here rather than in parseTestContent because this function
 *  only ever sees a FRESHLY generated paper. parseTestContent also reads stored
 *  content back, and an attempt records the option the student picked as an
 *  INDEX — reordering options after an attempt exists would silently rewrite
 *  what they answered. See test-answer-balance.ts. */
export function parseGeneratedTest(raw: string): TestItem[] {
  const parsed = jsonSlice(raw);
  if (!parsed || !Array.isArray(parsed.questions)) return [];
  const items = parsed.questions
    .map(toItem)
    .filter((question): question is TestItem => question !== null)
    .slice(0, MAX_QUESTIONS);
  // Only choice questions have positions to balance; typed ones pass through in
  // place, so the paper keeps the order the model wrote it in.
  const balanced = balanceAnswerPositions(items.filter((item): item is TestQuestion => !isTypedQuestion(item)));
  let next = 0;
  return items.map((item) => (isTypedQuestion(item) ? item : balanced[next++]!));
}

/** The `"outline": "…"` value inside a JSON wrapper that did NOT parse — i.e. one
 *  the model's output ran out of tokens partway through. Stops at the first
 *  unescaped quote, so a complete-but-unparseable object works too. */
const TRUNCATED_OUTLINE_FIELD = /"outline"\s*:\s*"((?:[^"\\]|\\.)*)/;

/** Parse one generation reply into an outline. Accepts {outline} JSON, that
 *  wrapper cut off mid-string by a token limit, or a bare markdown outline
 *  (models sometimes skip the wrapper).
 *
 *  The truncated arm is not defensive padding: without it the bare fallback
 *  matches the `- point` line INSIDE the broken JSON and returns the whole
 *  string, so the mind map's first node renders as the literal text
 *  `{"outline": "`. Kept identical to the phone's parseOutline
 *  (apps/mobile/src/lib/study-artifact-content.ts) — both surfaces now write
 *  mind maps from chat, so they must read a half-finished one the same way. */
export function parseGeneratedMindmap(raw: string): string | null {
  const parsed = jsonSlice(raw);
  const fromJson = parsed ? (parsed as Record<string, unknown>).outline : null;
  if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
  const trimmed = raw.trim();
  // A wrapper that failed to parse: salvage its field, or refuse. Handing it to
  // the bare arm below would return JSON punctuation as outline text.
  if (!parsed && trimmed.startsWith("{")) {
    const salvaged = TRUNCATED_OUTLINE_FIELD.exec(trimmed)?.[1];
    if (!salvaged) return null;
    try {
      // JSON.parse on the quoted fragment unescapes \n, \t and \uXXXX correctly,
      // which a chain of .replace() calls would get wrong.
      const text = JSON.parse(`"${salvaged}"`) as string;
      return text.trim() || null;
    } catch {
      // The fragment ends inside an escape sequence.
      return null;
    }
  }
  const bare = trimmed.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
  return /^(#{1,6}\s|[-*+]\s)/m.test(bare) ? bare : null;
}

export interface StudyMaterial {
  /** Where the material came from — shown to the model for context. */
  label: string;
  text: string;
}

/** Deck cards flattened into generation material. */
export function deckMaterial(deckTitle: string, cards: Array<{ front: string; back: string }>): StudyMaterial {
  const text = cards
    .map((card, index) => `${index + 1}. ${card.front.trim()} — ${card.back.trim()}`)
    .join("\n")
    .slice(0, MATERIAL_CHAR_LIMIT);
  return { label: `flashcard deck "${deckTitle}"`, text };
}

/** A library note flattened into generation material. */
export function noteMaterial(noteTitle: string, content: string): StudyMaterial {
  return { label: `note "${noteTitle}"`, text: content.trim().slice(0, MATERIAL_CHAR_LIMIT) };
}

/** One indexed passage of a document the learner uploaded. Mirrors a `library_chunks`
 *  row, and deliberately nothing more: this file stays pure and knows no table. */
export interface LecturePassage {
  /** Reading order within the document. */
  chunkIndex: number;
  content: string;
}

/** Below this a passage carries no fact worth asking about — a slide title on its
 *  own, a caption stub, a parser's placeholder for a picture it did not read.
 *  Stated as a LENGTH, not as a list of markers, so it holds for every document
 *  shape and every subject. */
const MIN_PASSAGE_CHARS = 40;

/**
 * Passages spread across the WHOLE document, under a character budget.
 *
 * 🔴🔴 TRUNCATION AT THE HEAD IS THE SAME BUG AS NO MATERIAL AT ALL. A lecture in this
 * account runs to 30,570 characters and the material budget is 9,000, so `slice(0, cap)`
 * would hand the examiner the first thirty per cent of one lecture and call it the lecture.
 * Every question would come from the opening slides, and a learner revising for an exam on
 * the whole deck would be tested on its title page and its learning objectives.
 *
 * 🔴 SO SELECTION, NOT TRUNCATION, AND SELECTION BY POSITION RATHER THAN BY SUBJECT. Taking
 * passages at an even stride across the document gives the beginning, the middle and the end
 * equal standing, needs nothing to be understood about the material, and reads the same for a
 * statute, a lab manual or a grammar chapter.
 *
 * PURE. No I/O.
 */
export function spreadPassages(passages: readonly LecturePassage[], budget: number): LecturePassage[] {
  const ordered = [...passages]
    .filter((passage) => passage.content.trim().length >= MIN_PASSAGE_CHARS)
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
  if (ordered.length === 0) return [];

  const cost = (passage: LecturePassage) => passage.content.trim().length + 2;
  const total = ordered.reduce((sum, passage) => sum + cost(passage), 0);
  if (total <= budget) return ordered;

  // How many average-sized passages fit, and then one every `stride` of them so the
  // sample runs end to end instead of stopping where the budget did.
  const wanted = Math.max(1, Math.floor(budget / (total / ordered.length)));
  const stride = ordered.length / wanted;
  const picked: LecturePassage[] = [];
  const seen = new Set<number>();
  let used = 0;
  for (let step = 0; step < wanted; step += 1) {
    const at = Math.min(ordered.length - 1, Math.floor(step * stride));
    if (seen.has(at)) continue;
    const passage = ordered[at];
    if (!passage) continue;
    // Skipped rather than stopped: one long passage in the middle must not end the sample
    // and take the whole back half of the document with it.
    if (used + cost(passage) > budget) continue;
    seen.add(at);
    picked.push(passage);
    used += cost(passage);
  }
  // Nothing fit whole, which means one passage is longer than the entire budget. Half a
  // passage is still material; an empty test is not.
  if (picked.length === 0) {
    const first = ordered[0];
    return first ? [{ chunkIndex: first.chunkIndex, content: first.content.trim().slice(0, budget) }] : [];
  }
  return picked;
}

/**
 * A document the learner uploaded, flattened into generation material.
 *
 * 🔴 THE LABEL SAYS WHEN IT IS A SAMPLE, because the label is the sentence the examiner reads
 * ("write a test from the student's ..."). A model told it holds a whole lecture will write
 * "this lecture covers" questions about a lecture it has seen a third of.
 */
export function lectureMaterial(
  title: string,
  passages: readonly LecturePassage[],
  budget: number = MATERIAL_CHAR_LIMIT,
): StudyMaterial {
  const usable = passages.filter((passage) => passage.content.trim().length >= MIN_PASSAGE_CHARS);
  const chosen = spreadPassages(passages, budget);
  const text = chosen
    .map((passage) => passage.content.trim())
    .join("\n\n")
    .slice(0, budget);
  const whole = chosen.length >= usable.length;
  return {
    label: whole
      ? `uploaded document "${title}"`
      : `uploaded document "${title}" (${chosen.length} passages sampled evenly across the whole document, of ${usable.length})`,
    text,
  };
}

/**
 * An aced paper's facts, as material for a harder paper on the SAME facts.
 *
 * 🔴 SELF-CONTAINED ON PURPOSE. A test artifact does not remember which deck or
 * note it came from, and adding that pointer would be a schema change for one
 * button. The questions already carry every fact they test — question, answer,
 * explanation — which is exactly the material a harder paper needs.
 */
export function hardenedMaterial(title: string, questions: TestItem[]): StudyMaterial {
  const text = questions
    .map((question, index) => {
      const answer = isTypedQuestion(question) ? question.typedAnswer : (question.options[question.answer] ?? "");
      return `${index + 1}. ${question.q} — ${answer}${question.why ? ` (${question.why})` : ""}`;
    })
    .join("\n")
    .slice(0, MATERIAL_CHAR_LIMIT);
  return { label: `facts the student already answered correctly in "${title}"`, text };
}

export interface MissedFact {
  q: string;
  answer: string;
  /** The student's own one-tap diagnosis, when they gave one — the single most
   *  useful line the examiner model gets: "forgot" and "never knew" call for
   *  different questions, and only the student knows which it was. */
  why?: MissKind;
}

/** What the most recent sitting got wrong — the re-ask list for a mixed review. */
export function missedFacts(questions: TestItem[], attempts: TestAttempt[]): MissedFact[] {
  const latest = attempts[attempts.length - 1];
  if (!latest) return [];
  return latest.missed.flatMap((miss) => {
    const question = questions[miss.questionIndex];
    if (!question) return [];
    const answer = isTypedQuestion(question) ? question.typedAnswer : (question.options[question.answer] ?? "");
    return [{ answer, q: question.q, ...(miss.why ? { why: miss.why } : {}) }];
  });
}

/** How many re-asks one mixed paper carries. More than this and the paper is
 *  remediation, not review — and the sources it spans get squeezed out. */
const MAX_REASKS = 15;

/**
 * Everything recent in one paper: sources concatenated, previously missed
 * questions appended for re-asking (owner 2026-08-31, from the post-exam
 * report's "spaced retrieval" failure: old material must come back, mixed with
 * new, and a missed question is the single highest-value thing to re-test).
 *
 * 🔴 THE MISSED SECTION IS BUDGETED FIRST. Under the material cap it is the
 * sources that get truncated, never the re-asks — a mixed review that silently
 * dropped exactly the questions the student failed would be the old failure
 * wearing a new name.
 *
 * 🔴🔴 AND EVERY SOURCE GETS A SHARE, WHICH IT DID NOT UNTIL 2026-09-03. The loop used to
 * slice each part against `budget - used`, so the FIRST part was free to eat the entire
 * budget and every later one arrived empty — silently, with the label still promising a
 * "mixed review across 9 sources". One long lecture starved eight decks. Now each part is
 * held to an equal share, and whatever a short part leaves unspent is handed on to the rest,
 * so the cap costs every source a little instead of costing most of them everything.
 */
export function mixedReviewMaterial(parts: StudyMaterial[], missed: MissedFact[]): StudyMaterial {
  const missedSection = missed.length
    ? `Previously missed:\n${missed
        .slice(0, MAX_REASKS)
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.q} — correct answer: ${entry.answer}` +
            (entry.why ? ` — the student's own diagnosis: "${MISS_KIND_LABEL[entry.why]}"` : ""),
        )
        .join("\n")}`.slice(0, MATERIAL_CHAR_LIMIT)
    : "";
  const budget = MATERIAL_CHAR_LIMIT - (missedSection ? missedSection.length + 2 : 0);
  const sources: string[] = [];
  let used = 0;
  let remaining = parts.length;
  for (const part of parts) {
    // The share is recomputed each time so a part that came in under its own share leaves
    // the surplus to the parts behind it rather than to nobody.
    const share = remaining > 0 ? Math.floor(Math.max(budget - used, 0) / remaining) : 0;
    remaining -= 1;
    if (share <= 0) continue;
    const block = `== ${part.label} ==\n${part.text}`.slice(0, share);
    if (!block) continue;
    sources.push(block);
    used += block.length + 2;
  }
  const text = [sources.join("\n\n"), missedSection].filter(Boolean).join("\n\n");
  return { label: `mixed review across ${parts.length} source${parts.length === 1 ? "" : "s"}`, text };
}

const GENERATION_SYSTEM =
  "You are Nemesis's study-deliverable engine. Build the requested deliverable STRICTLY from the " +
  "material provided — never invent facts the material does not contain. Return strict JSON only: " +
  "no markdown fences, no prose outside the JSON object. Never use emojis.";

export interface TestGenOpts {
  /**
   * What is known about THIS student's performance, in plain sentences — recent
   * scores, what they missed and how they tagged each miss, what they just
   * asked for. The model reads it and decides the paper.
   *
   * 🔴 A RECORD, NOT A RECIPE (owner 2026-08-31: "it should not be hardcoded —
   * DeepSeek should know what to do based on the given prompts... what the best
   * path for this user is"). An earlier draft commanded the composition — a
   * fixed ladder, a fixed share of scenario questions, a fixed re-ask order.
   * That was this file deciding the teaching. The examiner charter below hands
   * the model the evidence and the JUDGMENT; code keeps only what models are
   * measurably bad at (answer-position balance, grading, storage — see
   * test-answer-balance.ts for why "vary the positions" cannot be a prompt).
   */
  readonly record?: string;
}

/**
 * The examiner's charter: judgment over the paper's composition, guided by the
 * post-exam report's findings, decided per student rather than commanded.
 *
 * 🔴 FIELD-AGNOSTIC BY WORDING. "A situation from the material's own field" is
 * a patient vignette in a therapeutics paper and a fact pattern in a contracts
 * one, with no subject list to maintain.
 */
const EXAMINER_CHARTER =
  "You are this student's EXAMINER, not their tutor. From the material — and the record of this student's " +
  "performance, when one follows — YOU decide the paper's composition: the mix of direct recall, typed-answer " +
  "production and several-sentence situation questions set in the material's own field; how steeply the paper " +
  "climbs; and which previously missed or weakly held facts to re-test first, reworded, at a harder angle when " +
  "the record shows they were merely forgotten and gentler when they were never known. Let the record overrule " +
  "your defaults. Two standing findings to weigh: recognition masquerades as recall, so facts worth knowing cold " +
  "belong in typed questions; and ease is a signal to climb, never to stop — a well-aimed paper feels slightly " +
  "uncomfortable to a student who only recognises the material.";

export function buildTestGenMessages(material: StudyMaterial, questionCount: number, opts?: TestGenOpts): WireMsg[] {
  const count = Math.min(Math.max(questionCount, 3), MAX_QUESTIONS);
  return [
    { content: GENERATION_SYSTEM, role: "system" },
    {
      content:
        `Write a practice test of exactly ${count} multiple-choice questions from the student's ${material.label}. ` +
        `${EXAMINER_CHARTER}\n` +
        (opts?.record ? `The record of this student's performance:\n${opts.record}\n` : "") +
        // The item-writing rules are shared with the chat "test-craft" skill so
        // the two test-producing lanes cannot drift apart — see item-writing.ts.
        `Follow these rules:\n${EXAM_ITEM_RULES}\n\n` +
        // The example index used to read `"answer":0`, and models copy the
        // example — which is a large part of why every correct answer came out
        // first (owner 2026-07-24: "the answer isnt always B"). Written as a
        // placeholder now so the shape is still unambiguous without demonstrating
        // a position. The real guarantee is balanceAnswerPositions(), applied in
        // parseGeneratedTest after this reply comes back; this only helps the
        // model write better distractors while it is still deciding.
        'Return JSON shaped {"questions":[{"q":"…","options":["…","…","…","…"],"answer":<index>,"why":"…"}]} — ' +
        "4 options per question, answer is the 0-based index of the correct option, why is a one-sentence explanation " +
        "grounded in the material. If the material is too thin for that many questions, write fewer.\n\n" +
        // Typed items are OFFERED, not demanded: material with nothing worth
        // producing verbatim should come back all-choice, and does.
        "Where the material rewards producing the exact form — a conjugated or inflected word, a term of art, a name, " +
        'a short formula, a phrase in a language being studied — you may instead write a typed-answer question: ' +
        '{"q":"…","answer":"<the answer, written out>","accept":["<other correct spellings or phrasings>"],' +
        '"strict":<boolean>,"why":"…"} with no options. The student must produce it from memory and type it. ' +
        "Set strict true when the exact written form is the skill being tested — a conjugation where an accent " +
        "distinguishes tense, a spelling — and grading will require accents and marks; leave it false for phrases " +
        "and terms where writing mechanics are not the lesson (grading then forgives casing, accents and " +
        "punctuation, so list only genuinely different correct forms in accept). Keep typed answers short (a few " +
        "words) and use them for at most a third of the test.\n\n" +
        `Material:\n${material.text}`,
      role: "user",
    },
  ];
}

export function buildMindmapGenMessages(material: StudyMaterial): WireMsg[] {
  return [
    { content: GENERATION_SYSTEM, role: "system" },
    {
      content:
        `Build a mind-map outline of the student's ${material.label}. ` +
        'Return JSON shaped {"outline":"…"} where outline is markdown: one "# Topic" root heading, ' +
        "then nested bullets (2-space indents, at most 3 levels deep, at most 35 nodes total). " +
        "Short node labels (2-6 words), organized by concept — mechanisms, classes, contrasts, applications.\n\n" +
        `Material:\n${material.text}`,
      role: "user",
    },
  ];
}

/** Mermaid mindmap node text tolerates very little punctuation — quotes
 *  render literally and brackets/parens read as shape syntax, so strip them. */
function mermaidNodeText(text: string): string {
  const clean = text
    .replace(/[\r\n]+/g, " ")
    .replace(/[()[\]{}"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "…";
}

/** Convert a markdown outline (headings + nested bullets) into a mermaid
 *  `mindmap` diagram. Heading depth and bullet indentation both map to tree
 *  depth, same reading the desktop parser uses. */
export function outlineToMermaidMindmap(outline: string): string {
  const lines: Array<{ depth: number; text: string }> = [];
  let headingDepth = 0;
  for (const rawLine of outline.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(rawLine);
    if (heading?.[1] && heading[2]) {
      headingDepth = heading[1].length - 1;
      lines.push({ depth: headingDepth, text: heading[2].trim() });
      continue;
    }
    const bullet = /^(\s*)[-*+]\s+(.+?)\s*$/.exec(rawLine);
    if (bullet?.[2] !== undefined) {
      const indentDepth = Math.floor((bullet[1]?.length ?? 0) / 2);
      lines.push({ depth: headingDepth + 1 + indentDepth, text: bullet[2].trim() });
    }
  }
  if (lines.length === 0) return "mindmap\n  root((Mind map))";
  const [root, ...rest] = lines;
  const rootDepth = root?.depth ?? 0;
  const out = ["mindmap", `  root((${(root?.text ?? "Mind map").replace(/[()"`]/g, "")}))`];
  for (const line of rest) {
    const depth = Math.max(line.depth - rootDepth, 1);
    out.push(`${"  ".repeat(depth + 1)}${mermaidNodeText(line.text)}`);
  }
  return out.join("\n");
}

/**
 * What a typed answer must survive to be compared: casing, accents, punctuation
 * and spacing all go, letters and digits in every script stay.
 *
 * 🔴 FORGIVING ON PURPOSE, AND ONLY ABOUT WRITING MECHANICS. "Como esta usted"
 * matches "¿Cómo está usted?" because a test of Spanish phrasing is not a test
 * of whether the student's keyboard types accents. What it never forgives is the
 * words themselves — a different word is a different answer. Unicode-based, so
 * it is the same rule in every language and every field (the design test:
 * a law term and an engineering formula pass through it identically).
 */
export function normalisedAnswer(text: string, opts?: { keepMarks?: boolean }): string {
  // keepMarks is the strict lane: composed letters stay whole under NFC and
  // \p{M} spares the combining marks of scripts that have no composed forms.
  const folded = opts?.keepMarks
    ? text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    : text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  return folded.replace(/\s+/g, " ").trim();
}

/** Does a typed attempt count? The canonical answer and every `accept` entry
 *  are tried, all through the question's own normalisation \u2014 strict questions
 *  keep accents and marks. Empty input never matches. */
export function typedAnswerMatches(given: string, question: TypedTestQuestion): boolean {
  const keepMarks = question.strict;
  const attempt = normalisedAnswer(given, { keepMarks });
  if (!attempt) return false;
  return [question.typedAnswer, ...question.accept].some(
    (accepted) => normalisedAnswer(accepted, { keepMarks }) === attempt,
  );
}

/** Grade one finished run — picks[i] is the chosen option index (choice) or the
 *  typed text (typed) for questions[i]. */
export function scoreAttempt(questions: TestItem[], picks: Array<number | string>, at: string): TestAttempt {
  const missed: TestMiss[] = [];
  let score = 0;
  questions.forEach((question, index) => {
    const pick = picks[index];
    const right = isTypedQuestion(question)
      ? typeof pick === "string" && typedAnswerMatches(pick, question)
      : pick === question.answer;
    if (right) score += 1;
    else missed.push({ picked: pick ?? -1, questionIndex: index });
  });
  return { at, missed, score, total: questions.length };
}

/** The attempt to show in the tests table — best score, newest on ties. */
export function bestAttempt(attempts: TestAttempt[]): TestAttempt | null {
  let best: TestAttempt | null = null;
  for (const attempt of attempts) {
    if (!best || attempt.score / attempt.total >= best.score / best.total) best = attempt;
  }
  return best;
}

/** Colour band for the tests table's Score column. Cut at 80/60 — a
 *  content-agnostic strong/mid/weak read, not any course's grading scale. */
export type ScoreTone = "strong" | "mid" | "weak" | "none";

export function scoreTone(attempts: TestAttempt[]): ScoreTone {
  const best = bestAttempt(attempts);
  if (!best || best.total <= 0) return "none";
  const pct = (best.score / best.total) * 100;
  if (pct >= 80) return "strong";
  if (pct >= 60) return "mid";
  return "weak";
}

/** Missed questions as flashcard drafts — question on the front, the correct
 *  option plus the explanation on the back (active recall, not recognition). */
export function missedQuestionCards(questions: TestItem[], missed: TestMiss[]): Array<{ front: string; back: string }> {
  return missed.flatMap((miss) => {
    const question = questions[miss.questionIndex];
    if (!question) return [];
    const answer = isTypedQuestion(question) ? question.typedAnswer : (question.options[question.answer] ?? "");
    return [{ back: question.why ? `${answer}\n\n${question.why}` : answer, front: question.q }];
  });
}
