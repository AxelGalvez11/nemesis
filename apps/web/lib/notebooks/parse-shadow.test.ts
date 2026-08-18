/**
 * The check on the cheap route, and the two ways a check like this stops being one.
 *
 * 🔴 THE FIRST IS A FALSE-PASS RATE THAT MEASURES THE WRONG THING. If `serious` fires whenever the
 * vendor found one more list item or split a paragraph in two, the rate stops being "how often did
 * we lose teaching content" and becomes "how differently do two parsers write" — a number that will
 * never go to zero and that nobody can act on. So `minor` is a first-class outcome and the boundary
 * between it and `serious` is pinned from both sides.
 *
 * 🔴 THE SECOND IS AN UNBOUNDED CHECK. A shadow evaluation is duplicate spend by construction. Every
 * bound is asserted here rather than described: the sample is a stable subset rather than a coin
 * toss, a rate of zero runs nothing, and a rate of one is still bounded by the day's cap in SQL.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildDocument, documentToText, type DocumentModel } from "@nemesis/shared";

import {
  DEFAULT_SHADOW_DAILY_CAP,
  DEFAULT_SHADOW_RATE,
  judgeShadow,
  judgeStructure,
  recoveryOf,
  SERIOUS_TEXT_RATIO,
  shadowDailyCap,
  shadowRate,
  shouldShadow,
  type TeachingRecovery,
} from "./parse-shadow";

function recovery(overrides: Partial<TeachingRecovery> = {}): TeachingRecovery {
  return {
    blocks: 20,
    chars: 5_000,
    equations: 0,
    figures: 2,
    headings: 4,
    listItems: 6,
    tableCells: 40,
    tables: 3,
    units: 10,
    ...overrides,
  };
}

test("a cheap route that recovered everything is safe", () => {
  const verdict = judgeShadow(recovery(), recovery());
  assert.equal(verdict.outcome, "safe");
});

test("🔴 finding a bit more is not a loss — that is two parsers disagreeing about a boundary", () => {
  const verdict = judgeShadow(recovery({ listItems: 6, tables: 3 }), recovery({ listItems: 9, tables: 4 }));
  assert.equal(verdict.outcome, "minor", "9 tables against 11 is where a grid ends, not a missing grid");
  assert.match(verdict.detail, /not losses/);
});

test("🔴 a KIND the cheap route has NONE of is a false pass", () => {
  // 0 tables against 11 is a document whose grids did not arrive. This is the case the owner priced
  // explicitly: losing one contraindication table can be worse than a 10% text shortfall.
  const verdict = judgeShadow(recovery({ tableCells: 0, tables: 0 }), recovery({ tables: 11 }));
  assert.equal(verdict.outcome, "serious");
  assert.match(verdict.detail, /11 table\(s\)/);
});

test("a figure class the cheap route missed entirely is a false pass", () => {
  const verdict = judgeShadow(recovery({ figures: 0 }), recovery({ figures: 8 }));
  assert.equal(verdict.outcome, "serious");
});

test("🔴 wholesale text loss is a false pass, and a tenth more text is not", () => {
  // Set where the measured failures sat: 16,823 words against 9,098 is 1.85x, and the speaker-notes
  // case was 1,141 against 399 — 2.9x.
  assert.equal(judgeShadow(recovery({ chars: 9_098 }), recovery({ chars: 16_823 })).outcome, "serious");
  // 8% more text is not even a difference worth naming, let alone a loss.
  assert.equal(judgeShadow(recovery({ chars: 5_000 }), recovery({ chars: 5_400 })).outcome, "safe");
  // 20% more is worth recording and is still not a loss.
  assert.equal(judgeShadow(recovery({ chars: 5_000 }), recovery({ chars: 6_000 })).outcome, "minor");
  // And just under the ratio is still not a loss, which is the boundary that matters.
  assert.equal(judgeShadow(recovery({ chars: 10_000 }), recovery({ chars: 17_500 })).outcome, "minor");
  assert.ok(SERIOUS_TEXT_RATIO > 1.1 && SERIOUS_TEXT_RATIO < 3);
});

test("🔴 a cheap read that produced nothing at all is the most serious case", () => {
  // The ratio cannot see this one: it divides by a number the guard above refuses to let be zero.
  const verdict = judgeShadow(recovery({ chars: 0 }), recovery({ chars: 4_000 }));
  assert.equal(verdict.outcome, "serious");
  assert.match(verdict.detail, /against our none/);
});

test("🔴 the sample is a stable subset, not a coin toss", () => {
  // A random draw makes "why this file and not that one" unanswerable, and makes a reparse a fresh
  // toss — so one document could be checked five times while its neighbour is never checked.
  const hash = "a".repeat(56) + "00000001";
  assert.equal(shouldShadow(hash, 0.5), shouldShadow(hash, 0.5));
  assert.equal(shouldShadow(hash, 0.5), true, "a low tail is inside a 50% sample");
  assert.equal(shouldShadow("b".repeat(56) + "ffffffff", 0.5), false, "and a high one is outside it");
});

test("🔴 a rate of zero checks nothing at all", () => {
  for (const tail of ["00000000", "7fffffff", "ffffffff"]) {
    assert.equal(shouldShadow("c".repeat(56) + tail, 0), false);
  }
});

test("the sample is roughly the size it claims to be", () => {
  // Uniformity is the whole basis for calling this a rate. Over 4,000 synthetic hashes a 5% sample
  // should land near 5%; a window that was not uniform would show up here immediately.
  let hits = 0;
  const total = 4_000;
  for (let n = 0; n < total; n += 1) {
    const tail = ((n * 1_048_573) % 0xffffffff).toString(16).padStart(8, "0");
    if (shouldShadow("d".repeat(56) + tail, 0.05)) hits += 1;
  }
  const share = hits / total;
  assert.ok(share > 0.02 && share < 0.09, `sampled ${(share * 100).toFixed(1)}%, expected about 5%`);
});

test("🔴 the rate and the cap are both switchable without a deploy", () => {
  assert.equal(shadowRate({ PARSE_SHADOW_RATE: "0" }), 0);
  assert.equal(shadowRate({ PARSE_SHADOW_RATE: "1" }), 1);
  assert.equal(shadowRate({ PARSE_SHADOW_RATE: "nonsense" }), DEFAULT_SHADOW_RATE);
  assert.equal(shadowRate({}), DEFAULT_SHADOW_RATE);
  assert.equal(shadowDailyCap({ PARSE_SHADOW_DAILY_CAP: "0" }), 0);
  assert.equal(shadowDailyCap({}), DEFAULT_SHADOW_DAILY_CAP);
  assert.ok(DEFAULT_SHADOW_RATE > 0 && DEFAULT_SHADOW_RATE <= 0.1, "the default must be a sample, not a second parse of everything");
  assert.ok(DEFAULT_SHADOW_DAILY_CAP > 0 && DEFAULT_SHADOW_DAILY_CAP <= 100);
});

test("🔴 the day's bound is claimed in SQL, so two workers cannot both spend the last slot", () => {
  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260818T20_parse_shadow_evals.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /claim_parse_shadow_run/);
  assert.match(migration, /and runs < p_daily_cap/, "the cap has to be part of the UPDATE's own predicate");
  assert.match(migration, /if p_daily_cap <= 0 then\s*return false/, "a cap of zero must run nothing");
});

test("recovery counts the kinds a learner would miss, from the model rather than the string", () => {
  const model: DocumentModel = buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", text: "H", unit: 0 },
      { headingPath: [], kind: "paragraph", text: "P", unit: 0 },
      { headingPath: [], kind: "figure", text: "", unit: 0 },
      {
        headingPath: [],
        kind: "table",
        table: { headerRows: 1, rows: [["a", "b"], ["c", "d"]] },
        text: "",
        unit: 0,
      },
    ],
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
  });
  const counted = recoveryOf(model, "some text");
  assert.equal(counted.tables, 1);
  assert.equal(counted.tableCells, 4);
  assert.equal(counted.figures, 1);
  assert.equal(counted.headings, 1);
  assert.equal(counted.units, 1);
});

test("a parse with no model counts honestly rather than optimistically", () => {
  const counted = recoveryOf(undefined, "flat text only");
  assert.equal(counted.tables, 0);
  assert.equal(counted.units, 0);
  assert.equal(counted.chars, "flat text only".length);
});

// ── The structural judge ────────────────────────────────────────────────────────────────────────

test("🔴🔴 a table whose cells moved one column is SERIOUS, though every count is identical", () => {
  const grid = (rows: string[][]) => ({
    headerRows: 1,
    rows,
  });
  const model = (rows: string[][]): DocumentModel =>
    buildDocument({
      blocks: [{ headingPath: [], kind: "table", table: grid(rows), text: "", unit: 0 }],
      format: "pdf",
      title: null,
      units: [{ index: 0, kind: "page" }],
    });

  const ours = model([
    ["Clause", "Obligation", "Remedy"],
    ["4.1", "specific performance", "notice within 14 days"],
    ["4.2", "damages", "notice within 30 days"],
  ]);
  const theirs = model([
    ["Clause", "Obligation", "Remedy"],
    ["4.1", "notice within 14 days", "specific performance"],
    ["4.2", "notice within 30 days", "damages"],
  ]);

  // The old comparison sees nothing: one table each, same rows, same cells, same characters.
  const counts = judgeShadow(
    recoveryOf(ours, documentToText(ours)),
    recoveryOf(theirs, documentToText(theirs)),
  );
  assert.equal(counts.outcome, "safe", "this is precisely what a count-based judge cannot see");

  const structure = judgeStructure(
    { model: ours, text: documentToText(ours) },
    { model: theirs, text: documentToText(theirs) },
  );
  assert.equal(structure.outcome, "serious");
  assert.equal(structure.signals.misplacedTables, 1);
  assert.match(structure.detail, /wrong columns/);
});

test("🔴 a page BOTH parsers read across the gutter is not blamed on the cheap route", () => {
  // A hard page is not evidence against us. Blaming it would make the measurement useless on
  // exactly the documents where it matters most.
  const across = (): DocumentModel =>
    buildDocument({
      blocks: [
        { headingPath: [], kind: "paragraph", rect: { height: 40, width: 230, x: 60, y: 100 }, text: "Left column opening statement of the argument.", unit: 0 },
        { headingPath: [], kind: "paragraph", rect: { height: 40, width: 230, x: 330, y: 100 }, text: "Right column opening statement of the argument.", unit: 0 },
        { headingPath: [], kind: "paragraph", rect: { height: 40, width: 230, x: 60, y: 150 }, text: "Left column second statement continuing on.", unit: 0 },
        { headingPath: [], kind: "paragraph", rect: { height: 40, width: 230, x: 330, y: 150 }, text: "Right column second statement continuing on.", unit: 0 },
        { headingPath: [], kind: "paragraph", rect: { height: 40, width: 230, x: 60, y: 200 }, text: "Left column third statement to close it out.", unit: 0 },
        { headingPath: [], kind: "paragraph", rect: { height: 40, width: 230, x: 330, y: 200 }, text: "Right column third statement to close it out.", unit: 0 },
      ],
      format: "pdf",
      title: null,
      units: [{ index: 0, kind: "page", size: { height: 792, width: 612 } }],
    });

  const ours = across();
  const theirs = across();
  const verdict = judgeStructure(
    { model: ours, text: documentToText(ours) },
    { model: theirs, text: documentToText(theirs) },
  );
  assert.equal(verdict.signals.interleavedOurs, 1, "we did read it across");
  assert.equal(verdict.signals.interleavedTheirs, 1, "and so did they");
  assert.equal(verdict.outcome, "safe", "a hard page is not a cheap-route failure");
});

test("🔴 passage-order agreement is RECORDED and classifies nothing", () => {
  // The rule the owner set: do not invent a threshold before collecting data. This signal has no
  // defensible cut point yet, so it must appear on every row and decide none of them.
  const one = "The first proposition, stated at length so it counts as a passage.\nThe second proposition, also stated at length here.";
  const two = "The second proposition, also stated at length here.\nThe first proposition, stated at length so it counts as a passage.";
  const verdict = judgeStructure({ text: one }, { text: two });
  assert.ok(verdict.signals.sharedPassages > 0, "the passages must be recognised as shared");
  assert.ok(verdict.signals.orderAgreement < 1, "and the disagreement must be measured");
  assert.equal(verdict.outcome, "safe", "but it must not decide the verdict");
});

test("the worse of the two judges wins", () => {
  const source = readFileSync(new URL("./parse-shadow.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /structure\.outcome === "serious" \? \("serious" as const\) : counts\.outcome/,
    "a structural failure must not be overridden by a passing count comparison",
  );
});

test("a single mis-parsed cell in a large table is NOT called serious", () => {
  // The other edge of the provisional threshold. One wrong cell in a forty-eight cell table is a
  // parse imperfection, not a destroyed relationship, and a comparator that shouted about it would
  // be ignored within a week.
  const rows = (swap: boolean) => {
    const grid = [["Sample", "Mass (g)", "Yield (%)", "Notes"]];
    for (let i = 1; i <= 11; i += 1) {
      grid.push([`S${i}`, `${i * 3}`, `${40 + i}`, `run ${i}`]);
    }
    if (swap) grid[5]![2] = "different";
    return { headerRows: 1, rows: grid };
  };
  const model = (swap: boolean): DocumentModel =>
    buildDocument({
      blocks: [{ headingPath: [], kind: "table", table: rows(swap), text: "", unit: 0 }],
      format: "pdf",
      title: null,
      units: [{ index: 0, kind: "page" }],
    });

  const verdict = judgeStructure({ model: model(true), text: "" }, { model: model(false), text: "" });
  assert.equal(verdict.signals.tablesCompared, 1);
  assert.equal(verdict.signals.misplacedTables, 0, "one cell in forty-eight is not a misplacement");
  assert.equal(verdict.outcome, "safe");
});
