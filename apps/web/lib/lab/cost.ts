/**
 * What one model call cost, for the Lab's debug panel.
 *
 * 🔴🔴 THIS IS A MIRROR OF `supabase/functions/_shared/llm-cost.ts`, AND IT EXISTS BECAUSE THE
 * DEPLOYED BUILD CANNOT SEE THAT FILE. The obvious version of this module was a one-line import
 * reaching across the repo into the Deno function directory. `tsc` followed it, Turbopack dev
 * resolved it, and a local `pnpm build` — run from a full checkout — succeeded. Vercel builds from a
 * PRUNED workspace in which `supabase/functions/` is simply not present, so the deployment failed
 * with `module-not-found` at `turns.ts:17` and took the whole web app's build down with it. Three
 * green checks locally, one red where it counts.
 *
 * 🔴 SO THE COPY IS DELIBERATE, AND IT IS SELF-CHECKING RATHER THAN TRUSTED. `cost.test.ts` imports
 * the canonical module — which it can, because tests run from the full checkout — and asserts that
 * the price table and the arithmetic here agree with it exactly. The valve already keeps a third
 * mirror of these functions for the same deployment reason, documented and unenforced; this one
 * cannot drift without a test going red.
 *
 * 🔴 AND AN UNPRICED MODEL RETURNS `null`, NEVER `0`. A new tier that nobody has priced must read
 * as "we do not know what this cost", because a panel showing `$0.00` for it would report the one
 * thing that is certainly false.
 *
 * PURE. No I/O.
 */

/** Raw provider-reported token split for one completion. */
export interface LabTokenSplit {
  /** `prompt_tokens` — INCLUSIVE of cache hits on DeepSeek and GLM, the OpenAI convention. */
  promptTokens: number;
  completionTokens: number;
  /** `prompt_cache_hit_tokens`; 0 when the provider did not report one. */
  cacheHitTokens: number;
}

interface LabModelPrice {
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
}

/**
 * Provider list price in USD per 1M tokens, keyed on the model that ANSWERED.
 *
 * 🔴 NOT ON THE MODEL WE ASKED FOR. The client requests `deepseek-chat`; the valve maps it and
 * reports what actually answered. Pricing the requested name would price nothing at all.
 */
export const LAB_PRICES: Readonly<Record<string, LabModelPrice>> = {
  "deepseek-v4-flash": { cachedInputPerM: 0.0028, inputPerM: 0.14, outputPerM: 0.28 },
  "deepseek-v4-pro": { cachedInputPerM: 0.003625, inputPerM: 0.435, outputPerM: 0.87 },
  "glm-5.2": { cachedInputPerM: 0.26, inputPerM: 1.4, outputPerM: 4.4 },
};

export interface LabCostResult {
  /** USD for this one call, or `null` when the model is not in the price list. */
  usd: number | null;
  /** `false` when the model is unpriced. The panel must show these as unpriced, never as $0.00. */
  priced: boolean;
}

/** Dollar cost of one completion. Cache-hit tokens bill at the cached rate, the rest at the miss rate. */
export function labCostUsd(model: string, split: LabTokenSplit): LabCostResult {
  const price = LAB_PRICES[model.toLowerCase()];
  if (!price) return { priced: false, usd: null };

  const prompt = Math.max(0, split.promptTokens);
  const cached = Math.min(Math.max(0, split.cacheHitTokens), prompt);
  const missed = prompt - cached;
  const output = Math.max(0, split.completionTokens);

  const usd =
    (missed * price.inputPerM + cached * price.cachedInputPerM + output * price.outputPerM) / 1_000_000;

  // Nine decimals, as the canonical module does: a fully cached cheap turn costs millionths of a
  // dollar, and rounding at six would quantise the common case into noise.
  return { priced: true, usd: Math.round(usd * 1e9) / 1e9 };
}
