// Supabase Edge Function: nemesis-speak
//
// Voice mode's one paid call: a short piece of text in, MP3 bytes out.
//
// 🔴 WHY THIS IS A SUPABASE FUNCTION AND NOT A NEXT ROUTE. The xAI key lives in this project's
// FUNCTION SECRETS (owner added `xai_api_key` on 2026-07-28 for the transcription lane), not in
// Vercel's environment. Putting speech behind a Next.js route would mean copying a provider key
// into a second place — a new credential to add, rotate and leak. Reading it here means voice
// costs the owner no new secret at all. Same key, same account, same ladder as `nemesis-transcribe`.
//
// verify_jwt must be FALSE on this function. The caller's bearer token is verified below against
// the auth server, exactly as nemesis-transcribe does it — llm/search/media/ics/transcribe are all
// deployed `--no-verify-jwt` for the same reason, and getting it wrong is a production outage
// rather than a visible error.
//
// 🔴 THE LENGTH CAP IS ENFORCED HERE, NOT ONLY IN THE CLIENT. `canvas-speech.ts` refuses anything
// over 600 characters before it ever calls, and that is the real product rule — but a cap that
// exists only in the caller is a cap anybody can remove with a fetch. This is what actually bounds
// the bill: xAI accepts 15,000 characters per request, which is 25× what voice mode is for and
// 6.3 cents a call instead of a quarter of a cent.
//
// 🔴 NO CACHE, DELIBERATELY, AND IT IS A COST DECISION WORTH REVISITING. The same question asked of
// two learners synthesises twice. Caching would need a keyed store and an eviction policy for audio
// nobody may ever hear again; at $4.20 per million characters one repeat costs about a fifth of a
// cent. If voice mode turns out to be widely used on shared course material, the deduplication that
// pays for itself is on the QUESTION text, and this is where it goes.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Both spellings, longer-name-last, for the reason the transcribe function documents at length:
// Deno.env.get IS case-sensitive, Supabase stores secret names verbatim, and a case mismatch fails
// EXACTLY like a missing key.
const XAI_KEY = Deno.env.get("XAI_API_KEY") ?? Deno.env.get("xai_api_key") ?? "";

/** Mirrors SPEECH_CHAR_LIMIT in apps/web/lib/learn/canvas-speech.ts. Deliberately duplicated
 *  rather than shared: this process is the one that pays, and it must not depend on a constant
 *  living in a bundle it does not control. If the two ever disagree, THIS one wins. */
const MAX_CHARS = 600;

/** USD per character. $4.20 per million, read off x.ai/news/grok-stt-and-tts-apis. */
const USD_PER_CHAR = 4.2 / 1_000_000;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);
  if (!SB_URL || !ANON_KEY) return json({ error: "function not configured" }, 500, req);
  // 🔴 A NAMED 503, NOT SILENCE. Voice mode with no key must read as "not configured yet" in the
  // client, never as a canvas that simply never speaks — the difference between a missing secret
  // and a broken feature is invisible from the outside otherwise.
  if (!XAI_KEY) return json({ error: "Voice is not configured yet.", reason: "no-provider-key" }, 503, req);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "Sign in to use voice mode." }, 401, req);

  const body = await req.json().catch(() => ({})) as {
    text?: unknown;
    language?: unknown;
    locale?: unknown;
    speed?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json({ error: "Nothing to say.", reason: "empty-text" }, 400, req);
  if (text.length > MAX_CHARS) {
    return json({ error: "Too long to speak.", reason: "too-long-to-speak", limit: MAX_CHARS }, 413, req);
  }
  // `auto` rather than a hardcoded "en": Nemesis is field-agnostic and language-agnostic, and a
  // learner studying in Spanish should not hear their question read in an English accent.
  //
  // 🔴 `locale` IS THE NEW NAME AND `language` STILL WORKS. A deployed function cannot assume its
  // callers have been redeployed: a served bundle from before §43 sends neither field, and any
  // future caller sends `locale`. Dropping the old spelling would be a silent regression in exactly
  // the window where two versions of the client are live at once.
  //
  // 🔴 SHAPE-CHECKED HERE TOO, NOT ONLY IN THE CLIENT — the same argument the character cap makes a
  // few lines up. A caller is anybody with a bearer token, and an unchecked string goes straight
  // into a provider request body. `speech-route.ts` holds the identical regex; if the two ever
  // disagree, THIS one wins, because this is the process that talks to the provider.
  const requestedLocale = typeof body.locale === "string" && body.locale.trim()
    ? body.locale.trim()
    : typeof body.language === "string" && body.language.trim()
      ? body.language.trim()
      : "auto";
  if (requestedLocale !== "auto" && !/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/.test(requestedLocale)) {
    return json({ error: "Unsupported language.", reason: "locale-malformed" }, 400, req);
  }
  const language = requestedLocale;

  // 🔴 CLAMPED, NOT VALIDATED-OR-REJECTED, BECAUSE THE FAILURE HERE IS COSMETIC RATHER THAN UNSAFE.
  // A pace outside this window is unusable audio, not a security problem: 0.6 is a drawl and 1.4 is
  // unintelligible in a language the learner is still learning. §43 wants natural pace (1) for a
  // target-language utterance and slightly under (0.95) for a question read aloud, and both sit
  // comfortably inside. A caller sending nonsense gets the default rather than a 400 that would
  // silence voice mode entirely over a number.
  const requestedSpeed = typeof body.speed === "number" && Number.isFinite(body.speed) ? body.speed : 0.95;
  const speed = Math.min(1.2, Math.max(0.7, requestedSpeed));

  try {
    const res = await fetch("https://api.x.ai/v1/tts", {
      body: JSON.stringify({
        language,
        output_format: { codec: "mp3" },
        text,
        // Defaults to slightly under natural pace — a question the learner has to hold in working
        // memory while composing an answer is not a podcast. §43's target-language lane sends 1
        // instead, because slowing an example teaches a rhythm the language does not have.
        speed,
        voice_id: "eve",
      }),
      headers: { Authorization: `Bearer ${XAI_KEY}`, "Content-Type": "application/json" },
      method: "POST",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status}`);
      console.error(JSON.stringify({ event: "tts_failed", status: res.status, detail: detail.slice(0, 300) }));
      return json({ error: "Voice is unavailable right now.", reason: "provider-error" }, 502, req);
    }

    const audio = await res.arrayBuffer();
    // 🔴 AN EMPTY 200 IS A FAILURE, AND IT HAS TO BE NAMED AS ONE. The STT lane on this same
    // provider returned HTTP 200 with an empty transcript for weeks before anyone noticed; a
    // zero-byte audio body would play as silence and read exactly like a canvas choosing not to
    // speak. See the vad_threshold comment in nemesis-transcribe for that story.
    if (audio.byteLength === 0) {
      console.error(JSON.stringify({ event: "tts_empty", chars: text.length }));
      return json({ error: "Voice returned nothing.", reason: "empty-audio" }, 502, req);
    }

    // Counts only, never the text — that is the learner's own material, exactly as
    // canvas-analytics.ts holds for every other event.
    console.log(JSON.stringify({
      bytes: audio.byteLength,
      chars: text.length,
      event: "tts_spoken",
      // Counts and settings only, never the text. The locale is the field worth having: §43's whole
      // argument is that `auto` is fine for a question and wrong for a language lesson, and without
      // this nothing could report how often a locale was actually established.
      locale: language,
      speed,
      usd: Number((text.length * USD_PER_CHAR).toFixed(6)),
    }));

    return new Response(audio, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "audio/mpeg",
        "X-Nemesis-Tts-Chars": String(text.length),
        ...corsHeaders(req),
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ event: "tts_threw", message: (err as Error)?.message ?? "unknown" }));
    return json({ error: "Voice is unavailable right now.", reason: "provider-unreachable" }, 502, req);
  }
});
