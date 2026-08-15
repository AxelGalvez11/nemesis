import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { codeOnly as stripComments } from "./code-scan";
import { needsReprocess, type ProcessingStamp } from "./reprocess";

/** Read a repo-relative file as CODE — see `codeOnly` for why comments must not be scanned. */
function codeOnly(path: string): string {
  return stripComments(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
}

const stamp = (over: Partial<ProcessingStamp> = {}): ProcessingStamp => ({
  contentHash: "sha-abc",
  parserVersion: "extract-2026-08-13",
  rulesetVersion: "association/2+causal/1+territory/1",
  ...over,
});

test("nothing on record is work owed, and it says so by name", () => {
  const verdict = needsReprocess({ current: stamp(), stored: null });
  assert.deepEqual(verdict, { reason: "never-processed", reprocess: true });
});

test("same rules, same bytes, nobody asked — do not spend again", () => {
  assert.deepEqual(needsReprocess({ current: stamp(), stored: stamp() }), {
    reason: "unchanged",
    reprocess: false,
  });
});

test("🔴 the bytes changed, and that outranks every version comparison", () => {
  // A stored answer about different bytes is an answer about a different document, whatever
  // versions produced it. Reporting a version reason here would send someone looking for an
  // extractor change when the learner simply replaced their file.
  const verdict = needsReprocess({
    current: stamp({ contentHash: "sha-zzz" }),
    stored: stamp(),
  });
  assert.deepEqual(verdict, { reason: "content-changed", reprocess: true });
});

test("a better reader shipped", () => {
  const verdict = needsReprocess({
    current: stamp({ parserVersion: "extract-2026-09-01" }),
    stored: stamp(),
  });
  assert.deepEqual(verdict, { reason: "parser-version-changed", reprocess: true });
});

test("a knowledge lane moved", () => {
  const verdict = needsReprocess({
    current: stamp({ rulesetVersion: "association/3+causal/1+territory/1" }),
    stored: stamp(),
  });
  assert.deepEqual(verdict, { reason: "ruleset-version-changed", reprocess: true });
});

test("🔴 an explicit request stands ALONE — it is not conditional on a version moving", () => {
  // The owner listed three triggers and this is the third: "the relevant extractor/ruleset version
  // changes; the source itself changes; OR an explicit reprocess is requested." Somebody who
  // believes a parse is wrong must be able to get it re-read today, not when a version happens to
  // bump. Making the ask conditional on drift is the shape that looks correct and quietly refuses
  // every request made about a current document — which is most of them.
  const verdict = needsReprocess({ current: stamp(), requested: true, stored: stamp() });
  assert.deepEqual(verdict, { reason: "explicitly-requested", reprocess: true });
});

test("🔴 a request that coincides with real drift reports the DRIFT, not the request", () => {
  // Both are true and the verdict is `true` either way, so the only thing at stake is which reason
  // the caller is told — and only one of them says what might be recovered. "A person asked" is the
  // least informative true statement available.
  const verdict = needsReprocess({
    current: stamp({ parserVersion: "extract-2026-09-01" }),
    requested: true,
    stored: stamp(),
  });
  assert.equal(verdict.reason, "parser-version-changed");
});

// ------------------------------------------------------------------ the two nulls

test("🔴 a dimension NEITHER side tracks is not a trigger — the parse lane has no ruleset", () => {
  // `decideEnqueue` passes `rulesetVersion: null` on both sides on purpose: parsing does not run
  // the knowledge lanes. If a null/null pair counted as a change, every single reprocess request
  // would come back `ruleset-version-changed`, and any policy that acted on that reason would
  // reparse the whole corpus the first time an extractor was improved — the mass backfill the
  // owner refused, arriving through the predicate written to prevent it.
  const verdict = needsReprocess({
    current: stamp({ rulesetVersion: null }),
    stored: stamp({ rulesetVersion: null }),
  });
  assert.equal(verdict.reprocess, false);
});

test("🔴 a dimension the STORED answer never recorded IS a trigger — unknown is not unchanged", () => {
  // Every empty-build marker written before material stamping carries rules and no content hash.
  // Reading that absence as "the content is fine" would honour a "we looked and found nothing"
  // verdict about bytes nobody can prove it ever saw. Production held 0 such markers when this
  // shipped, so the honest reading costs nothing and buys the guarantee.
  const verdict = needsReprocess({
    current: stamp(),
    stored: stamp({ contentHash: null }),
  });
  assert.deepEqual(verdict, { reason: "content-changed", reprocess: true });
});

test("🔴 a dimension the CALLER stopped supplying can only suppress, never cause, a reprocess", () => {
  // The asymmetry is the safety property. A consumer that stops passing a dimension has a code
  // regression, not a content fact — and if that read as "changed", one bad edit would bill the
  // whole corpus. It reads as "I cannot tell", which skips an opportunity and spends nothing. Same
  // reading `territoryReuse` has always given an absent `rules`.
  const verdict = needsReprocess({
    current: stamp({ contentHash: null, parserVersion: null, rulesetVersion: null }),
    stored: stamp(),
  });
  assert.equal(verdict.reprocess, false);
});

test("🔴 a canvas whose source failed to load does not get billed for the outage", () => {
  // The composed case, stated end to end because it is the one that costs money when it is wrong:
  // a transient read failure makes the current material stamp null, and a null current stamp must
  // leave a stored "we already read this" marker standing.
  const verdict = needsReprocess({
    current: { contentHash: null, parserVersion: null, rulesetVersion: "association/2+causal/1+territory/1" },
    stored: stamp(),
  });
  assert.equal(verdict.reprocess, false, "an outage is not a changed document");
});

// ------------------------------------------------------------------ one mechanism, not two

test("🔴🔴 every retry decision in the product routes through THIS function", () => {
  // The owner's constraint was one sentence: "DO NOT CREATE A SECOND INDEPENDENT RETRY SYSTEM."
  // Two functions that agree today are two functions that disagree the first time one is edited,
  // and the disagreement is invisible — one lane keeps paying for an answer the other already has.
  //
  // 🔴 THIS READS THE THREE CALL SITES' SOURCE, because the property is "nobody compares versions
  // by hand", and no runtime assertion can observe an `===` that was never called. Each site is
  // named individually rather than counted, so deleting one cannot be compensated for by adding
  // another somewhere unrelated.
  const sites = [
    // The parse lane: is the stored parse the parse the current reader would produce?
    ["lib/notebooks/parse-enqueue.ts", "needsReprocess({"],
    // Both canvas markers, through their one adapter.
    ["lib/learn/canvas-territory.ts", "needsReprocess({"],
    // The empty-build marker.
    ["lib/learn/canvas-territory.ts", "markerStands({ material, over: stored.emptyOver"],
    // The mechanism marker — a bare `===` until this change, and the only one of the three that
    // exists in production today.
    ["lib/learn/canvas-knowledge.ts", "over: stored?.mechanismsOver"],
  ] as const;
  for (const [file, needle] of sites) {
    assert.ok(codeOnly(file).includes(needle), `${file} must reach the shared predicate — looked for: ${needle}`);
  }

  // 🔴 AND THE ONE THAT WAS ALREADY WRONG STAYS FIXED. `mechanismsUnder === <rules>` is the exact
  // line this change replaced; it would pass every test above while quietly being the second retry
  // system. Asserting its ABSENCE is what makes the fix durable rather than incidental.
  // 🔴 THE LOOKAHEAD EXCLUDES `typeof x === "string"`, WHICH IS VALIDATION, NOT A VERSION
  // COMPARISON. `readTerritory` legitimately typeof-checks both markers on the way out of jsonb,
  // and a guard that called that a hand-rolled retry decision would have to be deleted the first
  // time it fired — which is how a guard stops protecting anything.
  // 🔴 NO `\s*` BEFORE THE LOOKAHEAD, AND THAT IS NOT A STYLE CHOICE — IT IS THE BUG THIS REGEX
  // ALREADY HAD. Written `===\s*(?!"string")`, the engine simply backtracks `\s*` to zero, checks
  // the lookahead against the SPACE, passes, and reports a match on the very validation the
  // lookahead was written to exclude. A negative lookahead placed after a variable-width match
  // excludes nothing at all.
  const byHand = (marker: string, path: string) =>
    new RegExp(`${marker}\\s*===(?!\\s*"string")`).exec(codeOnly(path));
  assert.equal(
    byHand("mechanismsUnder", "lib/learn/canvas-knowledge.ts"),
    null,
    "mechanismsUnder must not be compared by hand — route it through needsReprocess",
  );
  // Same for the empty marker, which was `stored.emptyUnder === rules` in `territoryReuse`.
  assert.equal(
    byHand("emptyUnder", "lib/learn/canvas-territory.ts"),
    null,
    "emptyUnder must not be compared by hand — route it through needsReprocess",
  );
});
