// Hand a finished recording over to the durable pipeline.
//
// This route is the ONLY moment the browser is still involved in processing a
// recording, and it is deliberately short: create the rows, kick the worker,
// return. Everything after it — transcribing, writing the notes, filing them
// into the right course, waiting for search — belongs to recording_jobs and the
// recording-worker function, so navigating away, refreshing, or closing the tab
// cannot stop it.
//
// WHY THE ROWS ARE CREATED HERE AND NOT BY THE WORKER. The student is looking at
// the screen right now. The chat card and the Library note have to exist before
// this response comes back, or the first thing they see after stopping a lecture
// is nothing at all — which is the bug being fixed. The worker fills them in; it
// does not create them.
//
// Service role, not the caller's token, for the writes below: the three rows are
// one unit, and a half-created job (an artifact with no job to finish it) is
// exactly the orphan this design exists to avoid. Ownership is still the
// caller's own uid from their bearer token — never a uid from the body.

import { NextRequest } from "next/server";

import { FALLBACK_FOLDERS } from "@nemesis/shared";
import { supabaseUrl, serviceRoleKey } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";
import {
  isUniqueViolation,
  MAX_NOTE_NAME_ATTEMPTS,
  noteCandidate,
} from "@/lib/workspace/library-note-path";

export const runtime = "nodejs";

/** Where a recording's note is born. It moves into `<Course>/Lectures` during
 *  the filing stage, once there are notes to work out the course from — see the
 *  stageFile comment in the worker. Imported rather than spelled out so the
 *  placeholder always lands wherever unmatched items currently go. */
const PLACEHOLDER_FOLDER = FALLBACK_FOLDERS.recording;

/** What the Library note says while the recording is still being written up.
 *  Deliberately a real sentence rather than an empty body: this note is
 *  searchable and syncs to the phone, and a blank note reads as a bug. */
const PLACEHOLDER_BODY =
  "Nemesis is processing this recording. The notes will appear here when they are ready — you can close this page.";

/** Matches the ceiling nemesis-transcribe enforces, so an over-long recording is
 *  refused before anything is created for it. */
const MAX_SECONDS = 3 * 60 * 60;

/** How long to wait for the worker to say "got it". It answers in milliseconds
 *  and does the work afterwards, so this only ever fires if something is wrong —
 *  and then the cron takes over rather than the student waiting. */
const KICK_TIMEOUT_MS = 5_000;

function datedTitle(): string {
  return `Recording · ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`;
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return json({ error: "Sign in to save this recording." }, 401);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Recording processing is not configured yet." }, 503);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  const durationSeconds = Math.round(Number(body.durationSeconds));
  const contextId = typeof body.contextId === "string" ? body.contextId.slice(0, 200) : "";
  const messageId = typeof body.messageId === "string" ? body.messageId.slice(0, 200) : "";
  const surface = body.surface === "notebook" ? "notebook" : "sessions";
  const silenceSkipped = typeof body.silenceSkipped === "string" ? body.silenceSkipped.slice(0, 200) : null;

  // The same ownership rule the transcription function enforces: you can only
  // process audio that was uploaded under your own uid.
  if (!storagePath.startsWith(`${auth.id}/`)) {
    return json({ error: "That recording does not belong to this account." }, 403);
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_SECONDS) {
    return json({ error: "The recording length is invalid." }, 400);
  }
  if (!contextId) return json({ error: "A conversation id is required." }, 400);

  const admin = adminClient();

  // REFUSED BEFORE ANYTHING IS CREATED. Without this check a student over their
  // monthly allowance would get a placeholder note in their Library and a failed
  // card in their chat on every recording — clutter we generate about a limit we
  // already knew about. The reservation inside the transcription lane is still
  // the authority; this is a courtesy read that can lag it by seconds.
  const { data: quota } = await admin.rpc("transcription_quota_state", { p_user_id: auth.id });
  const rawLimit = (quota as { limit?: unknown } | null)?.limit;
  const limitSeconds = Number(rawLimit ?? 0);
  const usedSeconds = Number((quota as { used?: unknown } | null)?.used ?? 0);
  const plan = String((quota as { plan?: unknown } | null)?.plan ?? "free");
  if (usedSeconds + durationSeconds > limitSeconds) {
    return json({
      // A NULL limit is not a limit that was reached — it is a plan with no
      // transcription entitlement row at all, which the transcription lane also
      // treats as "not available on this plan". Telling someone they used up an
      // allowance they never had sends them looking for usage that does not
      // exist. Same 429, different sentence.
      error: rawLimit === null || rawLimit === undefined
        ? "Recording transcription isn't available on this plan yet."
        : "You have reached this month's transcription limit.",
      limitSeconds,
      plan,
      usedSeconds,
    }, 429);
  }

  const title = datedTitle();

  // 1. The artifact. This is the transcript's durable home — the worker writes
  //    the transcript here the moment it has one, which is what lets the chat
  //    card open before the notes exist.
  const { data: artifactRow, error: artifactError } = await admin
    .from("chat_recording_artifacts")
    .insert({
      context_id: contextId,
      duration_seconds: durationSeconds,
      notes: "",
      surface,
      title,
      transcript: "",
      user_id: auth.id,
    })
    .select("id")
    .single();
  if (artifactError || !artifactRow) {
    console.error("recording artifact insert failed", artifactError?.message);
    return json({ error: "This recording could not be saved. Try again in a moment." }, 502);
  }

  // 2. The job. Created BEFORE the Library note so that if the note write fails,
  //    the pipeline still runs and the student still gets their transcript and
  //    notes in chat — a missing Library copy is a smaller loss than a lost
  //    lecture.
  const { data: jobRow, error: jobError } = await admin
    .from("recording_jobs")
    .insert({
      artifact_id: artifactRow.id,
      context_id: contextId,
      duration_seconds: durationSeconds,
      message_id: messageId || null,
      silence_skipped: silenceSkipped,
      stage: "queued",
      status: "processing",
      storage_path: storagePath,
      surface,
      title,
      user_id: auth.id,
    })
    .select("id")
    .single();
  if (jobError || !jobRow) {
    console.error("recording job insert failed", jobError?.message);
    return json({ error: "This recording could not be queued. Try again in a moment." }, 502);
  }

  // 3. The Library note, already visible and already saying what is happening.
  const note = await createPlaceholderNote(admin, auth.id, title, jobRow.id);
  if (note) {
    await admin
      .from("recording_jobs")
      .update({ library_document_id: note.id, library_path: note.path })
      .eq("id", jobRow.id);
  }

  // Start it now rather than waiting for the cron. A failed kick is NOT an
  // error: pg_cron picks the job up within a minute, which is the whole point of
  // having a safety net. Awaited so the request is actually sent before this
  // serverless invocation ends.
  await kickWorker(jobRow.id);

  return json({
    artifactId: artifactRow.id,
    jobId: jobRow.id,
    libraryPath: note?.path ?? null,
    title,
  });
}

/** Insert the placeholder note, stepping the name on a path collision. Returns
 *  null rather than throwing: the Library copy is a destination, not the
 *  recording itself. */
async function createPlaceholderNote(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  title: string,
  jobId: string,
): Promise<{ id: string; path: string } | null> {
  const now = new Date().toISOString();
  for (let attempt = 1; attempt <= MAX_NOTE_NAME_ATTEMPTS; attempt += 1) {
    const { name, path } = noteCandidate(PLACEHOLDER_FOLDER, title, attempt);
    const { data, error } = await admin
      .from("readable_library_documents")
      .insert({
        content: PLACEHOLDER_BODY,
        deleted: false,
        kind: "note",
        path,
        recording_job_id: jobId,
        title: name,
        updated_at: now,
        user_id: userId,
      })
      .select("id")
      .single();
    if (!error && data) return { id: data.id as string, path };
    if (!error || !isUniqueViolation(error)) {
      console.error("recording placeholder note failed", error?.message);
      return null;
    }
  }
  return null;
}

/**
 * Nudge the worker so a recording starts processing immediately instead of on
 * the next cron tick.
 *
 * The worker acknowledges and then works in the background, so this returns in
 * milliseconds. The abort is belt-and-braces for the day it does not: this call
 * sits between the student and their confirmation, and NOTHING in that position
 * may take as long as the work it is starting. A lost kick costs at most one
 * cron tick.
 */
async function kickWorker(jobId: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/recording-worker`, {
      body: JSON.stringify({ jobId }),
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
    });
  } catch (caught) {
    console.error("recording worker kick failed", (caught as Error)?.message);
  }
}
