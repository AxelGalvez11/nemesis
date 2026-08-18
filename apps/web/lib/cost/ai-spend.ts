/**
 * What Nemesis spent, on what, for whom, and against which piece of their work.
 *
 * 🔴🔴 THIS EXTENDS THE LEDGER THAT EXISTS. IT DOES NOT BUILD A SECOND ONE. `usage_events` already
 * carries `cost_usd`, `price_rev` and `provider` in its metadata for the two lanes that had them —
 * the model valve (`nemesis-llm`) and web search (`nemesis-search`) — and `consume_usage` writes
 * into it from SQL. A parallel `ai_costs` table would mean two answers to "what did this month
 * cost", and the first person to query the wrong one would be confidently wrong.
 *
 * What was genuinely missing is not a table. It is:
 *
 *   1. THREE PROVIDERS THAT WERE COUNTED NOWHERE AT ALL. Mistral OCR and LlamaParse are billed per
 *      page and no column, log line or metric has ever recorded a page of either. Gemini vision is
 *      counted in UNITS (`library_sources.vision_units_spent`, `vision_usage`) with no price
 *      anywhere, deliberately — `docs/vision-cost.md` says why — which answers "how much did we
 *      look" and not "what did that cost".
 *   2. A SCOPE. Every existing row is keyed to a person and a day. None of them can say WHICH
 *      SOURCE, which canvas or which session, so "why did this lecture cost forty cents" had no
 *      query behind it.
 *
 * So: same table, same shape, new `event_type`s, and a `scope` in the metadata that every writer
 * fills in. One query joins the lot.
 *
 * 🔴 PRICES ARE DATED AND A RE-PRICE IS A NEW REVISION, NEVER AN EDIT. Exactly as `llm-cost.ts` and
 * `voice-cost.ts` do it: `PRICE_REV` is stamped on every row, so changing a rate cannot silently
 * rewrite what last month cost.
 *
 * 🔴 AND AN UNPRICED PROVIDER REPORTS AS UNPRICED, NEVER AS FREE. The single most misleading thing
 * a cost system can do is show a new provider as $0.00. `priced: false` is a countable state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Price list revision. Sources read on this date:
 *   mistral.ai/pricing          — OCR 4, $4 per 1,000 pages; OCR 3, $2; the original OCR, $1
 *   developers.llamaindex.ai/llamaparse/general/pricing
 *                               — LlamaParse, credits per page BY TIER; $1.25 per 1,000 credits
 *   ai.google.dev/pricing       — Gemini Flash-Lite, an image is ~258 input tokens
 *
 * 🔴🔴 REVISION `b` EXISTS BECAUSE REVISION ONE WAS WRONG IN THE DIRECTION THAT MATTERS, ON BOTH
 * PAID PARSERS, BY ABOUT FOUR TIMES. It priced Mistral at $1 per 1,000 pages — the ORIGINAL OCR
 * model's rate — while this codebase asks for `mistral-ocr-latest`, an alias that by design
 * resolves to the vendor's current generation, which is OCR 4 at $4. And it priced LlamaParse at
 * one credit per page, the rate for parsing with no model at all, while `LLAMA_DEFAULT_TIER` is
 * `cost_effective` at three — a number this repository already had written down, in
 * `llamaparse-ocr.ts`, as "3 credits/page (~$0.00375)". The price table and the parser disagreed
 * with each other in the same file tree.
 *
 * 🔴 UNDER-REPORTING IS THE FAILURE MODE A COST SYSTEM MUST NOT HAVE, AND IT IS NOT SYMMETRIC WITH
 * OVER-REPORTING. A bill that reads low makes every saving look smaller than it is, so the work
 * that avoids a paid call looks less worth doing than it is, and the cap that bounds a runaway is
 * set against a number four times too small. Everything below therefore rounds AGAINST us.
 *
 * 🔴 AND A RE-PRICE IS A NEW REVISION, NEVER AN EDIT — including this one, on the same day. Rows
 * already written carry `2026-08-18` and keep meaning what they meant; rows written from now carry
 * `2026-08-18b`. A report that mixes them can see that it is mixing them.
 */
export const PRICE_REV = "2026-08-18b";

/** Providers this module prices. Every one is billed per UNIT, and the unit is named. */
export type SpendProvider =
  /** Mistral OCR. One unit is one page of the document it was handed. */
  | "mistral_ocr"
  /** LlamaParse. One unit is one page. */
  | "llamaparse"
  /** Gemini vision. One unit is one image or one PDF page — the same unit `VisionLedger` counts. */
  | "gemini_vision";

/**
 * What one LlamaParse credit costs, in USD.
 *
 * LlamaParse bills in credits, not pages, and the two are related by the TIER that was requested.
 * Keeping the conversion separate from the tier table means a change to the credit price and a
 * change to a tier's credit cost are two different edits, and neither can be mistaken for the other.
 */
export const USD_PER_LLAMA_CREDIT = 0.00125;

/**
 * Credits per page, by the tier name this codebase sends in the `tier` form field.
 *
 * 🔴 THE TIER IS RECORDED, SO LLAMAPARSE COST IS EXACTLY KNOWABLE. `parse-document.ts` mints
 * `llamaparse/<tier>@<version>`, which means every stored parse says which tier read it and the
 * arithmetic below is a fact rather than an estimate. This is the good case, and it is worth naming
 * because the other paid parser is not like this.
 */
export const LLAMA_COST_EFFECTIVE_CREDITS = 3;

export const LLAMA_CREDITS_PER_PAGE: Readonly<Record<string, number>> = {
  agentic: 15,
  cost_effective: LLAMA_COST_EFFECTIVE_CREDITS,
  fast: 5,
  premium: 60,
};

/**
 * USD per page, by Mistral OCR generation.
 *
 * 🔴🔴 AND THE ONE WE ACTUALLY ASK FOR IS NOT IN THIS TABLE, WHICH IS THE POINT. We send
 * `mistral-ocr-latest`, and `MistralOcrResponse.model` echoes that alias straight back rather than
 * resolving it — verified on four real calls, and documented as such in `mistral-ocr.ts`. So the
 * stored provenance of every Mistral-read document in this product records WHAT WE ASKED FOR and
 * cannot say WHAT RAN. Three parses in production carry `mistral/mistral-ocr-latest` and there is
 * no way, from our own records, to know whether they were billed at $1, $2 or $4 per thousand.
 *
 * That is a genuine gap, and the honest response is not to guess the cheap end. See
 * `mistralCeilingUsd`.
 */
export const MISTRAL_PAGE_USD: Readonly<Record<string, number>> = {
  "mistral-ocr-2503": 0.001,
  "mistral-ocr-3": 0.002,
  "mistral-ocr-4": 0.004,
  "ocr-3": 0.002,
  "ocr-4": 0.004,
};

/**
 * What an unresolvable Mistral request costs, for accounting purposes: the dearest generation we
 * know the vendor sells.
 *
 * 🔴 A CEILING, DELIBERATELY, AND IT WILL SOMETIMES OVERSTATE. If the alias happens to resolve to
 * an older generation we will report up to four times what the call really cost. That is the error
 * to prefer: a cost report that is too high gets investigated, and a cost report that is too low
 * gets believed. `SpendResult.basis` marks these rows so a reader can tell an estimate from a fact.
 *
 * 🔴 THE REAL FIX IS TO PIN THE MODEL, AND THAT IS NOT AN ACCOUNTING DECISION. Sending an explicit
 * version instead of the alias would make this exact — and would also freeze the parse quality of
 * a live lane at whatever that version does, giving up the automatic upgrade `mistral-ocr.ts`
 * argues for on purpose. Trading parse quality for accounting precision is the owner's call, so
 * this module makes the bill honest and leaves the lane alone.
 */
export const mistralCeilingUsd = 0.004;

/**
 * USD per unit when the exact model or tier is not known — the CEILING for that provider.
 *
 * 🔴 THE VISION NUMBER IS THE ONE TO DISTRUST FIRST, AND IT SAYS SO HERE RATHER THAN IN A
 * DOCUMENT NOBODY OPENS. Gemini bills images as INPUT TOKENS, not as images, so a per-image price
 * is an average over a token count that varies with resolution. 258 tokens at Flash-Lite's input
 * rate is the published arithmetic and it is right to within a rounding error for the images this
 * parser sends, which are all downscaled to the same ceiling. If image pricing ever stops being
 * token-shaped, this row is wrong and the whole vision column with it.
 */
export const UNIT_PRICE_USD: Readonly<Record<SpendProvider, number>> = {
  gemini_vision: 0.0000258,
  // The tier we default to. A call whose tier we DID record is priced from the tier instead.
  llamaparse: LLAMA_COST_EFFECTIVE_CREDITS * USD_PER_LLAMA_CREDIT,
  mistral_ocr: mistralCeilingUsd,
};

/** Was this row priced from the thing that actually ran, or from a ceiling standing in for it? */
export type PriceBasis = "exact" | "ceiling" | "unpriced";

export interface SpendResult {
  /** USD, or null when the provider is not in the price list. */
  readonly usd: number | null;
  /** False when unpriced. An unpriced call must be COUNTED, never treated as $0.00. */
  readonly priced: boolean;
  /** `exact` when the model/tier that ran is known and priced; `ceiling` when it is standing in. */
  readonly basis: PriceBasis;
}

/**
 * The per-unit price for a provider, given whatever the caller knows about which model ran.
 *
 * `model` is the stored provenance string — `mistral/mistral-ocr-latest`,
 * `llamaparse/cost_effective@latest` — or bare. PURE.
 */
export function unitPriceUsd(provider: string, model?: string): { price: number | null; basis: PriceBasis } {
  const named = (model ?? "").trim();

  if (provider === "llamaparse") {
    // `llamaparse/<tier>@<version>`, and either affix may be missing.
    const tier = named.replace(/^llamaparse\//, "").split("@")[0] ?? "";
    const credits = LLAMA_CREDITS_PER_PAGE[tier];
    if (credits !== undefined) return { basis: "exact", price: credits * USD_PER_LLAMA_CREDIT };
    return { basis: "ceiling", price: UNIT_PRICE_USD.llamaparse };
  }

  if (provider === "mistral_ocr") {
    const generation = named.replace(/^mistral\//, "");
    const exact = MISTRAL_PAGE_USD[generation];
    if (exact !== undefined) return { basis: "exact", price: exact };
    // Includes `mistral-ocr-latest`, which is every real row we have.
    return { basis: "ceiling", price: mistralCeilingUsd };
  }

  const flat = UNIT_PRICE_USD[provider as SpendProvider];
  if (flat === undefined) return { basis: "unpriced", price: null };
  return { basis: "exact", price: flat };
}

/** What `units` of `provider` cost. PURE. */
export function unitCostUsd(provider: string, units: number, model?: string): SpendResult {
  const { basis, price } = unitPriceUsd(provider, model);
  if (price === null) return { basis: "unpriced", priced: false, usd: null };
  const safe = Number.isFinite(units) && units > 0 ? units : 0;
  // Nine decimals, matching `llm-cost.ts`: one cached image is worth millionths of a dollar and
  // rounding at six would quantise the common case into noise.
  return { basis, priced: true, usd: Math.round(safe * price * 1e9) / 1e9 };
}

/**
 * What piece of the learner's work this spend belongs to.
 *
 * 🔴 EVERY FIELD IS OPTIONAL AND AT LEAST ONE SHOULD BE PRESENT, WHICH IS NOT THE SAME AS SAYING
 * ANY OF THEM IS OPTIONAL IN PRACTICE. A row with no scope is a row that can be summed and cannot
 * be explained, and "why did this lecture cost forty cents" is the question this whole module
 * exists to answer.
 */
export interface SpendScope {
  readonly sourceId?: string;
  readonly canvasId?: string;
  readonly sessionId?: string;
  /** What was being done — `parse`, `figures`, `shadow-eval`, `page-escalation`. */
  readonly operation: string;
}

export interface SpendRecord {
  readonly userId: string;
  readonly provider: SpendProvider | string;
  readonly units: number;
  readonly scope: SpendScope;
  /** Which model or tier answered, when the provider has several. */
  readonly model?: string;
  /** Why this spend happened — a routing reason, an escalation reason. */
  readonly reason?: string;
  readonly durationMs?: number;
}

/**
 * Write one spend row.
 *
 * 🔴 NEVER THROWS, AND NEVER BLOCKS THE WORK IT IS ABOUT. Accounting that can fail a parse has cost
 * more than it will ever explain. A row that does not get written is a gap in a report; a parse
 * that does not happen is a student without their lecture.
 *
 * 🔴 `cost_credits: 0` ON PURPOSE. These rows are OUR bill, not the learner's meter. `usage_events`
 * serves both, and the entitlement counters read `counter_key`/`cost_credits`; a non-zero value
 * here would silently consume somebody's allowance for work they did not ask for — a shadow
 * evaluation, most obviously.
 */
export async function recordAiSpend(admin: SupabaseClient, record: SpendRecord): Promise<void> {
  const cost = unitCostUsd(record.provider, record.units, record.model);
  try {
    await admin.from("usage_events").insert({
      cost_credits: 0,
      counter_key: "ai_spend",
      event_type: `ai_spend_${record.provider}`,
      metadata: {
        cost_usd: cost.usd,
        operation: record.scope.operation,
        // 🔴 A READER MUST BE ABLE TO TELL A MEASURED DOLLAR FROM A STOOD-IN ONE. Every Mistral row
        // is a ceiling today, because the alias we send cannot be resolved from the response.
        price_basis: cost.basis,
        price_rev: PRICE_REV,
        priced: cost.priced,
        provider: record.provider,
        units: record.units,
        ...(record.model ? { model: record.model } : {}),
        ...(record.reason ? { reason: record.reason } : {}),
        ...(record.durationMs === undefined ? {} : { duration_ms: record.durationMs }),
        ...(record.scope.sourceId ? { source_id: record.scope.sourceId } : {}),
        ...(record.scope.canvasId ? { canvas_id: record.scope.canvasId } : {}),
        ...(record.scope.sessionId ? { session_id: record.scope.sessionId } : {}),
      },
      user_id: record.userId,
    });
  } catch (cause) {
    console.warn(JSON.stringify({
      event: "ai_spend_record_failed",
      detail: cause instanceof Error ? cause.message.slice(0, 160) : "unknown",
      provider: record.provider,
    }));
  }
}

/**
 * Which provider a `parsed_documents.parser_version` names, or null for our own reader.
 *
 * PURE. The provenance column is the only record of who read a document, so it is also the only
 * honest place to learn whether anybody was billed for it.
 */
export function providerOfParserVersion(parserVersion: string | undefined): SpendProvider | null {
  const value = (parserVersion ?? "").trim();
  if (value.startsWith("mistral/")) return "mistral_ocr";
  if (value.startsWith("llamaparse/")) return "llamaparse";
  return null;
}

/**
 * The most documents one learner may send to a paid parser in a UTC day.
 *
 * 🔴 SIZED AGAINST WHAT A DAY OF STUDY LOOKS LIKE, NOT AGAINST WHAT A BILL COULD SURVIVE. A heavy
 * learner uploads a week's lectures at once — six to ten files. Forty is far above any real day and
 * far below what a retry loop, a broken document or an automated re-import could otherwise cost:
 * at a thousand pages a day, which forty large lectures would be, this bounds one person's parser
 * bill at about a dollar.
 *
 * 🔴 AND IT BOUNDS DOCUMENTS RATHER THAN PAGES BECAUSE A PAGE COUNT IS ONLY KNOWN AFTER THE MONEY
 * IS SPENT — it comes back with the vendor's answer. A document is knowable before anything is
 * sent, and `MISTRAL_MAX_BYTES` already bounds how large one may be.
 */
export const DEFAULT_VENDOR_PARSE_DAILY_CAP = 40;

export function vendorParseDailyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt((env.VENDOR_PARSE_DAILY_CAP ?? "").trim(), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_VENDOR_PARSE_DAILY_CAP;
}
