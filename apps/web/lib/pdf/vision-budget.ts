/**
 * What one parse is allowed to spend looking at pictures, and what it actually spent.
 *
 * 🔴 VISION IS THE ONLY PRIMITIVE IN THIS SYSTEM WITH NO ENTITLEMENT AND NO COUNTER.
 * Every other paid call is either metered (transcription minutes, LLM tokens against a
 * tier row) or free. Gemini vision is billed per image and per page, is reached from
 * three different functions in `vision.ts`, and until this module existed nothing
 * counted it, nothing capped it across attempts, and nothing could answer "what did
 * that lecture cost". The unit-economics audit put a single free user at $19.44/mo on
 * this one path.
 *
 * The shape is deliberately small:
 *
 *   reserve  ->  parse (takes units as it goes)  ->  settle (refund what went unused)
 *
 * ## Why a ledger and not just a constant
 *
 * `MAX_FIGURES_PER_DOC` already exists in `figure-routing.ts` and it is a good
 * rule, but it is three things short of a budget:
 *
 *   * It is PER LANE. The figure lane obeys it; the page lane (`readPdfPagesWithVision`)
 *     and the whole-file lane (`readPdfWithVision`) never saw it. A 2,116-page scan is
 *     not a figure and was never covered.
 *   * It is PER ATTEMPT. `document_parse_max_attempts()` is 5, so a document that fails
 *     after paying is worth 5x its cap. A ceiling a retry resets is decorative.
 *   * It counts nothing. "How much did that cost" had no answer, so the honest report to
 *     an owner was an abstract warning rather than a number.
 *
 * ## What is deliberately NOT here
 *
 * No pricing. A ledger that knew dollars would have to be edited every time a vendor
 * changed a rate card, and it would be edited wrongly, because the person changing the
 * rate is not the person reading this file. Units are the durable fact; `docs/vision-cost.md`
 * multiplies them by a dated price.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** One image, or one PDF page, or one whole-file read. The billed unit. */
export interface VisionSpend {
  /** HTTP requests that actually left. Batching means calls < units. */
  readonly calls: number;
  /** Images and pages sent. This is the number a price is multiplied by. */
  readonly units: number;
}

export const NO_SPEND: VisionSpend = { calls: 0, units: 0 };

/**
 * The most units ONE DOCUMENT may ever cost, across every attempt it is given.
 *
 * 🔴 SIZED FROM MEASUREMENT, NOT FROM COMFORT. The page lane is the expensive one: a
 * scanned book is one unit per page, and the worst real document in the corpus is 2,116
 * pages.
 *
 * 🔴 AND IT IS NOW THE ONLY CEILING ON THE FIGURE LANE TOO (2026-09-01). `MAX_FIGURES_PER_DOC`
 * was 40, sized on the AVERAGE of a corpus (~9 figures a file) — and an average is the wrong
 * statistic for a ceiling, because every document that meets a ceiling lives in the tail. A real
 * lecture deck measured that day held ~117 figures and 77 were never looked at. It is 120 now,
 * matching this cap, so the priced ledger decides and an unpriced constant no longer silently
 * picks which content is lost first.
 *
 * 120 is deliberately BELOW what the worst document needs. That is the conservative
 * choice the owner asked for: a 2,116-page scan reports pages it could not afford to
 * read — which coverage already knows how to say — rather than quietly costing 17x the
 * next most expensive document in the library. Raising it is a priced decision, and the
 * number it should be raised to is whatever `docs/vision-cost.md` measures.
 */
export const DEFAULT_DOCUMENT_UNIT_CAP = 120;

/**
 * The most units ONE USER may spend in a rolling day.
 *
 * The per-document cap bounds a malformed file. This bounds a person: 25 documents at
 * the full document cap, which is far above any real day of study and far below the
 * "free user costs $19.44/mo" case the audit found.
 */
export const DEFAULT_USER_DAILY_UNIT_CAP = 3_000;

/** Read a positive integer from the environment, or keep the default. */
function capFrom(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function documentUnitCap(env: Record<string, string | undefined> = process.env): number {
  return capFrom(env.VISION_DOCUMENT_UNIT_CAP, DEFAULT_DOCUMENT_UNIT_CAP);
}

export function userDailyUnitCap(env: Record<string, string | undefined> = process.env): number {
  return capFrom(env.VISION_USER_DAILY_UNIT_CAP, DEFAULT_USER_DAILY_UNIT_CAP);
}

/**
 * One parse's allowance, and its running total.
 *
 * MUTABLE ON PURPOSE, and the one place in this codebase where that is the honest shape:
 * a budget that returned a new copy on every debit would let a caller spend the same
 * allowance twice by holding the old one. Money already spent cannot be un-spent by
 * keeping a reference.
 */
export class VisionLedger {
  #limit: number;
  #calls = 0;
  #units = 0;

  constructor(limit: number) {
    this.#limit = Math.max(0, Math.floor(limit));
  }

  /**
   * Claim up to `requested` units. Returns how many were granted — possibly 0.
   *
   * 🔴 GRANTING IS SPENDING. The caller is charged the moment it takes, not when the
   * request succeeds, because a request that failed after reaching the model was still
   * billed. Counting only successes would make a document that times out repeatedly look
   * free, which is the exact opposite of true.
   */
  take(requested: number): number {
    const want = Math.max(0, Math.floor(requested));
    const granted = Math.min(want, this.remaining());
    this.#units += granted;
    return granted;
  }

  /** One HTTP request left the process. Recorded separately because batching means calls < units. */
  noteCall(): void {
    this.#calls += 1;
  }

  remaining(): number {
    return Math.max(0, this.#limit - this.#units);
  }

  exhausted(): boolean {
    return this.remaining() === 0;
  }

  spend(): VisionSpend {
    return { calls: this.#calls, units: this.#units };
  }
}

/**
 * The ledger the current parse is running under.
 *
 * 🔴 ASYNC-LOCAL, NOT MODULE-GLOBAL, AND THE DIFFERENCE IS A REAL BUG. The background
 * worker runs one parse per thread, where a module-level counter would be fine. The
 * SYNCHRONOUS upload lane runs inside a shared Next.js process, where two students
 * uploading at once would share one counter — the second upload would find the budget
 * already spent and silently describe nothing. `AsyncLocalStorage` gives each parse its
 * own ledger without threading a parameter through every lane between here and
 * `parseDocument`.
 */
const ledgerStore = new AsyncLocalStorage<VisionLedger>();

/** Run `body` with `ledger` as the ambient budget. */
export function withVisionBudget<T>(ledger: VisionLedger, body: () => Promise<T>): Promise<T> {
  return ledgerStore.run(ledger, body);
}

/**
 * The ambient ledger, or a fresh capped one.
 *
 * 🔴 THE FALLBACK IS FRESH EVERY TIME, AND THAT IS NOT AN OVERSIGHT. A single shared
 * fallback would accumulate across unrelated requests and permanently exhaust, so every
 * document after the first N would silently stop being looked at — a cap that turns into
 * an outage. A fresh ledger still bounds the thing that is actually unbounded: ONE call
 * with a 400-figure document behind it. Callers that need the cap to hold across a whole
 * multi-lane parse — which is every caller that spends real money — install one with
 * `withVisionBudget`.
 */
export function currentVisionLedger(): VisionLedger {
  return ledgerStore.getStore() ?? new VisionLedger(documentUnitCap());
}

/**
 * How many units this attempt may have, given what the document and the user already spent.
 *
 * PURE, so the arithmetic that decides whether a student's lecture gets looked at is
 * testable without a database.
 *
 * Returns 0 rather than a negative number when either ceiling is already breached — a
 * caller that treated -3 as "3 left" is the shape of bug this returns early to prevent.
 */
export function grantableUnits(input: {
  readonly documentSpent: number;
  readonly documentCap: number;
  readonly userSpentToday: number;
  readonly userDailyCap: number;
}): number {
  const perDocument = input.documentCap - input.documentSpent;
  const perUser = input.userDailyCap - input.userSpentToday;
  return Math.max(0, Math.min(perDocument, perUser));
}
