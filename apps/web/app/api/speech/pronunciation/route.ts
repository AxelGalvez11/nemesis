// One attempt, assessed — and, when the caller sends the previous one, compared to it.
//
// 🔴 THE ROUTE RETURNS A DIAGNOSIS, NOT A VENDOR PAYLOAD, AND THAT IS THE PRODUCT DECISION. Azure's
// response is a hundred numbers; a learner needs one word, one sound and what they produced instead.
// Normalising, diagnosing and comparing all happen here so no surface is ever in a position to
// render a raw metric — the thing the owner explicitly said was not the end goal.
//
// 🔴 `raw` IS NEVER RETURNED. It is kept in memory for the transform and dropped: it is large, it is
// vendor-shaped, and a client that could see it would eventually read from it.
//
// 🔴 SIZE-CAPPED BEFORE ANYTHING IS PARSED. An assessment is a sentence, not a lecture; the ceiling
// is what a minute of Opus weighs, and a body over it is refused without being read into memory.

import { assessPronunciation } from "@/lib/speech/pronunciation";
import { compareAttempts } from "@/lib/speech/pronunciation-progress";
import { diagnose } from "@/lib/speech/pronunciation-diagnosis";
import type { PronunciationEvidence } from "@/lib/learn/pronunciation-evidence";
import { json, verifyBearer } from "@/lib/server";
import { chargeVoice, quotaResponse, secondsForAttemptBytes } from "@/lib/speech/meter";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The longest one attempt may be.
 *
 * 🔴 DERIVED FROM WHAT AN ATTEMPT IS, NOT BORROWED FROM THE UPLOAD CEILING. An earlier draft used
 * 4 MiB, which happens to equal `MAX_INLINE_UPLOAD_BYTES` — and a guard caught it, correctly. Two
 * limits that are the same number for unrelated reasons will move together the first time one of
 * them needs to change, and a document-upload ceiling has nothing to say about how long a learner
 * may spend reading one sentence aloud.
 *
 * A minute at 64 kbps, which is roughly triple what a browser actually produces for speech in Opus.
 */
const MAX_ATTEMPT_SECONDS = 60;
const MAX_AUDIO_BYTES = (MAX_ATTEMPT_SECONDS * 64_000) / 8;

/** HTTP status for each way an assessment can fail, so a client can act rather than retry blindly. */
const STATUS: Readonly<Record<string, number>> = {
  "audio-unusable": 400,
  "locale-malformed": 400,
  "locale-unsupported": 422,
  "no-provider": 503,
  "no-target": 400,
  "nothing-heard": 422,
  "off-target": 422,
  "provider-error": 502,
  "provider-rate-limited": 429,
  "provider-unauthorised": 502,
  "provider-unreachable": 502,
};

export async function POST(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return json({ error: "Sign in to practise pronunciation." }, 401);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    return json({ error: "That recording is too long.", reason: "audio-unusable" }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Couldn't read that recording.", reason: "audio-unusable" }, 400);
  }

  const audioField = form.get("audio");
  if (!(audioField instanceof Blob)) {
    return json({ error: "No recording was attached.", reason: "audio-unusable" }, 400);
  }
  if (audioField.size > MAX_AUDIO_BYTES) {
    return json({ error: "That recording is too long.", reason: "audio-unusable" }, 413);
  }

  const referenceText = String(form.get("text") ?? "").trim();
  const locale = String(form.get("locale") ?? "").trim();
  if (!referenceText) return json({ error: "Nothing to compare against.", reason: "no-target" }, 400);
  if (!locale) return json({ error: "A locale is required.", reason: "locale-malformed" }, 400);

  // 🔴🔴 CHARGED BEFORE AZURE IS ASKED ANYTHING. Assessment bills as real-time transcription plus
  // the prosody add-on ($1.30 an hour, read 2026-08-31), and until that day this route reached it
  // with the server's key and counted nothing — see lib/speech/meter.ts for what that was worth.
  //
  // 🔴 THE ATTEMPT'S OWN BYTES, NOT THE SCORE'S REPORTED DURATION. Azure reports how long it heard
  // only in the answer, and a charge made from the answer is a charge made after the money is
  // spent. Bytes are known now, and they are converted on the same rate this route already sizes
  // `MAX_AUDIO_BYTES` from, so anything that passes the size check above is chargeable within it.
  const charged = await chargeVoice(user.id, secondsForAttemptBytes(audioField.size), "stt");
  if (!charged.allowed) {
    console.log(JSON.stringify({ bytes: audioField.size, event: "azure_score_refused", locale, reason: charged.reason }));
    return json(quotaResponse(charged.reason), 429);
  }

  const audio = await audioField.arrayBuffer();
  const result = await assessPronunciation(
    { fetch },
    {
      audio,
      contentType: audioField.type || "audio/webm",
      locale,
      referenceText,
      // Held in memory for the transform below and never returned. See the header.
      keepRaw: false,
    },
  );

  if (!result.ok) {
    console.error(
      JSON.stringify({ bytes: audio.byteLength, event: "pronunciation_refused", locale, reason: result.reason }),
    );
    return json({ error: messageFor(result.reason), detail: result.detail, reason: result.reason }, STATUS[result.reason] ?? 502);
  }

  const diagnosis = diagnose(result.evidence);

  // 🔴 THE PREVIOUS ATTEMPT COMES BACK FROM THE CLIENT RATHER THAN A STORE, AND THAT IS DELIBERATE
  // FOR NOW. A drill is a handful of tries inside one screen; persisting each one would mean a table,
  // a retention decision and a migration for data whose whole life is ninety seconds. When attempts
  // need to outlive the screen they belong in `learner_evidence` with everything else, and that is a
  // schema change somebody makes on purpose.
  let comparison: ReturnType<typeof compareAttempts> | null = null;
  const previousRaw = form.get("previous");
  if (typeof previousRaw === "string" && previousRaw.trim()) {
    try {
      const previous = JSON.parse(previousRaw) as PronunciationEvidence;
      if (previous && typeof previous === "object" && Array.isArray(previous.words)) {
        const targetedRaw = form.get("targetedWords");
        const targetedWords =
          typeof targetedRaw === "string" && targetedRaw.trim()
            ? (JSON.parse(targetedRaw) as unknown[]).filter((word): word is string => typeof word === "string")
            : [];
        comparison = compareAttempts(previous, result.evidence, { targetedWords });
      }
    } catch {
      // A malformed previous attempt loses the comparison, never the assessment. The learner still
      // finds out how they did.
    }
  }

  console.log(
    JSON.stringify({
      bytes: audio.byteLength,
      event: "pronunciation_assessed",
      findings: diagnosis.findings.length,
      latencyMs: result.evidence.latencyMs,
      locale,
      verdict: diagnosis.verdict,
    }),
  );

  const { raw: _raw, ...evidence } = result.evidence;
  return json({ comparison, diagnosis, evidence });
}

/** One sentence per reason, in Nemesis's voice — no hedging, no praise, no exclamation. */
function messageFor(reason: string): string {
  switch (reason) {
    case "no-provider":
      return "Pronunciation scoring is not configured yet.";
    case "locale-unsupported":
      return "That language cannot be scored yet.";
    case "nothing-heard":
      return "Nothing was recorded.";
    case "off-target":
      return "That was a different sentence.";
    case "audio-unusable":
      return "That recording could not be read.";
    case "provider-rate-limited":
      return "Too many attempts at once. Wait a moment.";
    default:
      return "Pronunciation scoring is unavailable right now.";
  }
}
