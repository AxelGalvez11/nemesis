/**
 * Study performance statistics — the numbers behind "how am I doing?".
 *
 * Owner rule (see memory: meta stats computed in real code, never LLM-guessed):
 * every percentage, count, and trend on this page is computed HERE, in ordinary
 * arithmetic over rows the app already logs, and handed to the model as numbers.
 * The model's job is to explain them, never to estimate them. That is also why
 * every field is explicitly named and why `RETENTION_DEFINITION` ships inside
 * the payload: a model that is told what a number means cannot invent a
 * different meaning for it.
 *
 * Nothing here is new capture. `study_review_logs` has recorded every grade
 * since 20260719194556_web_library_study.sql, `study_cards` holds the per-card
 * memory state, and `study_artifacts.content.attempts` has carried test scores
 * and the exact missed questions since Batch C. Only a reader was missing.
 *
 * Pure and dependency-free (no Supabase, no DOM) so all of it is unit-tested.
 */

import { parseTestContent, type TestAttempt } from "./study-artifact-content";

/** Anki's own convention: a card whose interval has reached three weeks is
 *  "mature" — long-term memory rather than something still being learned. */
export const MATURE_INTERVAL_DAYS = 21;

/** A card is flagged as struggling once it has lapsed this many times. Anki
 *  calls these leeches and defaults to 8; we surface them earlier because the
 *  point is to tell the student before the card becomes a wall. */
export const LEECH_LAPSES = 4;

/** Stated in the payload so the model describes the number the way it is
 *  actually computed instead of reaching for a textbook definition. */
export const RETENTION_DEFINITION =
  "retention_pct is the share of graded reviews in this window that were NOT graded 'again' — i.e. how often the student recalled a card successfully at the moment it came up.";

const MAX_DECKS = 20;
const MAX_STRUGGLING = 12;
const MAX_TESTS = 12;
const MAX_MISSED = 5;
const DAY_MS = 86_400_000;

export interface ReviewLogRow {
  card_id: string;
  grade: string;
  reviewed_at: string;
}

export interface CardRow {
  id: string;
  deck_id: string;
  front: string;
  interval_days: number;
  repetitions: number;
  lapses: number;
  suspended: boolean;
  due_at: string;
}

export interface DeckRow {
  id: string;
  name: string;
}

export interface TestArtifactRow {
  title: string;
  group_name: string | null;
  content: unknown;
}

export interface DeckPerformance {
  deck: string;
  cards: number;
  unseen: number;
  learning: number;
  mature: number;
  due_now: number;
  suspended: number;
  reviews: number;
  /** Null when the deck saw no reviews in the window — an honest "no data yet"
   *  rather than a 0% that reads like total failure. */
  retention_pct: number | null;
}

export interface StrugglingCard {
  deck: string;
  front: string;
  lapses: number;
  interval_days: number;
}

export interface TestPerformance {
  title: string;
  group: string | null;
  attempts: number;
  latest_pct: number | null;
  first_pct: number | null;
  /** "up" / "down" only when first and latest differ by more than a rounding
   *  wobble; a single attempt has no trend at all. */
  trend: "up" | "down" | "flat" | null;
  last_taken: string | null;
  most_missed: string[];
}

export interface PerformanceSummary {
  window_days: number;
  reviews: number;
  days_studied: number;
  current_streak_days: number;
  retention_pct: number | null;
  cards_total: number;
  due_now: number;
  decks: DeckPerformance[];
  struggling_cards: StrugglingCard[];
  tests: TestPerformance[];
  retention_definition: string;
  /** Set when there is genuinely nothing to report, so the model says so
   *  plainly instead of narrating an empty table as if it were a finding. */
  note?: string;
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function clean(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** Calendar day (UTC) of an ISO timestamp, or null when unparseable. */
function dayOf(iso: string): string | null {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null;
}

/**
 * Consecutive days with at least one review, counting back from today. A streak
 * that ended yesterday still counts (the student has not missed a day yet at
 * 9am); one that ended two days ago is over.
 */
export function currentStreak(days: ReadonlySet<string>, now: Date): number {
  const todayMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(todayMs)) return 0;
  let cursor = todayMs;
  if (!days.has(new Date(cursor).toISOString().slice(0, 10))) {
    cursor -= DAY_MS;
    if (!days.has(new Date(cursor).toISOString().slice(0, 10))) return 0;
  }
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

/** One test artifact's attempt history, reduced to score trend and the
 *  questions the student actually got wrong most often. */
export function summarizeTest(row: TestArtifactRow): TestPerformance | null {
  const content = parseTestContent(row.content);
  if (!content) return null;
  const attempts = [...content.attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = attempts[0] ?? null;
  const latest = attempts[attempts.length - 1] ?? null;
  const firstPct = first ? pct(first.score, first.total) : null;
  const latestPct = latest ? pct(latest.score, latest.total) : null;

  let trend: TestPerformance["trend"] = null;
  if (attempts.length > 1 && firstPct !== null && latestPct !== null) {
    const delta = latestPct - firstPct;
    trend = delta > 1 ? "up" : delta < -1 ? "down" : "flat";
  }

  // Count misses per question index across every attempt, then name the
  // questions themselves — "you keep missing question 4" is useless without it.
  const missCounts = new Map<number, number>();
  for (const attempt of attempts as TestAttempt[]) {
    for (const miss of attempt.missed) {
      missCounts.set(miss.questionIndex, (missCounts.get(miss.questionIndex) ?? 0) + 1);
    }
  }
  const mostMissed = [...missCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_MISSED)
    .flatMap(([index]) => {
      const question = content.questions[index];
      return question ? [clean(question.q, 160)] : [];
    });

  return {
    attempts: attempts.length,
    first_pct: firstPct,
    group: row.group_name?.trim() || null,
    last_taken: latest?.at ?? null,
    latest_pct: latestPct,
    most_missed: mostMissed,
    title: clean(row.title, 160),
    trend,
  };
}

export interface PerformanceInput {
  decks: readonly DeckRow[];
  cards: readonly CardRow[];
  logs: readonly ReviewLogRow[];
  tests: readonly TestArtifactRow[];
  windowDays: number;
  now: Date;
}

/**
 * Turn raw rows into the findings a student would recognise: per-deck retention
 * and card mix, the cards that keep lapsing, and how test scores are moving.
 * PURE — every caller passes rows in and gets numbers out.
 */
export function summarizePerformance(input: PerformanceInput): PerformanceSummary {
  const { cards, decks, logs, now, tests, windowDays } = input;
  const deckNames = new Map(decks.map((deck) => [deck.id, clean(deck.name)]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const nowMs = now.getTime();

  // Per-deck accumulators, seeded from the deck list so a deck with cards but
  // no reviews still appears (that IS the finding: untouched material).
  const byDeck = new Map<string, DeckPerformance>();
  const ensure = (deckId: string): DeckPerformance => {
    const key = deckNames.get(deckId) ?? "(deleted deck)";
    let row = byDeck.get(key);
    if (!row) {
      row = { cards: 0, deck: key, due_now: 0, learning: 0, mature: 0, retention_pct: null, reviews: 0, suspended: 0, unseen: 0 };
      byDeck.set(key, row);
    }
    return row;
  };
  for (const deck of decks) ensure(deck.id);

  let dueNow = 0;
  for (const card of cards) {
    const row = ensure(card.deck_id);
    row.cards += 1;
    if (card.suspended) row.suspended += 1;
    if (card.repetitions <= 0) row.unseen += 1;
    else if (card.interval_days >= MATURE_INTERVAL_DAYS) row.mature += 1;
    else row.learning += 1;
    const due = Date.parse(card.due_at);
    if (!card.suspended && Number.isFinite(due) && due <= nowMs) {
      row.due_now += 1;
      dueNow += 1;
    }
  }

  // Retention is counted per deck AND overall from the same pass.
  const deckReviewTotals = new Map<string, { total: number; recalled: number }>();
  const studiedDays = new Set<string>();
  let totalReviews = 0;
  let totalRecalled = 0;
  for (const log of logs) {
    const day = dayOf(log.reviewed_at);
    if (day) studiedDays.add(day);
    totalReviews += 1;
    const recalled = log.grade !== "again";
    if (recalled) totalRecalled += 1;
    const card = cardsById.get(log.card_id);
    // A review whose card has since been deleted still counts toward the
    // overall totals — it happened — but has no deck to attribute it to.
    if (!card) continue;
    const key = deckNames.get(card.deck_id) ?? "(deleted deck)";
    const tally = deckReviewTotals.get(key) ?? { recalled: 0, total: 0 };
    tally.total += 1;
    if (recalled) tally.recalled += 1;
    deckReviewTotals.set(key, tally);
  }
  for (const [key, tally] of deckReviewTotals) {
    const row = byDeck.get(key) ?? ensure(key);
    row.reviews = tally.total;
    row.retention_pct = pct(tally.recalled, tally.total);
  }

  const struggling: StrugglingCard[] = cards
    .filter((card) => card.lapses >= LEECH_LAPSES)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, MAX_STRUGGLING)
    .map((card) => ({
      deck: deckNames.get(card.deck_id) ?? "(deleted deck)",
      front: clean(card.front, 160),
      interval_days: card.interval_days,
      lapses: card.lapses,
    }));

  const testRows = tests
    .flatMap((row) => {
      const summary = summarizeTest(row);
      return summary && summary.attempts > 0 ? [summary] : [];
    })
    .sort((a, b) => Date.parse(b.last_taken ?? "") - Date.parse(a.last_taken ?? ""))
    .slice(0, MAX_TESTS);

  const deckRows = [...byDeck.values()]
    .filter((row) => row.cards > 0 || row.reviews > 0)
    .sort((a, b) => b.reviews - a.reviews || b.cards - a.cards)
    .slice(0, MAX_DECKS);

  const summary: PerformanceSummary = {
    cards_total: cards.length,
    current_streak_days: currentStreak(studiedDays, now),
    days_studied: studiedDays.size,
    decks: deckRows,
    due_now: dueNow,
    retention_definition: RETENTION_DEFINITION,
    retention_pct: pct(totalRecalled, totalReviews),
    reviews: totalReviews,
    struggling_cards: struggling,
    tests: testRows,
    window_days: windowDays,
  };

  if (totalReviews === 0 && testRows.length === 0) {
    summary.note =
      cards.length === 0
        ? "This student has no flashcards and no completed practice tests yet, so there is no performance history to report."
        : `This student has cards but no graded reviews in the last ${windowDays} days and no completed practice tests, so there is no performance history to report yet.`;
  }

  return summary;
}
