// Which provider serves which speech capability, as one table instead of four scattered answers.
//
// 🔴 THE UNIT IS A CAPABILITY, NOT A VENDOR, AND THAT IS THE WHOLE DESIGN. "We use Azure" is not a
// fact anybody can act on: Azure serves two capabilities here and not a third, xAI serves one and
// not the others, and the browser serves the one nobody pays for. A vendor-shaped registry answers
// "is Azure on?" — a capability-shaped one answers the question that actually gets asked, which is
// "who synthesises this utterance, and what happens if they are down?"
//
// 🔴 SWAPPING A PROVIDER IS A CHANGE TO THIS FILE AND NOTHING ELSE. That is the promise, and it only
// holds while every caller asks `providerFor(capability)` instead of naming a vendor. The failure it
// prevents is the one the owner named: Azure-specific code spreading through the app until the
// second provider is a rewrite rather than a row.
//
// 🔴 `status` IS MEASURED FROM THE ENVIRONMENT, NEVER ASSERTED. A row saying "azure serves tts" in a
// deployment with no Azure key is a lie the code tells itself; `capabilityReport()` takes the env
// and says which rows are actually live. This repo has already been burned once by a table that
// described intent and read as description.
//
// PURE. No fetch, no SDK, no secret. Safe to import anywhere, including the browser.

export type SpeechCapability =
  /** Text in, audio out. */
  | "tts"
  /** Audio plus the words it was supposed to be, in — how well it was said, out. */
  | "pronunciation"
  /** Audio in, words out. */
  | "transcription";

export type SpeechProviderId = "azure" | "xai" | "assemblyai" | "browser";

/** Whether a provider can serve a capability in a given deployment. */
export type ProviderStatus =
  /** Wired, configured, and the one that runs today. */
  | "serving"
  /** Wired and configured, but something else is preferred for this capability. */
  | "standby"
  /** Wired, and the credential this deployment would need is absent. */
  | "unconfigured";

export interface ProviderRow {
  readonly capability: SpeechCapability;
  readonly provider: SpeechProviderId;
  readonly label: string;
  /**
   * The environment variable this provider needs, or null when it needs none.
   *
   * 🔴 THE NAME ONLY. Never the value, never a default, and nothing in this file ever reads it —
   * this module is imported by client code and a secret that reaches a bundle has already leaked.
   * `capabilityReport` is handed a presence map by a server caller instead.
   */
  readonly keyEnv: string | null;
  /** Where the credential lives, because Nemesis keeps them in two different places. */
  readonly secretHome: "vercel" | "supabase-functions" | "none";
  /** Which process actually makes the call. */
  readonly runsIn: "next-route" | "supabase-function" | "browser";
  /** Why this provider holds this slot, in words. */
  readonly because: string;
}

/**
 * Every speech capability and who serves it.
 *
 * 🔴 xAI KEEPS THE CANVAS AND AZURE TAKES THE LANGUAGE LANE, AND THAT SPLIT IS DELIBERATE RATHER
 * THAN TRANSITIONAL. `nemesis-speak` works, is paid for, reads a question aloud perfectly well, and
 * costs the owner no new secret — replacing it would be a migration with no beneficiary. What it
 * cannot do is name a variety: it takes `auto` or a language, picks a voice nobody chose, and offers
 * no catalogue to choose from. That is precisely the gap §43 refuses to guess across, and precisely
 * what Azure's catalogue closes. Two providers, two jobs, one router.
 */
export const PROVIDER_ROWS: readonly ProviderRow[] = [
  {
    because:
      "reads questions and corrections on the Canvas — one voice, no locale decision, and the key already lives in the function's secrets",
    capability: "tts",
    keyEnv: "XAI_API_KEY",
    label: "xAI",
    provider: "xai",
    runsIn: "supabase-function",
    secretHome: "supabase-functions",
  },
  {
    because:
      "speaks the language being learned, where the variety is the material — hundreds of neural voices with a queryable catalogue, so a locale maps to a voice somebody can name",
    capability: "tts",
    keyEnv: "AZURE_SPEECH_KEY",
    label: "Azure Speech",
    provider: "azure",
    runsIn: "next-route",
    secretHome: "vercel",
  },
  {
    because:
      "the only integrated engine that scores HOW something was said rather than WHAT was said — word, syllable and phoneme level, with the alternative the recogniser considered",
    capability: "pronunciation",
    keyEnv: "AZURE_SPEECH_KEY",
    label: "Azure Speech",
    provider: "azure",
    runsIn: "next-route",
    secretHome: "vercel",
  },
  {
    because:
      "fills the Canvas composer while the learner talks — free, instant, no round trip, and no audio ever leaves the machine",
    capability: "transcription",
    keyEnv: null,
    label: "Web Speech API",
    provider: "browser",
    runsIn: "browser",
    secretHome: "none",
  },
  {
    because: "long-form recordings and uploaded audio, through nemesis-transcribe",
    capability: "transcription",
    keyEnv: "XAI_API_KEY",
    label: "xAI",
    provider: "xai",
    runsIn: "supabase-function",
    secretHome: "supabase-functions",
  },
  {
    because: "live streaming transcription in sessions and notebooks, via a short-lived minted token",
    capability: "transcription",
    keyEnv: "ASSEMBLYAI_API_KEY",
    label: "AssemblyAI",
    provider: "assemblyai",
    runsIn: "next-route",
    secretHome: "vercel",
  },
];

/**
 * Who serves a capability, in preference order.
 *
 * 🔴 ORDER IS THE ROUTING RULE AND IT IS DATA. `preferredFor` walks this list and takes the first
 * provider whose credential is present, so an Azure outage degrades the language lane to xAI's
 * `auto` rather than to silence — worse audio, still a lesson.
 */
export function providersFor(capability: SpeechCapability): readonly ProviderRow[] {
  return PROVIDER_ROWS.filter((row) => row.capability === capability);
}

/**
 * The provider that will actually be used, given which credentials exist.
 *
 * `configured` is a map of env-var name to whether it is set — built by the SERVER caller, so no
 * secret and no `process.env` read happens in this module. A provider needing no key is always
 * available.
 */
export function preferredFor(
  capability: SpeechCapability,
  configured: Readonly<Record<string, boolean>>,
  /** Force a specific provider when the caller has already decided. Ignored if it is not configured. */
  prefer?: SpeechProviderId,
): ProviderRow | null {
  const rows = providersFor(capability);
  const usable = rows.filter((row) => row.keyEnv === null || configured[row.keyEnv] === true);
  if (prefer) {
    const forced = usable.find((row) => row.provider === prefer);
    if (forced) return forced;
  }
  return usable[0] ?? null;
}

export interface CapabilityStatus extends ProviderRow {
  readonly status: ProviderStatus;
}

/**
 * Every row, with what is actually true of this deployment stamped on it.
 *
 * 🔴 THIS IS WHAT A STATUS PAGE OR A DEV LAB SHOWS, AND IT IS THE ONLY HONEST VERSION. A capability
 * with no configured provider comes back as a list of `unconfigured` rows rather than as an empty
 * list, because "nobody can do this" and "nothing is wired for this" are different problems with
 * different fixes, and an empty list cannot tell them apart.
 *
 * 🔴 `serving` MEANS "THE DEFAULT WHEN NOBODY ASKS FOR ANYTHING ELSE", NOT "THE ONLY ONE THAT RUNS".
 * The target-language lane asks for Azure by name through `preferredFor(..., "azure")`, so a `tts`
 * report showing xAI as serving and Azure as standby is describing the CANVAS lane. Collapsing that
 * into one number would mean the report could not describe a product that deliberately runs two
 * synthesisers for two different jobs.
 */
export function capabilityReport(configured: Readonly<Record<string, boolean>>): readonly CapabilityStatus[] {
  const serving = new Set<SpeechCapability>();
  return PROVIDER_ROWS.map((row) => {
    const available = row.keyEnv === null || configured[row.keyEnv] === true;
    if (!available) return { ...row, status: "unconfigured" as const };
    if (!serving.has(row.capability)) {
      serving.add(row.capability);
      return { ...row, status: "serving" as const };
    }
    return { ...row, status: "standby" as const };
  });
}
