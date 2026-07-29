// Supabase Edge Function: nemesis-transcribe
//
// Owner 2026-07-27: "Assembly Ai should be in supabase" / "assembly should be
// in supabase now." This is the whole enhance-transcript lane, moved out of the
// Next.js app (apps/web/app/api/transcription/{submit,status}), so the
// AssemblyAI key lives in Supabase's function secrets rather than Vercel's env.
//
// TWO ACTIONS, on sub-paths, mirroring the routes it replaces:
//
//   POST /nemesis-transcribe/submit  { storagePath, seconds } -> { jobId, usage }
//   POST /nemesis-transcribe/status  { jobId }                -> { status, transcript? }
//
// The flow: the phone (or web) records, uploads the audio to the private
// `recordings` bucket, and posts the storage path here. Submit meters the
// request against the plan's monthly transcription allowance, then transcribes
// Groq-first — synchronous Whisper turbo at ~1/4 the AssemblyAI price, parking
// the text on the job row for the first status poll to collect. Any Groq failure
// (no pay-as-you-go on the account, file over its size cap, rate limit, outage)
// falls back to the asynchronous AssemblyAI flow, which status polls to
// completion.
//
// verify_jwt must be FALSE on this function: the caller's bearer token is
// verified below against the auth server, and the phone's Authorization header
// carries a user JWT rather than the anon key. See the verify_jwt deploy trap —
// llm/search/media/ics are all deployed this way for the same reason.
//
// The service role lives ONLY in the function env, never in an app bundle.

import { formatDiarizedTranscript, utterancesFromWords, utterancesOf } from "../_shared/transcript-speakers.ts";
import { batchCostUsd, batchProviderFor, PRICE_REV } from "../_shared/voice-cost.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// ASSEMBLY_API_KEY is the name the secret actually has in this project (owner
// 2026-07-27); ASSEMBLYAI_API_KEY is the spelling the Vercel env uses for the
// streaming lane. Both are read, longer-name-last, so a rename in either place
// cannot silently turn the whole lane into a 503 — the failure mode of getting
// this wrong is invisible until a student's recording never comes back.
const ASSEMBLYAI_KEY = Deno.env.get("ASSEMBLY_API_KEY") ?? Deno.env.get("ASSEMBLYAI_API_KEY") ?? "";
// Deliberately UNSET on this function: the account has no pay-as-you-go, so a
// present key buys a guaranteed failed round trip and its latency before every
// AssemblyAI fallback. Set it only if Groq billing is ever enabled.
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? "";

// Owner added these to the Supabase secrets on 2026-07-28 as `modulate_api_key`
// and `xai_api_key`. Deno.env.get IS case-sensitive and Supabase stores secret
// names verbatim, so both spellings are read: a case mismatch fails EXACTLY like
// a missing key, which is the failure that cost an afternoon on ASSEMBLY_API_KEY
// vs ASSEMBLYAI_API_KEY.
const XAI_KEY = Deno.env.get("XAI_API_KEY") ?? Deno.env.get("xai_api_key") ?? "";
// MODULATE_API_KEY is in the Supabase secrets too, and nothing reads it yet — on
// purpose. Declaring the const before there is a provider to use it would read as
// "wired" to the next person. See the provider-order comment in handleSubmit for
// what is still missing from their published docs.

// Project-scoped write-only key — not a secret. Override with POSTHOG_KEY.
const POSTHOG_KEY = Deno.env.get("POSTHOG_KEY") ?? "phc_xcEjfTB3a2ftyzsw7oEAkpiBXRThWWjA3D5BcPBj36ht";
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com";

// Longest single recording accepted for an enhance pass.
const MAX_SECONDS = 3 * 60 * 60;

// CORS: the web app calls this cross-origin from the browser, so allowlisted
// origins are reflected. Auth is still the bearer token; the list is
// defense-in-depth.
const ALLOWED_ORIGINS = [
  "https://app.enternemesis.com",
  "https://app.pharmaorb.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "https://app.enternemesis.com",
  };
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    status,
  });
}

interface ReserveResult {
  allowed?: boolean;
  reason?: string;
  plan?: string;
  used?: number;
  limit?: number;
}

interface JobRow {
  id: string;
  user_id: string;
  storage_path: string;
  provider_job_id: string | null;
  status: string;
  error: string | null;
  transcript: string | null;
  /** What was RESERVED against the student's monthly cap: the recording's real
   *  wall-clock length. Not necessarily what the provider was sent — see the
   *  settle rule in handleStatus. */
  audio_seconds: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);
  if (!SB_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: "function not configured" }, 500, req);
  if (!ASSEMBLYAI_KEY && !GROQ_KEY && !XAI_KEY) {
    return json({ error: "Transcript enhancement is not configured yet." }, 503, req);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "Sign in to enhance transcripts." }, 401, req);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  // Sub-path first, `action` in the body as the fallback — a client that cannot
  // easily append a path segment is still able to reach both halves.
  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const wanted = action === "submit" || action === "status"
    ? action
    : typeof body.action === "string"
      ? body.action
      : "";

  if (wanted === "submit") return await handleSubmit(req, userId, body);
  if (wanted === "status") return await handleStatus(req, userId, body);
  return json({ error: "Unknown action — expected /submit or /status." }, 404, req);
});

/** Meter the request, then hand the audio to a provider. */
async function handleSubmit(req: Request, userId: string, body: Record<string, unknown>): Promise<Response> {
  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  const seconds = Math.round(Number(body.seconds));
  if (!storagePath.startsWith(`${userId}/`)) {
    return json({ error: "That recording does not belong to this account." }, 403, req);
  }
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) {
    return json({ error: "The recording length is invalid." }, 400, req);
  }

  const jobId = crypto.randomUUID();
  const reserved = await rpc<ReserveResult>("reserve_transcription_seconds", {
    p_job_id: jobId,
    p_seconds: seconds,
    p_storage_path: storagePath,
    p_user_id: userId,
  });
  if (!reserved.ok) {
    console.error("transcription reservation failed", reserved.error);
    return json({ error: "Transcript metering is not ready. Apply the latest database migration." }, 503, req);
  }
  const reservation = reserved.data ?? {};
  if (!reservation.allowed) {
    return json({
      error: reservation.reason === "quota_exceeded"
        ? "You have reached this month's enhanced transcription limit."
        : "Enhanced transcription is not available on this plan.",
      limitSeconds: reservation.limit ?? 0,
      plan: reservation.plan ?? "free",
      usedSeconds: reservation.used ?? 0,
    }, 429, req);
  }
  const usage = {
    limitSeconds: Number(reservation.limit) || 0,
    plan: reservation.plan ?? "free",
    usedSeconds: Number(reservation.used) || seconds,
  };

  // Signed URL outlives the AssemblyAI queue comfortably; the object itself is
  // deleted once the transcript is back (below for Groq, by /status for
  // AssemblyAI).
  const signedUrl = await createSignedUrl(storagePath, 6 * 60 * 60);
  if (!signedUrl) {
    await finalize({ p_error: "missing audio object", p_job_id: jobId, p_status: "error" });
    return json({ error: "The uploaded audio could not be found." }, 404, req);
  }

  // PROVIDER ORDER, cheapest-that-works first. Each returns null on any failure,
  // so an outage at one falls through to the next rather than failing the job;
  // AssemblyAI below is the backstop because it is the one we have run in
  // production. Whichever answers is the one billed — reportVoiceCost is called
  // on the branch that actually produced the transcript, never on the one we
  // hoped would.
  //
  // Modulate is NOT in this ladder yet, deliberately. Its endpoint and auth are
  // published (api.modulate.ai/v1/transcription, bearer) but how audio is
  // delivered and how diarization is switched on are not, and writing a provider
  // against a guessed request shape is how a field gets silently ignored. They
  // give 400 free hours; wire it once it has been run against a real lecture.
  // WHY EACH PROVIDER DIDN'T ANSWER, written to the job row.
  //
  // Every fall-through above is deliberately silent — that is what makes the
  // ladder robust, and it is also what made this lane undebuggable. xAI went
  // live on 2026-07-28 at 20:35 UTC, a real recording ran through v5 at 21:02,
  // and it still came back `provider='assemblyai'`. Nothing anywhere said
  // whether the key was missing or the call had failed: console.warn does not
  // reach the log endpoint, and `error` is only written when the whole job dies.
  // A cheaper provider that quietly never runs costs the difference every month
  // and looks exactly like a working system.
  const attempts: string[] = [];

  if (XAI_KEY) {
    const xai = await transcribeWithXai(signedUrl);
    if (xai.ok) {
      await patchJob(jobId, {
        provider: "xai",
        provider_notes: note([...attempts, "xai: ok"]),
        ...(xai.text ? { transcript: xai.text } : {}),
      });
      await settleSynchronousJob(jobId, userId, "xai_grok_stt", xai.seconds, seconds);
      await removeObject(storagePath);
      return json({ jobId, usage }, 200, req);
    }
    attempts.push(`xai: ${xai.reason}`);
  } else {
    // Reads identically to a failed call in every other signal, and is a
    // completely different fix: a secret this function cannot see.
    attempts.push("xai: no key visible to this function (checked XAI_API_KEY and xai_api_key)");
  }

  if (GROQ_KEY) {
    const groq = await transcribeWithGroq(signedUrl);
    if (groq.ok) {
      // Transcript first, settle the meter second: if the finalize call ever
      // failed the student would still get their text (status serves any parked
      // transcript) while the meter keeps the conservative reservation.
      await patchJob(jobId, {
        provider: "groq",
        provider_notes: note([...attempts, "groq: ok"]),
        ...(groq.text ? { transcript: groq.text } : {}),
      });
      await settleSynchronousJob(jobId, userId, "groq_whisper_turbo", groq.seconds, seconds);
      await removeObject(storagePath);
      return json({ jobId, usage }, 200, req);
    }
    attempts.push(`groq: ${groq.reason}`);
  } else {
    attempts.push("groq: no key (unset on purpose — no pay-as-you-go on the account)");
  }

  if (!ASSEMBLYAI_KEY) {
    attempts.push("assemblyai: no key");
    await patchJob(jobId, { provider_notes: note(attempts) });
    await finalize({ p_error: "provider rejected the job", p_job_id: jobId, p_status: "error" });
    return json({ error: "The transcription provider is unavailable. Try again in a moment." }, 502, req);
  }

  const submitted = await fetch("https://api.assemblyai.com/v2/transcript", {
    body: JSON.stringify({
      audio_url: signedUrl,
      format_text: true,
      punctuate: true,
      // Owner 2026-07-27, on the cheaper async tier: "just do it for now."
      //
      // This is a LIST, in priority order, and omitting it is NOT the same as
      // omitting a default — AssemblyAI's own default is
      // ["universal-3-5-pro", "universal-2"], so sending nothing was quietly
      // buying the $0.21/hr Pro model on every recording. Pinning Universal-2
      // is $0.15/hr, ~29% off the transcription line.
      //
      // (`speech_model`, singular, is the deprecated spelling — it would be
      // accepted and ignored, which is the failure that looks like a saving on
      // the invoice and isn't. /status reads the model back off the finished
      // job for exactly that reason.)
      speech_models: ["universal-2"],
      // Owner 2026-07-27. +$0.02/hr — a tenth of the transcription line, not a
      // new engine — and it buys the one thing that matters for a lecture: a
      // classmate's question, and especially a classmate's wrong guess, is no
      // longer indistinguishable from what the lecturer established.
      // _shared/transcript-speakers.ts drops the labels again when the recording
      // turns out to have only one voice, which is the common case.
      speaker_labels: true,
    }),
    headers: { Authorization: ASSEMBLYAI_KEY, "Content-Type": "application/json" },
    method: "POST",
  });
  const submittedBody = await submitted.json().catch(() => null) as { id?: unknown; error?: unknown } | null;
  if (!submitted.ok || typeof submittedBody?.id !== "string") {
    attempts.push(`assemblyai: HTTP ${submitted.status}`);
    await patchJob(jobId, { provider_notes: note(attempts) });
    await finalize({ p_error: "provider rejected the job", p_job_id: jobId, p_status: "error" });
    console.error("AssemblyAI submit failed", submitted.status, submittedBody?.error);
    return json({ error: "The transcription provider is unavailable. Try again in a moment." }, 502, req);
  }

  // The row already says provider='assemblyai' (the column's default), so on its
  // own it cannot tell "AssemblyAI was chosen" from "nothing ran". The notes are
  // what distinguish them.
  await patchJob(jobId, { provider_notes: note([...attempts, "assemblyai: submitted"]) });
  await finalize({ p_job_id: jobId, p_provider_job_id: submittedBody.id, p_status: "processing" });
  return json({ jobId, usage }, 200, req);
}

/** The attempt trail as one bounded line. Diagnostics must never be the reason a
 *  write fails, so it is clipped well under any sane column budget. */
function note(attempts: readonly string[]): string {
  return attempts.join(" | ").slice(0, 600);
}

/** Poll one job. Settles the meter and deletes the audio on completion. */
async function handleStatus(req: Request, userId: string, body: Record<string, unknown>): Promise<Response> {
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) return json({ error: "A job id is required." }, 400, req);

  const job = await readJob(jobId);
  // Same 404 for "no such job" and "not yours" — a job id must not be probeable.
  if (!job || job.user_id !== userId) return json({ error: "That transcription job was not found." }, 404, req);

  // A parked transcript (synchronous provider) is handed over once and cleared —
  // the recording artifact is its durable home, not this table. Checked before
  // the status switch so it also covers a job whose meter settlement failed
  // mid-sequence.
  if (typeof job.transcript === "string" && job.transcript.length > 0) {
    await patchJob(job.id, { transcript: null });
    return json({ status: "done", transcript: job.transcript }, 200, req);
  }

  if (job.status === "error") {
    return json({ error: job.error ?? "The transcription failed.", status: "error" }, 200, req);
  }
  // Done jobs have already handed out their transcript and deleted the audio;
  // the artifact row is the durable home, so a re-poll just reports state.
  if (job.status === "done") return json({ status: "done", transcript: null }, 200, req);
  if (!job.provider_job_id) return json({ status: "processing" }, 200, req);
  // An AssemblyAI job can only be polled with the AssemblyAI key.
  if (!ASSEMBLYAI_KEY) return json({ status: "processing" }, 200, req);

  const polled = await fetch(`https://api.assemblyai.com/v2/transcript/${job.provider_job_id}`, {
    headers: { Authorization: ASSEMBLYAI_KEY },
  });
  const polledBody = await polled.json().catch(() => null) as {
    status?: unknown;
    text?: unknown;
    utterances?: unknown;
    audio_duration?: unknown;
    // Whichever spelling this account's API echoes — the completed job is the
    // only place that says which model actually ran, and the two batch tiers
    // differ by 35% an hour. See batchProviderFor.
    speech_model?: unknown;
    speech_models?: unknown;
    error?: unknown;
  } | null;
  if (!polled.ok || typeof polledBody?.status !== "string") return json({ status: "processing" }, 200, req);

  if (polledBody.status === "error") {
    const reason = typeof polledBody.error === "string" ? polledBody.error.slice(0, 300) : "The transcription failed.";
    await finalize({ p_error: reason, p_job_id: job.id, p_status: "error" });
    await removeObject(job.storage_path);
    return json({ error: reason, status: "error" }, 200, req);
  }

  if (polledBody.status !== "completed") return json({ status: "processing" }, 200, req);

  // Speaker turns when the recording had more than one voice, the provider's
  // flat text when it did not. Reading `text` alone here is what would have made
  // `speaker_labels` on the submit cost money and change nothing.
  const transcript = formatDiarizedTranscript(
    utterancesOf(polledBody.utterances),
    typeof polledBody.text === "string" ? polledBody.text : "",
  );
  const actualSeconds = Math.max(0, Math.round(Number(polledBody.audio_duration) || 0));

  // TWO DIFFERENT NUMBERS, TWO DIFFERENT DESTINATIONS. Read this before
  // changing either.
  //
  // The phone cuts sustained silence out of a lecture before uploading
  // (apps/mobile/src/lib/wav-trim.ts), so the provider is billed for LESS audio
  // than the student actually recorded. Owner 2026-07-27 chose that saving to be
  // OURS, not the student's — their monthly cap keeps counting real recorded
  // time, exactly as before.
  //
  //   what we PAID          -> actualSeconds (trimmed)  -> reportVoiceCost
  //   what the STUDENT owes -> wall-clock (reserved)    -> finalize
  //
  // finalize_transcription_job does `used += p_actual_seconds - audio_seconds`,
  // so handing it the provider's number REFUNDS the trimmed minutes to the
  // student — the option the owner rejected. Settling UP is still right (the
  // client under-estimated, and we should charge the truth); settling DOWN is
  // never right, because the only thing that makes the provider's number smaller
  // is our own trimming.
  const reservedSeconds = Math.max(0, Math.round(Number(job.audio_seconds) || 0));
  await finalize({
    p_actual_seconds: Math.max(actualSeconds, reservedSeconds),
    p_job_id: job.id,
    p_status: "done",
  });

  // WHICH batch rate comes from the model the finished job reports, not from the
  // one the submit asked for: an ignored request field would otherwise show up
  // as a saving that never happened. Unrecognised bills at the dearer tier.
  const ranModel = polledBody.speech_models ?? polledBody.speech_model;
  const batchProvider = batchProviderFor(ranModel);
  if (batchProvider === "assemblyai_batch") {
    // Loud on purpose: this is the tell that the pinned cheaper tier is not
    // being honoured, and it is otherwise invisible until the invoice arrives.
    console.warn("transcription billed at the Pro batch rate; model reported as", JSON.stringify(ranModel ?? null));
  }
  await reportVoiceCost(job.user_id, batchProvider, actualSeconds);
  await removeObject(job.storage_path);

  if (!transcript) return json({ error: "The recording contained no recognizable speech.", status: "error" }, 200, req);
  return json({ status: "done", transcript }, 200, req);
}

/**
 * Close out a job a SYNCHRONOUS provider already answered: settle the student's
 * meter, then report what we paid. Two numbers, two destinations — the same
 * split handleStatus documents at length for the AssemblyAI path, which is the
 * only place it used to be applied.
 *
 * 🔴 THE `Math.max` IS THE WHOLE POINT, and leaving it out is invisible.
 * `finalize_transcription_job` does `used += p_actual_seconds - audio_seconds`,
 * so a provider duration SMALLER than the reservation REFUNDS the difference to
 * the student. The phone trims sustained silence before uploading
 * (apps/mobile/src/lib/wav-trim.ts), so the provider's number is systematically
 * smaller — meaning the un-maxed form hands our own saving back to the student
 * on every recording. That is precisely the option the owner rejected on
 * 2026-07-27: the meter settles UP (the client under-estimated, charge the
 * truth) but never DOWN.
 *
 * The cost report gets the provider's REAL duration, because that is the audio
 * we are billed for. Only the meter is floored.
 *
 * Extracted so this cannot drift between providers again: both the xAI and Groq
 * branches previously inlined `provider.seconds || seconds`, which had this bug
 * in both copies.
 */
async function settleSynchronousJob(
  jobId: string,
  userId: string,
  provider: Parameters<typeof batchCostUsd>[0],
  providerSeconds: number,
  reservedSeconds: number,
): Promise<void> {
  const paidFor = Math.max(0, Math.round(Number(providerSeconds) || 0));
  const reserved = Math.max(0, Math.round(Number(reservedSeconds) || 0));
  await finalize({ p_actual_seconds: Math.max(paidFor, reserved), p_job_id: jobId, p_status: "done" });
  await reportVoiceCost(userId, provider, paidFor || reserved);
}

/** What a provider did: the transcript, or why it stood down. */
type ProviderAttempt =
  | { ok: true; text: string; seconds: number }
  | { ok: false; reason: string };

/**
 * A provider's error, short enough for a job row and safe to store.
 *
 * This lands in the database and is read by a human debugging a fall-through, so
 * it is clipped hard and scrubbed: an error body is arbitrary text from someone
 * else's server, and a diagnostic that quietly persists a credential would be a
 * worse bug than the one it exists to find. Anything long, unbroken and
 * token-shaped is redacted rather than trusted.
 */
function describe(value: unknown): string {
  const raw = typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
  return raw
    .replace(/\b(?:xai|sk|gsk|Bearer)[-_ ][A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/**
 * One synchronous xAI Grok STT pass over a remote audio URL.
 *
 * Shape read off docs.x.ai/developers/model-capabilities/audio/speech-to-text on
 * 2026-07-28: POST /v1/stt, bearer auth, and — the reason this lane is cheap to
 * add — a `url` parameter that makes xAI fetch the audio itself. The signed URL
 * we already mint for AssemblyAI works unchanged, so no audio is streamed through
 * this function.
 *
 * `diarize` is asked for because xAI's $0.10/hr INCLUDES speaker labels; unlike
 * AssemblyAI there is no add-on to weigh. It returns speakers per WORD rather
 * than per turn, which utterancesFromWords regroups so both providers produce an
 * identically-formatted transcript.
 *
 * Reports a REASON on failure rather than a bare null, so the caller can write
 * it onto the job row — never throws, and the ladder still falls through.
 */
async function transcribeWithXai(audioUrl: string): Promise<ProviderAttempt> {
  try {
    const form = new FormData();
    form.set("url", audioUrl);
    form.set("language", "en");
    // `language` ALONE DOES NOTHING — the docs define it as "used with
    // format=true to enable text formatting", so sending it without `format`
    // was an inert field. `format` turns on Inverse Text Normalization, which
    // is what writes "fifty milligrams" as "50 mg" and "one hundred dollars" as
    // "$100". That matters here more than it looks: a lecture transcript is the
    // input to notes and flashcards, and a dose or a figure spelled out in words
    // is one the student cannot skim or search for.
    // (The 400 in the docs is format=true WITHOUT language — never the reverse —
    // so the pair has to be set together, as it is here.)
    form.set("format", "true");
    form.set("diarize", "true");
    const res = await fetch("https://api.x.ai/v1/stt", {
      body: form,
      headers: { Authorization: `Bearer ${XAI_KEY}` },
      method: "POST",
    });
    const body = await res.json().catch(() => null) as {
      text?: unknown;
      words?: unknown;
      duration?: unknown;
      error?: unknown;
    } | null;
    if (!res.ok || typeof body?.text !== "string") {
      const detail = describe(body?.error);
      console.warn("xAI transcription unavailable, falling through", res.status, detail);
      return { ok: false, reason: `HTTP ${res.status}${detail ? ` — ${detail}` : ""}` };
    }
    const flat = body.text.trim();
    // Regrouped words when they carry speakers; the flat text otherwise. A
    // provider that stops sending `words` degrades to plain text rather than
    // to an empty transcript.
    const text = formatDiarizedTranscript(utterancesFromWords(body.words), flat);
    if (!text) return { ok: false, reason: "answered with an empty transcript" };
    return { ok: true, seconds: Math.max(0, Math.round(Number(body.duration) || 0)), text };
  } catch (err) {
    const detail = (err as Error)?.message ?? "unknown";
    console.warn("xAI transcription threw, falling through", detail);
    return { ok: false, reason: `threw: ${detail}` };
  }
}

/** One synchronous Groq Whisper pass over a remote audio URL. Reports a reason on
 *  failure so the caller can fall back AND say why — never throws. */
async function transcribeWithGroq(audioUrl: string): Promise<ProviderAttempt> {
  try {
    const form = new FormData();
    form.set("url", audioUrl);
    form.set("model", "whisper-large-v3-turbo");
    form.set("response_format", "verbose_json");
    form.set("temperature", "0");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      body: form,
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      method: "POST",
    });
    const resBody = await res.json().catch(() => null) as {
      text?: unknown;
      duration?: unknown;
      error?: { message?: unknown } | unknown;
    } | null;
    if (!res.ok || typeof resBody?.text !== "string") {
      const detail = describe(
        resBody && typeof resBody.error === "object" && resBody.error !== null
          ? (resBody.error as { message?: unknown }).message
          : resBody?.error,
      );
      console.warn("Groq transcription unavailable, falling back to AssemblyAI", res.status, detail);
      return { ok: false, reason: `HTTP ${res.status}${detail ? ` — ${detail}` : ""}` };
    }
    return { ok: true, seconds: Math.max(0, Math.round(Number(resBody.duration) || 0)), text: resBody.text.trim() };
  } catch (err) {
    const detail = (err as Error)?.message ?? "unknown";
    console.warn("Groq transcription threw, falling back to AssemblyAI", detail);
    return { ok: false, reason: `threw: ${detail}` };
  }
}

// ---- Supabase REST helpers (no SDK: one fetch each, and the service key never
// leaves this process) ----

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

/** The caller's uid from their bearer token, or null. Never trusts a uid from
 *  the body — you can only transcribe your own recordings. */
async function verifyUser(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json().catch(() => null) as { id?: unknown } | null;
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
      body: JSON.stringify(args),
      headers: restHeaders,
      method: "POST",
    });
    if (!res.ok) return { error: await res.text().catch(() => `${res.status}`), ok: false };
    return { data: await res.json().catch(() => undefined) as T, ok: true };
  } catch (err) {
    return { error: (err as Error)?.message ?? "rpc failed", ok: false };
  }
}

/** Settle the meter. Never throws — a failed settlement leaves the conservative
 *  reservation standing, which is the safe direction. */
async function finalize(args: Record<string, unknown>): Promise<void> {
  const result = await rpc("finalize_transcription_job", args);
  if (!result.ok) console.error("finalize_transcription_job failed", result.error);
}

async function readJob(jobId: string): Promise<JobRow | null> {
  try {
    const url = `${SB_URL}/rest/v1/transcription_jobs` +
      `?id=eq.${encodeURIComponent(jobId)}` +
      `&select=id,user_id,storage_path,provider_job_id,status,error,transcript,audio_seconds&limit=1`;
    const res = await fetch(url, { headers: restHeaders });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => null) as JobRow[] | null;
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function patchJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SB_URL}/rest/v1/transcription_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      body: JSON.stringify(patch),
      headers: { ...restHeaders, Prefer: "return=minimal" },
      method: "PATCH",
    });
  } catch (err) {
    console.error("transcription job update failed", (err as Error)?.message);
  }
}

async function createSignedUrl(path: string, expiresIn: number): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/sign/recordings/${path}`, {
      body: JSON.stringify({ expiresIn }),
      headers: restHeaders,
      method: "POST",
    });
    if (!res.ok) return null;
    const signed = await res.json().catch(() => null) as { signedURL?: unknown } | null;
    // The API returns a path like "/object/sign/recordings/…?token=…".
    return typeof signed?.signedURL === "string" ? `${SB_URL}/storage/v1${signed.signedURL}` : null;
  } catch {
    return null;
  }
}

/** Nothing is retained once the transcript exists. Never throws — a leaked
 *  object is a storage bill, not a broken transcript. */
async function removeObject(path: string): Promise<void> {
  try {
    await fetch(`${SB_URL}/storage/v1/object/recordings/${path}`, {
      headers: restHeaders,
      method: "DELETE",
    });
  } catch (err) {
    console.error("recording cleanup failed", (err as Error)?.message);
  }
}

/**
 * Report one voice charge to PostHog, where it joins the valve's $ai_generation
 * events on the same `client` property. Never throws: a missing cost report must
 * never break a transcript the student is waiting on.
 *
 * `client: "supabase"` — this lane used to be reported as "web" from the Next.js
 * app. The property says where the charge was incurred, so it moves with the code.
 */
async function reportVoiceCost(
  userId: string,
  provider: Parameters<typeof batchCostUsd>[0],
  seconds: number,
): Promise<void> {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  if (!POSTHOG_KEY || !userId || safeSeconds <= 0) return;
  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: "nemesis_service_cost",
        properties: {
          client: "supabase",
          cost_usd: batchCostUsd(provider, safeSeconds),
          distinct_id: userId,
          lane: "recording",
          price_rev: PRICE_REV,
          provider,
          seconds: safeSeconds,
          service: "voice",
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    /* analytics is never load-bearing */
  }
}
