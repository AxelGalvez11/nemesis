import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { buildRules } from "./canvas-territory";
import { codeOnly } from "./code-scan";
import { CAUSAL_EXTRACTION_VERSION } from "./causal-extraction-contract";
import { EXTRACTION_VERSION } from "./knowledge-extraction";
import { TERRITORY_VERSION } from "./knowledge-territory";
import { DEFERRED_REPROCESS_LANES, RULESET_LANES, RULESET_VERSION } from "./ruleset-version";

const LEARN_DIR = new URL("../../lib/learn/", import.meta.url);

test("🔴 RULESET_VERSION is a COMPOSITION of the lane versions, never a literal", () => {
  // 🔴 THE RELATIONSHIP IS ASSERTED, NOT THE STRING. `assert.equal(RULESET_VERSION,
  // "association/2+causal/1+territory/1")` would go red on every legitimate bump — so it would be
  // edited every time it fired, which is another way of saying it protects nothing. This holds
  // whatever the lanes are called and whatever they are bumped to, and it is the half of the
  // version rule that says the value CANNOT move for an unrelated edit: nothing but these three
  // constants feeds it.
  assert.equal(RULESET_VERSION, buildRules([TERRITORY_VERSION, CAUSAL_EXTRACTION_VERSION, EXTRACTION_VERSION]));
  for (const lane of [TERRITORY_VERSION, CAUSAL_EXTRACTION_VERSION, EXTRACTION_VERSION]) {
    assert.ok(RULESET_VERSION.includes(lane), `${lane} must be inside the ruleset version`);
  }
});

test("🔴 the lane ORDER cannot change it — otherwise a reorder would bill the corpus", () => {
  // `buildRules` sorts. Without that, moving two lines in `RULESET_LANES` would produce a different
  // string, every stored marker would stop matching, and every canvas would pay for one more model
  // read to reach exactly the answer it already had. A pure refactor must be free.
  assert.equal(buildRules([...RULESET_LANES].reverse()), RULESET_VERSION);
});

test("🔴 a lane cannot be both deferred and backfill-enabled", () => {
  const overlap = DEFERRED_REPROCESS_LANES.filter((lane) => RULESET_LANES.includes(lane));
  assert.deepEqual(overlap, []);
});

test("🔴 bumping ANY ONE lane moves it — an improvement must be able to reach the documents", () => {
  // The other half of the version rule. A lane whose bump did not move this is a lane whose
  // improvements can never reach the documents that most needed them: every "we looked and found
  // nothing" marker would keep standing.
  for (const lane of RULESET_LANES) {
    const bumped = RULESET_LANES.map((entry) => (entry === lane ? `${entry}-bumped` : entry));
    assert.notEqual(buildRules(bumped), RULESET_VERSION, `bumping ${lane} must change the ruleset version`);
  }
});

test("🔴🔴 the composition is byte-identical to the GROUNDED_BUILD_RULES it replaced", () => {
  // Production holds a live `mechanismsUnder` marker written under the old constant. A different
  // composition — one more lane, one fewer, a different join — would silently expire it and buy a
  // paid re-read of that canvas's material to arrive at the identical answer. The replacement had
  // to be a MOVE, not a redesign, and this is that stated as a fact rather than as an intention.
  assert.equal(RULESET_VERSION, buildRules([TERRITORY_VERSION, CAUSAL_EXTRACTION_VERSION, EXTRACTION_VERSION]));
  assert.equal(RULESET_LANES.length, 3);
});

test("🔴 the identity and evaluator versions are deliberately NOT lanes", () => {
  // `KNOWLEDGE_IDENTITY_VERSION` changes which KEY a fact is stored under, not which facts are
  // found — `territoryReuse` already treats it as its own separate rebuild trigger, and folding it
  // in would make an identity migration look like an extractor improvement and cost a model call
  // per canvas for a change no lane made. `EVALUATOR_VERSION` and `OBJECTIVE_IDENTITY_VERSION` are
  // downstream of extraction entirely: they change what is ASKED about a fact and how an answer is
  // judged, never whether the fact is found at all.
  // 🔴 CODE ONLY. The module NAMES all three in its header, explaining exactly why each is
  // excluded — so a guard reading the raw file would go red on the documentation of the decision
  // it is checking, and the obvious "fix" would be to delete the explanation.
  const code = codeOnly(readFileSync(new URL("ruleset-version.ts", LEARN_DIR), "utf8"));
  for (const excluded of ["KNOWLEDGE_IDENTITY_VERSION", "EVALUATOR_VERSION", "OBJECTIVE_IDENTITY_VERSION"]) {
    assert.ok(!code.includes(excluded), `${excluded} must not be composed into the ruleset version`);
  }
});

test("🔴🔴 TRIPWIRE — an extraction lane must be composed in or explicitly deferred from backfill", () => {
  // 🔴 A SEPARATE, SEPARATELY-NAMED TEST, because a scanning guard is a different kind of claim
  // from the ones above and this repo has one that "passed while reading ONE line of a ten-line
  // union". The tests above check a relationship between values that are already wired together;
  // this one checks that nothing has been left OUT, which no value comparison can see.
  //
  // The failure it exists for is silent and expensive in the direction that matters least visibly:
  // a fourth lane ships, its version bumps, and every document that yielded nothing under the old
  // three keeps its "we looked" marker for ever — the improvement is live and unreachable by the
  // documents built for it.
  const declared = codeOnly(readFileSync(new URL("ruleset-version.ts", LEARN_DIR), "utf8"));
  const found: string[] = [];
  for (const file of readdirSync(LEARN_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const code = readFileSync(new URL(file, LEARN_DIR), "utf8");
    // Only the constants an extraction/territory lane names its own rules with. Deliberately a
    // narrow pattern: it must not sweep up identity or evaluator versions, whose exclusion is
    // asserted directly above and is a decision, not an oversight.
    for (const match of code.matchAll(/^export const ([A-Z0-9_]*(?:EXTRACTION|TERRITORY)_VERSION)\b/gm)) {
      found.push(match[1]!);
    }
  }
  assert.ok(found.length >= 3, `expected to find the lane constants by scanning, found ${found.join(", ")}`);
  for (const constant of found) {
    assert.ok(
      declared.includes(constant),
      `${constant} looks like an extraction lane and is neither composed nor explicitly deferred.`,
    );
  }
  assert.deepEqual(DEFERRED_REPROCESS_LANES, ["semantic-prose/1", "wide-table/1"]);
});
