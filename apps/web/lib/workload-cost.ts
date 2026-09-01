/**
 * WHAT A NEMESIS SUBSCRIBER COSTS, AND WHAT IS LEFT.
 *
 * ── WHAT CHANGED, AND WHY THE OLD MODEL COULD NOT BE PATCHED ──────────────────
 *
 * This module used to be a recording-economics model. Its central question was
 * "how many hours of lecture audio can a plan afford", it carried three audio
 * rate tables, and its plan ladder was free / plus / pro with recording minutes
 * as the meter that separated them.
 *
 * Nemesis no longer sells lecture or meeting transcription (owner, 2026-08-18),
 * and there is one paid product rather than a ladder. Every one of those
 * assumptions is now wrong in the same direction: they price a product that is
 * not for sale, and they hide the cost of the one that is.
 *
 * ── WHAT THIS IS NOW ──────────────────────────────────────────────────────────
 *
 * Two plans, a handful of named scenarios, and a per-provider breakdown of what
 * each costs. Every rate comes from lib/provider-costs.ts, which is the ONLY
 * place a provider price is written.
 *
 * 🔴 NONE OF THESE SCENARIOS ARE MEASURED SUBSCRIBER BEHAVIOUR, BECAUSE THERE
 * ARE NO SUBSCRIBERS. Production held zero external paying accounts on
 * 2026-08-17. The percentile figures this repo used to report were computed over
 * the owner's own testing, which is not a cohort — it is one person exercising
 * features on purpose. `MEASUREMENT_STATE` says so in code so a reader of a
 * margin table cannot miss it.
 */

import {
  ingestionUsd,
  localExtractionShare,
  PROVIDER_ROLE,
  round,
  syntheticProviders,
  usdFor,
  type Provider,
} from "./provider-costs";

export { COST_REGISTRY_REV, PROVIDER_ROLE, RATES, RETIRED_RATES, syntheticProviders } from "./provider-costs";

/**
 * 🔴 READ THIS BEFORE QUOTING ANY NUMBER BELOW.
 *
 * There is no paying cohort. Nothing here is a percentile of subscriber
 * behaviour; the scenarios are constructed from what the product does per action
 * and how often a student plausibly does it. They are a cost CEILING exercise,
 * not a forecast.
 */
export const MEASUREMENT_STATE = {
  payingSubscribers: 0,
  observedAt: "2026-08-18",
  /**
   * What would have to be instrumented before a percentile means anything.
   *
   * 🔴 TWO OF THESE CLOSED WHILE THIS FILE SAID THEY WERE OPEN, WHICH IS THE MORE
   * EMBARRASSING DIRECTION TO BE WRONG IN: the model was claiming LESS measurement
   * than the product actually had. `recordAiSpend` (lib/cost/ai-spend.ts, added by
   * #681) now writes a `usage_events` row per Gemini vision call and per vendor
   * parse, scoped to the source, from the parse worker. So images-per-user and
   * pages-per-provider ARE recorded now; what is missing is only elapsed time and
   * somebody to measure.
   *
   * Kept as a list rather than a boolean because "we have the meter" and "we have
   * enough history for a percentile" are different claims, and only the first is
   * true today.
   */
  instrumentationGaps: [
    "No paying cohort exists, so every percentile below is over founder and test usage",
    "Gemini vision and vendor parse pages are now recorded per source by recordAiSpend, but only from 2026-08-18 -- there is no history to take a percentile of",
    "Conversational voice seconds start being recorded by consume_voice_seconds; there is no history",
  ],
} as const;

// ── Prices ───────────────────────────────────────────────────────────────────

export const NEMESIS_MONTHLY_USD = 19.99;
export const NEMESIS_ANNUAL_USD = 199.99;
/** Annual revenue normalised to a month, for comparing against monthly COGS.
 *  The CASH arrives once a year; the COST arrives every month. */
export const NEMESIS_ANNUAL_MONTHLY_EQUIVALENT_USD = round(NEMESIS_ANNUAL_USD / 12, 4);

/** The house rule: COGS should sit at or under 20% of net revenue. */
export const HOUSE_MARGIN = 0.8;

/** Flat platform cost per subscriber-month. Vercel plus Supabase; the split
 *  between them is an assumption, the total is the carried figure. */
export const OTHER_COGS_USD = round(
  usdFor("vercel", "fluid compute", "per_subscriber_month", 1)
  + usdFor("supabase", "database, storage, egress", "per_subscriber_month", 1),
  2,
);

/**
 * What lands after the payment processor takes its cut.
 *
 * A $0 plan is NOT charged: no card is presented, so neither the percentage nor
 * the flat fee exists. Returning -$0.30 for Free makes a free user look thirty
 * cents more expensive than they are.
 */
export function netRevenueUsd(priceUsd: number): number {
  if (priceUsd <= 0) return 0;
  const percent = usdFor("stripe", "card", "percent_of_revenue", priceUsd);
  const flat = usdFor("stripe", "card", "per_transaction", 1);
  return round(priceUsd - (percent + flat), 2);
}

/**
 * 🔴 THE ANNUAL PLAN IS CHARGED ONCE, SO IT PAYS THE FLAT FEE ONCE.
 *
 * This is the single largest structural advantage annual has, and modelling it
 * as twelve monthly charges would erase it: $0.30 taken once a year is 2.5 cents
 * a month, against thirty cents a month on the monthly plan. Stripe's percentage
 * applies either way.
 */
export function netAnnualRevenuePerMonthUsd(): number {
  return round(netRevenueUsd(NEMESIS_ANNUAL_USD) / 12, 4);
}

/**
 * The App Store's cut. Nemesis does not sell through StoreKit yet; this exists
 * so "what happens when it does" is a number rather than a worry.
 *
 * 🔴 TWO RATES, AND WHICH ONE APPLIES IS A BUSINESS FACT, NOT A TECHNICAL ONE.
 * Apple's Small Business Program is 15% for developers under $1M a year, which
 * Nemesis is; the standard rate is 30%. Both are modelled. Apple takes its cut
 * of the gross price and there is no per-transaction flat fee.
 */
export const APP_STORE_SMALL_BUSINESS_RATE = 0.15;
export const APP_STORE_STANDARD_RATE = 0.3;

export function netAppleRevenueUsd(priceUsd: number, rate: number): number {
  return round(priceUsd * (1 - rate), 2);
}

// ── Token arithmetic ─────────────────────────────────────────────────────────

/** Provider list price in USD per 1M tokens. */
export interface ModelPrice {
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
}

export const PRICE_REV = "2026-07-24";

/** Models the valve can route to, read out of the canonical registry. */
export const LIVE_MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "deepseek-v4-flash": {
    cachedInputPerM: usdFor("deepseek", "deepseek-v4-flash", "per_million_cached_input_tokens", 1),
    inputPerM: usdFor("deepseek", "deepseek-v4-flash", "per_million_input_tokens", 1),
    outputPerM: usdFor("deepseek", "deepseek-v4-flash", "per_million_output_tokens", 1),
  },
  "deepseek-v4-pro": {
    cachedInputPerM: usdFor("deepseek", "deepseek-v4-pro", "per_million_cached_input_tokens", 1),
    inputPerM: usdFor("deepseek", "deepseek-v4-pro", "per_million_input_tokens", 1),
    outputPerM: usdFor("deepseek", "deepseek-v4-pro", "per_million_output_tokens", 1),
  },
};

/** What a cached input token counts as against the monthly allowance. Mirrors
 *  CACHE_HIT_WEIGHT in supabase/functions/nemesis-llm/index.ts. */
export const CACHE_HIT_WEIGHT = 0.1;

/** How much of a lecture transcript one study-material pass reads. Imported by
 *  the generator itself so there is exactly one definition. */
export const MATERIAL_CHAR_LIMIT = 9_000;

/** Characters of transcript the note pass reads. Mirrors packages/shared. */
export const RECORDING_NOTE_TRANSCRIPT_CHARS = 60_000;

export const CHARS_PER_TOKEN = 4;
export const SPEECH_CHARS_PER_MINUTE = 850;

export interface TokenSplit {
  input: number;
  cachedInput: number;
  output: number;
}

export function completionUsd(model: string, split: TokenSplit): number | null {
  const price = LIVE_MODEL_PRICES[model];
  if (!price) return null;
  return round(
    (split.input / 1e6) * price.inputPerM
    + (split.cachedInput / 1e6) * price.cachedInputPerM
    + (split.output / 1e6) * price.outputPerM,
    6,
  );
}

/** What a completion counts against the monthly allowance. Cached input is
 *  discounted the same way the valve discounts it. */
export function meteredTokens(split: TokenSplit): number {
  return Math.round(split.input + split.cachedInput * CACHE_HIT_WEIGHT + split.output);
}

export function tokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

// ── The two plans ────────────────────────────────────────────────────────────

export type PlanCode = "free" | "nemesis";

export interface Plan {
  code: PlanCode;
  priceUsd: number;
  /** nemesis_llm_monthly_tokens. */
  monthlyTokens: number;
  /** nemesis_llm_daily_tokens. */
  dailyTokens: number;
  /** nemesis_search_monthly_units. */
  searchMonthly: number;
  /** ask_daily_limit. */
  askDaily: number;
  /** voice_seconds_month_limit -- CONVERSATIONAL voice, not lecture hours. */
  voiceSeconds: number;
}

/**
 * Live values, mirrored from `plan_entitlements`.
 *
 * 🔴 THERE IS NO `transcriptionMinutes` FIELD ANY MORE, AND ITS ABSENCE IS THE
 * POINT. It was the meter that separated the old tiers and the largest variable
 * cost in the product. Lecture transcription is not sold; the rows survive at
 * parity with free purely so the retired lanes refuse cleanly rather than
 * erroring. Reintroducing this field is how the retired product gets costed back
 * into a margin.
 */
export const PLANS: Readonly<Record<PlanCode, Plan>> = {
  free: {
    askDaily: 10,
    code: "free",
    dailyTokens: 75_000,
    monthlyTokens: 1_000_000,
    priceUsd: 0,
    // 🔴 20, NOT 60. This model carried 60 from an audit note; the live
    // plan_entitlements row says 20, read off production on 2026-08-18. A cost
    // model that overstates a free allowance overstates what free costs, which
    // is the direction that quietly justifies tightening something that was
    // never loose.
    searchMonthly: 20,
    voiceSeconds: 900,
  },
  nemesis: {
    askDaily: 250,
    code: "nemesis",
    dailyTokens: 4_000_000,
    monthlyTokens: 25_000_000,
    priceUsd: NEMESIS_MONTHLY_USD,
    searchMonthly: 150,
    voiceSeconds: 18_000,
  },
};

export interface CapInversion {
  meter: string;
  cheaper: PlanCode;
  dearer: PlanCode;
  cheaperValue: number;
  dearerValue: number;
}

const LADDERED: ReadonlyArray<readonly [keyof Plan, string]> = [
  ["monthlyTokens", "monthly tokens"],
  ["dailyTokens", "daily tokens"],
  ["searchMonthly", "monthly searches"],
  ["askDaily", "daily asks"],
  ["voiceSeconds", "conversational voice seconds"],
];

/** Any meter where Free offers MORE than Nemesis. Should always be empty. */
export function planCapInversions(plans: Readonly<Record<PlanCode, Plan>> = PLANS): CapInversion[] {
  const found: CapInversion[] = [];
  for (const [field, meter] of LADDERED) {
    const cheaperValue = plans.free[field] as number;
    const dearerValue = plans.nemesis[field] as number;
    if (dearerValue < cheaperValue) {
      found.push({ cheaper: "free", cheaperValue, dearer: "nemesis", dearerValue, meter });
    }
  }
  return found;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

/**
 * A month of one student's use, in the units the product actually bills in.
 *
 * 🔴 CONSTRUCTED, NOT OBSERVED. See MEASUREMENT_STATE. Each field is "how many
 * times would a student plausibly do this", and the cost of doing it once comes
 * from the registry.
 */
export interface StudentMonth {
  label: string;
  /** Weighted DeepSeek tokens (input + 0.1 x cached + output). */
  meteredTokens: number;
  /** What share of those tokens run on the dearer reasoning model. */
  proLaneShare: number;
  /** Pages of documents uploaded in the month. */
  documentPages: number;
  /** Share of those pages the local reader handles with no paid call. */
  localExtractionShare: number;
  /** Of the escalated pages, how they split. Shares of the escalated remainder. */
  mistralShare: number;
  llamaShare: number;
  geminiShare: number;
  /** Brave queries. */
  searches: number;
  /** Seconds of conversational voice, split between listening and speaking. */
  voiceSecondsIn: number;
  voiceSecondsOut: number;
  /**
   * How many times the learner pressed play on a target-language EXAMPLE in the month.
   *
   * 🔴🔴 A COUNT OF PHRASES, NOT A DURATION, AND THE OWNER IS THE REASON — 2026-08-31: *"we're not
   * going to do actual real time voice… we're just allowing users to hear how things sound, like
   * specific things, but not necessarily for actually reading out loud the entire response. I feel
   * like that would be a bit wasteful."*
   *
   * The first version of this modelled Azure as a share of the month's conversational MINUTES, and
   * that measured a product he had just refused to build: it put five hours of dialect speech on
   * the ceiling and turned the worst case into a $3.63 loss. Azure bills per character, so the unit
   * that matches the feature is one example sentence — `SpokenExample` and `hear-again.tsx` play
   * exactly one, on a press.
   */
  languagePhrasesPlayed: number;
  /** How many times the learner recorded an attempt and had it scored. Billed by the second. */
  pronunciationAttempts: number;
}

/**
 * The five scenarios the owner asked for, plus cap exhaustion.
 *
 * The escalation split is the same in every scenario because it is a property of
 * the DOCUMENTS, not of how hard the student works: a scanned PDF escalates
 * whether it is one of five uploads or one of fifty.
 */
const ESCALATION = { gemini: 0.35, llama: 0.25, mistral: 0.4 } as const;

/**
 * One spoken example, in characters.
 *
 * 🔴 A SENTENCE, BECAUSE THAT IS WHAT THE FEATURE PLAYS. `SpokenExample` renders one target-
 * language line out of an answer and speaks it on a press; a hundred characters is a generous
 * sentence in any of the languages this serves. It is the unit Azure bills in, so modelling it in
 * anything else would need a conversion nobody could check.
 */
const CHARS_PER_SPOKEN_EXAMPLE = 100;

/**
 * One scored attempt, in seconds.
 *
 * 🔴 THE ROUTE'S OWN CEILING IS 60 SECONDS (`MAX_ATTEMPT_SECONDS`) AND THAT IS NOT THE TYPICAL
 * CASE. A learner repeats the sentence they just heard, which takes about five seconds; using the
 * cap here would price every attempt as twelve.
 */
const SECONDS_PER_ATTEMPT = 5;

function scenario(
  label: string,
  meteredTokens: number,
  documentPages: number,
  localExtractionShare: number,
  searches: number,
  voiceMinutes: number,
  proLaneShare: number,
  /** Example phrases played in the month, and attempts scored. Zero for a student who never
   *  opens a language, which is most of them. */
  languagePhrases = 0,
  pronunciationAttempts = 0,
): StudentMonth {
  return {
    documentPages,
    geminiShare: ESCALATION.gemini,
    label,
    llamaShare: ESCALATION.llama,
    localExtractionShare,
    meteredTokens,
    mistralShare: ESCALATION.mistral,
    proLaneShare,
    searches,
    // Half the conversation is the learner talking and half is Nemesis, which is
    // what a taught exchange looks like. Both halves bill, at different rates.
    languagePhrasesPlayed: languagePhrases,
    pronunciationAttempts,
    // 🔴 THE CANVAS VOICE IS UNTOUCHED BY THE LANGUAGE LANE. They are different providers reached
    // by different controls: pressing play on one example does not consume conversational minutes.
    voiceSecondsIn: Math.round((voiceMinutes * 60) / 2),
    voiceSecondsOut: Math.round((voiceMinutes * 60) / 2),
  };
}

/** A student who tries it and uses it for one class. */
export const LIGHT_STUDENT = scenario("light", 600_000, 120, 0.9, 8, 4, 0.05);
/** The student the product is designed for: a few courses, most weeks. */
export const NORMAL_STUDENT = scenario("normal", 4_000_000, 500, 0.85, 40, 30, 0.15);
/** A full course load, leaning on it. */
export const HEAVY_STUDENT = scenario("heavy", 12_000_000, 1_400, 0.8, 90, 90, 0.25);
/** The realistic power user: not a cap-chaser, but the top of ordinary use. */
export const POWER_STUDENT = scenario("power", 20_000_000, 2_500, 0.75, 140, 200, 0.35);
/**
 * Every meter exhausted in the same month.
 *
 * 🔴 A CEILING, NOT A FORECAST. It requires one person to spend the whole
 * monthly token budget, upload thousands of pages of scanned material AND talk
 * for five hours. Nobody does all three. It is modelled because "what is the
 * worst a single subscriber can cost" has to have an answer.
 */
export const CAP_EXHAUSTION: StudentMonth = {
  // 🔴🔴 THE LANGUAGE LANE IS ZERO HERE, AND ITS ABSENCE IS THE POINT. This row means "every meter
  // at its cap", and Azure HAS no meter: `/api/speech/token` mints a ten-minute token to any
  // signed-in browser and counts nothing. Putting a number in would be inventing a ceiling for the
  // one lane that has none — the arbitrary figure tried first ($25 of Azure) made this row read as
  // a bound when it was really a guess. What the lane can actually cost is reported by
  // `unmeteredLanguageBurn()` as a RATE, which is the honest shape for something unbounded.
  ...scenario("cap exhaustion", PLANS.nemesis.monthlyTokens, 6_000, 0.6, PLANS.nemesis.searchMonthly, PLANS.nemesis.voiceSeconds / 60, 1, 0, 0),
};

/**
 * The owner's own second use for this product: *"let's say I wanna learn a new language."*
 *
 * 🔴 THE HEAVY STUDENT, PLUS A LANGUAGE. Forty example phrases and twenty-six scored attempts a
 * day is a serious daily drill, and it adds well under a dollar — because the feature plays one
 * sentence at a time rather than narrating anything. That is the whole point of the scope the
 * owner drew: the same provider narrating every answer would cost multiples of this.
 */
export const LANGUAGE_LEARNER = scenario("language learner", 12_000_000, 1_400, 0.8, 90, 90, 0.25, 1_200, 800);

/**
 * What the UNMETERED language lane costs per hour of continuous use, and what one account can do
 * with it in a day.
 *
 * 🔴🔴 IT IS A RATE, NOT A SCENARIO, BECAUSE THERE IS NOTHING TO CAP IT AT. Every other cost in
 * this file is bounded by a plan entitlement the valve enforces before it spends. Azure is reached
 * from the browser with a ten-minute token from `/api/speech/token`, whose only gate is being
 * signed in — no counter, no entitlement, no refusal. A FREE account can mint tokens all day.
 *
 * 🔴 SPEAKING RATE, NOT READING RATE. `SPEECH_CHARS_PER_MINUTE` is what a synthesiser emits per
 * minute of audio, so continuous playback is that many characters billed per minute.
 */
export function unmeteredLanguageBurn(): { ttsPerHourUsd: number; scoringPerHourUsd: number; bothPerDayUsd: number } {
  const ttsPerHourUsd = round(usdFor("azure_tts", "neural TTS", "per_million_characters", (SPEECH_CHARS_PER_MINUTE * 60) / 1e6), 4);
  const scoringPerHourUsd = round(usdFor("azure_pronunciation", "pronunciation assessment", "per_hour", 1), 4);
  return { bothPerDayUsd: round((ttsPerHourUsd + scoringPerHourUsd) * 24, 2), scoringPerHourUsd, ttsPerHourUsd };
}

export const SCENARIOS: readonly StudentMonth[] = [
  LIGHT_STUDENT,
  NORMAL_STUDENT,
  HEAVY_STUDENT,
  POWER_STUDENT,
  LANGUAGE_LEARNER,
  CAP_EXHAUSTION,
];

// ── Costing a month ──────────────────────────────────────────────────────────

export interface CostLine {
  provider: Provider;
  role: string;
  usd: number;
}

export interface WorkloadReport {
  label: string;
  lines: CostLine[];
  /** Everything a provider charges, before payment processing. */
  variableUsd: number;
  /** Variable plus the flat platform line. */
  cogsBeforePaymentUsd: number;
  /** True when any line came from an `assumed` rate. */
  synthetic: boolean;
  /** How much of the month's document pages never reached a paid parser. */
  localExtractionShare: number;
}

/**
 * A month priced by provider.
 *
 * The reasoning cost assumes an 80/20 input/output split on the weighted token
 * figure, because that is the shape of a teaching turn: a lot of material and a
 * source window in, a paragraph and a question out.
 */
export function modelStudentMonth(month: StudentMonth): WorkloadReport {
  const inputTokens = month.meteredTokens * 0.8;
  const outputTokens = month.meteredTokens * 0.2;
  const proTokens = { input: inputTokens * month.proLaneShare, output: outputTokens * month.proLaneShare };
  const flashTokens = { input: inputTokens - proTokens.input, output: outputTokens - proTokens.output };

  const deepseekUsd = round(
    usdFor("deepseek", "deepseek-v4-flash", "per_million_input_tokens", flashTokens.input / 1e6)
    + usdFor("deepseek", "deepseek-v4-flash", "per_million_output_tokens", flashTokens.output / 1e6)
    + usdFor("deepseek", "deepseek-v4-pro", "per_million_input_tokens", proTokens.input / 1e6)
    + usdFor("deepseek", "deepseek-v4-pro", "per_million_output_tokens", proTokens.output / 1e6),
    4,
  );

  const escalated = month.documentPages * (1 - month.localExtractionShare);
  const mistralPages = Math.round(escalated * month.mistralShare);
  const llamaPages = Math.round(escalated * month.llamaShare);
  const geminiPages = Math.round(escalated * month.geminiShare);

  const lines: CostLine[] = [
    { provider: "deepseek", role: PROVIDER_ROLE.deepseek, usd: deepseekUsd },
    { provider: "gemini", role: PROVIDER_ROLE.gemini, usd: round(usdFor("gemini", "gemini-3.5-flash vision", "per_image", geminiPages), 4) },
    { provider: "mistral", role: PROVIDER_ROLE.mistral, usd: round(usdFor("mistral", "mistral-ocr", "per_page", mistralPages), 4) },
    { provider: "llamaparse", role: PROVIDER_ROLE.llamaparse, usd: round(usdFor("llamaparse", "cost_effective", "per_page", llamaPages), 4) },
    { provider: "brave", role: PROVIDER_ROLE.brave, usd: round(usdFor("brave", "search", "per_query", month.searches), 4) },
    { provider: "xai_stt", role: PROVIDER_ROLE.xai_stt, usd: round(usdFor("xai_stt", "grok-stt", "per_hour", month.voiceSecondsIn / 3_600), 4) },
    {
      provider: "xai_tts",
      role: PROVIDER_ROLE.xai_tts,
      usd: round(
        usdFor(
          "xai_tts",
          "grok-tts",
          "per_million_characters",
          (month.voiceSecondsOut * (SPEECH_CHARS_PER_MINUTE / 60)) / 1e6,
        ),
        4,
      ),
    },
    // The language lane. Zero for a student who never opens one, which is most of them.
    {
      provider: "azure_tts",
      role: PROVIDER_ROLE.azure_tts,
      usd: round(
        usdFor(
          "azure_tts",
          "neural TTS",
          "per_million_characters",
          (month.languagePhrasesPlayed * CHARS_PER_SPOKEN_EXAMPLE) / 1e6,
        ),
        4,
      ),
    },
    {
      provider: "azure_pronunciation",
      role: PROVIDER_ROLE.azure_pronunciation,
      usd: round(
        usdFor(
          "azure_pronunciation",
          "pronunciation assessment",
          "per_hour",
          (month.pronunciationAttempts * SECONDS_PER_ATTEMPT) / 3_600,
        ),
        4,
      ),
    },
    { provider: "vercel", role: PROVIDER_ROLE.vercel, usd: usdFor("vercel", "fluid compute", "per_subscriber_month", 1) },
    { provider: "supabase", role: PROVIDER_ROLE.supabase, usd: usdFor("supabase", "database, storage, egress", "per_subscriber_month", 1) },
  ];

  const variableUsd = round(
    lines
      .filter((line) => line.provider !== "vercel" && line.provider !== "supabase")
      .reduce((total, line) => total + line.usd, 0),
    4,
  );
  const cogsBeforePaymentUsd = round(lines.reduce((total, line) => total + line.usd, 0), 4);
  const touched = new Set(lines.filter((line) => line.usd > 0).map((line) => line.provider));

  return {
    cogsBeforePaymentUsd,
    label: month.label,
    lines,
    localExtractionShare: localExtractionShare({
      locallyExtractedPages: month.documentPages - escalated,
      totalPages: month.documentPages,
    }),
    synthetic: syntheticProviders().some((provider) => touched.has(provider)),
    variableUsd,
  };
}

// ── Margins ──────────────────────────────────────────────────────────────────

export type Channel = "web_monthly" | "web_annual" | "ios_monthly_sbp" | "ios_annual_sbp" | "ios_monthly_standard" | "ios_annual_standard";

export interface Margin {
  channel: Channel;
  scenario: string;
  /** Revenue attributable to ONE month, after the store's cut. */
  netMonthlyRevenueUsd: number;
  cogsUsd: number;
  contributionUsd: number;
  contributionPercent: number;
  /** True when the COGS figure depends on an assumed provider rate. */
  synthetic: boolean;
}

export function netMonthlyRevenueFor(channel: Channel): number {
  switch (channel) {
    case "web_monthly":
      return netRevenueUsd(NEMESIS_MONTHLY_USD);
    case "web_annual":
      return netAnnualRevenuePerMonthUsd();
    case "ios_monthly_sbp":
      return netAppleRevenueUsd(NEMESIS_MONTHLY_USD, APP_STORE_SMALL_BUSINESS_RATE);
    case "ios_annual_sbp":
      return round(netAppleRevenueUsd(NEMESIS_ANNUAL_USD, APP_STORE_SMALL_BUSINESS_RATE) / 12, 4);
    case "ios_monthly_standard":
      return netAppleRevenueUsd(NEMESIS_MONTHLY_USD, APP_STORE_STANDARD_RATE);
    case "ios_annual_standard":
      return round(netAppleRevenueUsd(NEMESIS_ANNUAL_USD, APP_STORE_STANDARD_RATE) / 12, 4);
  }
}

export function marginFor(channel: Channel, month: StudentMonth): Margin {
  const report = modelStudentMonth(month);
  const netMonthlyRevenueUsd = netMonthlyRevenueFor(channel);
  const contributionUsd = round(netMonthlyRevenueUsd - report.cogsBeforePaymentUsd, 4);
  return {
    channel,
    cogsUsd: report.cogsBeforePaymentUsd,
    contributionPercent: netMonthlyRevenueUsd > 0
      ? round((contributionUsd / netMonthlyRevenueUsd) * 100, 1)
      : 0,
    contributionUsd,
    netMonthlyRevenueUsd,
    scenario: month.label,
    synthetic: report.synthetic,
  };
}

/** What a free account costs at its own caps. There is no revenue to divide by;
 *  the number is the whole answer. */
export function freeCeilingUsd(): number {
  const free = modelStudentMonth({
    ...scenario("free at cap", PLANS.free.monthlyTokens, 400, 0.8, PLANS.free.searchMonthly, PLANS.free.voiceSeconds / 60, 0),
  });
  return free.cogsBeforePaymentUsd;
}

export { ingestionUsd };
