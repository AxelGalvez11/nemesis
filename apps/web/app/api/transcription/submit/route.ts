import { randomUUID } from "node:crypto";

import { assemblyAiApiKey } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

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
 * plan's monthly transcription allowance, hands AssemblyAI a short-lived
 * signed URL, and returns a job id for /api/transcription/status polling.
 */
export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to enhance transcripts." }, 401);
  if (!assemblyAiApiKey) return json({ error: "Transcript enhancement is not configured yet." }, 503);

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

  // Signed URL outlives the AssemblyAI queue comfortably; the object itself
  // is deleted by the status route once the transcript is back.
  const signed = await admin.storage.from("recordings").createSignedUrl(storagePath, 6 * 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    await admin.rpc("finalize_transcription_job", { p_error: "missing audio object", p_job_id: jobId, p_status: "error" });
    return json({ error: "The uploaded audio could not be found." }, 404);
  }

  const submitted = await fetch("https://api.assemblyai.com/v2/transcript", {
    body: JSON.stringify({
      audio_url: signed.data.signedUrl,
      format_text: true,
      punctuate: true,
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

  return json({
    jobId,
    usage: {
      limitSeconds: Number(reservation.limit) || 0,
      plan: reservation.plan ?? "free",
      usedSeconds: Number(reservation.used) || seconds,
    },
  });
}
