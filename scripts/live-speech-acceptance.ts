// LIVE SPEECH ACCEPTANCE (manual): prove the DEPLOYED pronunciation lane works end to
// end, the way a signed-in learner hits it — through the production Next routes, with
// the production Azure credential, against the production Supabase auth.
//
// The trick is the same one `azure-speech-acceptance.mts` uses, moved onto the deployed
// app: ask /api/speech/tts to synthesise a sentence, then hand that audio straight back
// to /api/speech/pronunciation as the "attempt". A native-quality reading must score
// near the top of the scale; the same audio judged against a DIFFERENT sentence must be
// refused or collapse. If the Vercel env, the Azure key, the auth gate, the format
// plumbing or the normalisation is broken anywhere in the chain, one of those two
// numbers gives it away — and no fixture-driven test can produce either.
//
// TTS returns MP3 (the answer player's format); the assessor refuses MP3 by design
// (`azureContentType`). The workflow bridges with ffmpeg, exactly as a browser bridges
// with MediaRecorder: mp3 → 16 kHz mono WAV.
//
// Self-provisions one throwaway learner (mirrors live-prod-smoke) and tears it down
// through the provenance gate; the manifest survives the process so a cancelled run is
// cleaned by the workflow's always-runs step.
//
//   SB_URL=… SERVICE_KEY=… ANON_KEY=… APP_ORIGINS=https://app.enternemesis.com \
//     deno run --allow-net --allow-env --allow-read --allow-write --allow-run=ffmpeg \
//     scripts/live-speech-acceptance.ts
import { newCiRun, recordCiAccount, teardownCiRun } from "./lib/ci-account-cleanup.ts";

const RUN = newCiRun("speech");

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const ANON_KEY = Deno.env.get("ANON_KEY");
if (!SB_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("SB_URL + SERVICE_KEY + ANON_KEY required");
  Deno.exit(2);
}

/** Candidate front doors, tried in order. The custom domain sits behind a bot check
 *  that may or may not challenge a plain API request; the project's vercel.app alias
 *  serves the same deployment with no doorman. First origin whose speech API answers
 *  in JSON (200 or a JSON 401) wins. */
const ORIGINS = (Deno.env.get("APP_ORIGINS") ?? "https://app.enternemesis.com")
  .split(",").map((o) => o.trim()).filter(Boolean);

/** Round-trip floor, same bar as azure-speech-acceptance check 4: synthesised speech
 *  scored against its own transcript must clear 0.8 overall. */
const ROUND_TRIP_FLOOR = 0.8;

/** Two languages, two fields — the sentence content is deliberately not from one
 *  discipline (a law line and an everyday es-MX line), per the field-agnostic rule. */
const PROBES = [
  { locale: "es-MX", text: "El perro corre rápido por el parque." },
  { locale: "en-US", text: "Consideration is what makes a promise enforceable." },
];
/** The mismatch probe: es-MX audio judged against a sentence it is not. */
const WRONG_TEXT = "Buenas noches, hasta mañana.";

let JWT: string | undefined;
let userId: string | undefined;
let failed = 0;

/** The route reports the diagnosis's number (0-100) and the evidence's (0-1);
 *  compare on one scale whichever arrived. */
function scale01(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value > 1 ? value / 100 : value;
}

function check(id: string, ok: boolean, detail: string): void {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}`);
  console.log(`      ${detail}`);
}

async function pickOrigin(): Promise<string> {
  for (const origin of ORIGINS) {
    try {
      const res = await fetch(`${origin}/api/speech/voices`, { headers: { Authorization: "Bearer none" } });
      const type = res.headers.get("content-type") ?? "";
      await res.body?.cancel();
      // A JSON refusal is the Next route answering; an HTML page is a doorman.
      if (type.includes("application/json")) return origin;
      console.log(`origin ${origin}: ${res.status} ${type} — not the app, trying next`);
    } catch (e) {
      console.log(`origin ${origin}: unreachable (${(e as Error).message})`);
    }
  }
  throw new Error("no origin reaches the deployed speech API");
}

async function synthesise(origin: string, locale: string, text: string): Promise<Uint8Array> {
  const res = await fetch(`${origin}/api/speech/tts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ locale, text }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const voice = res.headers.get("X-Nemesis-Voice") ?? "(unnamed)";
  const bytes = new Uint8Array(await res.arrayBuffer());
  console.log(`      tts ${locale}: ${bytes.byteLength} bytes as ${voice}`);
  return bytes;
}

async function toWav(mp3: Uint8Array, stem: string): Promise<Uint8Array> {
  const inPath = `${stem}.mp3`;
  const outPath = `${stem}.wav`;
  await Deno.writeFile(inPath, mp3);
  const ffmpeg = await new Deno.Command("ffmpeg", {
    args: ["-y", "-i", inPath, "-ar", "16000", "-ac", "1", "-f", "wav", outPath],
    stderr: "null", stdout: "null",
  }).output();
  if (!ffmpeg.success) throw new Error("ffmpeg conversion failed");
  const wav = await Deno.readFile(outPath);
  await Deno.remove(inPath).catch(() => {});
  await Deno.remove(outPath).catch(() => {});
  return wav;
}

interface Assessed {
  status: number;
  reason?: string;
  overall?: number;
  words?: number;
  verdict?: string;
  headline?: string;
  comparison: boolean;
  evidence?: unknown;
}

async function assess(
  origin: string, wav: Uint8Array, locale: string, text: string, previous?: unknown,
): Promise<Assessed> {
  const form = new FormData();
  form.set("audio", new Blob([wav.slice().buffer], { type: "audio/wav" }), "attempt.wav");
  form.set("text", text);
  form.set("locale", locale);
  if (previous) form.set("previous", JSON.stringify(previous));
  const res = await fetch(`${origin}/api/speech/pronunciation`, {
    method: "POST", headers: { Authorization: `Bearer ${JWT}` }, body: form,
  });
  const body = await res.json().catch(() => ({}));
  // The audio is synthetic and the sentences are the script's own — nothing
  // personal can be in this dump.
  if (Deno.env.get("DEBUG_SPEECH")) console.log(`      DEBUG ${JSON.stringify(body).slice(0, 2400)}`);
  return {
    status: res.status,
    reason: body?.reason,
    overall: body?.evidence?.overall?.overall ?? body?.diagnosis?.overall,
    words: body?.evidence?.words?.length,
    verdict: body?.diagnosis?.verdict,
    headline: body?.diagnosis?.headline,
    comparison: Boolean(body?.comparison),
    evidence: body?.evidence,
  };
}

async function main() {
  const email = RUN.email;
  const password = crypto.randomUUID();
  const created = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  userId = created?.id ?? created?.user?.id;
  if (!userId) throw new Error("user create failed");
  await recordCiAccount(RUN, userId);

  JWT = (await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json())).access_token;
  if (!JWT) throw new Error("sign-in failed");

  const origin = await pickOrigin();
  console.log(`LIVE SPEECH — deployed app at ${origin}\n`);

  let esWav: Uint8Array | undefined;
  let esEvidence: unknown;
  for (const probe of PROBES) {
    const wav = await toWav(await synthesise(origin, probe.locale, probe.text), `attempt-${probe.locale}`);
    const a = await assess(origin, wav, probe.locale, probe.text);
    check(
      `round trip ${probe.locale}`,
      a.status === 200 && (scale01(a.overall) ?? 0) > ROUND_TRIP_FLOOR && (a.words ?? 0) > 0,
      `status ${a.status}, overall ${scale01(a.overall)?.toFixed(2) ?? "—"}, ${a.words ?? 0} words, ` +
        `verdict ${a.verdict ?? a.reason ?? "—"}: ${a.headline ?? ""}`,
    );
    if (probe.locale === "es-MX") {
      esWav = wav;
      esEvidence = a.evidence;
    }
  }

  if (esWav) {
    const wrong = await assess(origin, esWav, "es-MX", WRONG_TEXT);
    check(
      "mismatch is caught",
      wrong.status === 422 ||
        (wrong.status === 200 && ((scale01(wrong.overall) ?? 1) < ROUND_TRIP_FLOOR || wrong.verdict === "off-target" || wrong.verdict === "needs-work")),
      `status ${wrong.status}, overall ${scale01(wrong.overall)?.toFixed(2) ?? "—"}, reason ${wrong.reason ?? wrong.verdict ?? "—"}`,
    );

    if (esEvidence) {
      const again = await assess(origin, esWav, "es-MX", PROBES[0].text, esEvidence);
      check(
        "second attempt compares to the first",
        again.status === 200 && again.comparison,
        `status ${again.status}, comparison ${again.comparison ? "present" : "MISSING"}`,
      );
    }
  }

  console.log(failed === 0 ? "\n✅ LIVE SPEECH PASS" : `\n✗ ${failed} check(s) failed`);
  if (failed > 0) Deno.exit(1);
}

try {
  await main();
} finally {
  await teardownCiRun({ SB_URL: SB_URL!, SERVICE_KEY: SERVICE_KEY! }, RUN, userId);
}
