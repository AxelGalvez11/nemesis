import { assemblyAiApiKey } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

interface JobRow {
  id: string;
  user_id: string;
  storage_path: string;
  provider_job_id: string | null;
  status: string;
  error: string | null;
}

/**
 * Poll an enhance-transcript job. While AssemblyAI is working this proxies
 * its status; on completion it settles the meter to the provider-measured
 * duration, deletes the uploaded audio (nothing is retained once the
 * transcript exists), and returns the text exactly once for the caller to
 * fold into its recording artifact.
 */
export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to enhance transcripts." }, 401);
  if (!assemblyAiApiKey) return json({ error: "Transcript enhancement is not configured yet." }, 503);

  const body = await request.json().catch(() => ({})) as { jobId?: unknown };
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) return json({ error: "A job id is required." }, 400);

  const admin = adminClient();
  const { data, error } = await admin
    .from("transcription_jobs")
    .select("id,user_id,storage_path,provider_job_id,status,error")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) return json({ error: "That transcription job was not found." }, 404);
  const job = data as JobRow;
  if (job.user_id !== user.id) return json({ error: "That transcription job was not found." }, 404);

  if (job.status === "error") return json({ status: "error", error: job.error ?? "The transcription failed." });
  // Done jobs have already handed out their transcript and deleted the audio;
  // the artifact row is the durable home, so a re-poll just reports state.
  if (job.status === "done") return json({ status: "done", transcript: null });
  if (!job.provider_job_id) return json({ status: "processing" });

  const polled = await fetch(`https://api.assemblyai.com/v2/transcript/${job.provider_job_id}`, {
    cache: "no-store",
    headers: { Authorization: assemblyAiApiKey },
  });
  const polledBody = await polled.json().catch(() => null) as {
    status?: unknown;
    text?: unknown;
    audio_duration?: unknown;
    error?: unknown;
  } | null;
  if (!polled.ok || typeof polledBody?.status !== "string") {
    return json({ status: "processing" });
  }

  if (polledBody.status === "error") {
    const reason = typeof polledBody.error === "string" ? polledBody.error.slice(0, 300) : "The transcription failed.";
    await admin.rpc("finalize_transcription_job", { p_error: reason, p_job_id: job.id, p_status: "error" });
    await admin.storage.from("recordings").remove([job.storage_path]);
    return json({ status: "error", error: reason });
  }

  if (polledBody.status !== "completed") return json({ status: "processing" });

  const transcript = typeof polledBody.text === "string" ? polledBody.text.trim() : "";
  const actualSeconds = Math.max(0, Math.round(Number(polledBody.audio_duration) || 0));
  await admin.rpc("finalize_transcription_job", {
    p_actual_seconds: actualSeconds,
    p_job_id: job.id,
    p_status: "done",
  });
  await admin.storage.from("recordings").remove([job.storage_path]);

  if (!transcript) return json({ status: "error", error: "The recording contained no recognizable speech." });
  return json({ status: "done", transcript });
}
