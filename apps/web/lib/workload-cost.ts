// What one student's month actually costs us, line by line, on every plan.
//
// This answers a question prose arithmetic keeps getting wrong: does a plan cover a
// heavy student — hours of recorded lecture, a stack of slide decks, daily chat — and
// if not, which line is the problem.
//
// Three things make it worth committing rather than doing on a napkin:
//   1. TWO LEDGERS. The provider bill is RAW tokens at list price. The student's cap
//      (`nemesis_llm_monthly_tokens`) is CACHE-WEIGHTED — nemesis-llm/index.ts spends
//      `raw - cacheHit + ceil(cacheHit * CACHE_HIT_WEIGHT)`. A month can clear the
//      money and still hit the cap, or the reverse. Both are reported here.
//   2. RECORDER LANES with a 4x price spread between them. "4 hours a day" means a
//      different bill on each. Never answer without naming the lane.
//   3. MEASURED vs FORECAST. Some of this workflow is shipped and its sizes are read
//      off real constants; some of it does not exist yet. Every line says which, so a
//      confident-looking number for an unbuilt feature can't quietly become a fact.
//
// REWRITTEN 2026-07-28. The 2026-07-24 version modelled a web recorder that streamed
// to AssemblyAI and wrote a note every 45 seconds. Neither exists any more (PRs #298
// and #301): the web recorder records to a file, uploads once, and composes ONE note
// from the whole transcript. The old model's headline finding — "live notes are 21M of
// the 24M tokens" — described code that has since been deleted. A stale model that
// answers confidently is worse than no model, which is why this file is rewritten
// rather than patched.
//
// Prices and code-shape constants below are MIRRORS. workload-cost.test.ts reads the
// canonical files off disk and fails when they drift — that guard is the reason it is
// safe to mirror rather than import across the Deno/Node boundary.

/** Provider list price in USD per 1M tokens. Mirrors supabase/functions/_shared/llm-cost.ts. */
export interface ModelPrice {
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
}

/** Price list revision, mirrored from _shared/llm-cost.ts. */
export const PRICE_REV = "2026-07-24";

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "deepseek-v4-flash": { cachedInputPerM: 0.0028, inputPerM: 0.14, outputPerM: 0.28 },
  "deepseek-v4-pro": { cachedInputPerM: 0.003625, inputPerM: 0.435, outputPerM: 0.87 },
  "glm-5.2": { cachedInputPerM: 0.26, inputPerM: 1.4, outputPerM: 4.4 },
};

/** Voice price revision, mirrored from _shared/voice-cost.ts and lib/cost-report.ts. */
export const VOICE_PRICE_REV = "2026-07-27";

/** USD per hour of audio on the BATCH lane. Mirrors BATCH_USD_PER_HOUR in
 *  supabase/functions/_shared/voice-cost.ts. Both AssemblyAI rates INCLUDE the
 *  +$0.02/hr speaker-labels add-on, because that lane always asks for it. */
export const BATCH_USD_PER_HOUR = {
  assemblyai_batch: 0.23,
  assemblyai_batch_universal2: 0.17,
  groq_whisper_turbo: 0.04,
} as const;

/** USD per hour on the STREAMING lane. Mirrors VOICE_USD_PER_HOUR in lib/cost-report.ts.
 *  No recorder drives this today — kept because the route still exists. */
export const STREAMING_USD_PER_HOUR = { assemblyai_streaming: 0.15 } as const;

/** What `speaker_labels: true` adds per hour (assemblyai.com/pricing, VOICE_PRICE_REV).
 *  Already inside the two AssemblyAI rates above; named separately because it is the
 *  one item on the audio bill that can be switched off without changing engines. */
export const DIARIZATION_USD_PER_HOUR = 0.02;

// ── Plan economics ───────────────────────────────────────────────────────────

/** Stripe standard card pricing. The 2.9% scales with the plan; the 30 cents does not,
 *  which is most of why a cheap plan cannot simply be "half of an expensive one". */
const STRIPE_PERCENT = 0.029;
const STRIPE_FLAT_USD = 0.3;

/** Non-AI per-subscriber cost (Supabase rows/storage/egress, Vercel, email) at the
 *  worst case carried from the earlier voice-economics work. Flat per subscriber:
 *  it does not shrink on a cheaper plan either. */
export const OTHER_COGS_USD = 1.17;

/** The house rule: COGS should sit at or under 20% of net revenue. */
export const HOUSE_MARGIN = 0.8;

/** What actually lands after Stripe takes its cut. */
export function netRevenueUsd(priceUsd: number): number {
  return round(priceUsd - (priceUsd * STRIPE_PERCENT + STRIPE_FLAT_USD), 2);
}

// ── Live plan limits ─────────────────────────────────────────────────────────
// Read from plan_entitlements in production. Unlike the prices and pipeline shapes
// above, these mirror DATABASE rows, so no test can read the source of truth off
// disk — they go stale silently, and already did once. Re-query before trusting any
// cap figure this module reports:
//   select plan_code, entitlement_key, value_json from plan_entitlements;
export const PLAN_LIMITS_CHECKED = "2026-07-28";

/**
 * The ladder was RESHAPED on 2026-07-28 (owner: "it should increase linearly, plus
 * should get 20 hours, max gets 200 hours"). Before that write, three meters ran
 * backwards — Max allowed 60 recording hours where Pro allowed 83, and Free
 * out-searched both paid student plans. The old values, kept as the revert recipe:
 *
 *   transcription seconds  plus 36,000    max 216,000  professional 216,000
 *   live audio seconds     free 1,800  plus 3,600  max 240,000  professional 240,000
 *   llm monthly tokens     plus 5,000,000   max 30,000,000
 *   llm daily tokens       plus 1,500,000   max 10,000,000
 *   search monthly units   free 300  plus 100   max 300
 *   search daily units     max 120
 *   ask daily              plus 100   max 500
 *   evidence brief daily   plus 5     max 50
 *   deep research daily    max 10
 *   mission limit          max 20
 *   watch limit            plus 10    max 200
 *   watchlist limit        max 250
 *
 * Pro's recording allowance was deliberately NOT touched: 300,000s is 83 hours, it
 * already covers the advertised 80, and cutting a live allowance to make a table
 * tidier is never worth it.
 */
export const LADDER_RESHAPED = "2026-07-28";

export type PlanCode = "free" | "plus" | "pro" | "max";

export interface Plan {
  code: PlanCode;
  /** Monthly list price. Mirrors MONTHLY_PLAN_PRICE_CENTS in lib/billing-contract.ts. */
  priceUsd: number;
  /** nemesis_llm_monthly_tokens. */
  monthlyTokens: number;
  /** nemesis_llm_daily_tokens. */
  dailyTokens: number;
  /** transcription_seconds_month_limit, in MINUTES. */
  transcriptionMinutes: number;
  /** nemesis_search_monthly_units. */
  searchMonthly: number;
  /** ask_daily_limit. */
  askDaily: number;
  /** Whether the premium High answer lane (GLM-5.2 / v4-pro) is reachable.
   *  nemesis-llm/index.ts gates it on `ctx.plan === 'pro' || ctx.plan === 'max'`. */
  premiumAnswerLane: boolean;
}

/** Live values, read back out of plan_entitlements after the 2026-07-28 reshape.
 *  Plus is half of Pro and Max is 5x Pro on every meter EXCEPT recording, where the
 *  owner set the three numbers directly: 20 / 80 / 200 hours. `planCapInversions()`
 *  now returns empty, and a test asserts that so the next stray row fails CI. */
export const PLANS: Readonly<Record<PlanCode, Plan>> = {
  free: {
    askDaily: 10,
    code: "free",
    dailyTokens: 75_000,
    monthlyTokens: 2_000_000,
    premiumAnswerLane: false,
    priceUsd: 0,
    searchMonthly: 60,
    transcriptionMinutes: 120,
  },
  max: {
    askDaily: 1_250,
    code: "max",
    dailyTokens: 20_000_000,
    monthlyTokens: 125_000_000,
    premiumAnswerLane: true,
    priceUsd: 99,
    searchMonthly: 750,
    transcriptionMinutes: 12_000,
  },
  plus: {
    askDaily: 125,
    code: "plus",
    dailyTokens: 2_000_000,
    monthlyTokens: 12_500_000,
    premiumAnswerLane: false,
    priceUsd: 9.99,
    searchMonthly: 75,
    transcriptionMinutes: 1_200,
  },
  pro: {
    askDaily: 250,
    code: "pro",
    dailyTokens: 4_000_000,
    monthlyTokens: 25_000_000,
    premiumAnswerLane: true,
    priceUsd: 19.99,
    searchMonthly: 150,
    // 300,000s. Reads as "80 hours" in marketing with three hours of slack.
    transcriptionMinutes: 5_000,
  },
};

/** Meters where a dearer plan must never offer less than a cheaper one. */
const LADDERED: ReadonlyArray<readonly [keyof Plan, string]> = [
  ["monthlyTokens", "monthly tokens"],
  ["dailyTokens", "daily tokens"],
  ["transcriptionMinutes", "recording minutes"],
  ["searchMonthly", "monthly searches"],
  ["askDaily", "daily asks"],
];

/** Cheapest first — the order a student climbs. */
const LADDER: readonly PlanCode[] = ["free", "plus", "pro", "max"];

export interface CapInversion {
  meter: string;
  cheaper: PlanCode;
  dearer: PlanCode;
  cheaperValue: number;
  dearerValue: number;
}

/**
 * Every place where paying MORE buys LESS.
 *
 * Caps live in the database, are edited one row at a time, and nothing has ever
 * compared them across plans — so a raise applied to Pro and not to Max silently
 * inverts the ladder and no screen says so. This is the check that should have
 * existed before Pro was raised to 5,000 recording minutes against Max's 3,600.
 */
export function planCapInversions(plans: Readonly<Record<PlanCode, Plan>> = PLANS): CapInversion[] {
  const found: CapInversion[] = [];
  for (const [meter, label] of LADDERED) {
    for (let i = 0; i < LADDER.length - 1; i += 1) {
      for (let j = i + 1; j < LADDER.length; j += 1) {
        const cheaper = plans[LADDER[i]!]!;
        const dearer = plans[LADDER[j]!]!;
        const cheaperValue = cheaper[meter] as number;
        const dearerValue = dearer[meter] as number;
        if (dearerValue < cheaperValue) {
          found.push({ cheaper: cheaper.code, cheaperValue, dearer: dearer.code, dearerValue, meter: label });
        }
      }
    }
  }
  return found;
}

/** How much a cached prompt token counts against the student's cap.
 *  Mirrors CACHE_HIT_WEIGHT in supabase/functions/nemesis-llm/index.ts. */
export const CACHE_HIT_WEIGHT = 0.1;

// ── Shapes mirrored from the shipped pipelines ───────────────────────────────

/** Transcript handed to the single note pass, in characters.
 *  RECORDING_NOTE_TRANSCRIPT_CHARS in lib/workspace/recording-note.ts. */
export const RECORDING_NOTE_TRANSCRIPT_CHARS = 60_000;

/** Source material clip for flashcard/test/mind-map generation.
 *  MATERIAL_CHAR_LIMIT in lib/workspace/study-artifact-content.ts. */
export const MATERIAL_CHAR_LIMIT = 9_000;

/** English averages ~4 characters per token across DeepSeek/GLM tokenizers. An
 *  estimate, and the single largest source of slop in this model — every token
 *  figure below inherits it. */
export const CHARS_PER_TOKEN = 4;

/** Lecture speech at ~150 words/min, ~5.7 characters per word including spaces. */
export const SPEECH_CHARS_PER_MINUTE = 850;

// ── Measured production shape of a chat turn ─────────────────────────────────
// From usage_events on 2026-07-28: 39 completions that carry a stamped cost_usd
// (the cost-attribution valve, v23, only started stamping recently).
//
//   avg prompt 2,166 · avg completion 309 · 68.2% of prompt tokens cache-hit
//   avg $0.000187/call · max $0.000533/call
//
// SMALL SAMPLE, ONE SURFACE: 39 phone turns from a handful of accounts, and a web
// workspace turn carries more attached context than a phone turn. Treat as an order
// of magnitude, not a precise mean — which is enough, because the conclusion below
// survives being wrong about this by 3x.
export const MEASURED_CHAT = {
  cacheHitRate: 0.682,
  completionTokens: 309,
  promptTokens: 2_166,
  sampleSize: 39,
  usdPerCall: 0.000187,
} as const;

// ── Cost primitives ──────────────────────────────────────────────────────────

export interface TokenSplit {
  /** Inclusive of the cached share, matching the OpenAI/DeepSeek convention. */
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
}

/** Dollar cost of one completion. Mirrors costUsd() in _shared/llm-cost.ts —
 *  an unpriced model returns null, never 0. */
export function completionUsd(model: string, split: TokenSplit): number | null {
  const price = MODEL_PRICES[model.toLowerCase()];
  if (!price) return null;
  const prompt = Math.max(0, split.promptTokens);
  const cached = Math.min(Math.max(0, split.cacheHitTokens), prompt);
  const usd =
    ((prompt - cached) * price.inputPerM +
      cached * price.cachedInputPerM +
      Math.max(0, split.completionTokens) * price.outputPerM) /
    1_000_000;
  return round(usd, 6);
}

/** What the same call spends against the student's monthly cap. Mirrors
 *  recordUsage() in nemesis-llm/index.ts, including its floor of 1. */
export function meteredTokens(split: TokenSplit): number {
  const raw = Math.max(0, split.promptTokens + split.completionTokens);
  const cached = Math.min(Math.max(0, split.cacheHitTokens), raw);
  return Math.max(1, raw - cached + Math.ceil(cached * CACHE_HIT_WEIGHT));
}

export function tokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

// ── The workload ─────────────────────────────────────────────────────────────

/**
 * Which recorder the audio goes through.
 *
 *  • web-batch    — WHAT ACTUALLY RUNS TODAY. The recorder uploads a file, and
 *    nemesis-transcribe submits it to AssemblyAI pinned to Universal-2 with speaker
 *    labels. Groq is tried first in code but the owner has no pay-as-you-go access,
 *    so in practice every web recording lands here.
 *  • web-batch-pro — the SAME code path when AssemblyAI ignores the pinned model and
 *    runs Universal-3.5 Pro. Not hypothetical: `speech_models` is a priority list, and
 *    /status reads the model back off the finished job precisely because a request
 *    field that has moved is accepted and ignored rather than rejected.
 *  • web-batch-groq — the same route once Groq pay-as-you-go is available. No code
 *    change: nemesis-transcribe already tries Groq first.
 *  • ios-parakeet — on-device Parakeet (PR #273, shipped in iOS build 22, still not
 *    device-verified). Nothing leaves the phone, so there is no per-minute cost.
 */
export type RecorderLane = "web-batch" | "web-batch-pro" | "web-batch-groq" | "ios-parakeet";

const LANE_USD_PER_HOUR: Readonly<Record<RecorderLane, number>> = {
  "ios-parakeet": 0,
  "web-batch": BATCH_USD_PER_HOUR.assemblyai_batch_universal2,
  "web-batch-groq": BATCH_USD_PER_HOUR.groq_whisper_turbo,
  "web-batch-pro": BATCH_USD_PER_HOUR.assemblyai_batch,
};

const LANE_NOTES: Readonly<Record<RecorderLane, string>> = {
  "ios-parakeet": "nothing leaves the phone — built (PR #273, build 22), not device-verified",
  "web-batch": "AssemblyAI Universal-2 + speaker labels — the live default",
  "web-batch-groq": "Groq whisper-large-v3-turbo — wired and first in line, but no PAYG access",
  "web-batch-pro": "AssemblyAI Universal-3.5 Pro — what we pay if the pinned model is ignored",
};

export interface StudentMonth {
  plan: PlanCode;
  /** Hours the student presses record for — WALL CLOCK, before the silence gate. */
  audioHours: number;
  recorder: RecorderLane;
  /**
   * Share of wall-clock recording the silence gate keeps out of the file, 0-1.
   *
   * UNMEASURED. `transcription_jobs` has had zero rows since it was created, and the
   * table stores only the already-trimmed `audio_seconds` — the wall clock is never
   * written down, so even once students start recording, this ratio is not
   * recoverable from the database. Defaults to 0 so no saving is claimed that has
   * not been observed. Run the sensitivity band instead of picking a number.
   */
  silenceShare: number;
  /** Typical length of one recording, in hours — decides how many note passes run. */
  hoursPerRecording: number;
  /** Slide decks uploaded per month. */
  decks: number;
  /** Flashcard batches generated per deck. */
  flashcardRunsPerDeck: number;
  /** Diagnostic tests generated per deck. */
  testRunsPerDeck: number;
  /** Substantial chat turns per school day. */
  chatTurnsPerDay: number;
  schoolDays: number;
  /** Model the chat lane runs on. Everything resolves to v4-flash in the valve
   *  EXCEPT a High-effort turn on Pro/Max, which routes to glm-5.2 or v4-pro. */
  chatModel: string;
  /** Share of prompt tokens the provider reports as cache hits on the chat lane. */
  chatCacheHitRate: number;
  /** Per-slide vision calls for figures and diagrams. Not built; Gemini is not in
   *  MODEL_PRICES, so these report UNPRICED rather than $0. */
  visionImagesPerDeck: number;
  /** AI daily-recap notes. Not built. */
  dailyNotes: boolean;
}

/**
 * The owner's stated heavy student, 2026-07-28: 80 hours of recording a month, and
 * about two hours a day of AI work turning slide decks into flashcards, tests and
 * notes.
 *
 * "Two hours a day" is not a meter the product has, so it is translated here:
 * 40 chat turns a day is roughly one exchange every three minutes of active work,
 * plus 70 decks a month (3-4 a school day) each generating one flashcard batch and
 * one practice test. The translation is deliberately generous — see the test showing
 * that tripling it still leaves the whole AI lane under $3.
 */
export const HEAVY_STUDENT: StudentMonth = {
  audioHours: 80,
  chatCacheHitRate: MEASURED_CHAT.cacheHitRate,
  chatModel: "deepseek-v4-flash",
  chatTurnsPerDay: 40,
  dailyNotes: true,
  decks: 70,
  flashcardRunsPerDeck: 1,
  hoursPerRecording: 1,
  plan: "pro",
  recorder: "web-batch",
  schoolDays: 22,
  silenceShare: 0,
  testRunsPerDeck: 1,
  visionImagesPerDeck: 40,
};

/** MEASURED — sizes read off constants in shipped code. FORECAST — the feature does
 *  not exist yet, so the number is a projection of a design, not a measurement. */
export type Basis = "measured" | "forecast";

export interface CostLine {
  name: string;
  /** null when the model or provider has no price on file. */
  usd: number | null;
  calls: number;
  /** Tokens charged against nemesis_llm_monthly_tokens. */
  metered: number;
  basis: Basis;
  note: string;
}

export interface WorkloadReport {
  plan: PlanCode;
  lines: CostLine[];
  /** Sum of the priced lines only. */
  totalUsd: number;
  /** Provider cost of the audio lane alone. */
  audioUsd: number;
  /** Provider cost of everything that is a model call. */
  aiUsd: number;
  /** How many times the audio line exceeds the AI line. Infinity on a free lane. */
  audioToAiRatio: number;
  /** Lines with no price on file — reported as a count so they never read as free. */
  unpriced: string[];
  meteredTokens: number;
  tokenCap: number;
  /** Multiple of the cap this month would spend. 1.0 means exactly at the limit. */
  capRatio: number;
  /** Wall-clock minutes the student recorded. */
  recordedMinutes: number;
  /** Minutes that actually reach the provider after the silence gate. */
  billedMinutes: number;
  transcriptionCap: number;
  /** True when the plan's recording allowance covers the month. */
  withinTranscriptionCap: boolean;
  netRevenueUsd: number;
  /** (net revenue - all COGS) / net revenue. */
  grossMarginPct: number;
  /** Dollars left over per subscriber per month. Report this next to
   *  meetsHouseMargin — on its own the boolean flattens a 73%-margin month and an
   *  11%-margin month into the same word, which reads as "it doesn't work". */
  headroomUsd: number;
  meetsHouseMargin: boolean;
  profitable: boolean;
}

export function modelStudentMonth(input: StudentMonth): WorkloadReport {
  const plan = PLANS[input.plan];
  const lines = [
    transcriptionLine(input),
    recordingNotesLine(input),
    deckGenerationLine(input),
    visionLine(input),
    chatLine(input),
    dailyNotesLine(input),
  ].filter((line): line is CostLine => line !== null);

  const audioUsd = round(lines.filter(isAudio).reduce((sum, line) => sum + (line.usd ?? 0), 0), 4);
  const aiUsd = round(lines.filter((line) => !isAudio(line)).reduce((sum, line) => sum + (line.usd ?? 0), 0), 4);
  const totalUsd = round(audioUsd + aiUsd, 4);
  const cogs = totalUsd + OTHER_COGS_USD;
  const net = netRevenueUsd(plan.priceUsd);
  const metered = lines.reduce((sum, line) => sum + line.metered, 0);
  const billed = Math.round(billedHours(input) * 60);

  return {
    aiUsd,
    audioToAiRatio: aiUsd > 0 ? round(audioUsd / aiUsd, 1) : Infinity,
    audioUsd,
    billedMinutes: billed,
    capRatio: round(metered / plan.monthlyTokens, 2),
    grossMarginPct: net > 0 ? round(((net - cogs) / net) * 100, 1) : 0,
    headroomUsd: round(net - cogs, 2),
    lines,
    meetsHouseMargin: net > 0 && cogs <= net * (1 - HOUSE_MARGIN),
    meteredTokens: metered,
    netRevenueUsd: net,
    plan: input.plan,
    profitable: cogs < net,
    recordedMinutes: Math.round(input.audioHours * 60),
    tokenCap: plan.monthlyTokens,
    totalUsd,
    transcriptionCap: plan.transcriptionMinutes,
    unpriced: lines.filter((line) => line.usd === null).map((line) => line.name),
    // The cap counts what the FILE contains, not the wall clock: use-recording.ts
    // sends captured seconds, because the owner chose the trimming saving to go to
    // the student on web (the phone keeps it for us).
    withinTranscriptionCap: billed <= plan.transcriptionMinutes,
  };
}

function isAudio(line: CostLine): boolean {
  return line.name.startsWith("Transcription");
}

/** Hours that reach the provider once the silence gate has done its work. */
function billedHours(input: StudentMonth): number {
  return input.audioHours * (1 - clamp01(input.silenceShare));
}

// ── Lines ────────────────────────────────────────────────────────────────────

function transcriptionLine(input: StudentMonth): CostLine {
  const rate = LANE_USD_PER_HOUR[input.recorder];
  const hours = billedHours(input);
  const trimmed = input.silenceShare > 0
    ? ` — ${Math.round(clamp01(input.silenceShare) * 100)}% trimmed by the silence gate (UNMEASURED assumption)`
    : "";
  return {
    basis: "measured",
    calls: Math.round(input.audioHours / Math.max(0.01, input.hoursPerRecording)),
    metered: 0,
    name: `Transcription (${input.recorder})`,
    note: `$${rate.toFixed(2)}/audio-hour — ${LANE_NOTES[input.recorder]}${trimmed}`,
    usd: round(hours * rate, 4),
  };
}

/**
 * One note pass per finished recording, over the whole transcript.
 *
 * This replaced a pass every 45 seconds. The old lane made ~6,400 calls a month and
 * was the single biggest token consumer in the product; this one makes about 80, and
 * is smaller than deck generation.
 */
function recordingNotesLine(input: StudentMonth): CostLine {
  const recordings = Math.round(input.audioHours / Math.max(0.01, input.hoursPerRecording));
  // A one-hour lecture transcribes to roughly 51,000 characters at speaking pace, so
  // the 60,000-char window binds only on longer sessions.
  const transcriptChars = Math.min(
    RECORDING_NOTE_TRANSCRIPT_CHARS,
    input.hoursPerRecording * 60 * SPEECH_CHARS_PER_MINUTE,
  );
  const promptTokens = tokensFromChars(1_400 + transcriptChars);
  // A page or two of organised markdown.
  const completionTokens = 2_000;
  const split = { cacheHitTokens: 0, completionTokens, promptTokens };
  return {
    basis: "measured",
    calls: recordings,
    metered: meteredTokens(split) * recordings,
    name: "Lecture notes (one pass per recording)",
    note: `~${promptTokens.toLocaleString()} prompt tokens per recording, window capped at ${RECORDING_NOTE_TRANSCRIPT_CHARS.toLocaleString()} chars`,
    usd: multiply(completionUsd("deepseek-v4-flash", split), recordings),
  };
}

/** Flashcards and a diagnostic test per deck. Both read the same clipped material. */
function deckGenerationLine(input: StudentMonth): CostLine {
  const calls = input.decks * (input.flashcardRunsPerDeck + input.testRunsPerDeck);
  const promptTokens = tokensFromChars(MATERIAL_CHAR_LIMIT + 1_200);
  const completionTokens = tokensFromChars(6_000);
  const split = { cacheHitTokens: 0, completionTokens, promptTokens };
  return {
    basis: "measured",
    calls,
    metered: meteredTokens(split) * calls,
    name: "Flashcards + diagnostic tests",
    note: `material clipped to ${MATERIAL_CHAR_LIMIT.toLocaleString()} chars per run — a 5MB deck is mostly not read`,
    usd: multiply(completionUsd("deepseek-v4-flash", split), calls),
  };
}

/**
 * Reading the figures and diagrams off each slide. Not built — the .pptx extractor
 * is text-only — and Gemini has no entry in MODEL_PRICES, so this reports UNPRICED.
 */
function visionLine(input: StudentMonth): CostLine | null {
  const images = input.decks * input.visionImagesPerDeck;
  if (images === 0) return null;
  return {
    basis: "forecast",
    calls: images,
    metered: 0,
    name: "Slide image reading (vision)",
    note: `${images.toLocaleString()} images/month, no price on file — must be priced before this ships`,
    usd: null,
  };
}

/** Explaining concepts, editing library notes, planning. */
function chatLine(input: StudentMonth): CostLine {
  const calls = input.chatTurnsPerDay * input.schoolDays;
  const promptTokens = MEASURED_CHAT.promptTokens;
  const completionTokens = MEASURED_CHAT.completionTokens;
  const split = {
    cacheHitTokens: Math.round(promptTokens * clamp01(input.chatCacheHitRate)),
    completionTokens,
    promptTokens,
  };
  return {
    basis: "measured",
    calls,
    metered: meteredTokens(split) * calls,
    name: "Chat: concepts, library edits, planning",
    note: `${promptTokens.toLocaleString()} prompt / ${completionTokens} completion tokens, ${Math.round(clamp01(input.chatCacheHitRate) * 100)}% cached — measured over ${MEASURED_CHAT.sampleSize} production calls`,
    usd: multiply(completionUsd(input.chatModel, split), calls),
  };
}

/** One recap a day over what the student did. No such feature exists today. */
function dailyNotesLine(input: StudentMonth): CostLine | null {
  if (!input.dailyNotes) return null;
  const promptTokens = 6_000;
  const completionTokens = 700;
  const split = { cacheHitTokens: 0, completionTokens, promptTokens };
  return {
    basis: "forecast",
    calls: input.schoolDays,
    metered: meteredTokens(split) * input.schoolDays,
    name: "Daily recap notes",
    note: "not built — projection of one summarizing pass per school day",
    usd: multiply(completionUsd("deepseek-v4-flash", split), input.schoolDays),
  };
}

// ── Break-even ───────────────────────────────────────────────────────────────

/**
 * The most audio hours a plan can carry, given everything else the student does.
 *
 * `targetMarginPct` of 0 is break-even; HOUSE_MARGIN * 100 is the house rule. This is
 * the number that decides whether a promise like "80 hours of recording" is fundable
 * at a given price, and it is deliberately a function rather than a constant, because
 * the answer moves with the lane.
 */
export function affordableAudioHours(input: StudentMonth, targetMarginPct: number): number {
  const plan = PLANS[input.plan];
  const net = netRevenueUsd(plan.priceUsd);
  const budget = net * (1 - targetMarginPct / 100);
  const nonAudio = modelStudentMonth({ ...input, audioHours: 0 });
  const spare = budget - nonAudio.totalUsd - OTHER_COGS_USD;
  const rate = LANE_USD_PER_HOUR[input.recorder] * (1 - clamp01(input.silenceShare));
  if (rate <= 0) return Infinity;
  return Math.max(0, round(spare / rate, 1));
}

/**
 * The most a single audio-hour may cost while a plan still hits a margin target at a
 * given number of hours. The durable output of this whole model: prices move, and
 * this says immediately whether a new provider is worth switching to.
 */
export function affordableRatePerAudioHour(input: StudentMonth, targetMarginPct: number): number {
  const plan = PLANS[input.plan];
  const net = netRevenueUsd(plan.priceUsd);
  const budget = net * (1 - targetMarginPct / 100);
  const nonAudio = modelStudentMonth({ ...input, audioHours: 0 });
  const spare = budget - nonAudio.totalUsd - OTHER_COGS_USD;
  const hours = billedHours(input);
  if (hours <= 0) return Infinity;
  return Math.max(0, round(spare / hours, 4));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function multiply(usd: number | null, times: number): number | null {
  return usd === null ? null : round(usd * times, 4);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
