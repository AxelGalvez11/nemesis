import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  describeRecordingLength,
  jobDetail,
  jobHeadline,
  RECORDING_JOB_COLUMNS,
  SERVER_STAGES,
  stageIndex,
  STAGE_ORDER,
  stageLabel,
  toRecordingJob,
  transcriptReady,
} from "./recording-job";

/** Repo root is four levels up from apps/web/lib/workspace/. */
const repoFile = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

const WORKER_PIPELINE = "supabase/functions/recording-worker/pipeline.ts";
const MIGRATION = "supabase/migrations/20260806024500_recording_jobs.sql";

// ── The vocabulary, in three places that must agree ─────────────────────────
//
// A stage is written by a Deno edge function, constrained by a Postgres CHECK,
// and rendered by this TypeScript. None of the three can import the others, so
// this reads the other two as text. The failure they prevent is quiet: a stage
// the app has never heard of renders as a blank progress line on a lecture the
// student is waiting for, and nothing errors.

test("the stage list matches the worker's", () => {
  const source = repoFile(WORKER_PIPELINE);
  const declared = source.match(/export const STAGES = \[([^\]]+)\]/);
  assert.ok(declared, "the worker must still declare STAGES as a literal array");
  const stages = [...declared[1]!.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(stages, [...SERVER_STAGES]);
});

test("the stage list matches the database's check constraint", () => {
  const source = repoFile(MIGRATION);
  const check = source.match(/stage text not null default 'queued'\s*\n\s*check \(stage in \(([^)]+)\)\)/);
  assert.ok(check, "the migration must still pin `stage` with a check constraint");
  const stages = [...check[1]!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(stages, [...SERVER_STAGES]);
});

// `uploading` is the browser's own stage and deliberately has no row: the audio
// is still in memory at that point, so there is nothing durable to record it
// against. It must lead the list, because it happens before everything else.
test("uploading is a client stage and comes first", () => {
  assert.equal(STAGE_ORDER[0], "uploading");
  assert.equal((SERVER_STAGES as readonly string[]).includes("uploading"), false);
  assert.equal(stageIndex("uploading"), 0);
  assert.ok(stageIndex("transcribing") > stageIndex("uploading"));
  assert.ok(stageIndex("ready") > stageIndex("indexing"));
});

test("every stage has a label", () => {
  for (const stage of STAGE_ORDER) {
    const label = stageLabel(stage);
    assert.ok(label.length > 0, stage);
    // Read by someone waiting on a lecture, not by an engineer reading logs.
    assert.equal(label, label.trim());
  }
});

test("every selected column exists on the table", () => {
  const migration = repoFile(MIGRATION);
  for (const column of RECORDING_JOB_COLUMNS.split(",")) {
    assert.ok(
      new RegExp(`\\b${column}\\b`).test(migration),
      `${column} is selected by the app but is not in the migration`,
    );
  }
});

// ── Reading a row ───────────────────────────────────────────────────────────

const ROW = {
  id: "job-1",
  status: "processing",
  stage: "composing",
  failed_stage: null,
  error: null,
  context_id: "session-1",
  message_id: "message-1",
  artifact_id: "artifact-1",
  library_document_id: "doc-1",
  title: "Renal clearance and dosing",
  duration_seconds: 3_120,
  silence_skipped: "12 minutes of quiet skipped",
  transcript_words: 8_400,
  note_sections: 7,
  index_pending: false,
  created_at: "2026-08-05T18:00:00.000Z",
  updated_at: "2026-08-05T18:04:00.000Z",
};

test("a row becomes a job", () => {
  const job = toRecordingJob(ROW);
  assert.ok(job);
  assert.equal(job.stage, "composing");
  assert.equal(job.artifactId, "artifact-1");
  assert.equal(job.transcriptWords, 8_400);
  assert.equal(job.indexPending, false);
});

// A build that is BEHIND the worker would otherwise render a confidently wrong
// stage on a lecture that is still running. Refusing the row shows nothing,
// which is the honest answer to "I do not know what this is".
test("an unrecognised stage is refused, not guessed", () => {
  assert.equal(toRecordingJob({ ...ROW, stage: "summarising" }), null);
  assert.equal(toRecordingJob({ ...ROW, stage: null }), null);
  assert.equal(toRecordingJob({ id: "job-1" }), null);
  assert.equal(toRecordingJob(null), null);
});

test("an unrecognised status reads as still working", () => {
  // The safe direction: a job wrongly called ready stops being watched, and the
  // student is told a recording is finished when it is not.
  assert.equal(toRecordingJob({ ...ROW, status: "weird" })?.status, "processing");
  assert.equal(toRecordingJob({ ...ROW, status: "ready" })?.status, "ready");
  assert.equal(toRecordingJob({ ...ROW, status: "failed" })?.status, "failed");
});

// ── Detail: only what was counted ───────────────────────────────────────────

test("the detail line reports measurements and nothing else", () => {
  const job = toRecordingJob(ROW)!;
  const detail = jobDetail(job);
  assert.ok(detail);
  assert.match(detail, /52 min recording/);
  assert.match(detail, /8,400 words/);
  assert.match(detail, /7 sections/);
  // No percentage, and no guess at time remaining. Neither is known, and the
  // whole design turns on not inventing them.
  assert.doesNotMatch(detail, /%/);
  assert.doesNotMatch(detail, /remaining|left|about/i);
});

test("counts that do not exist yet are simply absent", () => {
  const early = toRecordingJob({ ...ROW, note_sections: null, stage: "transcribing", transcript_words: null })!;
  assert.equal(jobDetail(early), "52 min recording");
});

test("a recording length reads in words, not a clock", () => {
  assert.equal(describeRecordingLength(0), null);
  assert.equal(describeRecordingLength(45), "45s recording");
  assert.equal(describeRecordingLength(3_120), "52 min recording");
  assert.equal(describeRecordingLength(3_600), "1 hr recording");
  assert.equal(describeRecordingLength(5_400), "1 hr 30 min recording");
});

// ── Progressive reveal ──────────────────────────────────────────────────────
//
// The transcript exists from the moment transcription finishes, so the card
// opens then rather than staying inert until the notes, the filing and the
// indexing have all landed too.
test("the transcript is openable before the notes are written", () => {
  assert.equal(transcriptReady({ stage: "queued", status: "processing" }), false);
  assert.equal(transcriptReady({ stage: "transcribing", status: "processing" }), false);
  assert.equal(transcriptReady({ stage: "composing", status: "processing" }), true);
  assert.equal(transcriptReady({ stage: "indexing", status: "processing" }), true);
  assert.equal(transcriptReady({ stage: "ready", status: "ready" }), true);
});

test("a failure names the step it stopped at", () => {
  const headline = jobHeadline({ failedStage: "composing", stage: "composing", status: "failed" });
  assert.match(headline, /writing the notes/);
  assert.match(jobHeadline({ failedStage: null, stage: "ready", status: "ready" }), /ready/i);
  assert.match(jobHeadline({ failedStage: null, stage: "transcribing", status: "processing" }), /processing this recording/i);
});
