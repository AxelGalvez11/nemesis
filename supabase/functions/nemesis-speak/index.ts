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
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

/** Characters a second of speech, mirroring VOICE_SPEECH_CHARS_PER_SECOND in
 *  packages/shared/src/plan.ts (850 a minute). Speech OUT is billed by the
 *  character and speech IN by duration; converting here is what lets both halves
 *  of a conversation land in one meter the learner can understand. */
const CHARS_PER_SECOND = 850 / 60;

/**
 * Charge this turn against the learner's monthly conversational voice allowance.
 *
 * 🔴 BEFORE THE PROVIDER CALL, NOT AFTER. Metering after a successful synthesis
 * is metering nothing: the money is spent the moment xAI answers, so a check
 * that runs afterwards can only ever report an overrun it already paid for.
 *
 * 🔴 AND NOT `transcription_seconds_month_limit`. That key means recorded
 * lectures, a product Nemesis no longer sells. Conversational voice has its own
 * key, its own counter and its own allowance; see migration 20260818120000.
 */
async function chargeVoiceSeconds(userId: string, characters: number): Promise<
  { allowed: true } | { allowed: false; reason: string }
> {
  // A meter that cannot be reached must not silently become no meter at all —
  // but it must also not take voice mode down for everyone the first time an
  // environment is missing a key. A missing service role is a CONFIGURATION
  // failure and is refused; a transient database error is not, and is allowed
  // through with a loud log, because one un-metered reply costs a fifth of a cent.
  if (!SERVICE_KEY) return { allowed: false, reason: "not-configured" };
  const seconds = Math.max(1, Math.ceil(characters / CHARS_PER_SECOND));
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/consume_voice_seconds`, {
      body: JSON.stringify({ p_user_id: userId, p_seconds: seconds, p_kind: "tts" }),
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!res.ok) {
      console.error(JSON.stringify({ event: "voice_meter_unreachable", status: res.status }));
      return { allowed: true };
    }
    const verdict = await res.json().catch(() => null) as { allowed?: unknown; reason?: unknown } | null;
    if (verdict?.allowed === true) return { allowed: true };
    return { allowed: false, reason: typeof verdict?.reason === "string" ? verdict.reason : "quota_exceeded" };
  } catch (error) {
    console.error(JSON.stringify({
      event: "voice_meter_failed",
      message: error instanceof Error ? error.message : String(error),
    }));
    return { allowed: true };
  }
}

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

/**
 * The voice heard when the learner has not chosen one, and the one an unknown id falls back to.
 *
 * 🔴 THE VALUE THAT SHIPPED, UNCHANGED. Every canvas that has ever spoken has spoken in this voice;
 * changing the default in the same commit that adds the choice would silently re-voice the product
 * for everybody who never asked for anything.
 */
const DEFAULT_VOICE = "eve";

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
    voice?: unknown;
  };

  // 🔴🔴 THERE IS NO CATALOGUE ENDPOINT, AND THAT WAS ESTABLISHED BY ASKING RATHER THAN ASSUMING.
  // The first version of this handler proxied `GET https://api.x.ai/v1/voices` so the client would
  // never hold a hardcoded list. Deployed and called, it returns **404**: xAI publishes no voice
  // catalogue on this key, and no public documentation this repository could find lists the ids.
  //
  // A proxy to an endpoint that does not exist is the dormant-lane shape this codebase keeps
  // finding, so it is gone rather than left in place returning an error for ever. The set is
  // established EMPIRICALLY instead, by `scripts/xai-voices-probe.sh`, which sends two characters
  // in each candidate voice and reports which return audio. Its last run:
  //
  //     eve 200 · ara 200 · rex 200 · gork 200 · sal 200 · leo 200
  //     ani 502 · thomas 502 · zzzznotavoice 502
  //
  // The three refusals are the calibration: the probe can tell an accepted id from a rejected one,
  // so the six are a measurement and not a guess. Re-run it before adding to the client's list.

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

  // 🔴🔴 SHAPE-CHECKED AND THEN TRUSTED, WITH A FALLBACK RATHER THAN A REJECTION. The set of valid
  // ids lives at the provider and changes without telling us, so an allow-list compiled into this
  // file would start refusing voices that work the day xAI adds one. What is checked here is that
  // the value cannot be anything but an identifier — it goes straight into a provider request body,
  // and an unchecked string from anybody holding a bearer token is the one real hazard.
  //
  // 🔴 AND AN UNKNOWN ID FALLS BACK TO THE DEFAULT INSTEAD OF FAILING. A voice xAI has retired
  // would otherwise 502 every utterance for whoever had it selected, and they would have no way to
  // tell that from voice mode being broken. Silently hearing the default voice is recoverable;
  // silence is not.
  const requestedVoice = typeof body.voice === "string" ? body.voice.trim() : "";
  const voice = /^[a-zA-Z0-9_-]{1,64}$/.test(requestedVoice) ? requestedVoice : DEFAULT_VOICE;

  const charge = await chargeVoiceSeconds(userId, text.length);
  if (!charge.allowed) {
    // 402, not 403: this is "you have used this month's voice", which the client
    // turns into an offer rather than an error. `voice-quota` is the reason the
    // canvas reads to decide between the two.
    return json({
      error: charge.reason === "not-configured"
        ? "Voice is not configured yet."
        : "You have used this month's voice time.",
      reason: charge.reason === "not-configured" ? "no-provider-key" : "voice-quota",
    }, charge.reason === "not-configured" ? 503 : 402, req);
  }

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
        voice_id: voice,
      }),
      headers: { Authorization: `Bearer ${XAI_KEY}`, "Content-Type": "application/json" },
      method: "POST",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status}`);
      console.error(JSON.stringify({ event: "tts_failed", status: res.status, detail: detail.slice(0, 300) }));
      return json({ error: "Voice is unavailable right now.", reason: "provider-error" }, 502, req);
    }

    // 🔴🔴 STREAMED THROUGH RATHER THAN BUFFERED, AND THAT IS THE xAI HALF OF THE LATENCY THE OWNER
    // REPORTED (2026-08-22: *"noticeable lag around voice generation"*). This was
    // `await res.arrayBuffer()`, which waits for xAI's LAST byte before this function emits its
    // FIRST — and then the browser waited for this function's last byte before it played anything.
    // Two full buffers stacked on a response that arrives progressively. Handing the body onward
    // means the learner hears the opening words while the rest is still being synthesised.
    //
    // 🔴 THE EMPTY-BODY GUARD SURVIVES THE CHANGE, WHICH IS THE ONLY REASON THIS IS NOT A ONE-LINER.
    // The STT lane on this same provider returned HTTP 200 with an empty transcript for weeks
    // before anyone noticed, and a zero-byte audio body plays as silence — indistinguishable from a
    // canvas choosing not to speak. So the FIRST chunk is read here, before any status is committed:
    // nothing at all is still a named 502, and one chunk in hand is enough to know there is audio.
    // Everything after it flows straight through without being held.
    const upstream = res.body;
    if (!upstream) {
      console.error(JSON.stringify({ event: "tts_empty", chars: text.length }));
      return json({ error: "Voice returned nothing.", reason: "empty-audio" }, 502, req);
    }

    const reader = upstream.getReader();
    let first: Uint8Array | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) { first = value; break; }
    }
    if (!first) {
      console.error(JSON.stringify({ event: "tts_empty", chars: text.length }));
      await reader.cancel().catch(() => {});
      return json({ error: "Voice returned nothing.", reason: "empty-audio" }, 502, req);
    }

    // Counts only, never the text — that is the learner's own material, exactly as
    // canvas-analytics.ts holds for every other event.
    //
    // 🔴 LOGGED WHEN THE AUDIO STARTS, NOT WHEN IT FINISHES, AND `bytes` IS GONE WITH THE BUFFER. A
    // byte count that can only be known at the end would mean holding the whole response to produce
    // a log line, which is the thing this change exists to stop doing. The character count is what
    // the bill is based on anyway.
    console.log(JSON.stringify({
      chars: text.length,
      event: "tts_spoken",
      // Counts and settings only, never the text. The locale is the field worth having: §43's whole
      // argument is that `auto` is fine for a question and wrong for a language lesson, and without
      // this nothing could report how often a locale was actually established.
      locale: language,
      speed,
      usd: Number((text.length * USD_PER_CHAR).toFixed(6)),
    }));

    const audio = new ReadableStream<Uint8Array>({
      cancel(reason) {
        void reader.cancel(reason).catch(() => {});
      },
      async pull(controller) {
        if (first) {
          const opening = first;
          first = null;
          controller.enqueue(opening);
          return;
        }
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          if (value && value.byteLength > 0) controller.enqueue(value);
        } catch (error) {
          console.error(JSON.stringify({ event: "tts_stream_broke", message: (error as Error)?.message ?? "unknown" }));
          controller.error(error);
        }
      },
    });

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
