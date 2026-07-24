// What a model call actually COST US, and WHICH app spent it.
//
// Two separate ledgers meet here and must not be confused:
//   • the student meter (usage_counters / usage_events.metadata.tokens) — cache hits
//     already discounted by CACHE_HIT_WEIGHT, in tokens, not money;
//   • the provider bill — real dollars, computed here from the RAW provider token
//     split at the provider's own list prices.
// This file is the second one only.
//
// The valve (supabase/functions/nemesis-llm/index.ts) inlines a MIRROR of these two
// functions because it deploys as a single self-contained file. This copy is the
// canonical one — it is what the tests cover; change both together.

/** Which app made the request. `unknown` is a real bucket, never folded into web. */
export type ClientApp = "web" | "ios" | "desktop" | "unknown";

/** Raw provider-reported token split for one completion. */
export interface TokenSplit {
  /** prompt_tokens — INCLUSIVE of cache hits on DeepSeek/GLM (OpenAI convention). */
  promptTokens: number;
  completionTokens: number;
  /** prompt_cache_hit_tokens; 0 when the provider didn't report one. */
  cacheHitTokens: number;
}

/** Provider list price in USD per 1M tokens. */
export interface ModelPrice {
  inputPerM: number;
  /** Price for the cached (already-seen prefix) share of the input. */
  cachedInputPerM: number;
  outputPerM: number;
}

/**
 * Price list revision. Stamped onto every event so a later price change can never
 * silently rewrite what past months cost — a re-price is a NEW rev, not an edit.
 * Sources checked 2026-07-24: api-docs.deepseek.com/quick_start/pricing and
 * docs.z.ai/guides/overview/pricing.
 */
export const PRICE_REV = "2026-07-24";

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  "deepseek-v4-flash": { cachedInputPerM: 0.0028, inputPerM: 0.14, outputPerM: 0.28 },
  "deepseek-v4-pro": { cachedInputPerM: 0.003625, inputPerM: 0.435, outputPerM: 0.87 },
  // Only models whose price was read off the provider's own page go in here. An
  // unlisted model (a GLM_MODEL override, a new DeepSeek tier) reports as UNPRICED
  // rather than free — see CostResult.priced.
  "glm-5.2": { cachedInputPerM: 0.26, inputPerM: 1.4, outputPerM: 4.4 },
};

export interface CostResult {
  /** USD for this one call, or null when the model isn't in the price list. */
  usd: number | null;
  /** False when the model is unpriced — the report must show these as a COUNT of
   *  unpriced calls, never as $0.00, or new models silently read as free. */
  priced: boolean;
}

/**
 * Dollar cost of one completion. Cache-hit tokens are billed at the cached rate and
 * the remainder of the prompt at the miss rate (DeepSeek and GLM both report
 * prompt_tokens inclusive of the cached share). Defensive against a provider that
 * reports more cached tokens than prompt tokens.
 */
export function costUsd(model: string, split: TokenSplit): CostResult {
  const price = PRICES[model.toLowerCase()];
  if (!price) return { priced: false, usd: null };

  const prompt = Math.max(0, split.promptTokens);
  const cached = Math.min(Math.max(0, split.cacheHitTokens), prompt);
  const missed = prompt - cached;
  const output = Math.max(0, split.completionTokens);

  const usd =
    (missed * price.inputPerM + cached * price.cachedInputPerM + output * price.outputPerM) / 1_000_000;

  // Nine decimals (nano-dollars): a fully-cached cheap turn costs a few MILLIONTHS of
  // a dollar, so rounding at 6 would quantise the common case into noise. Rounding at
  // all keeps float dust from accumulating across millions of rows.
  return { priced: true, usd: Math.round(usd * 1e9) / 1e9 };
}

/** Device-key labels the clients mint themselves with (apps/web, apps/mobile, desktop). */
const LABEL_CLIENTS: ReadonlyArray<readonly [RegExp, ClientApp]> = [
  [/iphone|ipad|ios/i, "ios"],
  [/web/i, "web"],
  [/desktop|mac/i, "desktop"],
];

/**
 * Which app is calling. The explicit `X-Nemesis-Client` header wins; the device-key
 * label is the fallback that makes existing installs (and the desktop app, which
 * sends no header) attributable without shipping them anything.
 */
export function resolveClient(header: string | null, keyLabel: string | null): ClientApp {
  const declared = (header ?? "").trim().toLowerCase();
  if (declared === "web" || declared === "ios" || declared === "desktop") return declared;

  const label = keyLabel ?? "";
  for (const [pattern, client] of LABEL_CLIENTS) {
    if (pattern.test(label)) return client;
  }

  return "unknown";
}
