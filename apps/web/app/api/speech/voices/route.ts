// The voice catalogue, filtered.
//
// 🔴 THE FULL AZURE PAYLOAD IS ABOUT 700KB AND IS NEVER SENT TO A BROWSER. A client asking "which
// voice for es-MX?" needs one answer and a handful of alternatives, not four hundred rows it will
// filter and discard. The catalogue is fetched and cached server-side and this route answers
// questions about it.
//
// 🔴 THREE QUESTIONS, ONE ENDPOINT, BECAUSE THEY ARE THE SAME QUESTION AT THREE ZOOM LEVELS: which
// languages can be spoken at all, which voices exist for one of them, and which one would be chosen.

import { fetchVoiceCatalogue } from "@/lib/speech/azure/voice-catalog";
import { selectVoice, supportedLocales } from "@/lib/speech/voice-selection";
import { json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

/** A hard ceiling on rows returned, so a broad query cannot become a large response. */
const MAX_ROWS = 60;

export async function GET(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to use speech." }, 401);

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale")?.trim() ?? "";
  const gender = url.searchParams.get("gender")?.trim().toLowerCase() ?? "";
  const style = url.searchParams.get("style")?.trim() ?? "";
  const fallback = url.searchParams.get("fallback") === "true";

  const result = await fetchVoiceCatalogue({ fetch });
  if (!result.ok) {
    const status = result.reason.startsWith("azure-key") || result.reason.startsWith("azure-region") ? 503 : 502;
    return json({ error: "The voice catalogue is unavailable.", detail: result.detail, reason: result.reason }, status);
  }

  const catalogue = result.catalogue;
  if (!locale) {
    // No locale: answer the widest question — what can be spoken at all.
    return json({
      fetchedAt: catalogue.fetchedAt,
      locales: supportedLocales(catalogue.voices),
      provider: "azure",
      totalVoices: catalogue.voices.length,
    });
  }

  const chosen = selectVoice(catalogue.voices, {
    ...(fallback ? { allowRegionFallback: true } : {}),
    ...(gender === "female" || gender === "male" || gender === "neutral" ? { gender } : {}),
    locale,
    ...(style ? { style } : {}),
  });
  if (!chosen.ok) {
    return json({ error: "No voice matches that request.", detail: chosen.detail, reason: chosen.reason }, 404);
  }

  return json({
    alternatives: chosen.choice.alternatives.slice(0, MAX_ROWS),
    because: chosen.choice.because,
    fetchedAt: catalogue.fetchedAt,
    match: chosen.choice.match,
    provider: "azure",
    requestedLocale: chosen.choice.requestedLocale,
    voice: chosen.choice.voice,
  });
}
