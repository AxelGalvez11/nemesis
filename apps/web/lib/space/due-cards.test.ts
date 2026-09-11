import assert from "node:assert/strict";
import test from "node:test";

import { countDueCards, dueCardsFilter, dueCardsForReview, nextDueAfter, REVIEW_DECK_ID, type DueCardsDb } from "./due-cards";
import { buildReviewQueue, type ReviewQueueCard } from "../workspace/study-review-queue";
import { LEARN_AHEAD_MINUTES } from "../workspace/study-scheduler";

// ── the sidebar's number and the review page's cards are one rule ───────────────────────────────
//
// The row says "Review due cards (12)" and /review works through them. The row counts in the
// database because it must not load a whole collection to draw a sidebar; the page filters in
// memory because it already holds every card. Two places, and the only thing keeping them honest is
// that both express the same predicate — so that is what these tests check, by running the count
// against a fake Postgres and the page's own filter against the same rows.

const NOW = Date.parse("2026-09-11T10:00:00.000Z");
/** Minutes from NOW, as an ISO string. */
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const MINE = "learner-1";

interface Row {
  id: string;
  user_id: string;
  deck_id: string;
  due_at: string;
  state: string;
  suspended: boolean;
}

const row = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  user_id: MINE,
  deck_id: "deck-1",
  due_at: at(-720),
  state: "review",
  suspended: false,
  ...overrides,
});

/**
 * One collection, covering every branch of the rule at once. Deliberately subject-free: a card here
 * is a due date and a state, and nothing about this rule is specific to what anybody studies.
 */
const ROWS: Row[] = [
  row("due-this-morning"),
  // Across ALL decks is the whole point of this page; a second deck proves it is not deck-scoped.
  row("due-in-another-deck", { deck_id: "deck-2", due_at: at(-30) }),
  // A card whose time has come that has never been graded.
  row("never-seen", { deck_id: "deck-2", due_at: at(-1), state: "new" }),
  // Mid-step, not due yet, but inside Anki's learn-ahead window.
  row("stepping-back-soon", { due_at: at(10), state: "learning" }),
  // Mid-step and beyond the window: it waits.
  row("stepping-back-later", { due_at: at(45), state: "learning" }),
  // A review card close to due is NEVER pulled forward; reviewing early is the thing spaced
  // repetition exists to avoid.
  row("due-in-five-minutes", { due_at: at(5) }),
  row("put-aside", { due_at: at(-60), suspended: true }),
  row("somebody-else-entirely", { user_id: "learner-2", due_at: at(-60) }),
];

/** The same rows as the page holds them, which is the shape `toCard` produces. */
const asCards = (rows: readonly Row[]): ReviewQueueCard[] =>
  rows.filter((r) => r.user_id === MINE).map((r) => ({ id: r.id, deckId: r.deck_id, dueAt: r.due_at, state: r.state as ReviewQueueCard["state"], suspended: r.suspended }));

const DUE = ["due-this-morning", "due-in-another-deck", "never-seen", "stepping-back-soon"];

// ── a fake Postgres that MEANS the filter rather than merely recording it ────────────────────────
//
// 🔴 THE POINT OF INTERPRETING THE EXPRESSION. Asserting the filter string matches a pattern would
// pass just as well on a filter that says the wrong thing, and the disagreement this whole module
// exists to prevent is exactly "the SQL means something slightly different from the predicate". So
// the fake evaluates it: `column.op.value`, `in.(a,b)` lists, `and(...)` groups, and a comma at the
// top level meaning OR, which is PostgREST's logic-tree grammar as supabase-js sends it.

/** Split on commas that are not inside brackets. */
function parts(expression: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      out.push(expression.slice(start, i));
      start = i + 1;
    }
  }
  out.push(expression.slice(start));
  return out;
}

/** What `.or(…)` means: PostgREST receives `or=(…)`, so the top-level clauses are alternatives. */
const holdsAny = (record: Record<string, unknown>, filter: string): boolean => parts(filter).some((clause) => holds(record, clause));

function holds(record: Record<string, unknown>, clause: string): boolean {
  if (clause.startsWith("and(")) return parts(clause.slice(4, -1)).every((inner) => holds(record, inner));
  if (clause.startsWith("or(")) return parts(clause.slice(3, -1)).some((inner) => holds(record, inner));
  const [column, op, ...rest] = clause.split(".");
  const value = rest.join(".");
  const cell = String(record[column!]);
  if (op === "in") return value.slice(1, -1).split(",").includes(cell);
  if (op === "eq") return cell === value;
  if (op === "lte") {
    const left = Date.parse(cell);
    const right = Date.parse(value);
    return Number.isFinite(left) && Number.isFinite(right) ? left <= right : cell <= value;
  }
  throw new Error(`the fake backend does not know the operator "${op}"`);
}

function fakeDb(rows: readonly Row[], session: { user: { id: string } } | null = { user: { id: MINE } }) {
  const queries: Array<{ table: string; columns: string; filter: string | null }> = [];
  const db = {
    auth: { getSession: async () => ({ data: { session } }) },
    from(table: string) {
      return {
        select(columns: string, options: { count: "exact"; head: true }) {
          assert.equal(options.count, "exact", "the row count is not being asked for");
          assert.equal(options.head, true, "the count dragged every row back with it");
          const equals: Array<[string, unknown]> = [];
          let filter: string | null = null;
          const query = {
            eq(column: string, value: unknown) {
              equals.push([column, value]);
              return query;
            },
            or(expression: string) {
              filter = expression;
              return query;
            },
            then(resolve: (result: { count: number; error: null }) => void) {
              queries.push({ table, columns, filter });
              const kept = rows.filter(
                (record) =>
                  equals.every(([column, value]) => (record as unknown as Record<string, unknown>)[column] === value)
                  && (filter === null || holdsAny(record as unknown as Record<string, unknown>, filter)),
              );
              resolve({ count: kept.length, error: null });
            },
          };
          return query;
        },
      };
    },
  };
  return { db: db as unknown as DueCardsDb, queries };
}

test("🔴🔴 the sidebar's number is the cards the page would review, across every deck", async () => {
  const { db, queries } = fakeDb(ROWS);
  const counted = await countDueCards(db, NOW);

  assert.deepEqual(dueCardsForReview(asCards(ROWS), NOW).map((card) => card.id).sort(), [...DUE].sort(), "the page reviews a different set than the rule says");
  assert.equal(counted, DUE.length, "the count and the page disagree about how many cards are due");

  // One query, against the person's own cards, and no rows dragged back to draw a sidebar row.
  assert.equal(queries.length, 1, "the count is not one query");
  assert.equal(queries[0]!.table, "study_cards");
  assert.equal(queries[0]!.columns, "id");
});

test("🔴🔴 the player walks exactly the cards that were counted", async () => {
  // The strongest form of the claim: not "the numbers match" but "the queue hands over these cards
  // and then stops". Each card is graded the way a graduating press leaves it, days away, so the
  // sitting ends rather than looping.
  const { db } = fakeDb(ROWS);
  let live = asCards(ROWS);
  const walked: string[] = [];
  for (let guard = 0; guard < 50; guard += 1) {
    const queue = buildReviewQueue({ cards: dueCardsForReview(live, NOW), deckId: REVIEW_DECK_ID, now: new Date(NOW) });
    const next = queue[0];
    if (!next) break;
    walked.push(next.id);
    live = live.map((card) => (card.id === next.id ? { ...card, dueAt: at(3 * 1440), state: "review" } : card));
  }

  assert.deepEqual(walked.slice().sort(), [...DUE].sort(), "the player walks a different set of cards than the row counted");
  assert.equal(walked.length, await countDueCards(db, NOW));
  // 🔴 THE ORDER IS THE QUEUE'S OWN AND IS NOT THIS MODULE'S BUSINESS, but the one ordering rule that
  // would be a bug to lose is asserted: the card on a clock goes before the ones merely due today.
  assert.equal(walked[walked.length - 1], "stepping-back-soon", "a card pulled forward jumped ahead of cards that are genuinely due");
});

test("🔴 a card mid-step is still counted when nothing else is due, because opening the page would review it", async () => {
  // Press Good on your last card and it comes back in ten minutes. A strict "due now" count would
  // read zero over a sitting that is plainly unfinished, and the row would say you were done.
  const stepping = [row("stepping-back-soon", { due_at: at(10), state: "learning" })];
  const { db } = fakeDb(stepping);
  assert.equal(await countDueCards(db, NOW), 1);
  assert.deepEqual(dueCardsForReview(asCards(stepping), NOW).map((card) => card.id), ["stepping-back-soon"]);

  // Beyond the window, both sides wait.
  const later = [row("stepping-back-later", { due_at: at(LEARN_AHEAD_MINUTES + 5), state: "learning" })];
  assert.equal(await countDueCards(fakeDb(later).db, NOW), 0);
  assert.deepEqual(dueCardsForReview(asCards(later), NOW), []);
});

test("🔴 the window in the query is the scheduler's own, never a second copy of twenty minutes", () => {
  // A hand-typed interval here is the likeliest way these two drift: the constant would move in
  // study-scheduler.ts and the sidebar would keep counting against the old one.
  const filter = dueCardsFilter(NOW);
  assert.ok(filter.includes(`due_at.lte.${new Date(NOW).toISOString()}`), "the query stopped counting what is due now");
  assert.ok(
    filter.includes(`due_at.lte.${new Date(NOW + LEARN_AHEAD_MINUTES * 60_000).toISOString()}`),
    "the learn-ahead window in the query is not the scheduler's",
  );
  assert.ok(filter.includes("state.in.(learning,relearning)"), "the query pulls forward something other than a card mid-step");
});

test("the cards are the signed-in person's own, and nobody is counted when nobody is signed in", async () => {
  const { db, queries } = fakeDb(ROWS, null);
  assert.equal(await countDueCards(db, NOW), 0);
  assert.equal(queries.length, 0, "a signed-out visitor still queried the database");

  // Somebody else's due card is in the fixture above and is in neither the count nor the page's list.
  assert.ok(!DUE.includes("somebody-else-entirely"));
  assert.ok(!dueCardsForReview(asCards(ROWS), NOW).some((card) => card.id === "somebody-else-entirely"));
});

test("a count that fails says so instead of reporting zero cards", async () => {
  // Zero is a sentence: "you are finished". A read that did not happen must never say it.
  const db = {
    auth: { getSession: async () => ({ data: { session: { user: { id: MINE } } } }) },
    from: () => ({
      select: () => {
        const query = {
          eq: () => query,
          or: () => query,
          then: (resolve: (result: { count: null; error: { message: string } }) => void) => resolve({ count: null, error: { message: "the connection dropped" } }),
        };
        return query;
      },
    }),
  } as unknown as DueCardsDb;
  await assert.rejects(() => countDueCards(db, NOW), /the connection dropped/);
});

test("the empty state can say when the next card arrives, and ignores cards that are put aside", () => {
  assert.equal(nextDueAfter(asCards(ROWS), NOW), NOW + 5 * 60_000, "the soonest card still to come is not the one reported");
  assert.equal(nextDueAfter(asCards([row("put-aside", { due_at: at(30), suspended: true })]), NOW), null, "a suspended card was offered as the next one due");
  assert.equal(nextDueAfter([], NOW), null);
});
