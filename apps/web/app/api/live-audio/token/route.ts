import { createHash, randomBytes, randomUUID } from "node:crypto";

import { assemblyAiApiKey, assemblyAiSpeechModel } from "@/lib/env";
import { adminClient, json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

const WINDOW_SECONDS = 15 * 60;
const WEBHOOK_HEADER = "X-Nemesis-Audio-Secret";

interface ReserveResult {
  allowed?: boolean;
  reason?: string;
  plan?: string;
  used?: number;
  limit?: number;
  reserved_seconds?: number;
}
function secretHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the request origin when local configuration is malformed.
    }
  }
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to start live transcription." }, 401);
  if (!assemblyAiApiKey) return json({ error: "Live transcription is not configured yet." }, 503);

  const body = await request.json().catch(() => ({})) as { surface?: unknown; contextId?: unknown };
  const surface = body.surface === "notebook" ? "notebook" : "sessions";
  const contextId = typeof body.contextId === "string" ? body.contextId.slice(0, 200) : null;
  const reservationId = randomUUID();
  const webhookSecret = randomBytes(24).toString("hex");
  const webhookSecretHash = secretHash(webhookSecret);
  const admin = adminClient();

  const { data, error } = await admin.rpc("reserve_live_audio_window", {
    p_context_id: contextId,
    p_requested_seconds: WINDOW_SECONDS,
    p_reservation_id: reservationId,
    p_surface: surface,
    p_user_id: user.id,
    p_webhook_secret_hash: webhookSecretHash,
  });
  if (error) {
    console.error("live audio reservation failed", error.message);
    return json({ error: "Live audio metering is not ready. Apply the latest database migration." }, 503);
  }

  const reservation = (data ?? {}) as ReserveResult;
  if (!reservation.allowed) {
    return json({
      error: reservation.reason === "quota_exceeded"
        ? "You have reached this month's live transcription limit."
        : "Live transcription is not available on this plan.",
      limitSeconds: reservation.limit ?? 0,
      plan: reservation.plan ?? "free",
      usedSeconds: reservation.used ?? 0,
    }, 429);
  }

  const reservedSeconds = Math.max(60, Math.min(WINDOW_SECONDS, Number(reservation.reserved_seconds) || WINDOW_SECONDS));
  const tokenUrl = new URL("https://streaming.assemblyai.com/v3/token");
  tokenUrl.searchParams.set("expires_in_seconds", "60");
  tokenUrl.searchParams.set("max_session_duration_seconds", String(reservedSeconds));

  const tokenResponse = await fetch(tokenUrl, {
    cache: "no-store",
    headers: { Authorization: assemblyAiApiKey },
  });
  const tokenBody = await tokenResponse.json().catch(() => null) as { token?: unknown; error?: unknown } | null;
  if (!tokenResponse.ok || typeof tokenBody?.token !== "string") {
    // Reconcile immediately so a provider outage does not strand most of the
    // user's 15-minute reservation. The secure DB function uses server time.
    await admin.rpc("finalize_live_audio_window", {
      p_provider_session_id: null,
      p_reservation_id: reservationId,
      p_transcript_text: null,
      p_webhook_secret_hash: webhookSecretHash,
    });
    console.error("AssemblyAI temporary token failed", tokenResponse.status, tokenBody?.error);
    return json({ error: "The transcription provider is unavailable. Try again in a moment." }, 502);
  }

  const webhookUrl = new URL("/api/live-audio/webhook", appOrigin(request));
  webhookUrl.searchParams.set("reservation_id", reservationId);

  return json({
    reservationId,
    reservedSeconds,
    speechModel: assemblyAiSpeechModel,
    token: tokenBody.token,
    usage: {
      limitSeconds: Number(reservation.limit) || 0,
      plan: reservation.plan ?? "free",
      usedSeconds: Number(reservation.used) || reservedSeconds,
    },
    webhook: {
      headerName: WEBHOOK_HEADER,
      headerValue: webhookSecret,
      url: webhookUrl.toString(),
    },
  });
}
