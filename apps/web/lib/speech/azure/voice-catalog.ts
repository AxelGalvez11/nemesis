// Azure's voice list, turned into something Nemesis can choose from.
//
// 🔴 FETCHED, NEVER HARD-CODED, AND THE OWNER ASKED FOR EXACTLY THIS: *"Do not hard-code a tiny list
// of voices if Azure exposes a proper catalogue API."* Azure ships four hundred-odd neural voices
// across a hundred-plus locales and adds to them continuously; a list checked into this repo would
// be wrong within a month and wrong in the specific way that matters — a learner studying a locale
// Nemesis "does not support" that Azure has supported since March.
//
// 🔴 SO THE ONLY THING CHECKED IN IS THE SHAPE. `normaliseVoiceList` is pure and tested against real
// response fixtures; the fetch that feeds it is injected. That split is what lets the catalogue be
// live in production and deterministic in the suite.
//
// 🔴 A MALFORMED ENTRY IS SKIPPED, NOT FATAL, AND THE COUNT IS REPORTED. Azure adds fields to this
// payload without warning — `RolePlayList` and `SecondaryLocaleList` both appeared after launch.
// Refusing the whole catalogue because one voice grew a field nobody parses would take the language
// lane down on a vendor's release schedule. Refusing SILENTLY would hide the day the shape changed,
// which is why `skipped` travels with the result.

import { azureSpeechConfig, type AzureConfigRefusal } from "./config";

export type VoiceGender = "female" | "male" | "neutral";

export interface AzureVoice {
  /** What a synthesis request names, e.g. `es-MX-DaliaNeural`. The identity. */
  readonly shortName: string;
  readonly locale: string;
  /** Azure's own English name for the locale, e.g. "Spanish (Mexico)". */
  readonly localeName: string;
  readonly displayName: string;
  /** The voice's name written in its own language, which is what a learner should see. */
  readonly localName: string;
  readonly gender: VoiceGender;
  /**
   * Speaking styles this voice accepts — `cheerful`, `newscast`, `whispering`.
   *
   * 🔴 COVERAGE IS PER VOICE AND MOSTLY EMPTY, WHICH IS WHY IT IS A LIST RATHER THAN A FLAG. A
   * handful of voices carry a dozen styles and most carry none; asking for a style the voice does
   * not have makes Azure reject the SSML, so this is what `selectVoice` filters against.
   */
  readonly styles: readonly string[];
  /** Roles this voice can play — `YoungAdultFemale`, `OlderAdultMale`. Rarer still than styles. */
  readonly roles: readonly string[];
  /** Other locales this voice also speaks, for the multilingual voices. */
  readonly secondaryLocales: readonly string[];
  /** False for the retired standard voices. Nemesis only ever selects neural. */
  readonly neural: boolean;
  /** Azure labels a voice `Preview` until it is generally available. Preferred against, not banned. */
  readonly preview: boolean;
  readonly sampleRateHz: number | null;
  readonly wordsPerMinute: number | null;
}

export interface VoiceCatalogue {
  readonly voices: readonly AzureVoice[];
  /** How many entries were unparseable. Non-zero means Azure's payload moved; see the header. */
  readonly skipped: number;
  /** When this snapshot was taken, so a caller can say how stale it is. */
  readonly fetchedAt: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function genderOf(value: unknown): VoiceGender {
  const raw = text(value).toLowerCase();
  if (raw === "female") return "female";
  if (raw === "male") return "male";
  // Azure has begun shipping `Neutral`. Anything unrecognised lands here rather than being guessed
  // into one of the two, because guessing a voice's gender is exactly the kind of quiet wrong that
  // a learner who asked for one would never be able to see.
  return "neutral";
}

/**
 * Azure's `/voices/list` payload, as `AzureVoice[]`.
 *
 * PURE. Takes parsed JSON, returns rows. Anything without a `ShortName` and a `Locale` is skipped:
 * those two are the request key and the routing key, and a voice missing either cannot be used for
 * anything.
 */
export function normaliseVoiceList(raw: unknown, fetchedAt: string): VoiceCatalogue {
  if (!Array.isArray(raw)) return { fetchedAt, skipped: 0, voices: [] };
  const voices: AzureVoice[] = [];
  let skipped = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      skipped += 1;
      continue;
    }
    const row = entry as Record<string, unknown>;
    const shortName = text(row.ShortName);
    const locale = text(row.Locale);
    if (!shortName || !locale) {
      skipped += 1;
      continue;
    }
    const voiceType = text(row.VoiceType).toLowerCase();
    const status = text(row.Status).toLowerCase();
    const sampleRate = Number(row.SampleRateHertz);
    const wpm = Number(row.WordsPerMinute);
    voices.push({
      displayName: text(row.DisplayName) || shortName,
      gender: genderOf(row.Gender),
      locale,
      localeName: text(row.LocaleName) || locale,
      localName: text(row.LocalName) || text(row.DisplayName) || shortName,
      // `Neural`, `NeuralHD` and the multilingual variants all contain "neural"; the retired
      // `Standard` voices do not. Matching the substring rather than an exact value is what keeps
      // this working when Azure ships the next tier name.
      neural: voiceType.includes("neural"),
      preview: status === "preview",
      roles: list(row.RolePlayList),
      sampleRateHz: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null,
      secondaryLocales: list(row.SecondaryLocaleList),
      shortName,
      styles: list(row.StyleList),
      wordsPerMinute: Number.isFinite(wpm) && wpm > 0 ? wpm : null,
    });
  }
  return { fetchedAt, skipped, voices };
}

export type VoiceCatalogueRefusal =
  | AzureConfigRefusal
  /** Azure answered, but not with a catalogue. */
  | "azure-unauthorised"
  | "azure-rate-limited"
  | "azure-error"
  | "azure-unreachable"
  /** A 200 with nothing usable in it. An empty catalogue is a failure, not a small catalogue. */
  | "catalogue-empty";

export type VoiceCatalogueResult =
  | { readonly ok: true; readonly catalogue: VoiceCatalogue; readonly latencyMs: number }
  | { readonly ok: false; readonly reason: VoiceCatalogueRefusal; readonly detail: string };

export interface CatalogueDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly env?: Record<string, string | undefined>;
  /** Injected so a test does not depend on the clock. */
  readonly now?: () => number;
}

/**
 * How long a fetched catalogue is reused before Azure is asked again.
 *
 * 🔴 SIX HOURS, IN MEMORY, PER SERVER INSTANCE — because the catalogue is a ~700KB payload that
 * changes a few times a year and is needed on every language utterance. Fetching it per request
 * would add a full round trip to Azure in front of the round trip that produces the audio, which is
 * the latency the owner explicitly asked us not to spend. A per-instance cache is deliberately not
 * a shared one: correctness does not depend on instances agreeing, and a Redis for a voice list is
 * infrastructure bought for nothing.
 */
export const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

let cached: { at: number; catalogue: VoiceCatalogue } | null = null;

/** Drop the cache. For tests, and for a route that wants to force a refresh. */
export function forgetVoiceCatalogue(): void {
  cached = null;
}

export async function fetchVoiceCatalogue(
  deps: CatalogueDeps,
  options?: { readonly refresh?: boolean },
): Promise<VoiceCatalogueResult> {
  const now = deps.now ?? Date.now;
  if (!options?.refresh && cached && now() - cached.at < CATALOGUE_TTL_MS) {
    return { catalogue: cached.catalogue, latencyMs: 0, ok: true };
  }

  const configured = azureSpeechConfig(deps.env);
  if (!configured.ok) return { detail: configured.detail, ok: false, reason: configured.reason };

  const startedAt = now();
  let response: Response;
  try {
    response = await deps.fetch(configured.config.voicesEndpoint, {
      headers: { "Ocp-Apim-Subscription-Key": configured.config.key },
      method: "GET",
    });
  } catch (error) {
    return {
      detail: `the voice catalogue could not be reached: ${(error as Error)?.message ?? "unknown"}`,
      ok: false,
      reason: "azure-unreachable",
    };
  }

  if (!response.ok) {
    return { detail: `the voice catalogue returned ${response.status}`, ok: false, reason: httpRefusal(response.status) };
  }

  const payload = await response.json().catch(() => null);
  const catalogue = normaliseVoiceList(payload, new Date(now()).toISOString());
  if (catalogue.voices.length === 0) {
    return {
      detail: `Azure returned a catalogue with no usable voices (${catalogue.skipped} entries skipped)`,
      ok: false,
      reason: "catalogue-empty",
    };
  }
  cached = { at: now(), catalogue };
  return { catalogue, latencyMs: now() - startedAt, ok: true };
}

/** One HTTP status, one named reason — so a caller can tell a bad key from a busy account. */
export function httpRefusal(status: number): "azure-unauthorised" | "azure-rate-limited" | "azure-error" {
  if (status === 401 || status === 403) return "azure-unauthorised";
  // 🔴 429 IS ITS OWN REASON BECAUSE THE FREE TIER HITS IT ROUTINELY. F0 allows twenty requests in
  // a rolling minute; a learner drilling a sentence six times in a row is a normal session that hits
  // it. "Slow down" and "your key is wrong" call for completely different words on screen.
  if (status === 429) return "azure-rate-limited";
  return "azure-error";
}
