// A lecture recorded on the Canvas becomes a SOURCE ON THAT CANVAS.
//
// 🔴 THIS FILE EXISTS BECAUSE THE OBVIOUS ROUTE IS A SILENT LOSS. The durable pipeline
// (/api/recordings/jobs) files a recording as a Library note under `surface`, and `surface` is a
// closed set — a TS union AND a Postgres CHECK on both `chat_recording_artifacts` and
// `recording_jobs`. The route coerces anything it does not recognise:
//
//     const surface = body.surface === "notebook" ? "notebook" : "sessions";
//
// So posting `surface: "canvas"` returns 200, creates three rows, runs the job and produces a
// transcript — filed on /sessions, invisible to the Canvas. Green everywhere, nothing on screen.
// Passing a canvas id as `contextId` under `surface: "sessions"` is worse: a row no surface reads
// correctly. Neither is a shortcut; both are silent losses.
//
// What this does instead uses only doors that already exist. The audio goes to the same
// `recordings` bucket; the transcript comes from the same `nemesis-transcribe` function the phone
// already calls; and the text is then handed to the ORDINARY extraction chokepoint as a file —
// the identical path a dropped .txt takes. That is what makes it a real `library_sources` row and
// a real `CanvasSource`, rather than a fourth thing that happens to look like one.
//
// 🔴 WHAT THIS DELIBERATELY DOES NOT DO, AND THE CLAIM THAT HAD TO BE WITHDRAWN. It does not
// survive the tab closing between stopping and the transcript landing. This file first said "the
// audio is safe either way". IT IS NOT, and the code says so:
//
//   nemesis-transcribe /submit  →  removeObject(storagePath)   on the xAI and Groq paths
//   nemesis-transcribe /status  →  hands the transcript over ONCE, then patches it to null
//
// The primary provider answers synchronously, deletes the assembled audio inside `submit`, and the
// database copy of the text is cleared the first time it is read. So once this client holds the
// transcript, THE FETCH RESPONSE IS THE ONLY COPY IN EXISTENCE. That is precisely why the /sessions
// worker writes its artifact row before anything else.
//
// The consequence for every failure path below: NOTHING may be swallowed. `useRecordingSession`
// treats a resolved `deliver` as success and calls `discard()`, which forgets the recovery
// manifest — so a swallowed error would take away the recording AND the only route back to its
// parts. Errors propagate; the hook's own catch leaves the manifest alone.

import { describeRecordingBlob, recordingStoragePath, RECORDING_MAX_BYTES } from "./recording-capture";

/** How often to ask whether the transcript is ready. The provider ladder answers synchronously for
 *  xAI and asynchronously for AssemblyAI, so this only ever loops on the second. */
export const TRANSCRIPT_POLL_MS = 3_000;

/** How long to keep asking before saying so. A three-hour lecture is the pipeline's own ceiling and
 *  AssemblyAI runs at well under real time, so this is generous rather than tight — but it is
 *  FINITE, because a poll loop with no end is how a stalled job becomes a spinner forever. */
export const TRANSCRIPT_TIMEOUT_MS = 20 * 60 * 1_000;

/** What the learner is told while each part happens. Plain sentences, not stage names. */
export type CanvasRecordingPhase = "uploading" | "transcribing" | "attaching";

export function canvasRecordingCopy(phase: CanvasRecordingPhase): string {
  if (phase === "uploading") return "Saving your recording…";
  if (phase === "transcribing") return "Writing down what was said…";
  return "Adding it to this canvas…";
}

/**
 * The name a recorded lecture carries into the Sources panel.
 *
 * 🔴 IT MUST READ AS A RECORDING, NOT AS A FILE SOMEONE UPLOADED. A learner looking at their
 * sources needs to tell "the lecture I recorded on Tuesday" from "the slides I dropped in", and
 * the only thing carrying that distinction is this name.
 *
 * `.txt` because the extraction boundary reads the extension and `text/plain` is on the
 * `library-sources` bucket allowlist as of migration 20260812T03. An extension the bucket refuses
 * would fail the upload after the recording was already made, which is the worst possible moment.
 */
export function recordedSourceName(at: Date = new Date()): string {
  const stamp = at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return `Recording · ${stamp}.txt`;
}

/** Whether a transcript is worth attaching at all. A recording of a silent room produces an empty
 *  string, and attaching that would put a source on the canvas with nothing in it — which reads to
 *  the learner as "Nemesis could not understand my lecture" rather than "nothing was said". */
export function usableTranscript(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface TranscriptionStatus {
  status?: string;
  transcript?: string | null;
  error?: string;
}

/**
 * Read one `/api/transcription/status` answer.
 *
 * 🔴 THREE OUTCOMES, NOT TWO. "still working" and "finished with nothing" are different facts and
 * collapsing them is how a poll loop either gives up early or spins forever. A job that is `ready`
 * with an empty transcript is FINISHED — it heard nothing — and must stop the loop.
 */
export function readTranscriptionStatus(body: TranscriptionStatus | null):
  | { done: true; transcript: string }
  | { done: true; transcript: null }
  | { done: false }
  | { failed: true; message: string } {
  if (!body) return { done: false };
  const status = typeof body.status === "string" ? body.status : "";
  if (status === "error" || status === "failed") {
    return { failed: true, message: body.error ?? "That recording could not be transcribed." };
  }
  if (usableTranscript(body.transcript)) return { done: true, transcript: body.transcript.trim() };
  // `ready`/`completed` with nothing in it is a finished job, not a pending one.
  if (status === "ready" || status === "completed" || status === "done") return { done: true, transcript: null };
  return { done: false };
}

/** The blob is refused BEFORE it is uploaded, in words a learner can act on — storage would
 *  otherwise answer with a bare error after the whole file had gone up. */
export function rejectOversizeRecording(bytes: number): string | null {
  if (bytes <= RECORDING_MAX_BYTES) return null;
  return "That recording is too long to save in one piece. Record in shorter sessions — they will still all sit on this canvas.";
}

/** What turning ALREADY-STORED audio into a canvas source needs. Recovery has this much and no
 *  more — the audio is in the bucket already, so there is nothing to upload. */
export interface TranscribeDeps {
  accessToken: string;
  uid: string;
  /** POST a JSON body to one of the two transcription routes. */
  post: (url: string, body: unknown, token: string) => Promise<{ ok: boolean; status: number; body: unknown }>;
  /** Hand the finished text to the canvas as an ordinary file. */
  attach: (file: File) => Promise<void>;
  onPhase?: (phase: CanvasRecordingPhase) => void;
  /** Injected for tests; real callers leave these alone. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
  makeFile?: (text: string, name: string) => File;
}

export interface DeliverDeps extends TranscribeDeps {
  /** Upload the audio and resolve to its storage path. Injected so the whole flow can be tested
   *  without a network or a browser. */
  upload: (path: string, blob: Blob, contentType: string) => Promise<{ error: unknown }>;
}

/**
 * Take a finished recording all the way to a source on this canvas.
 *
 * Throws with a sentence a learner can read. Every failure leaves the audio in the bucket rather
 * than deleting it, because a transcript that failed is a recoverable problem and a deleted lecture
 * is not.
 */
export async function deliverRecordingToCanvas(
  blob: Blob,
  seconds: number,
  deps: DeliverDeps,
): Promise<void> {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const oversize = rejectOversizeRecording(blob.size);
  if (oversize) throw new Error(oversize);

  deps.onPhase?.("uploading");
  const { contentType, extension } = describeRecordingBlob(blob.type);
  const path = recordingStoragePath(deps.uid, newId(), extension);
  const uploaded = await deps.upload(path, blob, contentType);
  if (uploaded.error) {
    throw new Error("Your recording could not be saved. Check your connection and try again.");
  }

  return await transcribeStoredRecordingToCanvas(path, seconds, deps);
}

/**
 * Turn audio that is ALREADY in the recordings bucket into a source on this canvas.
 *
 * 🔴 SPLIT OUT BECAUSE RECOVERY NEEDS EXACTLY THIS HALF. A recording rebuilt from its parts after a
 * crash is already in storage — re-uploading it would be wrong — but it must reach the SAME
 * destination as a recording that finished normally, or the Canvas has two different answers to
 * "where did my lecture go" depending on whether the tab survived.
 *
 * That was a live defect: `recording-recovery-notice.tsx` sits on the Canvas home and filed every
 * recovered lecture as a brand-new SESSIONS conversation, on a surface the sidebar does not list.
 */
export async function transcribeStoredRecordingToCanvas(
  path: string,
  seconds: number,
  deps: TranscribeDeps,
): Promise<void> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const makeFile = deps.makeFile
    ?? ((text: string, name: string) => new File([text], name, { type: "text/plain" }));

  deps.onPhase?.("transcribing");
  const submitted = await deps.post("/api/transcription/submit", { seconds, storagePath: path }, deps.accessToken);
  const submitBody = submitted.body as { jobId?: string; error?: string } | null;
  if (submitted.status === 429) {
    // 🔴 TAGGED, NOT JUST WORDED. `useRecordingSession` reads `.quota` to choose the "quota" status,
    // which is the only thing that renders the "View plans" link. An untagged 429 reads as a
    // generic failure and sends someone looking for a network problem they do not have.
    const quota = new Error(submitBody?.error ?? "You have reached this month's transcription limit.") as Error & { quota?: boolean };
    quota.quota = true;
    throw quota;
  }
  if (!submitted.ok || !submitBody?.jobId) {
    throw new Error(submitBody?.error ?? "That recording could not be sent for transcription. Try again in a moment.");
  }

  const startedAt = now();
  let transcript: string | null = null;
  for (;;) {
    const polled = await deps.post("/api/transcription/status", { jobId: submitBody.jobId }, deps.accessToken);
    const read = readTranscriptionStatus(polled.body as TranscriptionStatus | null);
    if ("failed" in read) throw new Error(read.message);
    if (read.done) {
      transcript = read.transcript;
      break;
    }
    if (now() - startedAt > TRANSCRIPT_TIMEOUT_MS) {
      // 🔴 NOT "something went wrong". The audio genuinely is still safe and the job may still
      // finish; what has run out is our willingness to sit here watching it.
      throw new Error("This is taking longer than expected. Your recording is saved — try adding it again in a few minutes.");
    }
    await sleep(TRANSCRIPT_POLL_MS);
  }

  // Heard nothing. Nothing is attached — an empty source on the canvas reads as Nemesis failing to
  // understand the lecture rather than as there being nothing to understand.
  //
  // 🔴 IT THROWS RATHER THAN RETURNING QUIETLY, and the reason is not cosmetic. A normal return
  // resolves `deliver`, which makes the hook call `discard()` and forget the recovery manifest.
  // "Ready with no transcript" is ALSO what `/status` answers for a job whose transcript was
  // already handed out once — so this branch cannot tell a genuinely silent room from a transcript
  // that was collected and then lost. Discarding the parts on that ambiguity is unrecoverable;
  // keeping them costs nothing.
  if (!usableTranscript(transcript)) {
    throw new Error("Nemesis did not hear anything in that recording, so nothing was added to this canvas.");
  }

  deps.onPhase?.("attaching");
  await deps.attach(makeFile(transcript, recordedSourceName()));
}
