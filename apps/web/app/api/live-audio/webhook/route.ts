import { createHash } from "node:crypto";

import { adminClient, json } from "@/lib/server";

export const runtime = "nodejs";

const WEBHOOK_HEADER = "X-Nemesis-Audio-Secret";
const ASSEMBLYAI_WEBHOOK_IPS = new Set(["44.238.19.20", "54.220.25.36"]);

interface WebhookTurn {
  end_of_turn?: boolean;
  transcript?: string;
  type?: string;
}

function secretHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isTrustedProviderSource(request: Request): boolean {
  // Vercel overwrites these headers, so unlike the browser-visible custom
  // webhook secret, the source address cannot be spoofed by an end user.
  // AssemblyAI currently documents one fixed webhook address per US/EU region.
  if (!process.env.VERCEL) return true;
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? "";
  const sourceIp = forwarded.split(",", 1)[0]?.trim();
  return Boolean(sourceIp && ASSEMBLYAI_WEBHOOK_IPS.has(sourceIp));
}

export async function POST(request: Request) {
  const reservationId = new URL(request.url).searchParams.get("reservation_id");
  const secret = request.headers.get(WEBHOOK_HEADER);
  if (!reservationId || !secret || !isTrustedProviderSource(request)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const payload = await request.json().catch(() => null) as { session_id?: unknown; messages?: unknown } | null;
  if (!payload || !Array.isArray(payload.messages)) return json({ error: "Invalid webhook payload" }, 400);

  const transcript = (payload.messages as WebhookTurn[])
    .filter((turn) => turn.type === "Turn" && turn.end_of_turn && typeof turn.transcript === "string")
    .map((turn) => turn.transcript?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  const providerSessionId = typeof payload.session_id === "string" ? payload.session_id : null;

  const { data, error } = await adminClient().rpc("finalize_live_audio_window", {
    p_provider_session_id: providerSessionId,
    p_reservation_id: reservationId,
    p_transcript_text: transcript || null,
    p_webhook_secret_hash: secretHash(secret),
  });
  if (error) {
    console.error("live audio webhook reconciliation failed", error.message);
    // 5xx asks AssemblyAI to retry the delivery.
    return json({ error: "Reconciliation failed" }, 503);
  }

  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  if (!result.ok) return json({ error: "Unauthorized" }, 401);
  return json({ ok: true, reason: result.reason ?? "completed" });
}
