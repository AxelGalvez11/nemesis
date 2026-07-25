// Cloud study ARTIFACTS — the practice tests and mind maps that live alongside
// decks in `study_artifacts`. Same table the web workspace reads and writes
// (apps/web/lib/workspace/study-cloud-store.ts), so an artifact made on one
// device opens on the other with no translation layer.
//
// WHY THE PHONE NEEDED THIS AT ALL. The Study page has had Cards / Tests /
// Mindmaps segments for weeks, and the last two rendered "coming soon" — the
// phone had no artifact reader of any kind. So a test the student made on the web,
// or that the chat wrote for them, existed in their account and was invisible on
// the device they actually study on.
//
// CONTENT SHAPES ARE VALIDATED, NEVER TRUSTED. `content` is a jsonb column and
// the row could have been written by the web app, by chat, or by an older build.
// The parsers below are ports of the web's (lib/workspace/study-artifact-content.ts)
// and drop anything malformed rather than rendering a broken test. Keep them in
// step with the web original: both clients read the same rows, so drift means a
// test that works on one device and vanishes on the other.
import { supabase } from "./supabase";

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

export interface StudyArtifact {
  id: string;
  kind: StudyArtifactKind;
  title: string;
  /** The Study folder it sits in ("" for top level) — the same `::`-free group
   *  name the deck rows use. */
  groupName: string;
  status: StudyArtifactStatus;
  createdAt: string;
  /** Present for a ready test. */
  questions?: TestQuestion[];
  attempts?: TestAttempt[];
  /** Present for a ready mind map: a markdown outline. */
  outline?: string;
}

const MAX_ARTIFACTS = 200;
const MAX_TEXT = 500;
const MAX_OPTIONS = 6;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cleanText(value: unknown, maxLength = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return compact || null;
}

/** Port of the web's toQuestion. A question with no prompt, fewer than two
 *  options, or an answer index outside those options is unusable — dropped, not
 *  shown, because a test you cannot score right is worse than a missing one. */
function toQuestion(value: unknown): TestQuestion | null {
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

function toArtifact(row: Record<string, unknown>): StudyArtifact | null {
  const id = str(row.id);
  const kind = str(row.kind);
  if (!id || (kind !== "test" && kind !== "mindmap")) return null;
  const content = typeof row.content === "object" && row.content !== null ? (row.content as Record<string, unknown>) : {};
  const status = str(row.status) === "draft" ? "draft" : "ready";
  const base: StudyArtifact = {
    createdAt: str(row.created_at),
    groupName: str(row.group_name),
    id,
    kind,
    status,
    title: str(row.title) || "Untitled",
  };
  if (kind === "test") {
    const questions = (Array.isArray(content.questions) ? content.questions : [])
      .map(toQuestion)
      .filter((question): question is TestQuestion => question !== null);
    const attempts = (Array.isArray(content.attempts) ? content.attempts : [])
      .map(toAttempt)
      .filter((attempt): attempt is TestAttempt => attempt !== null);
    return { ...base, attempts, questions };
  }
  const outline = str(content.outline).trim();
  return { ...base, ...(outline ? { outline } : {}) };
}

/** Every test and mind map in the student's account, newest first.
 *
 *  No user_id filter: `study_artifacts` is RLS-scoped to the signed-in user, the
 *  same way the deck and card reads in cloudStudy.ts are. Adding one here would
 *  imply the others are unprotected, which they are not. */
export async function listStudyArtifacts(): Promise<StudyArtifact[]> {
  const { data, error } = await supabase
    .from("study_artifacts")
    .select("id,kind,title,group_name,status,content,created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ARTIFACTS);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => toArtifact(row as Record<string, unknown>))
    .filter((artifact): artifact is StudyArtifact => artifact !== null);
}

/** Record one finished run against a test.
 *
 *  Read-modify-write on the `content` jsonb rather than an append: there is no
 *  array-append primitive here, and a test is taken by one person on one device
 *  at a time, so the race this loses to is not a real one. The QUESTIONS are
 *  written back exactly as they were read — they must never be reordered at this
 *  point, because an attempt stores the picked option as an INDEX and moving the
 *  options would rewrite what the student answered. */
export async function recordTestAttempt(artifact: StudyArtifact, attempt: TestAttempt): Promise<TestAttempt[]> {
  const attempts = [...(artifact.attempts ?? []), attempt];
  const { error } = await supabase
    .from("study_artifacts")
    .update({ content: { attempts, questions: artifact.questions ?? [] } })
    .eq("id", artifact.id);
  if (error) throw new Error(error.message);
  return attempts;
}

/** Remove a test or mind map. PERMANENT, matching the web behaviour and the
 *  phone's existing Study deletes (Study is a hard delete here; Library is the
 *  surface with a soft one — see nemesis-ios-batch-6). */
export async function deleteStudyArtifact(id: string): Promise<void> {
  const { error } = await supabase.from("study_artifacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Missed questions as flashcard drafts — the prompt on the front, the correct
 *  option plus its explanation on the back. Active recall, not recognition. */
export function missedQuestionCards(questions: TestQuestion[], missed: TestAttempt["missed"]): { front: string; back: string }[] {
  return missed.flatMap((miss) => {
    const question = questions[miss.questionIndex];
    if (!question) return [];
    const answer = question.options[question.answer] ?? "";
    return [{ back: question.why ? `${answer}\n\n${question.why}` : answer, front: question.q }];
  });
}
