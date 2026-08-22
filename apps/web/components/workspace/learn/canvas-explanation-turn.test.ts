import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  NO_EXPLANATIONS,
  nextExplanationState,
  type ExplanationState,
} from "./canvas-explanation-turn";

// Product mandate rule 2 (owner, 2026-08-15): "Corrections or explanations that require reading
// STAY UNTIL ACKNOWLEDGED. Normal chat responses may remain only until the next turn." These tests
// are the decision, not the CSS — see the file header for why the fade itself needs no test.

const BOTH_OPEN: ExplanationState = { hasAside: true, hasPopover: true };

test("a new turn clears an open aside and an open popover together", () => {
  assert.deepEqual(nextExplanationState(BOTH_OPEN, { kind: "new_turn" }), NO_EXPLANATIONS);
});

test("a new turn is a no-op when nothing was open", () => {
  assert.deepEqual(nextExplanationState(NO_EXPLANATIONS, { kind: "new_turn" }), NO_EXPLANATIONS);
});

test("dismissing the aside leaves an unrelated open popover alone", () => {
  assert.deepEqual(nextExplanationState(BOTH_OPEN, { kind: "dismiss_aside" }), {
    hasAside: false,
    hasPopover: true,
  });
});

test("dismissing the popover leaves an unrelated open aside alone", () => {
  assert.deepEqual(nextExplanationState(BOTH_OPEN, { kind: "dismiss_popover" }), {
    hasAside: true,
    hasPopover: false,
  });
});

// 🔴 THE ROW THAT PROVES THIS IS NOT THE TEACHING POLICY'S RULE WEARING A NEW NAME. If acknowledging
// the policy's own Continue also cleared these two surfaces, the two categories rule 2 requires be
// distinguishable would have collapsed into one "anything moves attention forward clears everything"
// rule — which is the incidental version the mandate specifically rules out.
test("acknowledging the teaching policy's Continue clears neither surface", () => {
  assert.deepEqual(nextExplanationState(BOTH_OPEN, { kind: "policy_continue" }), BOTH_OPEN);
});

test("policy_continue is a no-op on an already-empty state too", () => {
  assert.deepEqual(nextExplanationState(NO_EXPLANATIONS, { kind: "policy_continue" }), NO_EXPLANATIONS);
});

// 🔴 CALIBRATION: an event this function does not recognise must fail to COMPILE, not fail
// silently at runtime. `nextExplanationState`'s switch has no default branch, so TypeScript
// itself is the guard here — removing a `case` (or this test's cast) and re-running `tsc` is the
// calibration: it must fail to typecheck. Left as a comment rather than a runtime assertion
// because there is nothing for `node:test` to observe; the compiler is the enforcement.
//
//   const bad = { kind: "unknown" } as unknown as import("./canvas-explanation-turn").ExplanationEvent;
//   nextExplanationState(NO_EXPLANATIONS, bad); // exhaustiveness only, not exercised at runtime

// ── an opening is not an answer, and it must not outlive its screen ──────────
//
// 🔴🔴 REPORTED 2026-08-21 WITH A SCREENSHOT, AND IT WAS THE SECOND TIME. The lesson had moved on
// to "What follows from Java's increasing popularity at the time, and why?" and underneath it still
// sat "Alright, let's get you started with JavaScript. The canvas will walk you through the core
// concepts…" — a sentence whose entire job was to introduce a screen that was no longer there. The
// owner's words: *"i thought we had already removed this?"*
//
// 🔴 THE RULE WAS RIGHT AND ITS SUBJECT WAS WRONG. `policy_continue` clearing NEITHER surface is
// correct for a learner-triggered explanation — acknowledging a correction says nothing about a
// question they asked three passages ago. An opening is not one of those: nobody asked for it, it
// belongs to one screen, and the moment that screen advances it describes the past.

test("🔴 an opening clears when the learner acknowledges the screen it introduced", () => {
  const before = { asideIsOpening: true, hasAside: true, hasPopover: false };
  const after = nextExplanationState(before, { kind: "policy_continue" });
  assert.equal(after.hasAside, false, "the introduction outlived the lesson it introduced");
  assert.equal(after.asideIsOpening, false);
});

// 🔴 AND THE ROW THIS FILE HAS ALWAYS PROTECTED SURVIVES INTACT. An explanation the learner asked
// for is theirs until they dismiss it or take another turn; a Continue on an unrelated correction
// is not permission to take it away.
test("🔴 an answer the learner asked for still survives Continue", () => {
  const before = { asideIsOpening: false, hasAside: true, hasPopover: true };
  assert.deepEqual(nextExplanationState(before, { kind: "policy_continue" }), before);
});

test("Continue still clears nothing when there is no aside at all", () => {
  const before = { asideIsOpening: false, hasAside: false, hasPopover: true };
  assert.deepEqual(nextExplanationState(before, { kind: "policy_continue" }), before);
});

// 🔴 THE KIND HAS TO REACH THE REDUCER, OR THE ROW ABOVE IS UNREACHABLE. A field nothing populates
// is a rule that reads correctly and never fires.
test("🔴 the canvas tells the reducer which kind of aside is on screen", () => {
  const canvas = readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /asideIsOpening: session\.aside\?\.kind === "opening"/);
  assert.match(canvas, /applyExplanationEvent\(\{ kind: "policy_continue" \}\)/);
});
