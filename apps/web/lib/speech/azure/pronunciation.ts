// Azure Pronunciation Assessment: audio plus what it was meant to be, in — how it was said, out.
//
// 🔴 THE TRANSFORM IS PURE AND THE CALL IS NOT, AND THEY ARE SEPARATE FUNCTIONS FOR THAT REASON.
// `normaliseAssessment` is where every real decision lives — which of Azure's numbers mean what,
// what a missing field means, how an error type maps — and it takes parsed JSON and returns
// evidence. That is the half worth testing exhaustively, and it can be tested exhaustively because
// it never touches a network.
//
// 🔴 SCORES COME BACK 0–100 AND ARE STORED 0–1. The conversion happens here, at the boundary, once.
// Every other confidence in this codebase is a fraction; a provider's scale leaking inward means the
// first person to average two numbers is wrong by a factor of a hundred.
//
// 🔴 OFFSETS COME BACK IN 100-NANOSECOND TICKS. Azure inherits this from Windows and it is not a
// unit anybody should meet twice. Converted to milliseconds here, so "replay the sound they got
// wrong" is a slice a media element understands rather than an arithmetic problem at every call site.
//
// 🔴 THE RAW RESPONSE IS KEPT. See `PronunciationEvidence.raw` — it is stripped before anything is
// shown and never reaches `learner_evidence`, but discarding it would make every future question
// about coverage a new round of data collection instead of a query over attempts already made.

import type {
  PhonemeAssessment,
  PronunciationEvidence,
  PronunciationGap,
  PronunciationResult,
  SyllableAssessment,
  WordAssessment,
  WordErrorType,
} from "@/lib/learn/pronunciation-evidence";

import { azureSpeechConfig } from "./config";
import { httpRefusal } from "./voice-catalog";

/** Azure's ticks are 100ns. */
const TICKS_PER_MS = 10_000;

/** Assessment is against a reference; this bounds how long one may be. */
export const MAX_REFERENCE_CHARS = 1_000;

/**
 * The smallest audio worth assessing, in bytes.
 *
 * 🔴 A GUARD AGAINST THE COMMON FAILURE, NOT AGAINST ATTACK. A learner who presses record and
 * releases immediately sends a few hundred bytes of container header and no speech; Azure answers
 * `NoMatch`, which is correct and costs a round trip and a quota slot to discover. Refusing locally
 * turns a two-second wait and a confusing result into an instant, accurate "I did not hear that".
 */
export const MIN_AUDIO_BYTES = 2_000;

/** How Azure grades. `HundredMark` is the numeric scale; the alternative is a five-point band. */
export type GradingSystem = "HundredMark" | "FivePoint";

/** How deep the report goes. Phoneme is what makes a correction nameable. */
export type Granularity = "Phoneme" | "Word" | "FullText";

export interface AssessmentConfig {
  readonly referenceText: string;
  readonly gradingSystem?: GradingSystem;
  readonly granularity?: Granularity;
  /**
   * Whether Azure marks words that were skipped or added.
   *
   * 🔴 ON, BECAUSE OFF MEANS A SKIPPED WORD IS INVISIBLE. Without miscue detection a learner who
   * omits half the sentence can score well on the half they said. §47's first branch — "said
   * something else" versus "said the right thing badly" — is not available without it.
   */
  readonly enableMiscue?: boolean;
  /** `IPA` where the locale supports it, `SAPI` otherwise. IPA is what a learner can be shown. */
  readonly phonemeAlphabet?: "IPA" | "SAPI";
  /** Stress, rhythm and contour. Supported on a subset of locales; harmless where it is not. */
  readonly enableProsody?: boolean;
  /** How many alternative phonemes Azure reports per sound. This is the "what did they produce" field. */
  readonly nBestPhonemeCount?: number;
}

/**
 * The `Pronunciation-Assessment` header: base64 of a JSON config.
 *
 * PURE and separately tested, because a header Azure cannot parse fails as a plain 400 with no
 * indication that the configuration rather than the audio was the problem.
 */
export function assessmentHeader(config: AssessmentConfig): string {
  const payload = {
    Dimension: "Comprehensive",
    EnableMiscue: config.enableMiscue ?? true,
    EnableProsodyAssessment: config.enableProsody ?? true,
    GradingSystem: config.gradingSystem ?? "HundredMark",
    Granularity: config.granularity ?? "Phoneme",
    NBestPhonemeCount: config.nBestPhonemeCount ?? 5,
    PhonemeAlphabet: config.phonemeAlphabet ?? "IPA",
    ReferenceText: config.referenceText,
  };
  // Base64 of UTF-8. `btoa` would mangle any reference text outside Latin-1, which is most of the
  // languages this feature exists for.
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function score(value: unknown): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return undefined;
  // Clamped as well as divided: Azure has been observed returning 100.0000001 on a perfect word, and
  // a confidence above one breaks every consumer that assumes a fraction.
  return Math.min(1, Math.max(0, raw / 100));
}

function ms(value: unknown): number | undefined {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return Math.round(raw / TICKS_PER_MS);
}

/**
 * Azure's `ErrorType` in this schema's vocabulary.
 *
 * 🔴 AN UNKNOWN LABEL BECOMES `unclassified`, NEVER `none`. Azure adds error types — `Monotone` and
 * the two break types arrived with prosody assessment — and mapping an unrecognised one to "nothing
 * wrong" would silently mark a learner correct on whatever Microsoft ships next.
 */
export function mapErrorType(raw: unknown): WordErrorType {
  switch (String(raw ?? "").toLowerCase()) {
    case "":
    case "none":
      return "none";
    case "omission":
      return "omission";
    case "insertion":
      return "insertion";
    case "mispronunciation":
      return "mispronunciation";
    case "unexpectedbreak":
      return "unexpected-break";
    case "missingbreak":
      return "missing-break";
    case "monotone":
      return "monotone";
    default:
      return "unclassified";
  }
}

function assessmentOf(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== "object") return {};
  const found = (node as Record<string, unknown>).PronunciationAssessment;
  if (found && typeof found === "object") return found as Record<string, unknown>;
  // 🔴 THE REST SHORT-AUDIO API RETURNS THE SCORES FLAT, AND THIS FALLBACK IS MEASURED, NOT
  // GUESSED. speech-live run 3 (2026-08-31) put the DEPLOYED service's actual response in the
  // log: `AccuracyScore`, `ErrorType`, `PronScore` and the rest sit directly on the word and
  // NBest nodes — only the SDK's JSON nests them under `PronunciationAssessment`. Reading only
  // the nested shape meant every live score parsed to undefined, every ErrorType fell through
  // to "", and a learner who said a DIFFERENT SENTENCE was told "Every word landed." The node
  // itself is the assessment record in that shape; a plain recognition node has none of these
  // keys and still yields nothing, exactly as before.
  return node as Record<string, unknown>;
}

function phonemesOf(word: Record<string, unknown>): PhonemeAssessment[] | undefined {
  const raw = word.Phonemes;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const phonemes: PhonemeAssessment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as Record<string, unknown>;
    const label = typeof node.Phoneme === "string" ? node.Phoneme : "";
    if (!label) continue;
    const assessment = assessmentOf(node);
    const alternatives = Array.isArray(assessment.NBestPhonemes)
      ? (assessment.NBestPhonemes as unknown[])
          .flatMap((candidate) => {
            if (!candidate || typeof candidate !== "object") return [];
            const row = candidate as Record<string, unknown>;
            const phoneme = typeof row.Phoneme === "string" ? row.Phoneme : "";
            const value = score(row.Score);
            return phoneme && value !== undefined ? [{ phoneme, score: value }] : [];
          })
      : [];
    phonemes.push({
      ...(score(assessment.AccuracyScore) !== undefined ? { accuracy: score(assessment.AccuracyScore) } : {}),
      ...(ms(node.Duration) !== undefined ? { durationMs: ms(node.Duration) } : {}),
      // 🔴 THE TOP CANDIDATE IS DROPPED WHEN IT IS THE TARGET ITSELF. Azure's NBest list leads with
      // the expected phoneme on a correct sound, and reporting "you produced /a/ instead of /a/" is
      // noise that makes the useful case harder to find.
      ...(alternatives.some((candidate) => candidate.phoneme !== label) ? { likelyProduced: alternatives } : {}),
      phoneme: label,
      ...(ms(node.Offset) !== undefined ? { startMs: ms(node.Offset) } : {}),
    });
  }
  return phonemes.length > 0 ? phonemes : undefined;
}

function syllablesOf(word: Record<string, unknown>): SyllableAssessment[] | undefined {
  const raw = word.Syllables;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const syllables: SyllableAssessment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as Record<string, unknown>;
    const label = typeof node.Syllable === "string" ? node.Syllable : "";
    if (!label) continue;
    const assessment = assessmentOf(node);
    syllables.push({
      ...(score(assessment.AccuracyScore) !== undefined ? { accuracy: score(assessment.AccuracyScore) } : {}),
      ...(ms(node.Duration) !== undefined ? { durationMs: ms(node.Duration) } : {}),
      ...(typeof node.Grapheme === "string" && node.Grapheme ? { grapheme: node.Grapheme } : {}),
      ...(ms(node.Offset) !== undefined ? { startMs: ms(node.Offset) } : {}),
      syllable: label,
    });
  }
  return syllables.length > 0 ? syllables : undefined;
}

export interface NormaliseInput {
  readonly raw: unknown;
  readonly target: string;
  readonly locale: string;
  readonly latencyMs?: number;
  /** Keep the provider's payload on the evidence. Off for anything that gets stored. */
  readonly keepRaw?: boolean;
}

/**
 * Azure's detailed recognition result, as `PronunciationEvidence`.
 *
 * PURE. Everything about how Azure describes an utterance is decided here and nowhere else.
 */
export function normaliseAssessment(input: NormaliseInput): PronunciationResult {
  const raw = input.raw as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") {
    return { detail: "the assessor returned something that was not a result", ok: false, reason: "provider-error" };
  }

  const status = String(raw.RecognitionStatus ?? "");
  if (status && status !== "Success") {
    // 🔴 EACH STATUS IS A DIFFERENT THING TO SAY TO A LEARNER. `NoMatch` means speech was detected
    // and matched nothing — usually the wrong language or the wrong sentence. The two timeouts mean
    // the microphone was open and nobody spoke. Collapsing them into "error" would tell somebody who
    // said nothing that the system is broken.
    const gap: PronunciationGap =
      status === "NoMatch"
        ? "off-target"
        : status === "InitialSilenceTimeout" || status === "BabbleTimeout"
          ? "nothing-heard"
          : "provider-error";
    return { detail: `the assessor reported ${status}`, ok: false, reason: gap };
  }

  const best = Array.isArray(raw.NBest) ? (raw.NBest[0] as Record<string, unknown> | undefined) : undefined;
  if (!best) {
    return { detail: "the assessor returned no recognition candidate", ok: false, reason: "nothing-heard" };
  }

  const overallRaw = assessmentOf(best);
  const heard = typeof best.Display === "string" && best.Display
    ? best.Display
    : typeof raw.DisplayText === "string"
      ? raw.DisplayText
      : typeof best.Lexical === "string"
        ? best.Lexical
        : "";

  const words: WordAssessment[] = [];
  if (Array.isArray(best.Words)) {
    for (const entry of best.Words) {
      if (!entry || typeof entry !== "object") continue;
      const node = entry as Record<string, unknown>;
      const label = typeof node.Word === "string" ? node.Word : "";
      if (!label) continue;
      const assessment = assessmentOf(node);
      const phonemes = phonemesOf(node);
      const syllables = syllablesOf(node);
      words.push({
        ...(score(assessment.AccuracyScore) !== undefined ? { accuracy: score(assessment.AccuracyScore) } : {}),
        ...(ms(node.Duration) !== undefined ? { durationMs: ms(node.Duration) } : {}),
        errorType: mapErrorType(assessment.ErrorType),
        ...(phonemes ? { phonemes } : {}),
        ...(ms(node.Offset) !== undefined ? { startMs: ms(node.Offset) } : {}),
        ...(syllables ? { syllables } : {}),
        word: label,
      });
    }
  }

  const overall = {
    ...(score(overallRaw.AccuracyScore) !== undefined ? { accuracy: score(overallRaw.AccuracyScore) } : {}),
    ...(score(overallRaw.CompletenessScore) !== undefined ? { completeness: score(overallRaw.CompletenessScore) } : {}),
    ...(score(overallRaw.PronScore) !== undefined ? { overall: score(overallRaw.PronScore) } : {}),
  };
  const prosody = {
    ...(score(overallRaw.FluencyScore) !== undefined ? { fluency: score(overallRaw.FluencyScore) } : {}),
    ...(score(overallRaw.ProsodyScore) !== undefined ? { prosody: score(overallRaw.ProsodyScore) } : {}),
  };

  const evidence: PronunciationEvidence = {
    heard,
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    locale: input.locale,
    ...(Object.keys(overall).length > 0 ? { overall } : {}),
    ...(Object.keys(prosody).length > 0 ? { prosody } : {}),
    provider: "azure",
    ...(input.keepRaw ? { raw: input.raw } : {}),
    target: input.target,
    ...(words.length > 0 ? { words } : {}),
  };
  return { evidence, ok: true };
}

export interface AssessDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => number;
}

export interface AssessRequest {
  readonly audio: ArrayBuffer;
  /** The MIME type of the audio the browser recorded. Azure needs this in the Content-Type. */
  readonly contentType: string;
  readonly referenceText: string;
  readonly locale: string;
  readonly config?: Omit<AssessmentConfig, "referenceText">;
  readonly keepRaw?: boolean;
}

/**
 * What a browser can hand Azure directly, mapped to the header Azure wants.
 *
 * 🔴 THE BROWSER RECORDS WHAT IT WANTS TO, NOT WHAT AZURE WANTS. `MediaRecorder` gives WebM/Opus on
 * Chrome and MP4/AAC on Safari, and Azure's REST endpoint accepts a documented list that includes
 * the first and not the second. Refusing here, by name, is what makes a Safari failure diagnosable
 * instead of a 400 nobody can attribute.
 */
export function azureContentType(mime: string): string | null {
  const base = (mime.split(";")[0] ?? "").trim().toLowerCase();
  switch (base) {
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "audio/wav; codecs=audio/pcm; samplerate=16000";
    case "audio/webm":
      return "audio/webm; codecs=opus";
    case "audio/ogg":
    case "application/ogg":
      return "audio/ogg; codecs=opus";
    default:
      return null;
  }
}

export async function assessWithAzure(deps: AssessDeps, request: AssessRequest): Promise<PronunciationResult> {
  const now = deps.now ?? Date.now;
  const reference = request.referenceText.trim();
  if (!reference) {
    return { detail: "assessment is always against a target, and none was given", ok: false, reason: "no-target" };
  }
  if (reference.length > MAX_REFERENCE_CHARS) {
    return {
      detail: `the reference text is ${reference.length} characters, and one assessment holds ${MAX_REFERENCE_CHARS}`,
      ok: false,
      reason: "no-target",
    };
  }
  if (request.audio.byteLength < MIN_AUDIO_BYTES) {
    return {
      detail: `${request.audio.byteLength} bytes of audio is too little to contain speech`,
      ok: false,
      reason: "audio-unusable",
    };
  }
  const contentType = azureContentType(request.contentType);
  if (!contentType) {
    return {
      detail: `the assessor does not accept "${request.contentType}" — record WAV, WebM/Opus or Ogg/Opus`,
      ok: false,
      reason: "audio-unusable",
    };
  }

  const configured = azureSpeechConfig(deps.env);
  if (!configured.ok) {
    return {
      detail: configured.detail,
      ok: false,
      reason: configured.reason === "azure-key-missing" ? "no-provider" : "provider-error",
    };
  }

  const url = new URL(configured.config.sttEndpoint);
  url.searchParams.set("language", request.locale);
  // Detailed is what carries `NBest`, and `NBest` is what carries every assessment number.
  url.searchParams.set("format", "detailed");

  const startedAt = now();
  let response: Response;
  try {
    response = await deps.fetch(url.toString(), {
      body: request.audio,
      headers: {
        Accept: "application/json",
        "Content-Type": contentType,
        "Ocp-Apim-Subscription-Key": configured.config.key,
        "Pronunciation-Assessment": assessmentHeader({ ...request.config, referenceText: reference }),
      },
      method: "POST",
    });
  } catch (error) {
    return {
      detail: `the assessor could not be reached: ${(error as Error)?.message ?? "unknown"}`,
      ok: false,
      reason: "provider-unreachable",
    };
  }

  const latencyMs = now() - startedAt;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const refusal = httpRefusal(response.status);
    // 🔴 400 ON A LOCALE IS NOT A GENERIC ERROR. Azure rejects an unsupported language for assessment
    // with a 400, and telling a learner studying Welsh that "something went wrong" instead of "this
    // language cannot be scored yet" sends them to retry an attempt that will never work.
    const reason: PronunciationGap =
      response.status === 400 && /language|locale/i.test(body)
        ? "locale-unsupported"
        : refusal === "azure-unauthorised"
          ? "provider-unauthorised"
          : refusal === "azure-rate-limited"
            ? "provider-rate-limited"
            : "provider-error";
    return { detail: `the assessor returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`, ok: false, reason };
  }

  const payload = await response.json().catch(() => null);
  return normaliseAssessment({
    ...(request.keepRaw ? { keepRaw: true } : {}),
    latencyMs,
    locale: request.locale,
    raw: payload,
    target: reference,
  });
}
