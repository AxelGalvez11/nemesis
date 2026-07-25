// Batch C content model for study_artifacts (owner 2026-07-21): tests carry
// real multiple-choice questions, mindmaps carry a markdown outline. Shapes
// mirror the desktop app's study extras (TestQuestion {q, options, answer,
// why}; outline = headings + nested bullets) so the two lanes stay coherent.
// Pure and dependency-free: LLM-reply parsing, jsonb validation, prompt
// builders, mermaid conversion, and attempt scoring all live here for tests.

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

export interface TestMiss {
  questionIndex: number;
  picked: number;
}

export interface TestAttempt {
  at: string;
  score: number;
  total: number;
  missed: TestMiss[];
}

export interface TestContent {
  questions: TestQuestion[];
  attempts: TestAttempt[];
}

export interface MindmapContent {
  outline: string;
}

const MAX_QUESTIONS = 25;
const MAX_OPTIONS = 6;
const MAX_TEXT = 500;
const MATERIAL_CHAR_LIMIT = 9_000;

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

function toAttempt(value: unknown): TestAttempt | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const at = typeof row.at === "string" ? row.at : null;
  const score = Number(row.score);
  const total = Number(row.total);
  if (!at || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  const missed = Array.isArray(row.missed)
    ? row.missed.flatMap((miss) => {
        if (typeof miss !== "object" || miss === null) return [];
        const entry = miss as Record<string, unknown>;
        const questionIndex = Number(entry.questionIndex);
        const picked = Number(entry.picked);
        return Number.isInteger(questionIndex) && Number.isInteger(picked) ? [{ picked, questionIndex }] : [];
      })
    : [];
  return { at, missed, score, total };
}

/** Validate a study_artifacts.content jsonb value as test content. */
export function parseTestContent(value: unknown): TestContent | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.questions)) return null;
  const questions = row.questions.map(toQuestion).filter((question): question is TestQuestion => question !== null);
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
export function parseGeneratedTest(raw: string): TestQuestion[] {
  const parsed = jsonSlice(raw);
  if (!parsed || !Array.isArray(parsed.questions)) return [];
  const questions = parsed.questions
    .map(toQuestion)
    .filter((question): question is TestQuestion => question !== null)
    .slice(0, MAX_QUESTIONS);
  return balanceAnswerPositions(questions);
}

/** Parse one generation reply into an outline. Accepts {outline} JSON or a
 *  bare markdown outline (models sometimes skip the wrapper). */
export function parseGeneratedMindmap(raw: string): string | null {
  const parsed = jsonSlice(raw);
  const fromJson = parsed ? (parsed as Record<string, unknown>).outline : null;
  if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
  const bare = raw.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
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

/** Grade one finished run — picks[i] is the chosen option for questions[i]. */
export function scoreAttempt(questions: TestQuestion[], picks: number[], at: string): TestAttempt {
  const missed: TestMiss[] = [];
  let score = 0;
  questions.forEach((question, index) => {
    if (picks[index] === question.answer) score += 1;
    else missed.push({ picked: picks[index] ?? -1, questionIndex: index });
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

/** Missed questions as flashcard drafts — question on the front, the correct
 *  option plus the explanation on the back (active recall, not recognition). */
export function missedQuestionCards(questions: TestQuestion[], missed: TestMiss[]): Array<{ front: string; back: string }> {
  return missed.flatMap((miss) => {
    const question = questions[miss.questionIndex];
    if (!question) return [];
    const answer = question.options[question.answer] ?? "";
    return [{ back: question.why ? `${answer}\n\n${question.why}` : answer, front: question.q }];
  });
}
