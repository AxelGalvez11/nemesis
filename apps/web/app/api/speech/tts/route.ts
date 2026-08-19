// Azure synthesis, streamed.
//
// 🔴 THIS DOES NOT REPLACE `nemesis-speak` AND MUST NOT. The Canvas voice lane works, is paid for,
// and reads a question aloud through a Supabase function whose key already exists — §47's whole
// argument is that Azure earns the LANGUAGE lane, where the variety is the material and a catalogue
// is the difference between choosing a voice and accepting one. Two providers, two jobs.
//
// 🔴 THE VOICE IS CHOSEN HERE RATHER THAN SENT BY THE CLIENT. A client naming a voice would be a
// client that has to know the catalogue, keep up with it, and be trusted with what a learner hears.
// It sends a locale; `selectVoice` answers deterministically, so the same lesson sounds the same
// tomorrow. An explicit `voice` is still accepted, for a picker that has already asked.
//
// 🔴 STREAMED STRAIGHT THROUGH. Azure starts returning audio before the sentence is finished, so the
// body is piped rather than buffered — most of a second of perceived latency on a short utterance,
// which is the difference between a drill that feels immediate and one that does not.

import { synthesise } from "@/lib/speech/azure/tts";
import { fetchVoiceCatalogue } from "@/lib/speech/azure/voice-catalog";
import { selectVoice } from "@/lib/speech/voice-selection";
import { SPEECH_CHAR_LIMIT } from "@/lib/learn/canvas-speech";
import { json, verifyBearer } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to use speech." }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    text?: unknown;
    locale?: unknown;
    voice?: unknown;
    style?: unknown;
    rate?: unknown;
    fallback?: unknown;
  };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json({ error: "Nothing to say.", reason: "empty-text" }, 400);
  // 🔴 THE SAME 600 THE CANVAS LANE HOLDS, AND NOT AZURE'S 3,000. The bound that matters is the
  // product's — an utterance longer than this is not something voice mode should be reading — and
  // enforcing the provider's larger one here would let a caller spend six times as much per request
  // as the feature was designed around.
  if (text.length > SPEECH_CHAR_LIMIT) {
    return json({ error: "Too long to speak.", limit: SPEECH_CHAR_LIMIT, reason: "too-long-to-speak" }, 413);
  }

  const locale = typeof body.locale === "string" ? body.locale.trim() : "";
  if (!locale) {
    // 🔴 REFUSED RATHER THAN DEFAULTED, WHICH IS §43'S RULE CARRIED INTO THE ROUTE. This endpoint
    // exists for the lane where the variety is being taught; a default here would silently teach an
    // accent nobody chose. The Canvas lane, which legitimately does not care, uses `nemesis-speak`.
    return json({ error: "A locale is required.", reason: "locale-unknown" }, 400);
  }

  const catalogue = await fetchVoiceCatalogue({ fetch });
  if (!catalogue.ok) {
    const status = catalogue.reason.startsWith("azure-key") || catalogue.reason.startsWith("azure-region") ? 503 : 502;
    return json({ error: "Speech is unavailable right now.", reason: catalogue.reason }, status);
  }

  const chosen = selectVoice(catalogue.catalogue.voices, {
    ...(body.fallback === true ? { allowRegionFallback: true } : {}),
    locale,
    ...(typeof body.voice === "string" && body.voice.trim() ? { shortName: body.voice.trim() } : {}),
    ...(typeof body.style === "string" && body.style.trim() ? { style: body.style.trim() } : {}),
  });
  if (!chosen.ok) {
    return json({ error: "No voice for that language yet.", detail: chosen.detail, reason: chosen.reason }, 404);
  }

  const rate = typeof body.rate === "number" && Number.isFinite(body.rate)
    ? Math.min(1.2, Math.max(0.7, body.rate))
    : 1;

  const spoken = await synthesise(
    { fetch },
    {
      locale: chosen.choice.voice.locale,
      rate,
      ...(typeof body.style === "string" && body.style.trim() && chosen.choice.voice.styles.includes(body.style.trim())
        ? { style: body.style.trim() }
        : {}),
      text,
      voice: chosen.choice.voice.shortName,
    },
  );

  if (!spoken.ok) {
    const status = spoken.reason === "azure-rate-limited" ? 429 : spoken.reason.startsWith("azure-key") ? 503 : 502;
    console.error(JSON.stringify({ event: "azure_tts_failed", latencyMs: spoken.latencyMs, reason: spoken.reason }));
    return json({ error: "Speech is unavailable right now.", reason: spoken.reason }, status);
  }

  // Counts and settings only, never the text — the same rule every other analytics call in this
  // codebase holds. The locale and the voice are the fields worth having: without them nothing can
  // report which variety a learner actually heard.
  console.log(
    JSON.stringify({
      chars: spoken.characters,
      event: "azure_tts_spoken",
      latencyMs: spoken.latencyMs,
      locale: chosen.choice.voice.locale,
      match: chosen.choice.match,
      voice: spoken.voice,
    }),
  );

  return new Response(spoken.audio, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "audio/mpeg",
      "X-Nemesis-Voice": spoken.voice,
      "X-Nemesis-Voice-Match": chosen.choice.match,
      "X-Nemesis-Tts-Latency-Ms": String(spoken.latencyMs),
    },
  });
}
