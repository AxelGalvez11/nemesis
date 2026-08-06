// Supabase Edge Function: recording-worker
//
// THE DURABLE HALF OF "stop recording". Everything that used to happen inside
// the chat page after you pressed stop happens here instead: polling the
// transcription provider, writing the notes, filling in the Library note,
// waiting for search to catch up.
//
// Why it exists. All of that lived in React — a poll loop in use-recording.ts
// and an awaited chain in session-chat.tsx — so opening the Library, refreshing,
// or closing the tab threw the results away after the audio had already been
// uploaded and metered. The student lost a lecture they had paid for. A page
// cannot own a ten-minute operation; a row plus this function can.
//
//   POST /  { }              -> claim every due job and advance each one
//   POST /  { jobId }        -> claim that one job (the kick from the web app)
//
// SERVICE ROLE ONLY. There is no user-facing action here — the browser reads job
// rows straight through RLS and never asks this function for anything. The only
// callers are apps/web/app/api/recordings/jobs (which kicks after creating a
// job) and pg_cron via run_recording_jobs() (the safety net for a kick that was
// lost). Deploy with verify_jwt=false: the check below is the auth.
//
// RE-ENTRANT BY CONSTRUCTION. A kick and a cron tick can arrive together, a
// previous run can have died holding a lease, and a stage can be attempted
// dozens of times. Every stage therefore checks whether its output already
// exists before doing the work, and claim_recording_jobs leases atomically so
// two runs never hold the same job. This matters most on `transcribing`:
// nemesis-transcribe hands a parked transcript over ONCE and clears it, so a
// second poll after a failed write would come back empty — which is why the
// transcript is written to the artifact (its durable home) before the job
// advances, and why a re-run reads it back from there rather than re-polling.

import { folderForNewItem, knownCourses } from "../../../packages/shared/src/course-filing.ts";
import { isServiceCaller } from "../_shared/service-auth.ts";
import {
  backoffSeconds,
  buildNoteMessages,
  countSections,
  countWords,
  describeFailure,
  nextStage,
  splitNote,
  stageAttemptLimit,
  type Stage,
  type StageOutcome,
} from "./pipeline.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// The compose pass runs server-side now, so it needs a model key of its own
// rather than the browser's device key. Same providers and same order as
// library-brain: DeepSeek is the engine the notes prompt was written against,
// GLM is outage insurance.
const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const GLM_KEY = Deno.env.get("GLM_API_KEY") ?? "";
const GLM_MODEL = Deno.env.get("GLM_MODEL") ?? "glm-5.2";

// Project-scoped write-only key — not a secret. Same one every function uses.
const POSTHOG_KEY = Deno.env.get("POSTHOG_KEY") ?? "phc_xcEjfTB3a2ftyzsw7oEAkpiBXRThWWjA3D5BcPBj36ht";
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com";

/** How long one invocation keeps advancing jobs. Well inside the platform's
 *  wall-clock limit, and it does not need to be longer: a job that is still
 *  going when this expires is left mid-stage with its lease, and the next kick
 *  or cron tick picks it straight up. */
const INVOCATION_BUDGET_MS = 90_000;
/** Longer than the budget above, so a run that dies mid-stage still blocks a
 *  duplicate for a while — but short enough that a crash costs minutes, not
 *  hours. */
const LEASE_SECONDS = 300;
/** How many jobs one drain handles. Bounded so a backlog cannot make a single
 *  invocation run past its budget doing nothing but setup. */
const DRAIN_LIMIT = 5;
/** MIRRORS MAX_NOTE_BYTES in apps/web/lib/workspace/library-note-path.ts. */
const MAX_NOTE_BYTES = 100_000;

interface JobRow {
  id: string;
  user_id: string;
  status: string;
  stage: Stage;
  stage_attempts: number;
  storage_path: string;
  duration_seconds: number;
  transcription_job_id: string | null;
  artifact_id: string | null;
  library_document_id: string | null;
  title: string | null;
  notes_written_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SB_URL || !SERVICE_KEY) return json({ error: "function not configured" }, 500);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // 🔴 NOT `token === SERVICE_KEY`. This project has two valid service-role
  // credentials — the legacy JWT and the newer `sb_secret_…` key — and the web
  // server holds a different one from the one the platform injects here. A plain
  // comparison rejected every kick from the web app with a 403 while
  // function-to-function calls sailed through. See _shared/service-auth.ts.
  if (!await isServiceCaller(token, { serviceKey: SERVICE_KEY, supabaseUrl: SB_URL })) {
    return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({})) as { jobId?: unknown; wait?: unknown };
  const jobId = typeof body.jobId === "string" && body.jobId ? body.jobId : null;
  // Tests and one-off diagnostics can ask for the synchronous behaviour. Nothing
  // in the product does.
  const wait = body.wait === true;

  const claimed = await claimJobs(jobId);
  if (claimed.length === 0) return json({ claimed: 0 }, 200);

  const drain = async () => {
    const deadline = Date.now() + INVOCATION_BUDGET_MS;
    let advanced = 0;
    for (const job of claimed) {
      if (Date.now() >= deadline) break;
      advanced += await runJob(job, deadline);
    }
    return advanced;
  };

  if (wait) return json({ advanced: await drain(), claimed: claimed.length }, 200);

  // 🔴 ACKNOWLEDGE, THEN WORK. Measured before this was here: the web route
  // awaits its kick, and the kick did not come back until the worker had run the
  // job to completion — so creating a recording took 14.5 seconds and the
  // student sat watching the recorder exactly as long as they used to. The whole
  // point is that they stop waiting.
  //
  // EdgeRuntime.waitUntil keeps this isolate alive for the drain after the
  // response has gone, which is what makes "return control immediately" true
  // rather than a description of the intent. Guarded because it is a platform
  // extension: without it, fall back to running inline, which is slow but never
  // wrong — and the cron would pick the job up either way.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(drain().catch((caught) => {
      console.error("recording drain failed", describeFailure(caught, "unknown"));
    }));
    return json({ accepted: claimed.length }, 202);
  }
  return json({ advanced: await drain(), claimed: claimed.length }, 200);
});

/**
 * Advance one job as far as it will go inside the budget.
 *
 * Loops rather than doing one stage per invocation because the common lecture
 * finishes every stage in a few seconds: transcribe, compose, file, and the only
 * genuine wait is search indexing. Doing one stage per call would turn a
 * twenty-second job into a four-minute one for no reason.
 */
async function runJob(initial: JobRow, deadline: number): Promise<number> {
  let job = initial;
  let steps = 0;
  while (Date.now() < deadline) {
    let outcome: StageOutcome;
    try {
      outcome = await runStage(job);
    } catch (caught) {
      // An unexpected throw is treated as a transient failure, not a terminal
      // one: the attempt limit below is what decides a stage is genuinely
      // broken. A single network blip must never lose a lecture.
      outcome = { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };
      console.error("recording stage threw", job.id, job.stage, describeFailure(caught, "unknown"));
    }

    if (outcome.kind === "fail") {
      await failJob(job, outcome.message);
      return steps;
    }
    if (outcome.kind === "wait") {
      // Out of patience with this stage. `stage_attempts` counts claims since
      // the stage began, so a provider that never answers ends as a failure the
      // student can retry rather than a job that spins forever.
      if (job.stage_attempts >= stageAttemptLimit(job.stage)) {
        await failJob(job, stalledMessage(job.stage));
        return steps;
      }
      await patchJob(job.id, {
        leased_until: "-infinity",
        next_attempt_at: new Date(Date.now() + outcome.seconds * 1_000).toISOString(),
        updated_at: new Date().toISOString(),
      });
      return steps;
    }

    steps += 1;
    if (outcome.to === "ready") {
      await patchJob(job.id, {
        leased_until: "-infinity",
        stage: "ready",
        status: "ready",
        updated_at: new Date().toISOString(),
      });
      return steps;
    }
    // A new stage starts with a clean attempt count — see the column comment in
    // 20260805T01: carrying a transcribe stage's forty polls into the compose
    // stage would back it off past its own limit before it ever ran.
    await patchJob(job.id, {
      next_attempt_at: new Date().toISOString(),
      stage: outcome.to,
      stage_attempts: 0,
      updated_at: new Date().toISOString(),
    });
    job = { ...job, stage: outcome.to, stage_attempts: 0 };
  }
  // Budget spent between stages. The lease is HANDED BACK rather than left to
  // expire: the stage is already persisted, so the next kick or cron tick can
  // pick it straight up. Waiting out a five-minute lease for a job that is
  // sitting there ready to continue would be five minutes of a student watching
  // a stage that has already finished.
  await patchJob(job.id, {
    leased_until: "-infinity",
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return steps;
}

function stalledMessage(stage: Stage): string {
  switch (stage) {
    case "transcribing":
      return "The transcription service did not finish in time. Your audio is safe — retry and it will pick up from here.";
    case "composing":
      return "Writing the notes failed. The transcript is saved, so retrying only re-runs the write-up.";
    case "filing":
      return "Saving to your Library failed. The transcript and notes are saved.";
    case "indexing":
      return "The notes are saved but search is still catching up.";
    default:
      return "This recording could not be processed.";
  }
}

async function runStage(job: JobRow): Promise<StageOutcome> {
  switch (job.stage) {
    case "queued": return { kind: "advance", to: "transcribing" };
    case "transcribing": return await stageTranscribe(job);
    case "composing": return await stageCompose(job);
    case "filing": return await stageFile(job);
    case "indexing": return await stageIndex(job);
    default: return { kind: "advance", to: "ready" };
  }
}

// ── transcribing ────────────────────────────────────────────────────────────

/**
 * Get the audio transcribed, through the same nemesis-transcribe lane the phone
 * uses.
 *
 * Not reimplemented here on purpose. That function owns the provider ladder, the
 * monthly meter, the cost reporting and the audio cleanup, and a second copy of
 * any of those would drift — the meter especially, where a double settle
 * silently corrupts a student's allowance.
 *
 * IDEMPOTENCE. nemesis-transcribe hands a parked transcript over exactly once
 * and clears it, so the artifact is written BEFORE this job advances, and a
 * re-run reads the artifact first. Polling a job whose transcript we already
 * banked would otherwise come back empty and look like a failure.
 */
async function stageTranscribe(job: JobRow): Promise<StageOutcome> {
  // BEFORE SPENDING ANYTHING. The artifact is the only durable home a transcript
  // has — nemesis-transcribe hands its text over once and clears it — so a job
  // with no artifact would pay a provider for a lecture it then had nowhere to
  // put, and fail one stage later with the money already gone. The web route
  // never creates such a job; this is the guard for the ones that reach here
  // some other way.
  if (!job.artifact_id) {
    return { kind: "fail", message: "This recording has nowhere to store its transcript. Record it again." };
  }

  const banked = await artifactTranscript(job.artifact_id);
  if (banked) return { kind: "advance", to: "composing" };

  if (!job.transcription_job_id) {
    const submitted = await callTranscribe("submit", {
      seconds: Math.max(1, Math.round(job.duration_seconds)),
      storagePath: job.storage_path,
      userId: job.user_id,
    });
    if (submitted.status === 429) {
      return { kind: "fail", message: describeFailure(submitted.body?.error, "You have reached this month's transcription limit.") };
    }
    const providerJobId = typeof submitted.body?.jobId === "string" ? submitted.body.jobId : "";
    if (!submitted.ok || !providerJobId) {
      // Transient: the provider is unavailable, not the recording. Wait and let
      // the attempt limit decide when that has gone on long enough.
      return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };
    }
    await patchJob(job.id, { transcription_job_id: providerJobId, updated_at: new Date().toISOString() });
    job = { ...job, transcription_job_id: providerJobId };
  }

  const polled = await callTranscribe("status", { jobId: job.transcription_job_id, userId: job.user_id });
  if (!polled.ok) return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };
  if (polled.body?.status === "error") {
    return { kind: "fail", message: describeFailure(polled.body?.error, "The recording could not be transcribed.") };
  }
  if (polled.body?.status !== "done") return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };

  const transcript = typeof polled.body?.transcript === "string" ? polled.body.transcript.trim() : "";
  if (!transcript) {
    // "done" with nothing in it means the audio held no recognisable speech —
    // a muted microphone sounds exactly like an empty room. Retrying cannot
    // change that, so it is terminal and says why.
    return { kind: "fail", message: "Nemesis did not hear any speech in this recording." };
  }

  // The artifact FIRST. It is the transcript's durable home, and until this
  // write lands the text exists nowhere else — the provider job has already
  // cleared it.
  if (job.artifact_id) {
    await patchRow("chat_recording_artifacts", job.artifact_id, { transcript });
  }
  await patchJob(job.id, { transcript_words: countWords(transcript), updated_at: new Date().toISOString() });
  return { kind: "advance", to: "composing" };
}

// ── composing ───────────────────────────────────────────────────────────────

/**
 * One pass over the whole transcript, producing the notes AND the title.
 *
 * ONE call, deliberately. The original ask listed cleaning, learning objectives,
 * key concepts and note-building as four stages, but this prompt does all of
 * that in a single request — showing four labels for one call would be a
 * progress display animating against nothing.
 */
async function stageCompose(job: JobRow): Promise<StageOutcome> {
  const existing = await artifactNotes(job.artifact_id);
  if (existing) return { kind: "advance", to: "filing" };

  const transcript = await artifactTranscript(job.artifact_id);
  if (!transcript) {
    return { kind: "fail", message: "The transcript for this recording could not be read back." };
  }

  const composed = await composeNotes(transcript, job.user_id);
  if (!composed) return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };

  const { body, title } = splitNote(composed);
  const notes = body.trim();
  if (!notes) return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };

  // Title on the artifact too, so the chat card and the Library note carry the
  // same name. An empty title is not an error — the dated fallback the artifact
  // was created with stands.
  if (job.artifact_id) {
    await patchRow("chat_recording_artifacts", job.artifact_id, {
      notes,
      ...(title ? { title } : {}),
    });
  }
  await patchJob(job.id, {
    note_sections: countSections(notes),
    updated_at: new Date().toISOString(),
    ...(title ? { title } : {}),
  });
  return { kind: "advance", to: "filing" };
}

// ── filing ──────────────────────────────────────────────────────────────────

/**
 * Put the finished notes into the Library note that has been sitting there
 * saying "processing" since the moment recording stopped — AND move it into the
 * course it turned out to be about.
 *
 * The move is why this is a stage rather than part of composing. A recording's
 * course is decided from what was said in it (folderForNewItem, #420), so the
 * placeholder cannot be filed correctly when it is created — the notes do not
 * exist yet. Creating it unsorted and moving it here is the honest order, and it
 * is exactly the "organizing into the course" step the pipeline reports.
 *
 * A tie between two courses is a REFUSAL inside matchCourse, so a lecture that
 * does not clearly belong anywhere simply stays where it is. Nothing is worse
 * than confident misfiling: a note in the wrong course is harder to find than a
 * note in the obvious pile.
 */
async function stageFile(job: JobRow): Promise<StageOutcome> {
  if (!job.library_document_id) return { kind: "advance", to: "indexing" };
  if (job.notes_written_at) return { kind: "advance", to: "indexing" };

  const written = await artifactWriteUp(job.artifact_id);
  const notes = written.notes;
  if (!notes) return { kind: "fail", message: "The notes for this recording could not be read back." };

  // 🔴 THE TITLE COMES FROM THE ARTIFACT, NOT FROM `job`. `job` is the row as it
  // was CLAIMED — before the compose stage ran — so `job.title` is still the
  // dated placeholder, and using it named every Library note "Recording · Aug 5,
  // 2026, 10-09 PM" while the job row and the chat card both showed "Renal
  // Clearance and Maintenance Dose Scaling". Caught in production acceptance:
  // the whole reason the compose pass writes a title is that the note in the
  // Library is called something you can recognise a month later.
  const title = written.title || job.title || "";
  const folder = folderForNewItem("recording", `${title}\n${notes}`, await knownCoursesFor(job.user_id));
  const writtenAt = new Date().toISOString();

  // Content first, path second, and each write stands on its own. A note whose
  // content landed but whose move failed is a correct note in the wrong folder,
  // which the student can fix; the reverse — moved, still saying "processing" —
  // is a note they cannot find AND cannot read.
  const wrote = await patchRow("readable_library_documents", job.library_document_id, {
    content: notes.slice(0, MAX_NOTE_BYTES),
    updated_at: writtenAt,
    ...(title ? { title: noteLeaf(title) } : {}),
  });
  if (!wrote) return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };

  const path = await moveNote(job.library_document_id, folder, title || "Recording");

  // Stamped only after the content write succeeded: this timestamp is what the
  // indexing stage compares against, so a value written optimistically would
  // have search report the PLACEHOLDER as indexed.
  await patchJob(job.id, {
    notes_written_at: writtenAt,
    updated_at: writtenAt,
    ...(path ? { library_path: path } : {}),
  });
  return { kind: "advance", to: "indexing" };
}

/**
 * Move a note to `<folder>/<title>.md`, stepping the name on a collision.
 *
 * The (user_id, path) unique constraint counts SOFT-DELETED rows too — a path
 * used once is occupied forever — so this has to retry with a suffix rather than
 * treat a duplicate as a failure. Same rule as library-note-path.ts in the web
 * app, which is where that landmine is documented.
 *
 * Returns the path it settled on, or null if every candidate was taken. A failed
 * move is NOT fatal: the note keeps its unsorted path, which is a findable place
 * to be.
 */
async function moveNote(documentId: string, folder: string, title: string): Promise<string | null> {
  const dir = folder.trim().replace(/^\/+|\/+$/g, "");
  const leaf = noteLeaf(title);
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const name = attempt === 1 ? leaf : `${leaf} ${attempt}`;
    const path = `${dir ? `${dir}/` : ""}${name}.md`;
    if (await patchRow("readable_library_documents", documentId, { path, title: name })) return path;
  }
  return null;
}

/** A note leaf name safe for a "/"-delimited path. MIRRORS safeLeaf in
 *  apps/web/lib/workspace/library-note-path.ts. */
function noteLeaf(title: string): string {
  return title.trim().replace(/[\\/:]/g, "-").slice(0, 120) || "Untitled note";
}

/**
 * The courses this student is actually taking, from their calendar and the top
 * level of their Library.
 *
 * The same two sources the web app reads (loadKnownCourses in agent-tools.ts),
 * scoped by user_id here because the service role is not RLS-bound. Failing
 * closed — an empty list — is safe: with no courses to match, folderForNewItem
 * returns the unsorted folder and the note simply stays where it is.
 */
async function knownCoursesFor(userId: string): Promise<string[]> {
  try {
    const [events, docs] = await Promise.all([
      restSelect<{ course?: unknown }>(
        `calendar_events?user_id=eq.${userId}&course=not.is.null&select=course&limit=500`,
      ),
      restSelect<{ path?: unknown }>(
        `readable_library_documents?user_id=eq.${userId}&deleted=eq.false&select=path&limit=1000`,
      ),
    ]);
    const top = new Set<string>();
    for (const row of docs) {
      const segments = typeof row.path === "string" ? row.path.split("/").filter(Boolean) : [];
      if (segments.length > 1) top.add(segments[0]!);
    }
    return knownCourses(events.map((row) => (typeof row.course === "string" ? row.course : null)), [...top]);
  } catch {
    return [];
  }
}

// ── indexing ────────────────────────────────────────────────────────────────

/**
 * Wait for the note to be searchable.
 *
 * A real, observable state and not a decorative one: the library indexer runs on
 * its own two-minute cron, and until it has been round the note exists but
 * nothing can find it. The comparison is against `notes_written_at` rather than
 * "has an index row at all", because the PLACEHOLDER note is indexable too — a
 * row alone would report search as ready while the only thing in the index was
 * the word "processing".
 *
 * Capped. Indexing is a bonus, not the deliverable: past the cap the job goes
 * ready with `index_pending` set, so the student is not held at 90% waiting for
 * something that does not stop them reading their notes.
 */
async function stageIndex(job: JobRow): Promise<StageOutcome> {
  if (!job.library_document_id || !job.notes_written_at) return { kind: "advance", to: "ready" };

  const indexedAt = await indexedTime(job.library_document_id);
  if (indexedAt && indexedAt >= Date.parse(job.notes_written_at)) return { kind: "advance", to: "ready" };

  if (job.stage_attempts >= stageAttemptLimit("indexing")) {
    await patchJob(job.id, { index_pending: true, updated_at: new Date().toISOString() });
    return { kind: "advance", to: "ready" };
  }
  // The indexer's own cron is every two minutes, so polling faster than the
  // backoff cap would only burn requests against a state that cannot have moved.
  return { kind: "wait", seconds: backoffSeconds(job.stage_attempts) };
}

// ── The model call ──────────────────────────────────────────────────────────

/**
 * The compose pass, DeepSeek first and GLM behind it.
 *
 * Same shape and same order as library-brain's organiser: this used to ride the
 * browser's device key through nemesis-llm, which cannot work from here, and
 * both providers are already configured on this project. Returns null on any
 * failure so the caller can retry with backoff rather than losing the job.
 */
async function composeNotes(transcript: string, userId: string): Promise<string | null> {
  const providers = [
    { base: "https://api.deepseek.com", key: DEEPSEEK_KEY, model: "deepseek-chat" },
    { base: "https://api.z.ai/api/paas/v4", key: GLM_KEY, model: GLM_MODEL },
  ].filter((provider) => provider.key);

  for (const provider of providers) {
    const controller = new AbortController();
    // Generous: a three-hour lecture's transcript is a large prompt and the
    // model is writing pages, not a sentence.
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(`${provider.base}/chat/completions`, {
        body: JSON.stringify({
          messages: buildNoteMessages(transcript),
          model: provider.model,
          temperature: 0.2,
        }),
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn("compose provider declined", provider.model, res.status);
        continue;
      }
      const parsed = await res.json().catch(() => null) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      } | null;
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) continue;
      await reportComposeCost(userId, provider.model, parsed?.usage);
      return content;
    } catch (caught) {
      console.warn("compose provider threw", provider.model, describeFailure(caught, "unknown"));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ── Supabase plumbing (one fetch each; the service key never leaves here) ────

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

async function claimJobs(jobId: string | null): Promise<JobRow[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/claim_recording_jobs`, {
      body: JSON.stringify({ p_job_id: jobId, p_lease_seconds: LEASE_SECONDS, p_limit: DRAIN_LIMIT }),
      headers: restHeaders,
      method: "POST",
    });
    if (!res.ok) {
      console.error("claim_recording_jobs failed", res.status, (await res.text()).slice(0, 300));
      return [];
    }
    const rows = await res.json().catch(() => null) as JobRow[] | null;
    return Array.isArray(rows) ? rows : [];
  } catch (caught) {
    console.error("claim_recording_jobs threw", describeFailure(caught, "unknown"));
    return [];
  }
}

async function patchJob(jobId: string, patch: Record<string, unknown>): Promise<boolean> {
  return await patchRow("recording_jobs", jobId, patch);
}

/** PATCH one row by id. Returns whether it landed, so a caller that must not
 *  advance past a failed write can wait instead. */
async function patchRow(table: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      body: JSON.stringify(patch),
      headers: { ...restHeaders, Prefer: "return=minimal" },
      method: "PATCH",
    });
    if (!res.ok) console.error("row update failed", table, res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (caught) {
    console.error("row update threw", table, describeFailure(caught, "unknown"));
    return false;
  }
}

/** Terminal. `failed_stage` is where a retry resumes from, so it is the stage
 *  that broke and not the one after it. The lease is released so a retry is not
 *  waiting on a run that has already given up. */
async function failJob(job: JobRow, message: string): Promise<void> {
  await patchJob(job.id, {
    error: message.slice(0, 300),
    failed_stage: job.stage,
    leased_until: "-infinity",
    status: "failed",
    updated_at: new Date().toISOString(),
  });
}

/** One REST read, query string and all. Returns an empty list on any failure —
 *  every caller here treats "no rows" as a safe answer. */
async function restSelect<T>(query: string): Promise<T[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${query}`, { headers: restHeaders });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => null) as T[] | null;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function selectOne<T>(table: string, id: string, columns: string): Promise<T | null> {
  try {
    const url = `${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=${columns}&limit=1`;
    const res = await fetch(url, { headers: restHeaders });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => null) as T[] | null;
    return Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;
  } catch {
    return null;
  }
}

async function artifactTranscript(artifactId: string | null): Promise<string> {
  if (!artifactId) return "";
  const row = await selectOne<{ transcript?: unknown }>("chat_recording_artifacts", artifactId, "transcript");
  return typeof row?.transcript === "string" ? row.transcript.trim() : "";
}

async function artifactNotes(artifactId: string | null): Promise<string> {
  return (await artifactWriteUp(artifactId)).notes;
}

/** The notes AND the title the compose stage wrote, read together because the
 *  filing stage needs both and they land on the same row. */
async function artifactWriteUp(artifactId: string | null): Promise<{ notes: string; title: string }> {
  if (!artifactId) return { notes: "", title: "" };
  const row = await selectOne<{ notes?: unknown; title?: unknown }>("chat_recording_artifacts", artifactId, "notes,title");
  return {
    notes: typeof row?.notes === "string" ? row.notes.trim() : "",
    title: typeof row?.title === "string" ? row.title.trim() : "",
  };
}

/** When the library indexer last finished this document, in epoch ms. */
async function indexedTime(documentId: string): Promise<number | null> {
  try {
    const url = `${SB_URL}/rest/v1/library_index_state` +
      `?document_id=eq.${encodeURIComponent(documentId)}&select=indexed_at&limit=1`;
    const res = await fetch(url, { headers: restHeaders });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => null) as Array<{ indexed_at?: unknown }> | null;
    const value = rows?.[0]?.indexed_at;
    if (typeof value !== "string") return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Call the transcription lane with the service key. See the service-role branch
 *  in nemesis-transcribe for why an explicit userId is safe here and would not
 *  be from a browser. */
async function callTranscribe(
  action: "submit" | "status",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${SB_URL}/functions/v1/nemesis-transcribe/${action}`, {
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const parsed = await res.json().catch(() => null) as Record<string, unknown> | null;
    return { body: parsed, ok: res.ok, status: res.status };
  } catch (caught) {
    console.error("transcription call threw", action, describeFailure(caught, "unknown"));
    return { body: null, ok: false, status: 0 };
  }
}

/**
 * Report what the compose pass cost, on the same PostHog event every other lane
 * uses.
 *
 * This call used to ride nemesis-llm, which reported its own spend. Moving it
 * here would have made the single most expensive per-recording model call
 * invisible to cost reporting — a saving that is really a blind spot. Never
 * throws: analytics is not load-bearing.
 */
async function reportComposeCost(userId: string, model: string, usage: unknown): Promise<void> {
  if (!POSTHOG_KEY || !userId) return;
  const counts = usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined;
  const promptTokens = Math.max(0, Math.round(Number(counts?.prompt_tokens) || 0));
  const completionTokens = Math.max(0, Math.round(Number(counts?.completion_tokens) || 0));
  if (promptTokens + completionTokens <= 0) return;
  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: "nemesis_service_cost",
        properties: {
          client: "supabase",
          completion_tokens: completionTokens,
          distinct_id: userId,
          lane: "recording_notes",
          model,
          prompt_tokens: promptTokens,
          service: "llm",
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    /* analytics is never load-bearing */
  }
}
