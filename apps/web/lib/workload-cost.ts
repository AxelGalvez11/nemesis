// What one student's month actually costs us, line by line.
//
// This answers a question prose arithmetic keeps getting wrong: does $19.99/month
// cover a heavy student — hours of recorded lecture, a stack of slide decks, daily
// chat — and if not, which line is the problem.
//
// Three things make it worth committing rather than doing on a napkin:
//   1. TWO LEDGERS. The provider bill is RAW tokens at list price. The student's cap
//      (`nemesis_llm_monthly_tokens`) is CACHE-WEIGHTED — nemesis-llm/index.ts spends
//      `raw - cacheHit + ceil(cacheHit * CACHE_HIT_WEIGHT)`. A month can clear the
//      money and still hit the cap, or the reverse. Both are reported here.
//   2. THREE RECORDER LANES with a 5x price spread between them. "4 hours a day"
//      means a different bill on each. Never answer without naming the lane.
//   3. MEASURED vs FORECAST. Some of this workflow is shipped and its sizes are read
//      off real constants; some of it does not exist yet. Every line says which, so a
//      confident-looking number for an unbuilt feature can't quietly become a fact.
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

/** Price list revision, mirrored from _shared/llm-cost.ts and lib/cost-report.ts. */
export const PRICE_REV = "2026-07-24";

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "deepseek-v4-flash": { cachedInputPerM: 0.0028, inputPerM: 0.14, outputPerM: 0.28 },
  "deepseek-v4-pro": { cachedInputPerM: 0.003625, inputPerM: 0.435, outputPerM: 0.87 },
  "glm-5.2": { cachedInputPerM: 0.26, inputPerM: 1.4, outputPerM: 4.4 },
};

/** USD per hour of audio. Mirrors VOICE_USD_PER_HOUR in lib/cost-report.ts. */
export const VOICE_USD_PER_HOUR = {
  assemblyai_batch: 0.21,
  assemblyai_streaming: 0.15,
  groq_whisper_turbo: 0.04,
} as const;

// ── Plan economics ───────────────────────────────────────────────────────────

export const PLAN_PRICE_USD = 19.99;
/** Stripe standard card pricing. */
const STRIPE_PERCENT = 0.029;
const STRIPE_FLAT_USD = 0.3;
/** Non-AI per-subscriber cost (Supabase rows/storage/egress, Vercel, email) at the
 *  worst case carried from the earlier voice-economics work. */
export const OTHER_COGS_USD = 1.17;
/** The house rule: COGS should sit at or under 20% of net revenue. */
export const HOUSE_MARGIN = 0.8;

/** What actually lands after Stripe takes its cut. */
export function netRevenueUsd(priceUsd: number = PLAN_PRICE_USD): number {
  return round(priceUsd - (priceUsd * STRIPE_PERCENT + STRIPE_FLAT_USD), 2);
}

// ── Live plan limits (read from plan_entitlements, plan_code='pro', 2026-07-24) ──

export const PRO_MONTHLY_TOKEN_CAP = 12_000_000;
export const PRO_DAILY_TOKEN_CAP = 4_000_000;
/** transcription_seconds_month_limit 90,000s. */
export const PRO_TRANSCRIPTION_MINUTES = 1_500;
/** live_audio_seconds_month_limit 10,800s. */
export const PRO_LIVE_AUDIO_MINUTES = 180;

/** How much a cached prompt token counts against the student's cap.
 *  Mirrors CACHE_HIT_WEIGHT in supabase/functions/nemesis-llm/index.ts. */
export const CACHE_HIT_WEIGHT = 0.1;

// ── Shapes mirrored from the shipped pipelines ───────────────────────────────

/** One notes pass per 45s. apps/mobile/src/lib/live-notes.ts and
 *  apps/web/components/workspace/sessions/use-live-audio.ts both use 45_000. */
export const LIVE_NOTES_INTERVAL_MS = 45_000;
/** The rolling transcript window handed to the notes prompt — a TAIL slice, which is
 *  why these calls get no prefix-cache discount. See cacheHitRate below. */
export const LIVE_NOTES_TRANSCRIPT_CHARS = 8_000;
/** Source material clip for test/mind-map generation.
 *  MATERIAL_CHAR_LIMIT in lib/workspace/study-artifact-content.ts. */
export const MATERIAL_CHAR_LIMIT = 9_000;

/** English averages ~4 characters per token across DeepSeek/GLM tokenizers. An
 *  estimate, and the single largest source of slop in this model — every token
 *  figure below inherits it. */
export const CHARS_PER_TOKEN = 4;
/** Lecture speech at ~150 words/min, ~5.7 characters per word including spaces. */
export const SPEECH_CHARS_PER_MINUTE = 850;

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
 * Which recorder the audio goes through. The whole answer turns on this:
 *  • ios-parakeet — on-device Parakeet (PR #273, shipped in iOS build 22, NOT yet
 *    device-verified). No per-minute cost at all, because nothing leaves the phone.
 *  • ios-ondevice — Apple speech on the phone is free, but the enhance pass fires
 *    automatically on save (RecordSession) and that is Groq batch.
 *  • web-upload   — /api/transcription/submit tries Groq first, AssemblyAI on failure.
 *  • web-live     — /api/live-audio streams to AssemblyAI. Nearly 4x the others.
 */
export type RecorderLane = "ios-parakeet" | "ios-ondevice" | "web-live" | "web-upload";

const LANE_USD_PER_HOUR: Readonly<Record<RecorderLane, number>> = {
  "ios-ondevice": VOICE_USD_PER_HOUR.groq_whisper_turbo,
  "ios-parakeet": 0,
  "web-live": VOICE_USD_PER_HOUR.assemblyai_streaming,
  "web-upload": VOICE_USD_PER_HOUR.groq_whisper_turbo,
};

const LANE_NOTES: Readonly<Record<RecorderLane, string>> = {
  "ios-ondevice": "Apple speech on-device is free; the enhance pass on save is Groq batch",
  "ios-parakeet": "nothing leaves the phone — built (PR #273, build 22), not device-verified",
  "web-live": "AssemblyAI streaming — the expensive lane",
  "web-upload": "Groq whisper-large-v3-turbo, AssemblyAI only on failure",
};

export interface StudentMonth {
  audioHours: number;
  recorder: RecorderLane;
  /** Slide decks uploaded per month. */
  decks: number;
  /** Flashcard batches generated per deck. */
  flashcardRunsPerDeck: number;
  /** Diagnostic tests generated per deck. */
  testRunsPerDeck: number;
  /** Substantial chat turns (workspace context attached) per school day. */
  chatTurnsPerDay: number;
  schoolDays: number;
  /** Model the chat lane runs on. */
  chatModel: string;
  /** Seconds between live-notes passes. Raising this is the biggest token lever. */
  notesIntervalMs: number;
  /** Share of prompt tokens the provider reports as cache hits on the notes lane.
   *  0 today: the prompt ends with a TAIL slice of the transcript, so consecutive
   *  calls share almost no prefix. Restructuring to a growing prefix is what makes
   *  this non-zero, and cached input is 50x cheaper than fresh input. */
  notesCacheHitRate: number;
  /** Per-slide vision calls for figures and diagrams. Not built; Gemini is not in
   *  MODEL_PRICES, so these report UNPRICED rather than $0. */
  visionImagesPerDeck: number;
  /** AI daily-recap notes. Not built. */
  dailyNotes: boolean;
}

/** The owner's stated heavy student: 4h/day, 5 days a week, 3.5 decks a day. */
export const HEAVY_STUDENT: StudentMonth = {
  audioHours: 80,
  chatModel: "deepseek-v4-flash",
  chatTurnsPerDay: 20,
  dailyNotes: true,
  decks: 70,
  flashcardRunsPerDeck: 1,
  notesCacheHitRate: 0,
  notesIntervalMs: LIVE_NOTES_INTERVAL_MS,
  recorder: "web-live",
  schoolDays: 20,
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
  lines: CostLine[];
  /** Sum of the priced lines only. */
  totalUsd: number;
  /** Lines with no price on file — reported as a count so they never read as free. */
  unpriced: string[];
  meteredTokens: number;
  tokenCap: number;
  /** Multiple of the cap this month would spend. 1.0 means exactly at the limit. */
  capRatio: number;
  transcriptionMinutes: number;
  transcriptionCap: number;
  netRevenueUsd: number;
  /** (net revenue - all COGS) / net revenue. */
  grossMarginPct: number;
  meetsHouseMargin: boolean;
  profitable: boolean;
}

export function modelStudentMonth(input: StudentMonth): WorkloadReport {
  const lines = [
    transcriptionLine(input),
    liveNotesLine(input),
    deckGenerationLine(input),
    visionLine(input),
    chatLine(input),
    dailyNotesLine(input),
  ].filter((line): line is CostLine => line !== null);

  const totalUsd = round(lines.reduce((sum, line) => sum + (line.usd ?? 0), 0), 4);
  const cogs = totalUsd + OTHER_COGS_USD;
  const net = netRevenueUsd();
  const metered = lines.reduce((sum, line) => sum + line.metered, 0);
  const minutes = Math.round(input.audioHours * 60);

  return {
    capRatio: round(metered / PRO_MONTHLY_TOKEN_CAP, 2),
    grossMarginPct: round(((net - cogs) / net) * 100, 1),
    lines,
    meetsHouseMargin: cogs <= net * (1 - HOUSE_MARGIN),
    meteredTokens: metered,
    netRevenueUsd: net,
    profitable: cogs < net,
    tokenCap: PRO_MONTHLY_TOKEN_CAP,
    totalUsd,
    transcriptionCap: PRO_TRANSCRIPTION_MINUTES,
    transcriptionMinutes: minutes,
    unpriced: lines.filter((line) => line.usd === null).map((line) => line.name),
  };
}

// ── Lines ────────────────────────────────────────────────────────────────────

function transcriptionLine(input: StudentMonth): CostLine {
  const rate = LANE_USD_PER_HOUR[input.recorder];
  const note = LANE_NOTES[input.recorder];
  return {
    basis: "measured",
    calls: Math.round(input.audioHours),
    metered: 0,
    name: `Transcription (${input.recorder})`,
    note: `$${rate.toFixed(2)}/audio-hour — ${note}`,
    usd: round(input.audioHours * rate, 4),
  };
}

/**
 * The rolling live-notes pass. Hours of audio times 80 calls an hour is the single
 * biggest token consumer in the product, and the prompt is nearly all input.
 */
function liveNotesLine(input: StudentMonth): CostLine {
  const callsPerHour = 3_600_000 / input.notesIntervalMs;
  const calls = Math.round(input.audioHours * callsPerHour);
  // Steady state: system prompt + session context + up to 12 kept notes + the full
  // 8,000-char transcript window. Short recordings sit under this, so it is an
  // upper bound on a lecture-length session.
  const promptTokens = tokensFromChars(450 + 500 + 12 * 240 + LIVE_NOTES_TRANSCRIPT_CHARS);
  const completionTokens = tokensFromChars(6 * 240);
  const cacheHitTokens = Math.round(promptTokens * clamp01(input.notesCacheHitRate));
  const split = { cacheHitTokens, completionTokens, promptTokens };
  return {
    basis: "measured",
    calls,
    metered: meteredTokens(split) * calls,
    name: "Live lecture notes",
    note: `one pass per ${input.notesIntervalMs / 1000}s, ~${promptTokens} prompt tokens each, ${Math.round(clamp01(input.notesCacheHitRate) * 100)}% cached`,
    usd: multiply(completionUsd("deepseek-v4-flash", split), calls),
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

/** Explaining concepts, with workspace context attached. */
function chatLine(input: StudentMonth): CostLine {
  const calls = input.chatTurnsPerDay * input.schoolDays;
  const promptTokens = 8_000;
  const completionTokens = 800;
  // Chat re-sends a stable system prompt and thread history, so the provider does
  // report real cache hits here — unlike the notes lane.
  const split = { cacheHitTokens: Math.round(promptTokens * 0.5), completionTokens, promptTokens };
  return {
    basis: "measured",
    calls,
    metered: meteredTokens(split) * calls,
    name: "Chat: concepts, library edits, planning",
    note: "~8k prompt tokens per turn, ~50% prefix-cached across a thread",
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
