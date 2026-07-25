// The SHAPE of a practice test and a mind map, and the validators that decide
// whether a stored blob is usable. Pure — no Supabase, no React Native — which
// is the whole reason it lives in lib/ rather than beside the queries in
// api/studyArtifacts.ts: the mobile test runner (Deno) cannot load either.
//
// Ported from apps/web/lib/workspace/study-artifact-content.ts. Both clients
// read and now WRITE the same `study_artifacts.content` jsonb, so drift here
// means a test that works on the phone and breaks on the web.
//
// NOTHING IS TRUSTED. A row could have been written by the web app, by the
// phone's chat, or by a build from three weeks ago. Anything malformed is
// dropped rather than rendered: a question whose answer index points past its
// own options cannot be scored, and a test you cannot score is worse than a
// test that isn't there.

export type StudyArtifactKind = "test" | "mindmap";
export type StudyArtifactStatus = "draft" | "ready";

export interface TestQuestion {
  q: string;
  options: string[];
  /** 0-based index into `options` — always in bounds after parsing. */
  answer: number;
  why: string;
}

export interface TestAttempt {
  at: string;
  score: number;
  total: number;
  missed: { questionIndex: number; picked: number }[];
}

const MAX_TEXT = 500;
const MAX_OPTIONS = 6;
/** Enough for a full unit exam, short of a payload that would stall the phone. */
export const MAX_QUESTIONS_PER_TEST = 60;

export function cleanText(value: unknown, maxLength = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compact || null;
}

/** One question, or null if it can't be scored. Accepts both the web's field
 *  names and the looser ones a model reaches for (`question`, `explanation`). */
export function toQuestion(value: unknown): TestQuestion | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const q = cleanText(row.q ?? row.question);
  const why = cleanText(row.why ?? row.explanation) ?? "";
  const rawOptions = Array.isArray(row.options) ? row.options : [];
  const options = rawOptions
    .map((option) => cleanText(option))
    .filter((option): option is string => option !== null)
    .slice(0, MAX_OPTIONS);
  const answer = Number(row.answer);
  if (!q || options.length < 2) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  return { answer, options, q, why };
}

export function toAttempt(value: unknown): TestAttempt | null {
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

/** Every usable question in a list the model just wrote. Used by the chat tool
 *  lane before a test is saved, so a half-formed question never reaches the
 *  student's Study page — the same gate the reader applies on the way out. */
export function usableQuestions(raw: unknown): TestQuestion[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(toQuestion)
    .filter((question): question is TestQuestion => question !== null)
    .slice(0, MAX_QUESTIONS_PER_TEST);
}

/** The `"outline": "…"` value inside a JSON wrapper that did NOT parse — i.e. one
 *  the model's output ran out of tokens partway through. Stops at the first
 *  unescaped quote, so a complete-but-unparseable object works too. */
const TRUNCATED_OUTLINE_FIELD = /"outline"\s*:\s*"((?:[^"\\]|\\.)*)/;

/**
 * A mind map outline out of whatever the model produced, or null.
 *
 * Four shapes are accepted, because models reliably produce all four even when
 * told to produce one: a bare markdown outline, that outline fenced in
 * ```markdown, a {"outline": "…"} JSON wrapper, and that wrapper cut off
 * mid-string by a token limit. Anything with no heading and no bullet anywhere is
 * prose, not an outline, and is refused.
 *
 * The truncated-wrapper arm is not defensive padding — without it the bare
 * fallback matches the `- point` line INSIDE the broken JSON and returns the
 * whole string, so the mind map's first node renders as the literal text
 * `{"outline": "`. Salvaging the field is the difference between a short map and
 * a visibly broken one.
 */
export function parseOutline(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const fromJson = parsed?.outline;
      if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
    } catch {
      // Unparseable. Pull the field out by hand and put its escapes back —
      // JSON.parse on the quoted fragment does the unescaping correctly, including
      // \n, \t and \uXXXX, which a chain of .replace() calls would get wrong.
      const salvaged = TRUNCATED_OUTLINE_FIELD.exec(trimmed)?.[1];
      if (salvaged) {
        try {
          const text = JSON.parse(`"${salvaged}"`) as string;
          if (text.trim()) return text.trim();
        } catch {
          // The fragment ends inside an escape sequence; fall through to refuse.
        }
      }
      // A wrapper we could not read is refused outright rather than handed to the
      // bare arm below, which would return the JSON punctuation as outline text.
      return null;
    }
  }
  const bare = trimmed
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return /^(#{1,6}\s|[-*+]\s)/m.test(bare) ? bare : null;
}

/** Grade a finished run. `picks[i]` is the chosen option for `questions[i]`;
 *  -1 means unanswered, which counts as missed rather than silently correct. */
export function scoreAttempt(questions: TestQuestion[], picks: number[], at: string): TestAttempt {
  const missed: TestAttempt["missed"] = [];
  let score = 0;
  questions.forEach((question, index) => {
    if (picks[index] === question.answer) score += 1;
    else missed.push({ picked: picks[index] ?? -1, questionIndex: index });
  });
  return { at, missed, score, total: questions.length };
}

/** The attempt to show on a test row — best score, newest on ties. */
export function bestAttempt(attempts: TestAttempt[]): TestAttempt | null {
  let best: TestAttempt | null = null;
  for (const attempt of attempts) {
    if (!best || attempt.score / attempt.total >= best.score / best.total) best = attempt;
  }
  return best;
}
