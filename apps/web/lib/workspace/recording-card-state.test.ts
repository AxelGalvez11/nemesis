import assert from "node:assert/strict";
import test from "node:test";

import {
  decideRecordingCard,
  displayedRecordingContent,
  nextRecordingSessionTitle,
  RECORDING_NOTES_MISSING,
  RECORDING_NOTES_READY,
  type RecordingCardInputs,
} from "./recording-card-state";
import type { RecordingJob } from "./recording-job";

// ── The real incident, kept as data ─────────────────────────────────────────
//
// Every timestamp and length below is copied from the production rows for the
// lecture that broke this: a 47-minute recording whose notes were written and
// filed correctly, and whose chat card told the student the write-up had failed
// and the transcript was lost.
//
//   artifact 676e8b17…  transcript 34,250 chars   notes 10,520 chars
//   job      e8e9ccac…  ready, 6,016 words, 17 sections
//   note     b3af8625…  Pharmacy/Lectures/Diabetes Classification…
//
// 🔴 THE NUMBER THAT EXPLAINS THE WHOLE BUG:
//      notes_written_at   13:52:29.389
//      job ready          13:52:29.625
//   236 ms, against a 2-second poll. There was no render in which the notes
//   existed and the job was still processing, so any logic that needs to SEE
//   that overlap to conclude success will conclude failure instead — every time,
//   not occasionally.
const TRANSCRIPT = "Anything comes up that, you know, kind of repeat questions I'll make.".repeat(40);
const NOTES = "## Classification of diabetes\n\nType 1 is autoimmune beta-cell destruction.".repeat(20);

function job(overrides: Partial<RecordingJob> = {}): RecordingJob {
  return {
    artifactId: "676e8b17-6030-494a-a475-d07500a21726",
    contextId: "ctx-1",
    createdAt: "2026-08-06T13:51:13.235Z",
    durationSeconds: 2819,
    error: null,
    failedStage: null,
    id: "e8e9ccac-7f27-4a93-b9e8-344f285d555f",
    indexPending: false,
    libraryDocumentId: "b3af8625-33b5-445d-ba13-9bfc79614a27",
    messageId: "msg-1",
    noteSections: null,
    silenceSkipped: null,
    stage: "composing",
    status: "processing",
    title: "Recording · Aug 6, 2026, 1:51 PM",
    transcriptWords: 6016,
    updatedAt: "2026-08-06T13:52:00.000Z",
    ...overrides,
  };
}

function inputs(overrides: Partial<RecordingCardInputs> = {}): RecordingCardInputs {
  return { job: null, jobsLoaded: true, notes: "", snapshotFresh: true, transcript: TRANSCRIPT, ...overrides };
}

// ── The regression. This is the test that fails on the old code ─────────────

test("a stale snapshot never accuses the write-up of failing", () => {
  // Precisely the production moment: the job has gone `ready` and left the
  // watch, and the artifact on hand was fetched during `composing`, so it has a
  // transcript and no notes yet. The old code resolved here — permanently, with
  // the wrong sentence, on a recording that had succeeded.
  const decision = decideRecordingCard(inputs({ job: null, notes: "", snapshotFresh: false }));

  assert.deepEqual(decision, { action: "wait" });
});

test("the same inputs one refetch later report success", () => {
  const decision = decideRecordingCard(inputs({ notes: NOTES, snapshotFresh: true }));

  assert.deepEqual(decision, { action: "resolve", content: RECORDING_NOTES_READY });
});

// ── The decision table, row by row ──────────────────────────────────────────

test("notes on the row outrank a job that still calls itself processing", () => {
  // The 236 ms window, from the other side: notes are written before the job is
  // ticked over, so this state is REACHED on every successful recording. It must
  // read as success, not as work in progress.
  const decision = decideRecordingCard(inputs({ job: job({ stage: "filing" }), notes: NOTES }));

  assert.deepEqual(decision, { action: "resolve", content: RECORDING_NOTES_READY });
});

test("a job still working is waited for, however fresh the empty snapshot is", () => {
  const decision = decideRecordingCard(inputs({ job: job({ stage: "composing" }), snapshotFresh: true }));

  assert.deepEqual(decision, { action: "wait" });
});

test("only a failed job may say the write-up did not happen, and it brings its own words", () => {
  const decision = decideRecordingCard(inputs({
    job: job({
      error: "Writing the notes failed. The transcript is saved, so retrying only re-runs the write-up.",
      failedStage: "composing",
      status: "failed",
    }),
  }));

  assert.deepEqual(decision, {
    action: "resolve",
    content: "Writing the notes failed. The transcript is saved, so retrying only re-runs the write-up.",
  });
});

test("a failed job with no message of its own still gets honest wording", () => {
  const decision = decideRecordingCard(inputs({ job: job({ error: "  ", status: "failed" }) }));

  assert.deepEqual(decision, { action: "resolve", content: RECORDING_NOTES_MISSING });
});

test("an artifact from before the job pipeline resolves once its snapshot is current", () => {
  // The opposite landmine, and the reason `snapshotFresh` is a condition rather
  // than a blanket refusal: a recording that predates recording_jobs has no job
  // and never will. If absence of a job meant "wait", its card would pulse and
  // stay unclickable forever.
  const decision = decideRecordingCard(inputs({ job: null, notes: "", snapshotFresh: true }));

  assert.deepEqual(decision, { action: "resolve", content: RECORDING_NOTES_MISSING });
});

test("nothing is claimed before the jobs have been read even once", () => {
  const decision = decideRecordingCard(inputs({ jobsLoaded: false, snapshotFresh: true }));

  assert.deepEqual(decision, { action: "wait" });
});

test("a card with no transcript yet is not resolved by any combination of the rest", () => {
  for (const extra of [{}, { jobsLoaded: false }, { job: job({ status: "failed" }) }, { notes: NOTES }]) {
    assert.deepEqual(
      decideRecordingCard(inputs({ transcript: "   ", ...extra })),
      { action: "wait" },
      `resolved with no transcript: ${JSON.stringify(extra)}`,
    );
  }
});

// ── Healing what is already on screen ───────────────────────────────────────

test("a card already carrying the false claim reads correctly once the notes are in hand", () => {
  assert.equal(displayedRecordingContent(RECORDING_NOTES_MISSING, NOTES), RECORDING_NOTES_READY);
});

test("the claim stands while there really are no notes", () => {
  assert.equal(displayedRecordingContent(RECORDING_NOTES_MISSING, ""), RECORDING_NOTES_MISSING);
});

test("the correction only ever replaces Nemesis's own sentence", () => {
  // A student who typed something similar keeps every character of it.
  for (const written of [
    "Writing the notes did not finish",
    "Your recording is transcribed.",
    `${RECORDING_NOTES_MISSING} Also, remind me to email the professor.`,
    RECORDING_NOTES_READY,
    "",
  ]) {
    assert.equal(displayedRecordingContent(written, NOTES), written, `would have rewritten: ${written}`);
  }
});

test("correcting is idempotent — the corrected sentence stays corrected", () => {
  const once = displayedRecordingContent(RECORDING_NOTES_MISSING, NOTES);
  assert.equal(displayedRecordingContent(once, NOTES), once);
});

// ── The conversation's name ─────────────────────────────────────────────────

const PLACEHOLDER = "Recording · Aug 6, 2026, 1:51 PM";
const COMPOSED = "Diabetes Classification, Pathophysiology, and the Ominous Octet";
const FALLBACK = "Recorded session";

test("a conversation still carrying the dated placeholder takes the real title", () => {
  // The exact defect in the screenshot: the sidebar read "Recording · Aug 6,
  // 2026, 1:51 PM" while the composed title sat on the row unused, because the
  // old guard only allowed replacing the "Recorded session" default — and the
  // code had already replaced that with the placeholder itself.
  assert.equal(
    nextRecordingSessionTitle({ composed: COMPOSED, current: PLACEHOLDER, fallback: FALLBACK, placeholder: PLACEHOLDER }),
    COMPOSED,
  );
});

test("the untouched default is replaced too", () => {
  assert.equal(
    nextRecordingSessionTitle({ composed: COMPOSED, current: FALLBACK, fallback: FALLBACK, placeholder: PLACEHOLDER }),
    COMPOSED,
  );
});

test("a name the student typed is never overwritten", () => {
  assert.equal(
    nextRecordingSessionTitle({ composed: COMPOSED, current: "Diabetes exam prep", fallback: FALLBACK, placeholder: PLACEHOLDER }),
    null,
  );
});

test("the placeholder is never installed as though it were a result", () => {
  // Before compose runs, the job's title IS the placeholder. Adopting it is what
  // locked the old code out of ever using the real one.
  assert.equal(
    nextRecordingSessionTitle({ composed: PLACEHOLDER, current: FALLBACK, fallback: FALLBACK, placeholder: PLACEHOLDER }),
    null,
  );
});

test("no title, or one already in place, is left alone", () => {
  const base = { current: FALLBACK, fallback: FALLBACK, placeholder: PLACEHOLDER };
  assert.equal(nextRecordingSessionTitle({ ...base, composed: null }), null);
  assert.equal(nextRecordingSessionTitle({ ...base, composed: "   " }), null);
  assert.equal(nextRecordingSessionTitle({ ...base, composed: FALLBACK }), null);
});
