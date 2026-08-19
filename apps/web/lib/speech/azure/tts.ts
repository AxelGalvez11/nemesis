// SSML in, MP3 out.
//
// 🔴 MP3 AT 24kHz, WHICH IS A COMPATIBILITY DECISION RATHER THAN A QUALITY ONE. `use-canvas-speech`
// already plays `audio/mpeg` through an `Audio` element and has done since voice mode shipped;
// choosing Azure's higher-fidelity PCM or Opus formats would mean a second playback path in the
// client for the sake of a difference nobody can hear on a laptop speaker. One codec, one player,
// one set of autoplay bugs.
//
// 🔴 THE TEXT IS ESCAPED AND THEN THE ESCAPING IS TESTED. SSML is XML, the text comes from a model,
// and an unescaped `&` does not produce a wrong voice — it produces a 400 from Azure and silence in
// a lesson. Worse, a `<` opens the door to a model emitting its own prosody tags, which is a model
// writing markup into a document Nemesis sends to a paid API under its own credential.
//
// 🔴 STREAMED THROUGH, NOT BUFFERED. Azure begins returning audio bytes before it has finished
// synthesising the sentence, so the route hands the body straight to the client. On a two-second
// utterance that is most of a second of perceived latency, and the owner named latency as a
// requirement rather than a nicety.

import { azureSpeechConfig, type AzureConfigRefusal } from "./config";
import { httpRefusal } from "./voice-catalog";

/**
 * What Azure returns. 24kHz mono MP3 at 48kbit.
 *
 * Anything higher is inaudible over the speech itself and costs bytes on a mobile connection; the
 * lower tiers are audibly compressed on exactly the sibilants a pronunciation lesson is about.
 */
export const AZURE_AUDIO_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/**
 * 16kHz PCM in a WAV container.
 *
 * 🔴 NOT FOR PLAYBACK — FOR FEEDING THE ASSESSOR. The live acceptance harness proves the two halves
 * of this integration against each other: synthesise a sentence, then score that audio against the
 * same sentence. A native-quality reading has to come back near the top of the scale, and if it does
 * not, something between the SSML and the normalisation is wrong. That round trip only works in a
 * format the assessment endpoint accepts, and it does not accept MP3.
 */
export const AZURE_PCM_FORMAT = "riff-16khz-16bit-mono-pcm";

/** The character ceiling Azure enforces per request, kept here so the refusal is ours and named. */
export const AZURE_MAX_CHARS = 3_000;

export type AzureTtsRefusal =
  | AzureConfigRefusal
  | "azure-unauthorised"
  | "azure-rate-limited"
  | "azure-error"
  | "azure-unreachable"
  /** Nothing to say. */
  | "empty-text"
  /** Longer than one synthesis request may be. */
  | "too-long-to-speak"
  /** A 200 with no bytes — the failure that plays as silence and reads as a choice not to speak. */
  | "empty-audio";

export interface SsmlRequest {
  readonly text: string;
  /** An Azure `ShortName`, e.g. `ja-JP-NanamiNeural`. */
  readonly voice: string;
  readonly locale: string;
  /** 1 is natural. §43's target-language lane always sends 1; the canvas lane runs slightly under. */
  readonly rate?: number;
  /** An Azure speaking style the chosen voice advertises. Unsupported styles are a 400 from Azure. */
  readonly style?: string;
  readonly role?: string;
  /** Defaults to MP3. See `AZURE_PCM_FORMAT` for the one caller that wants otherwise. */
  readonly outputFormat?: string;
}

/** XML's five, and only those — SSML is XML and nothing else needs escaping. */
export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build the document Azure is sent.
 *
 * PURE, and the reason it is a separate function is that every rule above is then a test rather than
 * a claim: the escaping, the rate, the style wrapper, and the fact that a style is only emitted when
 * one was asked for.
 */
export function buildSsml(request: SsmlRequest): string {
  const body = escapeSsml(request.text.trim());
  // Azure takes a percentage delta rather than a multiplier: 1 is "+0%", 0.95 is "-5%".
  const percent = Math.round(((request.rate ?? 1) - 1) * 100);
  const rated = percent === 0 ? body : `<prosody rate="${percent > 0 ? "+" : ""}${percent}%">${body}</prosody>`;
  const styled = request.style
    ? `<mstts:express-as style="${escapeSsml(request.style)}"${request.role ? ` role="${escapeSsml(request.role)}"` : ""}>${rated}</mstts:express-as>`
    : rated;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${escapeSsml(request.locale)}">` +
    `<voice name="${escapeSsml(request.voice)}">${styled}</voice></speak>`
  );
}

export interface SynthesisResult {
  readonly ok: true;
  /** The response body, unread, so a route can stream it onward. */
  readonly audio: ReadableStream<Uint8Array> | null;
  /** Present instead of `audio` when the caller asked for bytes. */
  readonly bytes: ArrayBuffer | null;
  /** Time to the first byte of the response, which is what a learner experiences as the wait. */
  readonly latencyMs: number;
  readonly voice: string;
  readonly characters: number;
}

export type SynthesisOutcome =
  | SynthesisResult
  | { readonly ok: false; readonly reason: AzureTtsRefusal; readonly detail: string; readonly latencyMs: number };

export interface TtsDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => number;
}

export async function synthesise(
  deps: TtsDeps,
  request: SsmlRequest & { readonly collect?: boolean },
): Promise<SynthesisOutcome> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const text = request.text.trim();
  if (!text) return { detail: "there was nothing to say", latencyMs: 0, ok: false, reason: "empty-text" };
  if (text.length > AZURE_MAX_CHARS) {
    return {
      detail: `${text.length} characters, and one synthesis request holds ${AZURE_MAX_CHARS}`,
      latencyMs: 0,
      ok: false,
      reason: "too-long-to-speak",
    };
  }

  const configured = azureSpeechConfig(deps.env);
  if (!configured.ok) {
    return { detail: configured.detail, latencyMs: 0, ok: false, reason: configured.reason };
  }

  let response: Response;
  try {
    response = await deps.fetch(configured.config.ttsEndpoint, {
      body: buildSsml(request),
      headers: {
        "Content-Type": "application/ssml+xml",
        "Ocp-Apim-Subscription-Key": configured.config.key,
        "User-Agent": "nemesis-canvas",
        "X-Microsoft-OutputFormat": request.outputFormat ?? AZURE_AUDIO_FORMAT,
      },
      method: "POST",
    });
  } catch (error) {
    return {
      detail: `Azure could not be reached: ${(error as Error)?.message ?? "unknown"}`,
      latencyMs: now() - startedAt,
      ok: false,
      reason: "azure-unreachable",
    };
  }

  const latencyMs = now() - startedAt;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      detail: `Azure returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      latencyMs,
      ok: false,
      reason: httpRefusal(response.status),
    };
  }

  if (request.collect) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      return { detail: "Azure returned no audio", latencyMs, ok: false, reason: "empty-audio" };
    }
    return { audio: null, bytes, characters: text.length, latencyMs, ok: true, voice: request.voice };
  }

  if (!response.body) {
    return { detail: "Azure returned no audio", latencyMs, ok: false, reason: "empty-audio" };
  }
  return { audio: response.body, bytes: null, characters: text.length, latencyMs, ok: true, voice: request.voice };
}
