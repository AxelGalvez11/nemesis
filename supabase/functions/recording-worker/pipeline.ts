// The decisions the recording worker makes, with no I/O in sight.
//
// Everything here is pure so the parts that are easy to get quietly wrong — the
// backoff curve, when a stage gives up, where the model's title ends and its
// notes begin — can be tested without a database, a provider, or a clock.
//
// index.ts does the talking; this file does the deciding.

/** Stages the worker owns. MIRRORS the `stage` check constraint in
 *  20260805T01_recording_jobs.sql and SERVER_STAGES in
 *  apps/web/lib/workspace/recording-job.ts. A stage set here that the web app
 *  has never heard of renders as a blank progress line, so
 *  apps/web/lib/workspace/recording-job.test.ts reads this file and checks the
 *  three lists still agree. */
export const STAGES = ["queued", "transcribing", "composing", "filing", "indexing", "ready"] as const;
export type Stage = (typeof STAGES)[number];

/** What a stage decided. `wait` is not a failure — a provider that has not
 *  finished yet is the normal case, and treating it as an error is how a
 *  perfectly healthy job ends up backed off for hours. */
export type StageOutcome =
  | { kind: "advance"; to: Stage }
  | { kind: "wait"; seconds: number }
  | { kind: "fail"; message: string };

/**
 * How long to wait before the next attempt at the SAME stage.
 *
 * Doubling from two seconds, capped at a minute. The cap matters more than the
 * curve: the slow lane here is AssemblyAI, which answers in tens of seconds for
 * a normal lecture, so a backoff that grew to ten minutes would turn a provider
 * hiccup into a student staring at "Transcribing audio" long after the
 * transcript was ready on the other end.
 *
 * Capped at a minute also means the pg_cron safety net (one tick a minute) is
 * never the thing holding a job back.
 */
export function backoffSeconds(stageAttempts: number): number {
  const attempt = Math.max(1, Math.floor(stageAttempts));
  return Math.min(60, 2 ** Math.min(attempt, 6));
}

/**
 * How many attempts a stage gets before the job is declared failed.
 *
 * `transcribing` is generous because most of its attempts are POLLS, not
 * retries — a long lecture on the asynchronous provider legitimately needs many.
 * At the cap above, 60 attempts is roughly 45 minutes of polling, which is far
 * past any real transcript and still bounded.
 *
 * `composing` and `filing` get few: they are single calls, and one that fails
 * five times is broken rather than slow. Failing fast there is what makes the
 * retry button useful instead of something you press while the job would have
 * recovered anyway.
 */
export function stageAttemptLimit(stage: Stage): number {
  switch (stage) {
    case "transcribing": return 60;
    case "indexing": return 15;
    default: return 5;
  }
}

/** The stage after this one. `ready` has no successor. */
export function nextStage(stage: Stage): Stage {
  const index = STAGES.indexOf(stage);
  return index < 0 || index >= STAGES.length - 1 ? "ready" : STAGES[index + 1]!;
}

// ── The compose pass ────────────────────────────────────────────────────────

// The prompt, the title extraction and the two counters all come from
// packages/shared/src/recording-note.ts and are RE-EXPORTED here rather than
// re-written.
//
// This is the file that would have grown a second copy of the notes prompt —
// the worker cannot import from the Next.js app, so copying was the obvious
// move. It is also exactly what went wrong in July, when the phone ran an older
// prompt against the same audio and the notes came back worse with nothing
// anywhere reporting a difference. A relative import into packages/shared is
// how supabase/functions/ask already reaches shared code, so there is no reason
// to keep two sets of words.
export {
  buildRecordingNoteMessages as buildNoteMessages,
  countNoteSections as countSections,
  countTranscriptWords as countWords,
  RECORDING_NOTE_TRANSCRIPT_CHARS as TRANSCRIPT_CHARS,
  RECORDING_TITLE_MAX_CHARS as TITLE_MAX_CHARS,
  splitRecordingNote as splitNote,
} from "../../../packages/shared/src/recording-note.ts";

/** A provider or database error trimmed to something a student can read and a
 *  column can hold. Never carries a stack or a token-shaped string. */
export function describeFailure(value: unknown, fallback: string): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const safe = raw
    .replace(/\b(?:xai|sk|gsk|nmk|Bearer)[-_ ][A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return (safe || fallback).slice(0, 300);
}
