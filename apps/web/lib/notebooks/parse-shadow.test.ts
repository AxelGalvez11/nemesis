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

import { buildDocument, type DocumentModel } from "@nemesis/shared";

import {
  DEFAULT_SHADOW_DAILY_CAP,
  DEFAULT_SHADOW_RATE,
  judgeShadow,
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
