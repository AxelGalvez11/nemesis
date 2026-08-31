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

export interface TestMiss {
  questionIndex: number;
  /** The option INDEX picked (choice questions) or the TEXT typed (typed ones). */
  picked: number | string;
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
        // A typed miss records the TEXT the student wrote; a choice miss the index.
        if (typeof entry.picked === "string") return [{ picked: entry.picked.slice(0, MAX_TEXT), questionIndex }];
        const picked = Number(entry.picked);
        return Number.isInteger(picked) ? [{ picked, questionIndex }] : [];
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

const GENERATION_SYSTEM =
  "You are Nemesis's study-deliverable engine. Build the requested deliverable STRICTLY from the " +
  "material provided — never invent facts the material does not contain. Return strict JSON only: " +
  "no markdown fences, no prose outside the JSON object. Never use emojis.";

export function buildTestGenMessages(material: StudyMaterial, questionCount: number): WireMsg[] {
  const count = Math.min(Math.max(questionCount, 3), MAX_QUESTIONS);
  return [
    { content: GENERATION_SYSTEM, role: "system" },
    {
      content:
        `Write a practice test of exactly ${count} multiple-choice questions from the student's ${material.label}. ` +
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
