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
// The validators live in lib/study-artifact-content.ts — pure, so the Deno test
// runner can load them (it can load neither Supabase nor React Native) — and are
// ports of the web's lib/workspace/study-artifact-content.ts. Keep them in step
// with that original: both clients read the same rows, so drift means a test that
// works on one device and vanishes on the other.
import { supabase } from "./supabase";
import {
  bestAttempt,
  cleanText,
  parseOutline,
  scoreAttempt,
  toAttempt,
  toQuestion,
  usableQuestions,
  type StudyArtifactKind,
  type StudyArtifactStatus,
  type TestAttempt,
  type TestQuestion,
} from "@/lib/study-artifact-content";
import { balanceAnswerPositions } from "@/lib/test-answer-balance";

// Re-exported so every caller keeps importing artifacts from ONE place: the
// screens want the row type and the scorer together, and splitting that across
// two import paths buys nothing.
export { bestAttempt, scoreAttempt };
export type { StudyArtifactKind, StudyArtifactStatus, TestAttempt, TestQuestion };

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
/** Titles and folder names are shown on a row, so they are clipped to what a row
 *  can hold rather than to the column's limit. */
const MAX_TITLE = 160;
const MAX_GROUP = 120;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
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
    // Ordered exactly like the web workspace's artifact fetch (updated_at desc,
    // then id). It used to sort by created_at, so the same two tests appeared in
    // a different order on each surface as soon as one of them was taken —
    // taking a test writes its attempt back and moves updated_at, not created_at.
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_ARTIFACTS);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => toArtifact(row as Record<string, unknown>))
    .filter((artifact): artifact is StudyArtifact => artifact !== null);
}

/** Fetch one exact artifact for a fullscreen route opened from Study or chat. */
export async function getStudyArtifact(id: string): Promise<StudyArtifact | null> {
  const artifactId = id.trim();
  if (!artifactId) return null;
  const { data, error } = await supabase
    .from("study_artifacts")
    .select("id,kind,title,group_name,status,content,created_at")
    .eq("id", artifactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toArtifact(data as Record<string, unknown>) : null;
}

/**
 * Save a practice test the chat just wrote (owner 2026-07-24: "the phone chat
 * needs to be able to create flashcards, tests, mindmaps and those should show up
 * in the study page").
 *
 * The questions go through the SAME validator the reader uses, so a malformed
 * question is refused here rather than landing as an unusable row — and then
 * through balanceAnswerPositions, so a paper written on the phone has its correct
 * answers spread across the positions exactly like one written on the web. That
 * call is safe only because the paper is brand new: `attempts` starts empty, and
 * reordering options after an attempt exists would rewrite what the student
 * answered (see lib/test-answer-balance.ts).
 *
 * `user_id` is written explicitly. The column does default to `auth.uid()`, but
 * every other write in this app names it, and a row that silently depends on a
 * server-side default is a row that breaks quietly if that default is ever
 * dropped.
 */
export async function createStudyTest(
  userId: string,
  input: { title: string; groupName?: string; questions: unknown },
): Promise<{ id: string; questions: TestQuestion[] }> {
  const title = cleanText(input.title, MAX_TITLE);
  if (!title) throw new Error("A test needs a title.");
  const questions = balanceAnswerPositions(usableQuestions(input.questions));
  if (questions.length === 0) {
    throw new Error("No usable questions — each needs a prompt, at least two options, and a valid answer index.");
  }
  const { data, error } = await supabase
    .from("study_artifacts")
    .insert({
      content: { attempts: [], questions },
      group_name: cleanText(input.groupName, MAX_GROUP) ?? "",
      kind: "test",
      status: "ready",
      title,
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = str(data?.id);
  if (!id) throw new Error("The test was saved but came back unreadable.");
  return { id, questions };
}

/** Save a mind map the chat just wrote. The outline is re-validated here because
 *  a model asked for "a markdown outline" also produces JSON wrappers, fenced
 *  blocks, and plain prose — and prose renders as a single blob, which is not a
 *  mind map. See parseOutline. */
export async function createStudyMindmap(
  userId: string,
  input: { title: string; groupName?: string; outline: string },
): Promise<{ id: string; outline: string }> {
  const title = cleanText(input.title, MAX_TITLE);
  if (!title) throw new Error("A mind map needs a title.");
  const outline = parseOutline(input.outline);
  if (!outline) {
    throw new Error("That outline wasn't usable — it needs a '# Topic' heading and nested '- ' bullets.");
  }
  const { data, error } = await supabase
    .from("study_artifacts")
    .insert({
      content: { outline },
      group_name: cleanText(input.groupName, MAX_GROUP) ?? "",
      kind: "mindmap",
      status: "ready",
      title,
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = str(data?.id);
  if (!id) throw new Error("The mind map was saved but came back unreadable.");
  return { id, outline };
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

// Deliberately NOT ported here yet: the web's missedQuestionCards(), which turns
// the questions you got wrong into flashcard drafts. It needs a deck picker and a
// card-insert path on top of it to mean anything, and a helper with no caller is
// dead weight that reads as a half-built feature. Worth building as its own thing
// — "turn my misses into cards" is a genuinely good end to a test.
