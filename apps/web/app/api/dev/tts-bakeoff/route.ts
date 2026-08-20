// DEV-ONLY — synthesise one phrase through several providers so a person can listen (§43).
//
// 🔴 THESE ADAPTERS ARE NOT A MULTI-PROVIDER INTEGRATION AND MUST NOT BECOME ONE. Production speech
// goes through `supabase/functions/nemesis-speak`, on one provider, on a key that lives in that
// function's secrets. What is here is a listening bench: it exists so the owner can hear four
// voices say the same sentence in the same locale and score them, which is the only evidence §43
// accepts for choosing a provider. Wiring a second provider into production is a separate change
// that starts by moving `MEASURED_PROVIDERS` in `speech-route.ts`.
//
// 🔴 EVERY ADAPTER BELOW IS WRITTEN FROM EACH VENDOR'S DOCUMENTED REQUEST SHAPE AND NONE HAS BEEN
// EXERCISED AGAINST THE LIVE SERVICE FROM THIS REPOSITORY. That is why a provider failure is
// reported as a per-provider error row rather than failing the request: the first run of this bench
// is itself the test of these four shapes, and a bench that dies on the first 400 tells you
// nothing about the other three. Fix the shape, not the error handling.
//
// 🔴 REFUSED IN PRODUCTION. It spends money on a caller's text with no auth. `NODE_ENV` is checked
// before anything else happens.
import { NextResponse } from "next/server";

import { isWellFormedLocale } from "@/lib/learn/speech-route";
import { PROVIDER_CATALOGUE, type BakeoffProvider } from "@/lib/learn/tts-bakeoff";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The cap on one bench phrase. Long enough for prosody, short enough that a mistake costs cents. */
const MAX_PHRASE = 300;

interface Synthesis {
  audioBase64: string;
  mime: string;
  voice?: string;
}

type AdapterResult = { ok: true; synthesis: Synthesis } | { ok: false; detail: string };

async function readAudio(response: Response, voice?: string): Promise<AdapterResult> {
  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status}`);
    return { detail: `${response.status}: ${detail.slice(0, 200)}`, ok: false };
  }
  const bytes = await response.arrayBuffer();
  // A zero-byte 200 plays as silence and reads exactly like a provider that was never called —
  // the same failure `nemesis-speak` names for the production lane.
  if (bytes.byteLength === 0) return { detail: "the provider returned an empty body", ok: false };
  return {
    ok: true,
    synthesis: {
      audioBase64: Buffer.from(bytes).toString("base64"),
      mime: "audio/mpeg",
      ...(voice ? { voice } : {}),
    },
  };
}

const ADAPTERS: Record<BakeoffProvider, (phrase: string, locale: string, key: string) => Promise<AdapterResult>> = {
  // Matches what `nemesis-speak` sends today, so the bench's xAI column is the production voice
  // rather than a different configuration of it.
  async xai(phrase, locale, key) {
    const voice = process.env.XAI_TTS_VOICE ?? "eve";
    const response = await fetch("https://api.x.ai/v1/tts", {
      body: JSON.stringify({
        language: locale,
        output_format: { codec: "mp3" },
        text: phrase,
        voice_id: voice,
      }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
    });
    return readAudio(response, voice);
  },

  async cartesia(phrase, locale, key) {
    // 🔴 A VOICE ID IS REQUIRED AND IS NOT INVENTED HERE. Guessing an identifier would produce a
    // 404 that reads like "Cartesia is broken"; an unset variable says plainly what is missing.
    const voice = process.env.CARTESIA_VOICE_ID;
    if (!voice) return { detail: "set CARTESIA_VOICE_ID to a voice from your Cartesia account", ok: false };
    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      body: JSON.stringify({
        language: locale.split("-")[0],
        model_id: process.env.CARTESIA_MODEL ?? "sonic-3",
        output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
        transcript: phrase,
        voice: { id: voice, mode: "id" },
      }),
      headers: {
        "Cartesia-Version": process.env.CARTESIA_VERSION ?? "2024-06-10",
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      method: "POST",
    });
    return readAudio(response, voice);
  },

  async elevenlabs(phrase, _locale, key) {
    const voice = process.env.ELEVENLABS_VOICE_ID;
    if (!voice) return { detail: "set ELEVENLABS_VOICE_ID to a voice from your ElevenLabs account", ok: false };
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
      body: JSON.stringify({
        // The multilingual model is the one whose locale coverage is the reason to test it at all.
        model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
        text: phrase,
      }),
      headers: { "Content-Type": "application/json", "xi-api-key": key },
      method: "POST",
    });
    return readAudio(response, voice);
  },

  async google(phrase, locale, key) {
    // 🔴 NO VOICE NAME, DELIBERATELY. Google picks a default voice for a language code, so the
    // bench can ask for `es-MX` without anybody having to know that catalogue — which is exactly
    // the case where a wrong guess would silently return a different variety.
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
      {
        body: JSON.stringify({
          audioConfig: { audioEncoding: "MP3" },
          input: { text: phrase },
          voice: { languageCode: locale },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => `${response.status}`);
      return { detail: `${response.status}: ${detail.slice(0, 200)}`, ok: false };
    }
    const payload = (await response.json().catch(() => null)) as { audioContent?: unknown } | null;
    if (typeof payload?.audioContent !== "string" || !payload.audioContent) {
      return { detail: "the response carried no audioContent", ok: false };
    }
    return { ok: true, synthesis: { audioBase64: payload.audioContent, mime: "audio/mpeg" } };
  },
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "The TTS bench is a development surface." }, { status: 404 });
  }
  // Which columns are real on THIS machine. A provider with no key is offered as unavailable rather
  // than hidden, so the bench never looks complete when it is not.
  return NextResponse.json({
    providers: PROVIDER_CATALOGUE.map((entry) => ({
      advertisedLocales: entry.advertisedLocales,
      available: Boolean(process.env[entry.keyEnv]),
      keyEnv: entry.keyEnv,
      label: entry.label,
      // The rate travels with its provenance, so the Lab cannot print a remembered figure as a
      // price. See ProviderPricing for why the three evidence levels are not degrees of one thing.
      pricing: entry.pricing,
      provider: entry.provider,
    })),
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "The TTS bench is a development surface." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { locale?: unknown; phrase?: unknown };
  const locale = typeof body.locale === "string" ? body.locale.trim() : "";
  const phrase = typeof body.phrase === "string" ? body.phrase.trim() : "";
  if (!phrase) return NextResponse.json({ error: "Enter a phrase." }, { status: 400 });
  if (phrase.length > MAX_PHRASE) {
    return NextResponse.json({ error: `Phrases are capped at ${MAX_PHRASE} characters.` }, { status: 413 });
  }
  // 🔴 THE BENCH HOLDS §43'S OWN RULE. Comparing providers on `auto` would compare four guesses at
  // which Spanish to speak, which is the exact confound the whole locale contract exists to remove.
  if (!isWellFormedLocale(locale)) {
    return NextResponse.json(
      { error: "Give a BCP-47 locale — es-MX, not Spanish, and never auto.", reason: "locale-malformed" },
      { status: 400 },
    );
  }

  const samples = await Promise.all(
    PROVIDER_CATALOGUE.map(async (entry) => {
      const key = process.env[entry.keyEnv];
      if (!key) {
        return { available: false, detail: `${entry.keyEnv} is not set`, provider: entry.provider };
      }
      const started = Date.now();
      try {
        const result = await ADAPTERS[entry.provider](phrase, locale, key);
        const latencyMs = Date.now() - started;
        if (!result.ok) return { available: true, detail: result.detail, latencyMs, provider: entry.provider };
        return {
          audioBase64: result.synthesis.audioBase64,
          available: true,
          chars: phrase.length,
          latencyMs,
          locale,
          mime: result.synthesis.mime,
          phrase,
          provider: entry.provider,
          voice: result.synthesis.voice,
        };
      } catch (error) {
        return {
          available: true,
          detail: (error as Error)?.message ?? "the request threw",
          latencyMs: Date.now() - started,
          provider: entry.provider,
        };
      }
    }),
  );

  return NextResponse.json({ locale, phrase, samples });
}
