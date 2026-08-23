/**
 * Reading a picture with DeepSeek instead of Google.
 *
 * 🔴 WHY THIS EXISTS: COST, MEASURED, NOT VIBES. The same transcription that costs ~$0.0039 a page
 * on gemini-3.7-flash (input + the output tokens the old per-image estimate forgot) prices at
 * ~$0.0015 on deepseek-v4-flash-vision-exp at peak, half that off-peak. The output side is where
 * the money goes — a transcript is long — and DeepSeek's output rate is a third of Google's.
 *
 * 🔴 SAME CONTRACT AS lib/vision/gemini.ts, DELIBERATELY: bytes and a mime type in, text out,
 * null — never a throw — for "unconfigured, too large, unreadable, provider down". That is what
 * lets `lib/vision/read.ts` fall back to Gemini without the call sites knowing either provider
 * exists. Everything except the single fetch is pure and unit-tested.
 *
 * 🔴 THE MODEL IS TWO DAYS OLD AND SAYS SO IN ITS NAME (`-exp`, released 2026-08-21). Both facts
 * shape this file: the id is env-overridable because experimental names get retired — this repo
 * has already once paid for a ladder of dead model ids for weeks (lib/pdf/vision.ts's header) —
 * and this module is never the only reader, because the front door keeps Gemini behind it.
 */

import type { VisionEnv } from "./gemini";
import { withinVisionLimit } from "./gemini";

/** DeepSeek's chat completions endpoint — vision rides the same door as text. */
const DEEPSEEK_BASE = "https://api.deepseek.com";

/** The one vision-capable model. Overridable via DEEPSEEK_VISION_MODEL for the day `-exp` dies. */
export const DEEPSEEK_VISION_MODEL = "deepseek-v4-flash-vision-exp";

/**
 * What DeepSeek can read. 🔴 NO HEIC, AND THAT IS A REAL PRODUCT FACT, NOT TRIVIA. DeepSeek takes
 * JPEG/PNG/GIF/WebP only; an iPhone camera produces HEIC by default. So an iPhone photo does not
 * go to DeepSeek at all — the front door sees the mime, skips this module, and Gemini (which does
 * read HEIC) takes it. Silently sending HEIC here would burn the request and fall back anyway,
 * paying latency for nothing.
 */
export const DEEPSEEK_VISION_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** Can DeepSeek read this mime at all? PURE. */
export function deepseekReadable(mimeType: string): boolean {
  return (DEEPSEEK_VISION_MIMES as readonly string[]).includes(mimeType.trim().toLowerCase());
}

/** Whether the DeepSeek door is open. Key added by the owner, not assumed. */
export function deepseekVisionConfigured(env: VisionEnv = process.env): boolean {
  return Boolean((env.DEEPSEEK_API_KEY ?? "").trim());
}

/** The model to ask, honouring the override. PURE. */
export function deepseekVisionModel(env: VisionEnv = process.env): string {
  return (env.DEEPSEEK_VISION_MODEL ?? "").trim() || DEEPSEEK_VISION_MODEL;
}

/**
 * What one call actually consumed, straight from the provider's own meter.
 *
 * 🔴 MEASURED, NOT ESTIMATED, AND THAT IS THE WHOLE COST-TRACKING FIX. The Gemini lane prices "an
 * image" from an assumption (~258 tokens, input only) that under-recorded real cost by orders of
 * magnitude once output tokens are counted. DeepSeek returns the true token counts on every reply;
 * recording those against the published rates is arithmetic, not modelling.
 */
export interface DeepseekVisionUsage {
  /** Input tokens billed at the full (cache-miss) rate. */
  inputMissTokens: number;
  /** Input tokens billed at the ~30x cheaper cache-hit rate. */
  inputHitTokens: number;
  outputTokens: number;
}

export interface DeepseekVisionResult {
  text: string;
  model: string;
  usage: DeepseekVisionUsage | null;
}

/**
 * The output ceiling on every request, in tokens.
 *
 * 🔴 MEASURED, NOT GUESSED (2026-08-23, quality test on real lecture figures). This model
 * REASONS before it answers and bills the reasoning as output: a molecular diagram whose visible
 * answer was ~150 tokens burned 18,642 output tokens — $0.025 and 135 seconds for one figure —
 * enumerating every printed residue. The largest LEGITIMATE reply seen (a full page transcript
 * with labels) is under 3,000; 8,192 is comfortably past every real answer and caps the
 * pathological case at less than half its unbounded cost. A reply that still hits the ceiling
 * comes back truncated, which the caller already treats as "use what arrived".
 */
export const DEEPSEEK_VISION_MAX_OUTPUT = 8192;

/**
 * The chat completions body for one image. OpenAI vision shape: the image rides as a data URL
 * content part beside the prompt text. PURE.
 */
export function buildDeepseekVisionRequest(
  base64: string,
  mimeType: string,
  prompt: string,
  model: string,
): string {
  return JSON.stringify({
    max_tokens: DEEPSEEK_VISION_MAX_OUTPUT,
    messages: [
      {
        content: [
          { image_url: { url: `data:${mimeType};base64,${base64}` }, type: "image_url" },
          { text: prompt, type: "text" },
        ],
        role: "user",
      },
    ],
    model,
  });
}

/** Pull text + the token meter out of a chat completions reply. "" text for anything malformed —
 *  the caller treats that as "nothing readable", exactly like the Gemini parser. PURE. */
export function parseDeepseekVisionReply(payload: unknown): { text: string; usage: DeepseekVisionUsage | null } {
  const empty = { text: "", usage: null };
  if (typeof payload !== "object" || payload === null) return empty;
  const choices = (payload as { choices?: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : null;
  const content = (first as { message?: { content?: unknown } })?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";

  const raw = (payload as { usage?: Record<string, unknown> }).usage;
  const count = (key: string): number => {
    const value = raw?.[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  };
  const hit = count("prompt_cache_hit_tokens");
  // DeepSeek reports the split explicitly; when it does not, every prompt token is priced at the
  // full rate. 🔴 THE CONSERVATIVE DIRECTION ON PURPOSE — after finding vision under-recorded by
  // ~150x, no fallback here is allowed to make a bill look smaller than it could be.
  const miss = count("prompt_cache_miss_tokens") || Math.max(count("prompt_tokens") - hit, 0);
  const usage: DeepseekVisionUsage = {
    inputHitTokens: hit,
    inputMissTokens: miss,
    outputTokens: count("completion_tokens"),
  };
  const metered = usage.inputHitTokens + usage.inputMissTokens + usage.outputTokens > 0;
  return { text, usage: metered ? usage : null };
}

/**
 * Read a picture with DeepSeek.
 *
 * Returns null — never throws — whenever the key is absent, the mime is one DeepSeek cannot read,
 * the file is too large, or the provider fails. One attempt, no ladder: there is exactly one
 * vision model here, and the retry story belongs to the front door, whose fallback is a whole
 * different provider.
 */
export async function readWithDeepseekVision(
  bytes: Uint8Array,
  mimeType: string,
  options: { env?: VisionEnv; prompt: string; signal?: AbortSignal },
): Promise<DeepseekVisionResult | null> {
  const env = options.env ?? process.env;
  const key = (env.DEEPSEEK_API_KEY ?? "").trim();
  if (!key) return null;
  if (!deepseekReadable(mimeType)) return null;
  if (!withinVisionLimit(bytes.byteLength)) return null;

  const model = deepseekVisionModel(env);
  const body = buildDeepseekVisionRequest(
    Buffer.from(bytes).toString("base64"),
    mimeType,
    options.prompt,
    model,
  );
  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      body,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
      signal: options.signal,
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    // Same structured line the Gemini reader emits, so one log query sees both providers.
    console.warn(JSON.stringify({
      event: "vision_provider_error",
      model,
      provider: "deepseek",
      status: response.status,
    }));
    await response.body?.cancel();
    return null;
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const { text, usage } = parseDeepseekVisionReply(payload);
  if (!text) {
    console.warn(JSON.stringify({ event: "vision_empty_response", model, provider: "deepseek" }));
    return null;
  }
  return { model, text, usage };
}
