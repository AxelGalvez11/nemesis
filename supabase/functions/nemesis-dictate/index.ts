// Supabase Edge Function: nemesis-dictate
//
// One short spoken answer in, its text out. The fallback half of dictation.
//
// 🔴🔴 THIS IS NOT `nemesis-transcribe`, AND THE DIFFERENCE IS THE PRODUCT RATHER THAN THE PROVIDER.
// That function is the LECTURE lane: an upload to a durable bucket, a job row, a metered draw on
// the monthly transcription allowance, an asynchronous ladder and a /status poll. All of it is
// right for an hour of a seminar and all of it is wrong for someone answering a question out loud:
// a job row for a nine-second clip, a poll loop for something that should already be text, and a
// charge against the allowance a student bought for their recordings.
//
// So this is the small synchronous door. Same key, same account, same provider — different
// lifetime, different meter, and no job to poll.
//
// 🔴 WHY IT EXISTS AT ALL: the browser is still the first choice and this never runs for most
// people. `lib/voice/dictation-engine.ts` picks the Web Speech API wherever it exists — free,
// on-device, words on screen while you are still speaking. Firefox ships no recogniser, and until
// now the microphone simply vanished there, which reads as "Nemesis cannot listen" rather than
// "your browser cannot". Owner, 2026-08-22: keep the browser, add xAI behind it.
//
// 🔴 WHY xAI RATHER THAN THE OTHER TWO. Same ordering `nemesis-transcribe` argues at length and
// measured on this account: xAI at $0.10/hr against AssemblyAI's $0.17/hr with no quality gap once
// both were given the same prompt. There is no ladder here on purpose — a fallback for a fallback,
// on a clip the learner can simply re-record, is machinery bought for nothing.
//
// 🔴 THE AUDIO IS NOT KEPT. It goes to the `recordings` bucket only because that is where a signed
// URL can be minted for the provider to fetch — the shape this repo has actually run in production
// — and it is deleted on the way out, on every path including failure. A spoken answer is a
// keystroke, not a document.
//
// verify_jwt must be FALSE on this function: the caller's bearer token is verified below against
// the auth server, exactly as `nemesis-speak` and `nemesis-transcribe` do it. Getting that wrong is
// a production outage rather than a visible error.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Both spellings, longer-name-last, for the reason `nemesis-transcribe` documents: Deno.env.get IS
// case-sensitive, Supabase stores secret names verbatim, and a case mismatch fails EXACTLY like a
// missing key.
const XAI_KEY = Deno.env.get("XAI_API_KEY") ?? Deno.env.get("xai_api_key") ?? "";

/** Mirrors MAX_DICTATION_SECONDS in apps/web/lib/voice/dictation-engine.ts. Deliberately duplicated
 *  rather than shared: this process is the one that pays, and a cap that exists only in the caller
 *  is a cap anybody can remove with a fetch. If the two disagree, THIS one wins. */
const MAX_SECONDS = 120;

/** Two minutes of Opus is well under a megabyte; eight is room for a worse codec and no more. */
const MAX_BYTES = 8 * 1024 * 1024;

/** USD per second. $0.10/hr, the rate apps/web/lib/workload-cost.ts records for xAI Grok STT. */
const USD_PER_SECOND = 0.1 / 3600;

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
 * Charge this clip against the learner's monthly conversational voice allowance.
 *
 * 🔴 BEFORE THE PROVIDER CALL, NOT AFTER — the identical rule `nemesis-speak` states. The money is
 * spent the moment xAI answers, so a check that runs afterwards can only report an overrun it has
 * already paid for.
 *
 * 🔴 AND ON `stt`, WHICH IS THE SAME METER READING ALOUD DRAWS ON. Both halves of a spoken
 * conversation belong in one number the learner can understand; billing dictation against
 * `transcription_seconds` would take it out of the allowance bought for lecture recordings.
 */
async function chargeVoiceSeconds(userId: string, seconds: number): Promise<
  { allowed: true } | { allowed: false; reason: string }
> {
  // A meter that cannot be reached must not silently become no meter at all — but it must also not
  // take dictation down for everyone the first time an environment is missing a key. A missing
  // service role is a CONFIGURATION failure and is refused; a transient database error is not.
  if (!SERVICE_KEY) return { allowed: false, reason: "not-configured" };
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/consume_voice_seconds`, {
      body: JSON.stringify({ p_user_id: userId, p_seconds: Math.max(1, Math.ceil(seconds)), p_kind: "stt" }),
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

/**
 * The file extension for a recorded container.
 *
 * 🔴 THE EXTENSION IS NOT COSMETIC HERE. xAI has answered `Could not detect audio format from file
 * header` on this account before (see nemesis-transcribe's provider-order note), and the object it
 * fetches is identified partly by its name. An unrecognised type is stored as `.webm` — what every
 * browser this lane exists for actually produces — rather than as something invented.
 */
function extensionFor(contentType: string): string {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "audio/mp4" || type === "audio/aac" || type === "audio/x-m4a") return "m4a";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mpeg") return "mp3";
  if (type === "audio/wav" || type === "audio/x-wav") return "wav";
  return "webm";
}

async function uploadClip(path: string, bytes: ArrayBuffer, contentType: string): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/recordings/${path}`, {
      body: bytes,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": contentType || "audio/webm",
      },
      method: "POST",
    });
    if (res.ok) return true;
    console.error(JSON.stringify({
      event: "dictation_upload_failed",
      status: res.status,
      detail: (await res.text().catch(() => "")).slice(0, 200),
    }));
    return false;
  } catch (error) {
    console.error(JSON.stringify({ event: "dictation_upload_threw", message: (error as Error)?.message ?? "unknown" }));
    return false;
  }
}

async function createSignedUrl(path: string, expiresIn: number): Promise<string | null> {
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/sign/recordings/${path}`, {
      body: JSON.stringify({ expiresIn }),
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const signed = await res.json().catch(() => null) as { signedURL?: unknown } | null;
    // The API returns a path like "/object/sign/recordings/…?token=…".
    return typeof signed?.signedURL === "string" ? `${SB_URL}/storage/v1${signed.signedURL}` : null;
  } catch {
    return null;
  }
}

/**
 * 🔴 NO Content-Type HEADER ON A BODYLESS DELETE, and the result IS checked. Supabase Storage
 * answers `400 Body cannot be empty when content-type is set to 'application/json'` — the exact
 * mistake that silently leaked 29 lecture files in `nemesis-transcribe` before anyone noticed.
 */
async function removeObject(path: string): Promise<void> {
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/recordings/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      method: "DELETE",
    });
    if (!res.ok) {
      console.error(JSON.stringify({
        event: "dictation_cleanup_rejected",
        status: res.status,
        detail: (await res.text().catch(() => "")).slice(0, 200),
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "dictation_cleanup_failed", message: (error as Error)?.message ?? "unknown" }));
  }
}

/**
 * One synchronous xAI Grok STT pass over the signed clip.
 *
 * 🔴 THE SHAPE IS COPIED FROM `nemesis-transcribe`'s `transcribeWithXai`, WHICH HAS RUN IN
 * PRODUCTION, AND NOT INVENTED HERE. Writing a provider against a guessed request shape is how a
 * field gets silently ignored, and this repo says so in that function's own comments. Two fields
 * differ and both differ deliberately:
 *
 *   `diarize` is NOT sent. That lane wants speaker labels because a lecture has speakers; one
 *   person answering a question does not, and asking for per-word speakers here would buy a
 *   regrouping step to throw away.
 *
 *   `language` is the LEARNER'S, not a hardcoded `en`. `format=true` turns on inverse text
 *   normalisation — the thing that writes "fifty milligrams" as "50 mg" — and the docs define
 *   `language` as its companion, so the pair is set together. Sending `en` for everybody would
 *   normalise a Portuguese answer as English.
 *
 * `vad_threshold` is 0.08 for the reason that function documents at length: the batch default of
 * 0.5 is a close-mic gate that returned an EMPTY transcript on real quiet audio.
 */
async function transcribeWithXai(audioUrl: string, language: string): Promise<
  { ok: true; seconds: number; text: string } | { ok: false; reason: string }
> {
  try {
    const form = new FormData();
    form.set("url", audioUrl);
    form.set("language", language);
    form.set("format", "true");
    form.set("vad_threshold", "0.08");
    const res = await fetch("https://api.x.ai/v1/stt", {
      body: form,
      headers: { Authorization: `Bearer ${XAI_KEY}` },
      method: "POST",
    });
    const body = await res.json().catch(() => null) as { text?: unknown; duration?: unknown; error?: unknown } | null;
    if (!res.ok || typeof body?.text !== "string") {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const text = body.text.trim();
    // 🔴 AN EMPTY 200 IS A FAILURE AND MUST BE NAMED. This provider returned HTTP 200 with an empty
    // transcript for weeks on the lecture lane before anyone noticed; here it would read as "you
    // said nothing", which is what a learner who just spoke a sentence will not believe.
    if (!text) return { ok: false, reason: "empty-transcript" };
    return { ok: true, seconds: Math.max(0, Math.round(Number(body.duration) || 0)), text };
  } catch (error) {
    return { ok: false, reason: `threw: ${(error as Error)?.message ?? "unknown"}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, req);
  if (!SB_URL || !ANON_KEY) return json({ error: "function not configured" }, 500, req);
  // 🔴 A NAMED 503, NOT SILENCE. A browser with no recogniser and no key here must read as "not
  // configured yet" rather than as a microphone that listens and returns nothing.
  if (!XAI_KEY) return json({ error: "Dictation is not configured yet.", reason: "no-provider-key" }, 503, req);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyUser(token);
  if (!userId) return json({ error: "Sign in to use dictation." }, 401, req);

  const url = new URL(req.url);
  const language = (url.searchParams.get("language") ?? "en").trim().toLowerCase();
  if (!/^[a-z]{2,3}$/.test(language)) {
    return json({ error: "Unsupported language.", reason: "language-malformed" }, 400, req);
  }

  // 🔴 THE CLIENT DECLARES THE DURATION AND THIS BOUNDS IT — the same contract `nemesis-transcribe`
  // uses at submit. It is what the meter is charged on, because the real duration is not known
  // until after the money has been spent, and metering afterwards is metering nothing.
  const declared = Number(url.searchParams.get("seconds"));
  const seconds = Number.isFinite(declared) && declared > 0 ? Math.min(MAX_SECONDS, declared) : 1;

  const contentType = req.headers.get("content-type") ?? "audio/webm";
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: "Nothing was recorded.", reason: "empty-audio" }, 400, req);
  if (bytes.byteLength > MAX_BYTES) {
    return json({ error: "That recording is too long.", reason: "too-long", limit: MAX_SECONDS }, 413, req);
  }

  const charge = await chargeVoiceSeconds(userId, seconds);
  if (!charge.allowed) {
    // 402, not 403: "you have used this month's voice", which the client turns into an offer rather
    // than an error — the learner can still type.
    return json({
      error: charge.reason === "not-configured"
        ? "Dictation is not configured yet."
        : "You have used this month's voice time.",
      reason: charge.reason === "not-configured" ? "no-provider-key" : "voice-quota",
    }, charge.reason === "not-configured" ? 503 : 402, req);
  }

  // Namespaced by user so a stray object is still traceable to an owner, and named with a random id
  // so two clips in the same second cannot collide.
  const path = `dictation/${userId}/${crypto.randomUUID()}.${extensionFor(contentType)}`;

  if (!(await uploadClip(path, bytes, contentType))) {
    return json({ error: "Dictation is unavailable right now.", reason: "upload-failed" }, 502, req);
  }

  try {
    // Five minutes: long enough for the provider to fetch it, short enough that a leaked link is
    // worthless. The lecture lane signs for six HOURS because its ladder is asynchronous; this one
    // is a single call that has already begun.
    const signed = await createSignedUrl(path, 5 * 60);
    if (!signed) return json({ error: "Dictation is unavailable right now.", reason: "sign-failed" }, 502, req);

    const heard = await transcribeWithXai(signed, language);
    if (!heard.ok) {
      console.error(JSON.stringify({ event: "dictation_failed", reason: heard.reason, language }));
      return heard.reason === "empty-transcript"
        ? json({ error: "Nothing could be made out.", reason: "empty-transcript" }, 422, req)
        : json({ error: "Dictation is unavailable right now.", reason: "provider-error" }, 502, req);
    }

    // Counts and settings only, never the words — that is the learner's own material, the same rule
    // every other analytics call in this codebase holds.
    console.log(JSON.stringify({
      chars: heard.text.length,
      declaredSeconds: seconds,
      event: "dictation_heard",
      language,
      seconds: heard.seconds,
      usd: Number((seconds * USD_PER_SECOND).toFixed(6)),
    }));

    return json({ text: heard.text }, 200, req);
  } finally {
    // 🔴 ON EVERY PATH, INCLUDING FAILURE. A spoken answer is a keystroke, not a document, and the
    // promise that it is not kept has to hold when things go wrong too — which is exactly when the
    // lecture lane's cleanup turned out to have been failing silently for weeks.
    await removeObject(path);
  }
});
