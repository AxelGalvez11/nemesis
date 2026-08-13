// npx tsx --test lib/workspace/canvas-recording.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasRecordingCopy,
  deliverRecordingToCanvas,
  readTranscriptionStatus,
  recordedSourceName,
  rejectOversizeRecording,
  usableTranscript,
  TRANSCRIPT_TIMEOUT_MS,
  type DeliverDeps,
} from "./canvas-recording";
import { RECORDING_MAX_BYTES } from "./recording-capture";

/** A blob stand-in: the code only reads `.size` and `.type`. */
function audio(bytes = 1_000, type = "audio/webm"): Blob {
  return { size: bytes, type } as unknown as Blob;
}

interface Recorded {
  uploads: Array<{ path: string; contentType: string }>;
  posts: Array<{ url: string; body: unknown }>;
  attached: Array<{ name: string; text: string }>;
  phases: string[];
}

function harness(statuses: unknown[], overrides: Partial<DeliverDeps> = {}): { deps: DeliverDeps; log: Recorded } {
  const log: Recorded = { attached: [], phases: [], posts: [], uploads: [] };
  let poll = 0;
  let clock = 0;
  const deps: DeliverDeps = {
    accessToken: "token",
    attach: async (file) => {
      log.attached.push({ name: file.name, text: (file as unknown as { __text: string }).__text });
    },
    makeFile: (text, name) => ({ name, __text: text } as unknown as File),
    newId: () => "11111111-2222-4333-8444-555555555555",
    now: () => clock,
    onPhase: (phase) => log.phases.push(phase),
    post: async (url, body) => {
      log.posts.push({ body, url });
      if (url.endsWith("/submit")) return { body: { jobId: "job-1" }, ok: true, status: 200 };
      const next = statuses[Math.min(poll, statuses.length - 1)];
      poll += 1;
      return { body: next, ok: true, status: 200 };
    },
    sleep: async () => { clock += 3_000; },
    uid: "user-1",
    upload: async (path, _blob, contentType) => {
      log.uploads.push({ contentType, path });
      return { error: null };
    },
    ...overrides,
  };
  return { deps, log };
}

test("a recorded lecture lands as a source on THIS canvas", async () => {
  const { deps, log } = harness([{ status: "processing" }, { status: "ready", transcript: "  The mitochondrion is the powerhouse.  " }]);
  const result = await deliverRecordingToCanvas(audio(), 90, deps);

  assert.deepEqual(result, { attached: true });
  // The audio went to the recordings bucket, under this user's own uid — the bucket's RLS is
  // `(storage.foldername(name))[1] = auth.uid()`, so a path that does not start with the uid is
  // refused outright.
  assert.equal(log.uploads.length, 1);
  assert.ok(log.uploads[0]!.path.startsWith("user-1/"), log.uploads[0]!.path);

  // 🔴 THE POINT OF THE WHOLE FEATURE: the transcript is handed over as a FILE, so it travels the
  // ordinary extraction path and becomes a real library_sources row plus a real CanvasSource.
  assert.equal(log.attached.length, 1);
  assert.equal(log.attached[0]!.text, "The mitochondrion is the powerhouse.");
  assert.ok(log.attached[0]!.name.endsWith(".txt"), log.attached[0]!.name);
  assert.ok(log.attached[0]!.name.startsWith("Recording · "), log.attached[0]!.name);
});

test("🔴 CONTROL — nothing here ever posts to the durable job route", async () => {
  // Without this, the silent-loss route and the correct one are indistinguishable from the
  // outside: BOTH produce a transcript, and only one of them puts it on this canvas.
  // /api/recordings/jobs coerces an unknown `surface` to "sessions", so a single call to it here
  // would file the lecture on a surface the learner was not looking at, and every other assertion
  // in this file would still pass.
  const { deps, log } = harness([{ status: "ready", transcript: "text" }]);
  await deliverRecordingToCanvas(audio(), 30, deps);

  for (const post of log.posts) {
    assert.ok(!post.url.includes("/api/recordings/jobs"), `posted to the durable job route: ${post.url}`);
    assert.ok(!JSON.stringify(post.body).includes("surface"), `sent a surface: ${JSON.stringify(post.body)}`);
    assert.ok(!JSON.stringify(post.body).includes("contextId"), `sent a contextId: ${JSON.stringify(post.body)}`);
  }
  assert.deepEqual(log.posts.map((p) => p.url), ["/api/transcription/submit", "/api/transcription/status"]);
});

test("a silent room attaches nothing rather than an empty source", async () => {
  const { deps, log } = harness([{ status: "ready", transcript: "   " }]);
  const result = await deliverRecordingToCanvas(audio(), 30, deps);
  assert.deepEqual(result, { attached: false, reason: "silent" });
  assert.equal(log.attached.length, 0, "an empty source reads as 'Nemesis could not understand my lecture'");
});

test("polling stops on a finished-but-empty job instead of spinning forever", async () => {
  // `ready` with no transcript is FINISHED, not pending. Collapsing the two is how a poll loop
  // runs until its timeout on a job that answered immediately.
  assert.deepEqual(readTranscriptionStatus({ status: "ready", transcript: "" }), { done: true, transcript: null });
  assert.deepEqual(readTranscriptionStatus({ status: "processing" }), { done: false });
  assert.deepEqual(readTranscriptionStatus({ status: "ready", transcript: "hi" }), { done: true, transcript: "hi" });
  assert.deepEqual(readTranscriptionStatus(null), { done: false });
  const failed = readTranscriptionStatus({ error: "provider rejected the job", status: "error" });
  assert.ok("failed" in failed && failed.message === "provider rejected the job");
});

test("a transcript that never arrives ends in a sentence, not a spinner", async () => {
  const { deps } = harness([{ status: "processing" }]);
  await assert.rejects(
    () => deliverRecordingToCanvas(audio(), 30, deps),
    (error: Error) => {
      // 🔴 It must not read as "something went wrong" — the recording genuinely IS saved.
      assert.match(error.message, /saved/i);
      return true;
    },
  );
});

test("the poll loop is bounded", () => {
  assert.ok(TRANSCRIPT_TIMEOUT_MS > 0 && Number.isFinite(TRANSCRIPT_TIMEOUT_MS));
});

test("quota is reported as quota, not as a network problem", async () => {
  const { deps } = harness([], {
    post: async (url) => url.endsWith("/submit")
      ? { body: { error: "You have reached this month's transcription limit." }, ok: false, status: 429 }
      : { body: {}, ok: true, status: 200 },
  });
  await assert.rejects(() => deliverRecordingToCanvas(audio(), 30, deps), /limit/i);
});

test("an oversize recording is refused before it is uploaded, not after", async () => {
  assert.equal(rejectOversizeRecording(1_000), null);
  assert.ok(rejectOversizeRecording(RECORDING_MAX_BYTES + 1));
  const { deps, log } = harness([{ status: "ready", transcript: "x" }]);
  await assert.rejects(() => deliverRecordingToCanvas(audio(RECORDING_MAX_BYTES + 1), 30, deps));
  assert.equal(log.uploads.length, 0, "the whole file must not go up before being refused");
});

test("a failed upload never claims the recording was saved", async () => {
  const { deps, log } = harness([{ status: "ready", transcript: "x" }], {
    upload: async () => ({ error: new Error("network") }),
  });
  await assert.rejects(() => deliverRecordingToCanvas(audio(), 30, deps), /could not be saved/i);
  assert.equal(log.attached.length, 0);
});

test("the learner is told what is happening, in order and in sentences", async () => {
  const { deps, log } = harness([{ status: "ready", transcript: "text" }]);
  await deliverRecordingToCanvas(audio(), 30, deps);
  assert.deepEqual(log.phases, ["uploading", "transcribing", "attaching"]);
  for (const phase of ["uploading", "transcribing", "attaching"] as const) {
    const copy = canvasRecordingCopy(phase);
    // Assert the BEHAVIOUR the copy has to have — a sentence aimed at a learner — rather than
    // checking for particular words, which a rename would satisfy while changing nothing.
    assert.ok(copy.length > 10, copy);
    assert.equal(copy, copy[0]!.toUpperCase() + copy.slice(1));
    assert.ok(!/\b(job|artifact|surface|context|payload|queue|stage)\b/i.test(copy), `internal vocabulary: ${copy}`);
  }
});

test("the source name says it was a recording", () => {
  const name = recordedSourceName(new Date("2026-08-13T14:05:00Z"));
  assert.ok(name.startsWith("Recording · "), name);
  assert.ok(name.endsWith(".txt"), name);
  assert.ok(usableTranscript("x"));
  assert.ok(!usableTranscript("   "));
  assert.ok(!usableTranscript(null));
});
