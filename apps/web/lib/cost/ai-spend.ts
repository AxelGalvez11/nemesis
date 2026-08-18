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
 *   mistral.ai/pricing        — OCR, $1 per 1,000 pages
 *   cloud.llamaindex.ai/pricing — LlamaParse, 1 credit per page on the balanced tier,
 *                                $1 per 1,000 credits
 *   ai.google.dev/pricing     — Gemini Flash-Lite, an image is ~258 input tokens
 */
export const PRICE_REV = "2026-08-18";

/** Providers this module prices. Every one is billed per UNIT, and the unit is named. */
export type SpendProvider =
  /** Mistral OCR. One unit is one page of the document it was handed. */
  | "mistral_ocr"
  /** LlamaParse. One unit is one page. */
  | "llamaparse"
  /** Gemini vision. One unit is one image or one PDF page — the same unit `VisionLedger` counts. */
  | "gemini_vision";

/** USD per unit, at `PRICE_REV`. */
export const UNIT_PRICE_USD: Readonly<Record<SpendProvider, number>> = {
  // 🔴 THE VISION NUMBER IS THE ONE TO DISTRUST FIRST, AND IT SAYS SO HERE RATHER THAN IN A
  // DOCUMENT NOBODY OPENS. Gemini bills images as INPUT TOKENS, not as images, so a per-image price
  // is an average over a token count that varies with resolution. 258 tokens at Flash-Lite's input
  // rate is the published arithmetic and it is right to within a rounding error for the images this
  // parser sends, which are all downscaled to the same ceiling. If image pricing ever stops being
  // token-shaped, this row is wrong and the whole vision column with it.
  gemini_vision: 0.0000258,
  llamaparse: 0.001,
  mistral_ocr: 0.001,
};

export interface SpendResult {
  /** USD, or null when the provider is not in the price list. */
  readonly usd: number | null;
  /** False when unpriced. An unpriced call must be COUNTED, never treated as $0.00. */
  readonly priced: boolean;
}

/** What `units` of `provider` cost. PURE. */
export function unitCostUsd(provider: string, units: number): SpendResult {
  const price = UNIT_PRICE_USD[provider as SpendProvider];
  if (price === undefined) return { priced: false, usd: null };
  const safe = Number.isFinite(units) && units > 0 ? units : 0;
  // Nine decimals, matching `llm-cost.ts`: one cached image is worth millionths of a dollar and
  // rounding at six would quantise the common case into noise.
  return { priced: true, usd: Math.round(safe * price * 1e9) / 1e9 };
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
  const cost = unitCostUsd(record.provider, record.units);
  try {
    await admin.from("usage_events").insert({
      cost_credits: 0,
      counter_key: "ai_spend",
      event_type: `ai_spend_${record.provider}`,
      metadata: {
        cost_usd: cost.usd,
        operation: record.scope.operation,
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
