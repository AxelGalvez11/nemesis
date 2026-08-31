import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The scheduler exists twice, and this is what stops the two copies drifting apart.
//
// 🔴🔴 WHY THERE ARE TWO AT ALL. Production grading has to be one atomic statement in Postgres —
// it takes a row lock, advances the card and writes the audit row in a single transaction, so two
// devices reviewing the same card cannot interleave into a corrupt schedule. But the browser also
// needs the answer BEFORE that round trip returns (the optimistic update the learner sees the
// instant they press a grade) and the signed-out preview lane has no database at all. So the same
// equations live in `study-scheduler.ts` and in `grade_study_card`.
//
// 🔴🔴 THE FAILURE MODE IS SILENT AND SLOW, WHICH IS WHY THIS FILE IS STRICT. If the two disagree,
// nothing throws: a card simply shows "due in 6 days" for a moment and then quietly becomes 9, and
// the preview lane teaches a schedule the real one will not honour. Nobody notices for weeks.
//
// 🔴 WHAT THIS CAN AND CANNOT CHECK. It reads the SQL as text; it cannot execute it. So it pins the
// things a drift would show up in FIRST — the seventeen parameters, the derived constants, and the
// shape of each equation — and leaves "do they produce the same number" to the acceptance run
// against the real database. Text is a weaker check than execution and a much stronger one than
// nothing, which is what was here before.

/**
 * 🔴🔴 TWO VIEWS OF THE MIGRATIONS, AND CONFLATING THEM IS A REAL TRAP. The scheduler was rewritten
 * three times in one day: 20260830T30 introduced FSRS-4.5, T40 added Anki's learning steps, and T50
 * replaced 4.5 with FSRS-6. Each `create or replace` supersedes the last.
 *
 *   • `FUNCTION` is T50 ALONE, because that is the body Postgres actually executes. An assertion
 *     about the equations run against all three files would happily match 4.5's arithmetic sitting
 *     in T30 and report agreement with a version that no longer runs — the exact failure this file
 *     exists to prevent.
 *   • `SCHEMA` is all three, because a column added in T30 is still there and re-asserting it in
 *     every later migration would be noise.
 */
const read = (name: string) => readFileSync(new URL(`../../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const FUNCTION = read("20260830T50_fsrs6.sql");
const SCHEMA = [read("20260830T30_study_fsrs.sql"), read("20260830T40_study_learning_steps.sql"), FUNCTION].join("\n");
const SCHEDULER = readFileSync(new URL("./study-scheduler.ts", import.meta.url), "utf8");
/** The scheduler with its prose removed. Its header DISCUSSES duration at length, deliberately, so
 *  "no duration in the maths" has to be asked of the code rather than of the file. */
const SCHEDULER_CODE = SCHEDULER.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

/** The published FSRS-6 defaults, written out here so a change has to be made in three places. */
const WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

test("🔴🔴 both implementations carry the same twenty-one parameters, in the same order", () => {
  // Index IS meaning in FSRS: w4 is the initial difficulty intercept, w15 is the hard penalty.
  // Order matters more than the values, and a reordering is invisible to every type checker.
  const inSql = [...FUNCTION.matchAll(/(\d+\.\d+)(?=[,\s\]])/g)].map((hit) => Number(hit[1]));
  const start = inSql.indexOf(WEIGHTS[0]!);
  assert.notEqual(start, -1, "the migration does not carry the FSRS parameter array at all");
  assert.deepEqual(inSql.slice(start, start + WEIGHTS.length), WEIGHTS, "the SQL parameters drifted from the published set");

  const inTs = [...SCHEDULER.matchAll(/(\d+\.\d+)(?=,)/g)].map((hit) => Number(hit[1]));
  const tsStart = inTs.indexOf(WEIGHTS[0]!);
  assert.notEqual(tsStart, -1, "study-scheduler.ts does not carry the FSRS parameter array");
  assert.deepEqual(inTs.slice(tsStart, tsStart + WEIGHTS.length), WEIGHTS, "the TypeScript parameters drifted from the SQL");
});

test("🔴🔴 the decay and the factor are DERIVED on both sides, never typed out", () => {
  // In FSRS-6 the decay is a fitted parameter (w20), not the fixed 0.5 of 4.5, and the factor
  // follows from it: it is the value that makes retrievability exactly 0.9 when elapsed days equals
  // stability, which is the DEFINITION of stability. Typing either as a literal would pin the
  // algorithm to one version's constants and silently redefine the unit the model works in.
  assert.match(FUNCTION, /v_decay := -w\[21\];/, "the SQL decay is not read from the parameters");
  assert.match(FUNCTION, /v_factor := power\(0\.9, 1\.0 \/ v_decay\) - 1;/, "the SQL factor is hard-coded");
  assert.match(SCHEDULER, /const DECAY = -FSRS_WEIGHTS\[20\];/, "the TypeScript decay is not read from the parameters");
  assert.match(SCHEDULER, /const FACTOR = Math\.pow\(0\.9, 1 \/ DECAY\) - 1;/, "the TypeScript factor is hard-coded");
  assert.match(FUNCTION, /v_retention double precision := 0\.9/, "the SQL retention target moved");
  assert.match(SCHEDULER, /DESIRED_RETENTION = 0\.9/, "the TypeScript retention target moved");
});

test("🔴 the three equations have the same shape on both sides", () => {
  // Retrievability: (1 + FACTOR * t / S) ^ DECAY
  assert.match(FUNCTION, /power\(1 \+ v_factor \* v_elapsed \/ v_stability_in, v_decay\)/, "the SQL forgetting curve changed shape");
  assert.match(SCHEDULER, /Math\.pow\(1 \+ \(FACTOR \* Math\.max\(0, elapsedDays\)\) \/ stability, DECAY\)/, "the TypeScript forgetting curve changed shape");

  // Initial difficulty is EXPONENTIAL in the grade in FSRS-6, where 4.5 was linear.
  assert.match(FUNCTION, /w\[5\] - exp\(w\[6\] \* \(v_rating - 1\)\) \+ 1/, "the SQL initial difficulty is not the FSRS-6 curve");
  assert.match(SCHEDULER, /FSRS_WEIGHTS\[4\] - Math\.exp\(FSRS_WEIGHTS\[5\] \* \(RATING\[grade\] - 1\)\) \+ 1/, "the TypeScript initial difficulty is not the FSRS-6 curve");

  // Difficulty: one LINEARLY DAMPED step, then mean reversion toward D0(easy).
  assert.match(FUNCTION, /\(-w\[7\] \* \(v_rating - 3\)\) \* \(10 - v_difficulty_in\) \/ 9\.0/, "the SQL lost the FSRS-6 damping");
  assert.match(FUNCTION, /v_stepped \+ w\[8\] \* \(v_anchor - v_stepped\)/, "the SQL mean reversion changed");
  assert.match(SCHEDULER, /\(delta \* \(10 - difficulty\)\) \/ 9/, "the TypeScript lost the FSRS-6 damping");
  assert.match(SCHEDULER, /stepped \+ FSRS_WEIGHTS\[7\] \* \(initialDifficulty\("easy"\) - stepped\)/, "the TypeScript mean reversion changed");

  // 🔴 A LAPSE COMES OUT STRICTLY WEAKER. FSRS-6 caps it at a FRACTION of the old stability rather
  // than merely refusing to grow it, because a card you have just forgotten is never exactly as
  // strong as it was.
  assert.match(FUNCTION, /v_stability_in \/ exp\(w\[18\] \* w\[19\]\)/, "the SQL lapse cap is not the FSRS-6 one");
  assert.match(SCHEDULER, /stability \/ Math\.exp\(FSRS_WEIGHTS\[17\] \* FSRS_WEIGHTS\[18\]\)/, "the TypeScript lapse cap is not the FSRS-6 one");
});

test("🔴🔴 a same-day review has its OWN curve on both sides, which is why we are on FSRS-6", () => {
  // 4.5 had no same-day formula, so a press ten minutes into a learning step was scored against the
  // long-term forgetting curve — a test of memory the learner had not had time to fail. Losing this
  // branch on either side would silently put the learning steps back on the wrong curve.
  assert.match(FUNCTION, /if v_elapsed < 1 then/, "the SQL scores a learning step as a long-term review");
  assert.match(FUNCTION, /exp\(w\[18\] \* \(v_rating - 3 \+ w\[19\]\)\) \* power\(v_stability_in, -w\[20\]\)/, "the SQL same-day curve changed shape");
  assert.match(FUNCTION, /when v_rating >= 2 then greatest\(v_sinc, 1\)/, "the SQL lets a same-day PASS shrink the memory");
  assert.match(SCHEDULER_CODE, /if \(elapsedDays < 1\)/, "the TypeScript scores a learning step as a long-term review");
  assert.match(SCHEDULER, /Math\.exp\(FSRS_WEIGHTS\[17\] \* \(RATING\[grade\] - 3 \+ FSRS_WEIGHTS\[18\]\)\) \* Math\.pow\(stability, -FSRS_WEIGHTS\[19\]\)/, "the TypeScript same-day curve changed shape");
  assert.match(SCHEDULER, /RATING\[grade\] >= 2 \? Math\.max\(sinc, 1\)/, "the TypeScript lets a same-day PASS shrink the memory");
});

test("🔴🔴 a card from before FSRS is seeded the same way on both sides", () => {
  // Its old interval IS what the old scheduler meant by how long the memory lasts, so that is the
  // seed. If the two sides seeded differently, every pre-2026-08-30 card would jump the first time
  // it was graded, and the jump would depend on whether the learner was signed in.
  assert.match(FUNCTION, /when v_seen then greatest\(0\.1, current_card\.interval_days::double precision\)/, "the SQL seeds a legacy card differently");
  assert.match(SCHEDULER, /seen \? Math\.max\(MIN_STABILITY, card\.intervalDays\)/, "the TypeScript seeds a legacy card differently");
  // And the backfill applies exactly the same rule up front, so most cards never take the fallback.
  assert.match(SCHEMA, /set stability = greatest\(0\.1, interval_days::double precision\)/, "the backfill invents a different starting stability");
  // 🔴 THE NEUTRAL ANCHOR MOVED WITH THE VERSION: 4.5 put it at 5.1618, FSRS-6's D0(good) is about
  // 2.118. T50 re-seeds every card still carrying the old constant, or every legacy card would sit
  // on the wrong part of the difficulty curve from its very next review.
  assert.match(SCHEMA, /where difficulty = 5\.1618/, "legacy cards keep FSRS-4.5's difficulty anchor");
  assert.match(FUNCTION, /set difficulty = least\(10, greatest\(1, 6\.4133 - exp\(0\.8334 \* 2\) \+ 1\)\)/, "the re-seed is not FSRS-6's D0(good)");
});

test("🔴🔴 the old two-argument function is dropped, or every existing client breaks", () => {
  // PostgREST calls by NAME. A 2-arg function and a 3-arg one whose third argument has a default
  // are ambiguous for a call carrying two named arguments, so leaving both would fail every review
  // from the mobile app and the canvas bridge — which both still send only two.
  assert.match(SCHEMA, /drop function if exists public\.grade_study_card\(uuid, text\);/, "the old overload is left in place and calls will be ambiguous");
  assert.match(SCHEMA, /p_duration_ms integer default null/, "the duration argument is not optional, so existing two-argument callers break");
  assert.match(SCHEMA, /grant execute on function public\.grade_study_card\(uuid, text, integer\) to authenticated/, "nobody can execute the new function");
});

test("🔴🔴 how long the learner took is recorded, and nothing schedules on it", () => {
  // Neither Anki nor FSRS uses answer latency to choose an interval; the hesitation is reported by
  // pressing Hard. It is stored because the question cannot be settled later on data nobody
  // collected. This guard is what stops somebody wiring it in without meaning to.
  assert.match(SCHEMA, /add column if not exists duration_ms integer/, "the review log stopped recording how long a card took");
  assert.match(SCHEMA, /duration_ms, elapsed_days, stability, difficulty/, "the duration is accepted and then thrown away");
  assert.doesNotMatch(FUNCTION, /v_stability[^\n]*p_duration_ms|v_difficulty[^\n]*p_duration_ms|v_interval[^\n]*p_duration_ms/, "the SQL schedules on answer latency");
  assert.doesNotMatch(SCHEDULER_CODE, /duration/i, "the TypeScript scheduler takes a duration — see the note at the top of that file");

  // The gap BETWEEN reviews is the timing signal that does count, and it is stored for a later fit.
  assert.match(SCHEMA, /add column if not exists elapsed_days double precision/, "the review log does not record the gap FSRS actually reads");
});


// ── The learning steps ────────────────────────────────────────────────────────
// FSRS decides how many DAYS a graduated card waits. The steps decide whether the card is taking
// that answer yet or coming back in minutes. Both halves exist twice and both have to agree.

test("🔴🔴 the step machine ships in both places, with Anki's own defaults", () => {
  // Read from Anki's `DeckConfig::default()`: learn_steps [1.0, 10.0], relearn_steps [10.0].
  assert.match(FUNCTION, /learn_steps double precision\[\] := array\[1, 10\]/, "the SQL learning steps drifted from Anki's defaults");
  assert.match(FUNCTION, /relearn_steps double precision\[\] := array\[10\]/, "the SQL relearning steps drifted from Anki's defaults");
  assert.match(SCHEDULER, /LEARNING_STEPS: readonly number\[\] = \[1, 10\]/, "the TypeScript learning steps drifted from the SQL");
  assert.match(SCHEDULER, /RELEARNING_STEPS: readonly number\[\] = \[10\]/, "the TypeScript relearning steps drifted from the SQL");
});

test("🔴🔴 a new card is treated as a failed learning card on both sides", () => {
  // Anki's normal.rs states this outright, and it is what makes the first Good worth the SECOND
  // step (ten minutes) rather than repeating the first (one minute). Get it wrong on one side and
  // the two implementations schedule the very first press of every card differently.
  assert.match(FUNCTION, /when current_card\.state = 'new' or current_card\.remaining_steps <= 0 then v_total/, "the SQL starts a new card mid-ladder");
  assert.match(SCHEDULER_CODE, /card\.state === "new" \|\| card\.remainingSteps <= 0 \? steps\.length/, "the TypeScript starts a new card mid-ladder");
});

test("🔴 Hard averages the first two steps on the first step, and 1.5x afterwards, on both sides", () => {
  assert.match(FUNCTION, /when v_index = 0 and v_total >= 2 then \(v_steps\[1\] \+ v_steps\[2\]\) \/ 2\.0/, "the SQL Hard delay changed shape");
  assert.match(FUNCTION, /least\(v_steps\[v_index \+ 1\] \* 1\.5, v_steps\[v_index \+ 1\] \+ 1440\)/, "the SQL Hard cap changed");
  assert.match(SCHEDULER_CODE, /if \(index === 0 && steps\.length >= 2\) return \(steps\[0\]! \+ steps\[1\]!\) \/ 2;/, "the TypeScript Hard delay changed shape");
  assert.match(SCHEDULER_CODE, /Math\.min\(current \* 1\.5, current \+ 24 \* 60\)/, "the TypeScript Hard cap changed");
});

test("🔴🔴 only a graduated card can lapse, on both sides", () => {
  // Counting learning failures as lapses would make somebody struggling with new material look
  // like somebody forgetting what they had learned — and lapses feed difficulty.
  assert.match(FUNCTION, /if current_card\.state = 'review' then\s+if p_grade = 'again' then\s+[\s\S]{0,400}?v_lapses := v_lapses \+ 1;/, "the SQL counts a lapse outside the review state");
  assert.match(SCHEDULER_CODE, /if \(card\.state === "review"\)[\s\S]{0,300}?const lapses = card\.lapses \+ 1;/, "the TypeScript counts a lapse outside the review state");
});

test("🔴 the day interval is carried by a card still in its steps, never applied early", () => {
  // Anki's `card.interval` holds the review interval while the card sits in the learning queue.
  // Zeroing it would lose the graduating interval; applying it would defeat the steps entirely.
  assert.match(FUNCTION, /set due_at = v_due,\s+interval_days = v_interval,/, "the SQL stops carrying the graduating interval");
  assert.match(FUNCTION, /when v_minutes is null then now\(\) \+ make_interval\(days => v_interval\)/, "the SQL no longer schedules graduated cards in days");
  assert.match(SCHEDULER_CODE, /dueInMinutes: null/, "the TypeScript lost the days-versus-minutes distinction");
});
