// The one place `AZURE_SPEECH_KEY` is read, and the one place that knows Azure's hostnames.
//
// 🔴 SERVER ONLY, ENFORCED AT RUNTIME AND NOT ONLY BY CONVENTION. Next.js already refuses to inline
// a non-`NEXT_PUBLIC_` variable into a client bundle, so importing this from a component would give
// an empty key rather than a leaked one — which is safe and completely silent, and a silent failure
// is how somebody "fixes" it by renaming the variable to `NEXT_PUBLIC_AZURE_SPEECH_KEY`. The throw
// below turns that into a loud error at the moment the mistake is made.
//
// 🔴 THE REGION IS VALIDATED BECAUSE IT BUILDS A HOSTNAME. Every Azure Speech endpoint is
// `https://{region}.something.microsoft.com`, so an unchecked region is a string from configuration
// interpolated into a URL Nemesis then sends a bearer credential to. `eastus.` with a trailing dot,
// a slash, or an `@` is the whole attack. The shape check is narrow on purpose: Azure regions are
// lowercase letters optionally ending in a digit, and nothing else has ever been one.
//
// 🔴 A MISSING KEY IS A NAMED REFUSAL, NOT AN EXCEPTION. Voice is a feature of a Canvas session, and
// a session must survive its absence: "Azure is not configured" has to reach the surface as a fact
// it can render, exactly as `nemesis-speak`'s 503 does for xAI.

/** Why Azure cannot be called. A name, never a sentence — the prose goes in `detail`. */
export type AzureConfigRefusal =
  /** `AZURE_SPEECH_KEY` is not set in this environment. */
  | "azure-key-missing"
  /** `AZURE_SPEECH_REGION` is not set. There is no sensible default: the wrong region is a 401. */
  | "azure-region-missing"
  /** The region is not a region. See the header. */
  | "azure-region-malformed";

export interface AzureSpeechConfig {
  /** 🔴 NEVER LOG, NEVER SERIALISE, NEVER RETURN FROM A ROUTE. */
  readonly key: string;
  readonly region: string;
  /** Mints a ten-minute bearer token, so the browser never sees the key. */
  readonly tokenEndpoint: string;
  /** The full neural voice catalogue for this region. */
  readonly voicesEndpoint: string;
  /** SSML in, audio out. */
  readonly ttsEndpoint: string;
  /** Audio in, recognition plus pronunciation assessment out. */
  readonly sttEndpoint: string;
}

export type AzureConfigResult =
  | { readonly ok: true; readonly config: AzureSpeechConfig }
  | { readonly ok: false; readonly reason: AzureConfigRefusal; readonly detail: string };

/**
 * A region as Azure names them: `eastus`, `westus2`, `japaneast`, `uksouth`.
 *
 * Lowercase letters, optionally one or two trailing digits. No dots, no slashes, no credentials —
 * this string becomes the first label of a hostname Nemesis authenticates against.
 */
const REGION_SHAPE = /^[a-z]{4,24}[0-9]{0,2}$/;

/** How long a minted token is good for, per Azure's documented ten minutes. Used to set expiry. */
export const AZURE_TOKEN_TTL_SECONDS = 9 * 60;

function endpointsFor(region: string): Omit<AzureSpeechConfig, "key" | "region"> {
  return {
    sttEndpoint: `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
    tokenEndpoint: `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    ttsEndpoint: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    voicesEndpoint: `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
  };
}

/**
 * Read the Azure credentials, or say precisely why they cannot be read.
 *
 * `env` is injected so tests can exercise every refusal without touching the real process — the same
 * reason `resolveStructure` takes its fetch.
 */
export function azureSpeechConfig(env: Record<string, string | undefined> = process.env): AzureConfigResult {
  if (typeof window !== "undefined") {
    // See the header. This is a mistake worth crashing on rather than degrading past.
    throw new Error("azureSpeechConfig was called in a browser — the Azure key is server-side only");
  }
  const key = (env.AZURE_SPEECH_KEY ?? "").trim();
  if (!key) {
    return {
      detail: "AZURE_SPEECH_KEY is not set in this environment",
      ok: false,
      reason: "azure-key-missing",
    };
  }
  const region = (env.AZURE_SPEECH_REGION ?? "").trim().toLowerCase();
  if (!region) {
    return {
      detail: "AZURE_SPEECH_REGION is not set, and a Speech resource is only reachable in its own region",
      ok: false,
      reason: "azure-region-missing",
    };
  }
  if (!REGION_SHAPE.test(region)) {
    return {
      detail: `"${region}" is not an Azure region name, and it would be interpolated into a hostname`,
      ok: false,
      reason: "azure-region-malformed",
    };
  }
  return { config: { key, region, ...endpointsFor(region) }, ok: true };
}

/** Whether Azure can be called at all, for a capability check that must not throw. */
export function azureConfigured(env: Record<string, string | undefined> = process.env): boolean {
  if (typeof window !== "undefined") return false;
  return azureSpeechConfig(env).ok;
}

/**
 * Which credentials this deployment has, by env-var NAME only.
 *
 * 🔴 THE BRIDGE TO `capabilities.ts`, AND IT CARRIES BOOLEANS RATHER THAN VALUES. The registry needs
 * to know whether a provider is usable; it must never be in a position to leak one if it is.
 */
export function configuredSpeechKeys(env: Record<string, string | undefined> = process.env): Record<string, boolean> {
  return {
    ASSEMBLYAI_API_KEY: Boolean((env.ASSEMBLYAI_API_KEY ?? "").trim()),
    AZURE_SPEECH_KEY: Boolean((env.AZURE_SPEECH_KEY ?? "").trim()) && Boolean((env.AZURE_SPEECH_REGION ?? "").trim()),
    XAI_API_KEY: Boolean((env.XAI_API_KEY ?? "").trim()),
  };
}
