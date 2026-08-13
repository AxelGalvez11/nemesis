// 🔴 WHAT THE SIX-STAGE RETIREMENT TOOK WITH IT, ENUMERATED.
//
// This file WAS an audit. It is now the deletion record. Nothing here changes behaviour; it pins what is currently
// unreachable so that reviving any of it is a decision somebody makes on purpose, and so the next
// person does not spend an afternoon working out why a button never appears.
//
// ── The failure mode, stated once ────────────────────────────────────────────────────────────
//
// The retirement of the six-stage machine was implemented as one rule in one place:
//
//     nextAction:  if (move && isEvidenceStage(move.to)) return null;
//
// That is good design — a single refusal, derived from `isEvidenceStage` rather than from a
// hand-kept list, so it cannot drift from what decides painting. But:
//
//   🔴 A RETIREMENT EXPRESSED AS A REFUSAL REMOVES EVERYTHING THAT HAPPENED TO ROUTE THROUGH THE
//      RETIRED THING, INCLUDING THINGS THAT WERE NOT PART OF IT.
//
// It is worse than an ordinary regression because the removal is invisible and looks like correct
// behaviour: the rule does exactly what it says, no error is raised, and the control simply never
// renders. §12 found the first instance — a reading-pace control, "I've read this", which the
// owner then had to ask for again as if it had never existed. This sweep looks for the rest.
//
// ── What the sweep found ─────────────────────────────────────────────────────────────────────
//
//   learn              → "I've read this"      → recall     RETIRED   fixed in #584 (§12)
//   targeted_relearn   → "Retest me"           → retest     RETIRED   dead, unreported until now
//   diagnose           → "Fix my weak spots"   → targeted_relearn      survives the refusal, but
//                                                                      `diagnose` is itself
//                                                                      unreachable, so it cannot
//                                                                      render either
//
// The consequence is bigger than any single row: `nextAction` returns `null` for EVERY state a
// canvas can actually be in, so the control it feeds — and the whole handler chain behind it — is
// dead in all cases, not merely in some.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import * as canvasState from "./canvas-state";

const learn = (file: string) =>
  readFileSync(join(import.meta.dirname, "..", "..", "components", "workspace", "learn", file), "utf8");

test("🔴 the legacy advance machinery is DELETED, not merely unreachable", () => {
  // The audit reported it dead; the owner then ruled it out by description — *"The only button
  // should be 'continue' below reading passages, thats it."* So `nextAction` and `offeredMove`
  // are gone, and with them the control they fed.
  assert.equal("nextAction" in canvasState, false, "nextAction must not come back");
  assert.equal("NextAction" in canvasState, false);
  // 🔴 AND THE GUARDS THAT WERE NEVER PART OF IT MUST SURVIVE. `canTransition` refuses writes into
  // a retired stage; the entrance refusal was never the same thing as the control that offered it,
  // and deleting the control must not take the refusal with it — which is the exact failure this
  // whole audit was about, running in the other direction.
  assert.equal(typeof canvasState.canTransition, "function", "the write guard must survive the deletion");
  assert.equal(typeof canvasState.canStart, "function");
});

test("🔴 the whole chain went, not just the button", () => {
  const canvas = learn("learning-canvas.tsx");
  for (const method of ["startRecall", "startTest", "finishTest", "relearn", "startRetest"]) {
    assert.ok(!canvas.includes(`session.${method}(`), `${method} still has a call site`);
  }
  assert.ok(!/const advance = useCallback/.test(canvas), "the handler must be gone");
  assert.ok(!/onAdvance=\{advance\}/.test(canvas), "and its wiring");
});

test("🔴 THE TRAP THAT MATTERED: the composer's advance was a DIFFERENT, LIVE thing", () => {
  // Pinned in the audit so a future deleter would not follow the name into a working control. I
  // became that deleter, and it did its job: the policy's `acknowledge` was NOT deleted — it moved
  // out of the composer and became the `Continue` below a correction (§38/§39).
  const canvas = learn("learning-canvas.tsx");
  assert.match(canvas, /policy\.acknowledge/, "the correction acknowledgment must still be wired");
  const composer = learn("canvas-composer.tsx");
  assert.ok(!/onAdvance/.test(composer), "…and it must no longer live in the composer");
});

test("what is NOT deleted, because it is not the learner choosing what happens next", () => {
  // The line the owner drew: the composer steers, Continue paces, navigation moves.
  const composer = learn("canvas-composer.tsx");
  assert.match(composer, /aria-label="Add material"/, "the composer's attach affordance survives (§2)");
  assert.match(composer, /Finish dictation/, "dictation's ✓ survives — owner-specified");
  assert.match(composer, /Cancel dictation/, "and its ×");
  const surface = learn("canvas-surface.tsx");
  assert.match(surface, /aria-label="Leave the canvas"/, "navigation survives");
});
