import assert from "node:assert/strict";
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
