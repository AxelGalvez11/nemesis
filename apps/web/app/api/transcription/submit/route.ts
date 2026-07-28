import { randomUUID } from "node:crypto";

import { reportVoiceCost } from "@/lib/cost-report";
import { assemblyAiApiKey, groqApiKey } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";
// The Groq path transcribes synchronously inside this request (~200x real
// time, so even a 2h file finishes in well under a minute) — give the route
// headroom beyond the platform default.
export const maxDuration = 120;

// Longest single recording accepted for an enhance pass (the recordings
// bucket caps files at 250MB ≈ 2h of 16-bit/16kHz mono anyway).
const MAX_SECONDS = 3 * 60 * 60;

interface ReserveResult {
  allowed?: boolean;
  reason?: string;
  plan?: string;
  used?: number;
  limit?: number;
}

/**
 * Enhance-transcript submit: the phone (or web, later) records with the free
 * on-device engine, uploads the audio to the private `recordings` bucket, and
 * posts the storage path here. This route meters the request against the
 * plan's monthly transcription allowance, then transcribes Groq-first —
 * synchronous Whisper turbo at ~1/4 the AssemblyAI price, parking the text on
 * the job row for the first /api/transcription/status poll to collect. Any
 * Groq failure (file over its size cap, rate limit, outage) falls back to the
 * asynchronous AssemblyAI flow, which /status polls to completion.
 */
export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to enhance transcripts." }, 401);
  if (!assemblyAiApiKey && !groqApiKey) {
    return json({ error: "Transcript enhancement is not configured yet." }, 503);
  }

  const body = await request.json().catch(() => ({})) as { storagePath?: unknown; seconds?: unknown };
  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  const seconds = Math.round(Number(body.seconds));
  if (!storagePath.startsWith(`${user.id}/`)) return json({ error: "That recording does not belong to this account." }, 403);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) {
    return json({ error: "The recording length is invalid." }, 400);
  }

  const admin = adminClient();
  const jobId = randomUUID();
  const { data, error } = await admin.rpc("reserve_transcription_seconds", {
    p_job_id: jobId,
    p_seconds: seconds,
    p_storage_path: storagePath,
    p_user_id: user.id,
  });
  if (error) {
    console.error("transcription reservation failed", error.message);
    return json({ error: "Transcript metering is not ready. Apply the latest database migration." }, 503);
  }
  const reservation = (data ?? {}) as ReserveResult;
  if (!reservation.allowed) {
    return json({
      error: reservation.reason === "quota_exceeded"
        ? "You have reached this month's enhanced transcription limit."
        : "Enhanced transcription is not available on this plan.",
      limitSeconds: reservation.limit ?? 0,
      plan: reservation.plan ?? "free",
      usedSeconds: reservation.used ?? 0,
    }, 429);
  }
  const usage = {
    limitSeconds: Number(reservation.limit) || 0,
    plan: reservation.plan ?? "free",
    usedSeconds: Number(reservation.used) || seconds,
  };

  // Signed URL outlives the AssemblyAI queue comfortably; the object itself
  // is deleted once the transcript is back (below for Groq, by the status
  // route for AssemblyAI).
  const signed = await admin.storage.from("recordings").createSignedUrl(storagePath, 6 * 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    await admin.rpc("finalize_transcription_job", { p_error: "missing audio object", p_job_id: jobId, p_status: "error" });
    return json({ error: "The uploaded audio could not be found." }, 404);
  }

  if (groqApiKey) {
    const groq = await transcribeWithGroq(signed.data.signedUrl);
    if (groq) {
      // Transcript first, settle the meter second: if the finalize call ever
      // failed the user would still get their text (the status route serves
      // any parked transcript) while the meter keeps the conservative
      // reservation.
      await admin
        .from("transcription_jobs")
        .update(groq.text ? { provider: "groq", transcript: groq.text } : { provider: "groq" })
        .eq("id", jobId);
      await admin.rpc("finalize_transcription_job", {
        p_actual_seconds: groq.seconds || seconds,
        p_job_id: jobId,
        p_status: "done",
      });
      // What those minutes cost us, on the web app's ledger.
      await reportVoiceCost({
        lane: "recording",
        provider: "groq_whisper_turbo",
        seconds: groq.seconds || seconds,
        userId: user.id,
      });
      await admin.storage.from("recordings").remove([storagePath]);
      return json({ jobId, usage });
    }
  }

  if (!assemblyAiApiKey) {
    await admin.rpc("finalize_transcription_job", { p_error: "provider rejected the job", p_job_id: jobId, p_status: "error" });
    return json({ error: "The transcription provider is unavailable. Try again in a moment." }, 502);
  }

  const submitted = await fetch("https://api.assemblyai.com/v2/transcript", {
    body: JSON.stringify({
      audio_url: signed.data.signedUrl,
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
      // the invoice and isn't.)
      //
      // The trade is accuracy: Universal-2 is the older model. Reverting is
      // deleting this one line, and lib/cost-report.ts's rate must move back
      // with it.
      speech_models: ["universal-2"],
      // Owner 2026-07-27. +$0.02/hr on top of this lane's async rate — a tenth
      // of the transcription line, not a new engine — and it buys the one thing
      // that matters for a lecture: a classmate's question, and especially a
      // classmate's wrong guess, is no longer indistinguishable from what the
      // lecturer established. lib/transcript-speakers.ts drops the labels again
      // when the recording turns out to have only one voice, which is the
      // common case, so a solo lecture is unchanged.
      speaker_labels: true,
    }),
    cache: "no-store",
    headers: { Authorization: assemblyAiApiKey, "Content-Type": "application/json" },
    method: "POST",
  });
  const submittedBody = await submitted.json().catch(() => null) as { id?: unknown; error?: unknown } | null;
  if (!submitted.ok || typeof submittedBody?.id !== "string") {
    await admin.rpc("finalize_transcription_job", { p_error: "provider rejected the job", p_job_id: jobId, p_status: "error" });
    console.error("AssemblyAI submit failed", submitted.status, submittedBody?.error);
    return json({ error: "The transcription provider is unavailable. Try again in a moment." }, 502);
  }

  await admin.rpc("finalize_transcription_job", {
    p_job_id: jobId,
    p_provider_job_id: submittedBody.id,
    p_status: "processing",
  });

  return json({ jobId, usage });
}

/** One synchronous Groq Whisper pass over a remote audio URL. Returns null on
 *  any failure so the caller can fall back to AssemblyAI — never throws. */
async function transcribeWithGroq(audioUrl: string): Promise<{ text: string; seconds: number } | null> {
  try {
    const form = new FormData();
    form.set("url", audioUrl);
    form.set("model", "whisper-large-v3-turbo");
    form.set("response_format", "verbose_json");
    form.set("temperature", "0");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      body: form,
      cache: "no-store",
      headers: { Authorization: `Bearer ${groqApiKey}` },
      method: "POST",
    });
    const resBody = await res.json().catch(() => null) as {
      text?: unknown;
      duration?: unknown;
      error?: { message?: unknown } | unknown;
    } | null;
    if (!res.ok || typeof resBody?.text !== "string") {
      const reason = resBody && typeof resBody.error === "object" && resBody.error !== null
        ? (resBody.error as { message?: unknown }).message
        : undefined;
      console.warn("Groq transcription unavailable, falling back to AssemblyAI", res.status, reason);
      return null;
    }
    return {
      text: resBody.text.trim(),
      seconds: Math.max(0, Math.round(Number(resBody.duration) || 0)),
    };
  } catch (cause) {
    console.warn("Groq transcription failed, falling back to AssemblyAI", cause instanceof Error ? cause.message : cause);
    return null;
  }
}
