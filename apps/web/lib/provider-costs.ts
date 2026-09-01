/**
 * THE CANONICAL PROVIDER COST REGISTRY. Every rate Nemesis pays, in one table.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
 *
 * Provider rates lived in four places that disagreed: `workload-cost.ts` had a
 * model table and two audio tables, `chat-economics.ts` had its own
 * `SEARCH_UNIT_COST_USD` and `LIVE_TRANSCRIPTION_HOURLY_COST_USD`,
 * `cost-report.ts` had a third audio table, and `_shared/voice-cost.ts` had a
 * fourth. Two of them still priced a provider the product had already stopped
 * using. A margin computed from any one of them was a margin computed from a
 * different set of numbers than the next one.
 *
 * There is one table now, and the modules above read it.
 *
 * ── PROVENANCE IS PART OF THE RATE ────────────────────────────────────────────
 *
 * Every row carries a `basis`, because "what does this cost" and "how do we know"
 * are different questions and the second one is the one that goes stale:
 *
 *   mirrored   the same number exists in shipped code, and a test reads that file
 *              and fails on divergence. The strongest kind.
 *   published  read off the provider's own price list on `checked`. Nothing in
 *              this repo can detect a change; re-read before trusting a margin.
 *   assumed    a planning figure with NO source. It is in the model so a total
 *              exists, and every total it touches must be reported as synthetic.
 *
 * 🔴 A MARGIN BUILT ON AN `assumed` ROW IS A HYPOTHESIS. `syntheticProviders()`
 * exists so a report can say which of its lines are which, rather than printing
 * one confident number over a mixture.
 */

export const COST_REGISTRY_REV = "2026-08-18";

/**
 * The forward-looking Nemesis stack.
 *
 * 🔴 THIS LIST IS THE PRODUCT, NOT THE HISTORY. AssemblyAI, Groq and the batch
 * lecture-transcription lane are NOT here: Nemesis no longer sells recorded
 * lectures, so leaving them in the canonical model would price a product that is
 * not for sale and hide the real xAI conversational cost behind it. They are
 * still costable — see RETIRED_RATES — because the routes still exist and a
 * historical usage row still has to be priceable.
 */
export type Provider =
  | "deepseek"
  | "gemini"
  | "mistral"
  | "llamaparse"
  | "brave"
  | "xai_stt"
  | "xai_tts"
  | "azure_tts"
  | "azure_pronunciation"
  | "vercel"
  | "supabase"
  | "stripe";

export const PROVIDER_ROLE: Readonly<Record<Provider, string>> = {
  // 🔴 AZURE WAS MISSING FROM THIS TABLE ENTIRELY UNTIL 2026-08-31, and the owner is the one who
  // caught it: *"for the voices, you didn't really mention Azure because we use Azure for the
  // language pronunciation scoring and also the language dialects accents."* He is right, and the
  // omission is not cosmetic — it is the one lane where a cost model that reports "voice" as a
  // single xAI line is describing a product we do not ship. `speech-route.ts` has routed the target
  // language to Azure since §43 (`TARGET_LANGUAGE_PROVIDER = "azure"`), because only its catalogue
  // can name a dialect; and `azure/pronunciation.ts` scores what the learner says back, which xAI
  // cannot do at all.
  azure_pronunciation: "Pronunciation scoring, in the language being learned",
  azure_tts: "Target-language speech, in a named dialect",
  brave: "Web search",
  deepseek: "Teaching, reasoning and learning orchestration",
  gemini: "Image, diagram, figure and handwriting understanding",
  llamaparse: "Complex Office/PPTX/DOCX parsing escalation",
  mistral: "PDF/OCR escalation",
  stripe: "Payment processing",
  supabase: "Database, storage and egress",
  vercel: "Application compute",
  xai_stt: "Conversational speech in",
  xai_tts: "Conversational speech out",
};

export type Basis = "mirrored" | "published" | "assumed";

export type Unit =
  | "per_million_input_tokens"
  | "per_million_cached_input_tokens"
  | "per_million_output_tokens"
  | "per_page"
  | "per_image"
  | "per_hour"
  | "per_million_characters"
  | "per_query"
  | "per_subscriber_month"
  | "percent_of_revenue"
  | "per_transaction";

export interface ProviderRate {
  provider: Provider;
  /** The model or service billed, as the provider names it. */
  service: string;
  unit: Unit;
  usd: number;
  basis: Basis;
  /** Where the number came from. A file path for `mirrored`, a URL for `published`. */
  source: string;
  checked: string;
}

/**
 * 🔴 THE ONE TABLE. Keyed by `provider:service:unit` so a rate can be looked up
 * from a usage row without a switch statement anywhere else in the codebase.
 */
export const RATES: readonly ProviderRate[] = [
  // ── Azure AI Speech. The language lane, and ONLY the language lane. ──
  //
  // 🔴 THE OWNER DREW THIS SCOPE HIMSELF, TWICE, 2026-08-31: *"the reason we added Azure is so that
  // we can have language learnings with, like, actual, correct accents and pronunciation scoring.
  // That's pretty much the only reason."* And on what it is NOT: *"we're not going to do actual
  // real time voice… we're just allowing users to hear how things sound, like specific things, but
  // not necessarily for actually reading out loud the entire response. I feel like that would be a
  // bit wasteful."*
  //
  // That scope is what makes these rates cheap in practice: TTS is billed per CHARACTER, and a
  // learner pressing play on one example sentence spends about a hundred of them. The same rate
  // against a read-aloud of every answer would be a different product and a different bill, which
  // is the trade he was refusing.
  //
  // 🔴 PUBLISHED, NOT ASSUMED, SINCE 2026-08-31 — and the pronunciation number went UP when it was
  // actually read. Assessment is not plain speech-to-text: it is real-time transcription at $1.00
  // an hour PLUS a $0.30 prosody add-on billed per feature per hour. The planning figure here was
  // $1.00 and it was 30% light.
  //
  // 🔴 STILL LIST PRICE. Azure's free grant (500k characters a month) and its commitment tiers
  // (down to about $7.50 per million characters) would both make these smaller; neither is claimed
  // here, because nobody has read which tier this account is on. Every number in this table errs
  // toward costing more, never less.
  { basis: "published", checked: "2026-08-31", provider: "azure_tts", service: "neural TTS", source: "azure.microsoft.com/pricing/details/speech -- prebuilt neural voices, pay-as-you-go; HD voices are $22 and are not used", unit: "per_million_characters", usd: 16 },
  { basis: "published", checked: "2026-08-31", provider: "azure_pronunciation", service: "pronunciation assessment", source: "azure.microsoft.com/pricing/details/speech -- real-time STT $1.00/hr plus the $0.30/hr prosody add-on, billed in one-second increments", unit: "per_hour", usd: 1.3 },

  // ── DeepSeek. Mirrored from the valve's own price list, guarded by a test. ──
  { basis: "mirrored", checked: "2026-07-24", provider: "deepseek", service: "deepseek-v4-flash", source: "supabase/functions/_shared/llm-cost.ts", unit: "per_million_input_tokens", usd: 0.14 },
  { basis: "mirrored", checked: "2026-07-24", provider: "deepseek", service: "deepseek-v4-flash", source: "supabase/functions/_shared/llm-cost.ts", unit: "per_million_cached_input_tokens", usd: 0.0028 },
  { basis: "mirrored", checked: "2026-07-24", provider: "deepseek", service: "deepseek-v4-flash", source: "supabase/functions/_shared/llm-cost.ts", unit: "per_million_output_tokens", usd: 0.28 },
  { basis: "mirrored", checked: "2026-07-24", provider: "deepseek", service: "deepseek-v4-pro", source: "supabase/functions/_shared/llm-cost.ts", unit: "per_million_input_tokens", usd: 0.435 },
  { basis: "mirrored", checked: "2026-07-24", provider: "deepseek", service: "deepseek-v4-pro", source: "supabase/functions/_shared/llm-cost.ts", unit: "per_million_cached_input_tokens", usd: 0.003625 },
  { basis: "mirrored", checked: "2026-07-24", provider: "deepseek", service: "deepseek-v4-pro", source: "supabase/functions/_shared/llm-cost.ts", unit: "per_million_output_tokens", usd: 0.87 },
  // 🔴 DEEPSEEK VISION IS PRICED AT THE PUBLISHED PEAK RATE, DELIBERATELY THE EXPENSIVE READING.
  // DeepSeek halves these outside 01:00-04:00 and 06:00-10:00 UTC weekdays; a single-rate table
  // cannot carry a clock, and after gemini vision was found under-recorded ~150x the standing rule
  // is that an estimate may only ever err toward looking MORE expensive than reality. Basis is
  // "published" rather than "mirrored" because these calls go to DeepSeek directly from the web
  // server (lib/vision/deepseek.ts) — the valve's llm-cost.ts never sees them.
  { basis: "published", checked: "2026-08-23", provider: "deepseek", service: "deepseek-v4-flash-vision-exp", source: "api-docs.deepseek.com/quick_start/pricing -- peak rate; off-peak is half", unit: "per_million_input_tokens", usd: 0.44 },
  { basis: "published", checked: "2026-08-23", provider: "deepseek", service: "deepseek-v4-flash-vision-exp", source: "api-docs.deepseek.com/quick_start/pricing -- peak rate; off-peak is half", unit: "per_million_cached_input_tokens", usd: 0.014 },
  { basis: "published", checked: "2026-08-23", provider: "deepseek", service: "deepseek-v4-flash-vision-exp", source: "api-docs.deepseek.com/quick_start/pricing -- peak rate; off-peak is half", unit: "per_million_output_tokens", usd: 1.32 },

  // ── Gemini. 🔴 THE WEAKEST ROW IN THE TABLE, AND THE ONE THAT MATTERS MOST. ──
  //
  // Vision is the only primitive in the product with NO meter on it: nothing
  // counts how many images a user sends, so there is no measured cost per user
  // and no way to compute one from what is stored today. The figure below is a
  // planning assumption built from a slide-sized image (~1,300 input tokens plus
  // a short transcript out) at flash-class rates. Every scenario that includes it
  // is a hypothesis, and `syntheticProviders()` says so.
  //
  // WHAT WOULD MAKE IT REAL: record a `gemini` billable operation per vision call
  // with its input/output token counts, which the API already returns. That is
  // the single highest-value instrumentation gap in this file.
  // 🔴 0.0000258, NOT 0.002. THIS WAS SEVENTY-SEVEN TIMES TOO HIGH and it was the
  // single largest error in the document economics. The old row was honest about
  // being a guess (`basis: "assumed"`) and the guess was simply wrong: Gemini does
  // not bill per image at all, it bills the image as INPUT TOKENS, and an image at
  // the ceiling this parser downscales to is ~258 of them. 258 tokens at
  // Flash-Lite's published input rate is $0.0000258. Derivation and caveat come
  // from apps/web/lib/cost/ai-spend.ts, which read ai.google.dev/pricing on the
  // same day and now takes this row as its source rather than keeping a second one.
  //
  // If image pricing ever stops being token-shaped, this row is wrong and every
  // vision column with it.
  { basis: "published", checked: "2026-08-18", provider: "gemini", service: "gemini-3.5-flash vision", source: "ai.google.dev/pricing -- Flash-Lite input rate x ~258 tokens per downscaled image", unit: "per_image", usd: 0.0000258 },

  // ── Parsers. Per page, and only on the pages that escalate. ────────────────
  { basis: "published", checked: "2026-08-18", provider: "mistral", service: "mistral-ocr", source: "mistral.ai/pricing, $1 per 1,000 pages", unit: "per_page", usd: 0.001 },
  // 3 credits a page on the cost_effective tier, measured on the owner's own
  // coursework -- see LLAMA_DEFAULT_TIER in lib/notebooks/llamaparse-ocr.ts.
  // The tier the parser ACTUALLY sends (`LLAMA_DEFAULT_TIER`), measured on real
  // coursework: 3 credits/page. A "balanced tier, 1 credit/page" reading of the
  // price list gives $0.001 and understates this lane by 3.75x, because that is
  // not the tier this code uses.
  { basis: "mirrored", checked: "2026-08-18", provider: "llamaparse", service: "cost_effective", source: "apps/web/lib/notebooks/llamaparse-ocr.ts", unit: "per_page", usd: 0.00375 },

  // ── Brave. Web research. ──────────────────────────────────────────────────
  { basis: "published", checked: "2026-08-18", provider: "brave", service: "search", source: "brave.com/search/api", unit: "per_query", usd: 0.005 },

  // ── xAI. CONVERSATION, not lecture transcription. ─────────────────────────
  { basis: "mirrored", checked: "2026-07-28", provider: "xai_stt", service: "grok-stt", source: "supabase/functions/_shared/voice-cost.ts", unit: "per_hour", usd: 0.1 },
  { basis: "mirrored", checked: "2026-07-28", provider: "xai_tts", service: "grok-tts", source: "supabase/functions/nemesis-speak/index.ts", unit: "per_million_characters", usd: 4.2 },

  // ── Infrastructure. Flat per subscriber, and it does not shrink on Free. ──
  //
  // 🔴 THE TOTAL IS CARRIED, THE SPLIT IS INVENTED. $1.17 a subscriber-month is
  // the worst-case platform figure carried from the earlier voice-economics work
  // and is the number every previous margin in this repo used. Splitting it
  // between Vercel and Supabase is what makes a per-provider breakdown possible
  // at all, and nothing measures where the $1.17 actually goes. Trust the sum;
  // do not quote either half on its own.
  { basis: "assumed", checked: "2026-08-18", provider: "vercel", service: "fluid compute", source: "split of the carried $1.17 platform figure", unit: "per_subscriber_month", usd: 0.55 },
  { basis: "assumed", checked: "2026-08-18", provider: "supabase", service: "database, storage, egress", source: "split of the carried $1.17 platform figure", unit: "per_subscriber_month", usd: 0.62 },

  // ── Stripe. ───────────────────────────────────────────────────────────────
  { basis: "published", checked: "2026-08-18", provider: "stripe", service: "card", source: "stripe.com/pricing", unit: "percent_of_revenue", usd: 0.029 },
  { basis: "published", checked: "2026-08-18", provider: "stripe", service: "card", source: "stripe.com/pricing", unit: "per_transaction", usd: 0.3 },
];

/**
 * Providers the product no longer routes to.
 *
 * 🔴 PRESERVED, NOT CANONICAL. `live-audio/token` still mints AssemblyAI
 * streaming tokens and `nemesis-transcribe` still has a Groq fallback, so a
 * usage row can still name them and must still be priceable. They are excluded
 * from `RATES` so nothing forward-looking can accidentally build a Nemesis
 * margin out of a lane Nemesis does not sell.
 */
export const RETIRED_RATES: readonly Omit<ProviderRate, "provider">[] = [
  { basis: "mirrored", checked: "2026-07-27", service: "assemblyai_streaming", source: "apps/web/lib/cost-report.ts", unit: "per_hour", usd: 0.15 },
  { basis: "mirrored", checked: "2026-07-27", service: "assemblyai_batch_universal2", source: "supabase/functions/_shared/voice-cost.ts", unit: "per_hour", usd: 0.17 },
  { basis: "mirrored", checked: "2026-07-27", service: "assemblyai_batch", source: "supabase/functions/_shared/voice-cost.ts", unit: "per_hour", usd: 0.23 },
  { basis: "mirrored", checked: "2026-07-27", service: "groq_whisper_turbo", source: "supabase/functions/_shared/voice-cost.ts", unit: "per_hour", usd: 0.04 },
];

function key(provider: Provider, service: string, unit: Unit): string {
  return `${provider}:${service}:${unit}`;
}

const BY_KEY: ReadonlyMap<string, ProviderRate> = new Map(
  RATES.map((rate) => [key(rate.provider, rate.service, rate.unit), rate]),
);

/** The rate for one billable thing. Throws rather than returning zero: a missing
 *  rate silently costing nothing is how a provider disappears from a margin. */
export function rateFor(provider: Provider, service: string, unit: Unit): ProviderRate {
  const found = BY_KEY.get(key(provider, service, unit));
  if (!found) throw new Error(`no rate for ${key(provider, service, unit)}`);
  return found;
}

export function usdFor(provider: Provider, service: string, unit: Unit, quantity: number): number {
  return rateFor(provider, service, unit).usd * quantity;
}

/** Which providers in this table are priced from an assumption rather than a
 *  source. Anything totalling across one of these is synthetic and must say so. */
export function syntheticProviders(): Provider[] {
  return [...new Set(RATES.filter((rate) => rate.basis === "assumed").map((rate) => rate.provider))];
}

// ── The billable operation ───────────────────────────────────────────────────

/**
 * One thing Nemesis paid a provider to do, for one user.
 *
 * 🔴 THE SHAPE EXISTS BEFORE THE TABLE DOES, DELIBERATELY. This is what a usage
 * row has to carry for "what did this subscriber actually cost us this calendar
 * month?" to be answerable by a query rather than by an estimate. Today only
 * some lanes record anything at all (tokens, search units, voice seconds go into
 * `usage_counters`; Gemini vision records nothing). Writing the shape down is
 * what makes the gaps nameable — see `syntheticProviders()` and the report.
 *
 * `plan` and `interval` are stamped ON THE ROW rather than joined at read time
 * because a subscriber who upgrades mid-month must not have their earlier free
 * usage re-attributed to the paid plan.
 */
export interface BillableOperation {
  userId: string;
  /** The canonical plan at the moment of the operation: `free` or `nemesis`. */
  plan: string;
  /** `monthly` | `annual` | null when not paying. NEVER read to decide access. */
  interval: string | null;
  provider: Provider;
  service: string;
  /** What was being done: `teach_turn`, `ocr_page`, `vision_page`, `search`,
   *  `speak`, `listen`. Free text so a new lane can record before this file
   *  learns about it. */
  operation: string;
  inputUnits?: number;
  outputUnits?: number;
  cachedUnits?: number;
  pages?: number;
  images?: number;
  minutes?: number;
  searches?: number;
  /** What it cost. `estimated` when derived from this table, `actual` when the
   *  provider reported a figure. */
  usd: number;
  usdBasis: "estimated" | "actual";
  /** The document, canvas or session it belonged to, when there is one. */
  sourceId?: string | null;
  at: string;
}

/**
 * What one document ingestion cost, and where it went.
 *
 * 🔴 THE POINT IS THE FIRST THREE FIELDS TOGETHER. `locallyExtractedPages`
 * against `mistralPages + llamaParsePages + geminiPages` is the whole
 * cheap-first argument expressed as a number: if the local reader is doing its
 * job, the paid lanes see a small minority of a document. A rise in that ratio
 * is a cost regression that no per-call rate change would reveal.
 */
export interface IngestionCostRecord {
  sourceId: string;
  userId: string;
  totalPages: number;
  locallyExtractedPages: number;
  mistralPages: number;
  llamaParsePages: number;
  geminiPages: number;
  cacheHits: number;
  usd: number;
}

/** What an ingestion cost, from the page counts alone. */
export function ingestionUsd(record: Omit<IngestionCostRecord, "usd" | "sourceId" | "userId">): number {
  return round(
    usdFor("mistral", "mistral-ocr", "per_page", record.mistralPages)
    + usdFor("llamaparse", "cost_effective", "per_page", record.llamaParsePages)
    + usdFor("gemini", "gemini-3.5-flash vision", "per_image", record.geminiPages),
    4,
  );
}

/** Share of a document that never reached a paid provider. 1 means free to read. */
export function localExtractionShare(record: { totalPages: number; locallyExtractedPages: number }): number {
  if (record.totalPages <= 0) return 1;
  return round(record.locallyExtractedPages / record.totalPages, 4);
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
