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

/**
 * An Azure voice id, by shape. `es-MX-DaliaNeural`, `en-US-AvaMultilingualNeural`.
 *
 * See the note beside its use: a shape check rather than a list, because the real set lives at the
 * provider and a compiled-in allow-list starts refusing voices that work the day Azure ships one.
 */
const AZURE_VOICE_SHAPE = /^[A-Za-z0-9-]{3,64}Neural$/;

/**
 * The pace, bounded.
 *
 * 🔴 CLAMPED RATHER THAN REJECTED, because a number outside this window is unusable audio and not a
 * security problem. A caller sending nonsense gets a normal reading rather than a 400 that would
 * silence the lesson over a decimal.
 */
function clampRate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1.2, Math.max(0.7, value)) : 1;
}

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

  // 🔴🔴 A NAMED VOICE SKIPS THE CATALOGUE ENTIRELY, AND THAT IS THE AZURE HALF OF THE LATENCY THE
  // OWNER REPORTED (§48). `fetchVoiceCatalogue` is a ~700KB round trip to Azure that has to finish
  // before the round trip that makes the sound can start. It is cached for six hours PER SERVER
  // INSTANCE — which on serverless means every cold instance pays it, in front of the first
  // utterance a learner hears. The catalogue exists to CHOOSE a voice; a request that already names
  // one does not need to choose, so it does not wait.
  //
  // 🔴 SHAPE-CHECKED AND THEN TRUSTED, WITH THE PROVIDER AS THE VALIDATOR — the identical rule
  // `nemesis-speak` states at length for xAI's ids. The real set lives at Azure and changes without
  // telling us; what must be checked is that the value cannot be anything but an identifier, since
  // it goes into a request body under our own credential. A retired id gets a 502 from Azure rather
  // than a 404 from us, and the id in question came from this same catalogue via Settings.
  const named = typeof body.voice === "string" ? body.voice.trim() : "";
  if (named && AZURE_VOICE_SHAPE.test(named)) {
    const direct = await synthesise(
      { fetch },
      { locale, rate: clampRate(body.rate), text, voice: named },
    );
    if (!direct.ok) {
      const status = direct.reason === "azure-rate-limited" ? 429 : direct.reason.startsWith("azure-key") ? 503 : 502;
      console.error(JSON.stringify({ event: "azure_tts_failed", latencyMs: direct.latencyMs, named: true, reason: direct.reason }));
      return json({ error: "Speech is unavailable right now.", reason: direct.reason }, status);
    }
    console.log(JSON.stringify({
      chars: direct.characters,
      event: "azure_tts_spoken",
      latencyMs: direct.latencyMs,
      locale,
      match: "named",
      voice: direct.voice,
    }));
    return new Response(direct.audio, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "audio/mpeg",
        "X-Nemesis-Voice": direct.voice,
        "X-Nemesis-Voice-Match": "named",
        "X-Nemesis-Tts-Latency-Ms": String(direct.latencyMs),
      },
    });
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

  const rate = clampRate(body.rate);

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
