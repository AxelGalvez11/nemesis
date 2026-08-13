// 🔴 WHAT THE SIX-STAGE RETIREMENT TOOK WITH IT, ENUMERATED.
//
// This file is an AUDIT, not a fix. Nothing here changes behaviour; it pins what is currently
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

import { isEvidenceStage } from "./canvas-hosting";
import type { CanvasState, LearningCanvas } from "./canvas-model";
import { CANVAS_STATES } from "./canvas-model";
import { nextAction } from "./canvas-state";

/** 🔴 A canvas GENEROUS ENOUGH THAT EVERY LEGACY GATE IS SATISFIED. Each legacy branch also has an
 *  "are they finished?" condition, and a sparse fixture would return null for that reason instead
 *  — reporting "the control is dead" when the truth was "the learner has not finished yet". Every
 *  null below is therefore the RETIREMENT refusing, which is the only thing this file measures. */
function ready(state: CanvasState): LearningCanvas {
  return {
    answers: [{ id: "q1" }],
    blocks: [{ content: "x", id: "b1", type: "paragraph" }],
    questions: [{ id: "q1" }],
    recall: [{ id: "r1" }],
    recallResults: [{ id: "r1" }],
    state,
    weakConceptIds: ["c1"],
  } as unknown as LearningCanvas;
}

/** States a canvas can actually be observed in.
 *
 *  🔴 `normaliseCanvas` COERCES EVERY EVIDENCE STAGE TO `learn` ON READ, so a stored `recall` or
 *  `diagnose` canvas never reaches a component in that state. Auditing "which controls render"
 *  against all ten states would count five that cannot occur. */
const OBSERVABLE = CANVAS_STATES.filter((state) => !isEvidenceStage(state));

test("🔴 no state a canvas can be in offers the legacy advance control — it is dead in ALL cases", () => {
  for (const state of OBSERVABLE) {
    assert.equal(
      nextAction(ready(state)),
      null,
      `${state} offers a legacy move again — revive it deliberately, and check whether the control it feeds still makes sense`,
    );
  }
});

test("🔴 targeted_relearn's 'Retest me' is dead too, and I reported the opposite in #584", () => {
  // The correction, recorded where it cannot be missed. #584's comment claimed this control was
  // "still rendered where it is still reachable". It is not, and the mistake is instructive:
  // `canvas-state.ts` says *"targeted_relearn is reading material, not an evidence stage, so it is
  // still reachable"* — a true statement about the STATE — and I read it as a statement about the
  // CONTROL. The state is reachable; its only move goes to `retest`, which is retired.
  assert.equal(nextAction(ready("targeted_relearn")), null);
  assert.equal(isEvidenceStage("targeted_relearn"), false, "the STATE is not retired…");
  assert.equal(isEvidenceStage("retest"), true, "…but the only place it can go is");
});

test("and no new canvas can even enter targeted_relearn, so the question is moot for new work", () => {
  // It is set by `relearn()`, which is called from exactly one place: the handler behind the dead
  // control. Only canvases stored in that state before the retirement are ever observed in it.
  const source = readFileSync(join(import.meta.dirname, "..", "..", "components", "workspace", "learn", "learning-canvas.tsx"), "utf8");
  const calls = source.match(/session\.relearn\(\)/g) ?? [];
  assert.equal(calls.length, 1, "relearn has exactly one caller");
  const handler = source.slice(source.indexOf("const advance = useCallback"), source.indexOf("session.relearn()"));
  assert.match(handler, /if \(!next\) return;/, "…and that caller is gated on the move that is always null");
});

test("🔴 the whole chain behind the control is dead, not just the button", () => {
  // Recorded so a future reader does not have to re-derive it. Each of these six has exactly one
  // call site, all inside the one handler the dead control invokes.
  const source = readFileSync(join(import.meta.dirname, "..", "..", "components", "workspace", "learn", "learning-canvas.tsx"), "utf8");
  for (const method of ["startRecall", "startTest", "finishTest", "relearn", "startRetest", "finish"]) {
    const calls = source.match(new RegExp(`session\\.${method}\\(`, "g")) ?? [];
    assert.equal(calls.length, 1, `${method} should have exactly one call site; found ${calls.length}`);
  }
  // 🔴 AND THE COMPOSER'S `onAdvance` IS A DIFFERENT, LIVE THING. It is the policy's
  // `acknowledge` — the `✓` that clears a correction — and has nothing to do with the legacy
  // machine. Anyone deleting dead code here must not follow the name into that one.
  assert.match(source, /onAdvance=\{\s*\n?\s*regions\.policy && offersAdvance\(/, "the composer's advance is the policy's, and is live");
});

test("the audit reports nothing about what SHOULD come back — that is the owner's call", () => {
  // Deliberately not asserted anywhere: whether "Retest me" or "Fix my weak spots" should be
  // revived. They belong to a machine the owner retired on purpose, and the §12 case was revived
  // only because the OWNER asked for that control by description. This file records what is dead.
  assert.ok(true);
});
