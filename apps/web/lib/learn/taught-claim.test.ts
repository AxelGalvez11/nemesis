import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { citationLine, taughtClaim } from "./taught-claim";

const SENTENCE = "Chemically, a given functional group behaves in nearly the same way in every molecule it's a part of.";

test("🔴🔴 a one-sided claim is never printed as 'X → X'", () => {
  // Exactly what the owner was shown. A `conceptual_system` has no pair, so both sides resolve to
  // the statement and the arrow asserted a relationship between a sentence and itself.
  const claim = taughtClaim({ answer: SENTENCE, cue: SENTENCE, statement: SENTENCE });
  assert.equal(claim.heading, SENTENCE);
  assert.ok(!claim.heading.includes("→"), "an arrow was drawn between a sentence and itself");
  assert.equal(claim.body, null, "the same sentence was printed twice");
});

test("🔴 a smart quote does not make two copies look different", () => {
  // The heading came from the objective and the body from the stored statement, and those two
  // travelled through different code. One had a curly apostrophe.
  const claim = taughtClaim({
    answer: "a given functional group behaves the same way",
    cue: "a given functional group behaves the same way",
    statement: "A given functional group behaves the same way’",
  });
  assert.ok(!claim.heading.includes("→"));
});

test("🔴 a trailing full stop does not either", () => {
  const claim = taughtClaim({ answer: "alcohol", cue: "alcohol.", statement: "Alcohol" });
  assert.ok(!claim.heading.includes("→"));
});

test("🟢 a genuinely two-sided claim keeps its arrow AND its prose", () => {
  // The case the screen was designed for must not regress: an association reads as cue → answer,
  // with the statement underneath as the claim written out.
  const claim = taughtClaim({
    answer: "-OH",
    cue: "alcohol",
    statement: "An alcohol has a hydroxyl (-OH) group bonded to a saturated carbon.",
  });
  assert.equal(claim.heading, "alcohol → -OH");
  assert.match(claim.body ?? "", /hydroxyl/);
});

test("🔴 an empty side is one-sided, not an arrow into nothing", () => {
  assert.ok(!taughtClaim({ answer: "", cue: "alcohol", statement: "An alcohol has -OH." }).heading.includes("→"));
  assert.ok(!taughtClaim({ answer: "-OH", cue: "", statement: "An alcohol has -OH." }).heading.includes("→"));
});

test("🔴 a body already contained in the heading is dropped", () => {
  const claim = taughtClaim({ answer: "-OH", cue: "alcohol", statement: "alcohol" });
  assert.equal(claim.body, null);
});

// ── the citation line ────────────────────────────────────────────────────────

test("🔴🔴 a label that repeats its own title is not printed twice", () => {
  // "From 3.1Functional Groups, 3.1Functional Groups" — what the owner saw.
  assert.equal(
    citationLine([{ label: "3.1Functional Groups", sourceTitle: "3.1Functional Groups" }]),
    "3.1Functional Groups",
  );
});

test("🔴 a label the title already contains adds nothing", () => {
  assert.equal(citationLine([{ label: "Functional Groups", sourceTitle: "3.1 Functional Groups" }]), "3.1 Functional Groups");
});

test("🟢 a label that says something new is kept", () => {
  assert.equal(citationLine([{ label: "page 4", sourceTitle: "Lecture 3" }]), "Lecture 3, page 4");
});

test("🔴 the same source cited twice is listed once", () => {
  assert.equal(citationLine([{ sourceTitle: "Wikipedia" }, { sourceTitle: "Wikipedia" }]), "Wikipedia");
});

test("no citations is nothing at all, not the word 'From'", () => {
  assert.equal(citationLine([]), null);
});

// ── the screen actually uses it ──────────────────────────────────────────────

/** Comments stripped. 🔴 THE FIRST VERSION OF THIS TEST FAILED AGAINST ITS OWN FIX: the commit that
 *  removed the preamble left a comment quoting the removed line, and a guard searching the raw file
 *  found it there. A guard that can match prose about the code is not reading the code. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

test("🔴🔴 the teach screen has no fixed grey preamble any more", () => {
  // Owner, 2026-08-19: "i dont want this unnessary wordy gray text". It sat where the eye lands
  // first and told the learner nothing they could not already see.
  const view = code(readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8"));
  assert.ok(!/Worth having in front of you/.test(view), "the preamble is back");
  assert.ok(!/Same idea, plainer words/.test(view), "the simplify preamble is back");
  // 🔴 THE OTHER TWO LEADS STAY, and are asserted so this is not read as "delete every grey line".
  // They say something the screen does not: what the learner answered, and that two things are
  // being confused.
  assert.match(view, /correctionLead\(said\)/, "the correction lost the line saying what was answered");
  assert.match(view, /Two of these are getting mixed up/, "the contrast screen lost its lead");
});

test("🔴🔴 no screen builds its own cue-arrow-answer any more", () => {
  // Three branches each wrote `{decision.objective.cue} → {decision.objective.answer}` inline, which
  // is why one fix would otherwise have left the other two printing `X → X`.
  const view = readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8");
  const inline = view.match(/\{decision\.objective\.cue\}\s*→/g) ?? [];
  assert.equal(inline.length, 0, `${inline.length} screen(s) still join the two sides by hand`);
  assert.match(view, /taughtClaim\(/, "the screen does not use the shared derivation");
});
