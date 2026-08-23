import assert from "node:assert/strict";
import { test } from "node:test";

import { determineNextCognitiveAction, MAX_CORRECTIVE_ATTEMPTS } from "./canvas-policy";
import type { ResponseEvaluation, Verdict } from "./canvas-model";

function evidence(verdict: Verdict, patch: Partial<ResponseEvaluation> = {}): ResponseEvaluation {
  return {
    verdict,
    confidence: 0.8,
    demonstrated: ["what they had"],
    missing: ["the piece they did not have"],
    misconceptions: [],
    feedback: "…",
    ...patch,
  };
}

// ------------------------------------------------------------- the four moves

test("a performance that got there advances", () => {
  for (const verdict of ["strong", "understood"] as const) {
    assert.equal(determineNextCognitiveAction({ evaluation: evidence(verdict), attempts: 0 }).type, "advance");
  }
});

test("a partial performance clarifies ONLY what was missing, and carries it", () => {
  // The centre of the product: preserve what they had, teach the gap, ask again. Re-teaching
  // A+B+C to someone who demonstrated A+B is the behaviour this exists to prevent.
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial", { missing: ["what happens to the by-product"] }),
    attempts: 0,
  });
  assert.equal(action.type, "clarify_missing");
  assert.deepEqual(action.type === "clarify_missing" ? action.missing : null, [
    "what happens to the by-product",
  ]);
});

test("a partial performance with nothing named as missing falls back to a retry", () => {
  // "Partial" with an empty gap gives us nothing to teach against, so a targeted clarification
  // would be a rewrite of the whole thing wearing a targeted label.
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial", { missing: [] }),
    attempts: 0,
  });
  assert.equal(action.type, "retry");
});

test("a named false belief is repaired, not merely corrected", () => {
  const action = determineNextCognitiveAction({
    evaluation: evidence("misconception", {
      misconceptions: ["believes voltage falls when resistance rises"],
    }),
    attempts: 0,
  });
  assert.equal(action.type, "repair_misconception");
  assert.deepEqual(
    action.type === "repair_misconception" ? action.misconceptions : null,
    ["believes voltage falls when resistance rises"],
  );
});

test("an incorrect answer we can aim at gets a targeted correction", () => {
  const action = determineNextCognitiveAction({
    evaluation: evidence("incorrect", { missing: ["the direction of the gradient"], confidence: 0.8 }),
    attempts: 0,
  });
  assert.equal(action.type, "correct");
});

test("an incorrect answer we cannot aim at gets a fuller re-teach instead", () => {
  // Nothing named as missing, or a reading the judge itself was unsure of, is not enough to
  // correct precisely. Guessing at a target produces a confident correction of the wrong thing.
  assert.equal(
    determineNextCognitiveAction({
      evaluation: evidence("incorrect", { missing: [] }),
      attempts: 0,
    }).type,
    "retry",
  );
  assert.equal(
    determineNextCognitiveAction({
      evaluation: evidence("incorrect", { missing: ["something"], confidence: 0.2 }),
      attempts: 0,
    }).type,
    "retry",
  );
});

// ------------------------------------------------------------------- the guards

test("grinding stops: after enough corrective attempts the canvas moves on", () => {
  // 🔴 Without this the loop never ends. partial → clarify → partial → clarify forever is a
  // worse experience than moving on, and the concept stays weak either way, so the scheduler
  // brings it back with fresh material rather than the same paragraph a fourth time.
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial"),
    attempts: MAX_CORRECTIVE_ATTEMPTS,
  });
  assert.equal(action.type, "advance");
  assert.match(action.because, /attempt/i);
});

test("one attempt short of the cap still corrects", () => {
  const action = determineNextCognitiveAction({
    evaluation: evidence("partial"),
    attempts: MAX_CORRECTIVE_ATTEMPTS - 1,
  });
  assert.equal(action.type, "clarify_missing");
});

test("revealing the answer advances — the page already showed it", () => {
  // They have seen the answer, so there is nothing left to teach here in this moment. The
  // scheduler already recorded that no retrieval happened and will ask again later.
  const action = determineNextCognitiveAction({ evaluation: null, attempts: 0, revealed: true });
  assert.equal(action.type, "advance");
  assert.match(action.because, /shown|revealed/i);
});

test("an unreadable answer advances rather than inventing a correction", () => {
  // We could not read what they said. Teaching against a reading we do not have would be
  // making something up at the learner.
  const action = determineNextCognitiveAction({ evaluation: null, attempts: 0 });
  assert.equal(action.type, "advance");
});

test("every action explains itself", () => {
  for (const input of [
    { evaluation: evidence("strong"), attempts: 0 },
    { evaluation: evidence("partial"), attempts: 0 },
    { evaluation: evidence("incorrect"), attempts: 0 },
    { evaluation: evidence("misconception", { misconceptions: ["x"] }), attempts: 0 },
    { evaluation: null, attempts: 0 },
  ]) {
    assert.ok(determineNextCognitiveAction(input).because.length > 0);
  }
});

test("the decision never needs a SECOND model call", () => {
  // 🔴 THIS GUARD MATTERS MORE SINCE THE MODEL STARTED CHOOSING, NOT LESS. The obvious way to
  // hand the decision to DeepSeek is a second call — "here is the reading, what should I do?" —
  // and that doubles the latency and the cost of every answer to re-derive what the first call
  // already knew. The move now rides home on the evaluation that had to be made anyway, so this
  // stays a pure, synchronous function of a reading that already exists.
  //
  // Calibration: make `determineNextCognitiveAction` async, or give it a second parameter to
  // thread a fetch through, and this reddens.
  assert.equal(typeof determineNextCognitiveAction, "function");
  assert.equal(determineNextCognitiveAction.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL PICKS THE MOVE
//
// Owner 2026-08-22: "'policy picks next move' is the wrong architecture, deepseek needs to pick
// the next move." These are the tests that say the ladder no longer decides.

test("🔴🔴🔴 the model's chosen move is OBEYED, even where the old ladder disagreed", () => {
  // The ladder's rule was: a passing verdict advances, full stop. So this is the case that proves
  // the ladder is not running — a judge that read the answer, saw it was technically right, and
  // decided there is still a false belief worth repairing underneath it.
  //
  // Calibration: restore the `if (verdictIsPass) return advance` at the top of the live path and
  // this reddens on its own.
  const action = determineNextCognitiveAction({
    evaluation: evidence("understood", {
      misconceptions: ["thinks the arrow runs the other way"],
      moveReason: "right answer, wrong model underneath",
      nextMove: "repair_misconception",
    }),
    attempts: 0,
  });
  assert.equal(action.type, "repair_misconception");
  assert.equal(action.because, "right answer, wrong model underneath");
});

test("🔴🔴 and the ladder's confidence threshold no longer overrides it", () => {
  // `CONFIDENT_ENOUGH_TO_AIM` used to demote a low-confidence reading to `retry` no matter what.
  // A judge that is only 40% sure overall can still be certain about the one thing that was
  // missing, and it is now allowed to say so.
  const action = determineNextCognitiveAction({
    evaluation: evidence("incorrect", {
      confidence: 0.15,
      missing: ["the second step"],
      nextMove: "correct",
    }),
    attempts: 0,
  });
  assert.equal(action.type, "correct");
  assert.deepEqual(action.type === "correct" ? action.missing : [], ["the second step"]);
});

test("🔴🔴 the attempt cap still wins, because the judge cannot see the session", () => {
  // The guardrail that most earns its place: the model reads ONE answer and has no idea this is
  // the fifth round on the same objective. Without this it can hold a learner on one idea forever.
  const action = determineNextCognitiveAction({
    evaluation: evidence("incorrect", { nextMove: "correct" }),
    attempts: MAX_CORRECTIVE_ATTEMPTS,
  });
  assert.equal(action.type, "advance");
});

test("🔴 a revealed answer still advances whatever the judge chose", () => {
  // Nothing was retrieved, so there is no performance to teach against.
  const action = determineNextCognitiveAction({
    evaluation: evidence("incorrect", { nextMove: "repair_misconception" }),
    attempts: 0,
    revealed: true,
  });
  assert.equal(action.type, "advance");
});

test("🔴🔴 a move with nothing to apply it to is downgraded, not executed", () => {
  // Consistency, not second-guessing. `teachingMessages` interpolates these lists into the
  // instruction, so an empty one asks the model to replace a belief nobody named, or to teach a
  // gap nobody found.
  const noBelief = determineNextCognitiveAction({
    evaluation: evidence("misconception", { misconceptions: [], nextMove: "repair_misconception" }),
    attempts: 0,
  });
  assert.equal(noBelief.type, "retry");

  const nothingToAim = determineNextCognitiveAction({
    evaluation: evidence("partial", { missing: [], nextMove: "clarify_missing" }),
    attempts: 0,
  });
  assert.equal(nothingToAim.type, "retry");
});

test("🔴🔴 a reply carrying no move falls back to the old ladder rather than refusing", () => {
  // What makes this shippable without a flag day: an older cached reply, or a rescue call that
  // came back thin, still teaches the learner.
  const action = determineNextCognitiveAction({ evaluation: evidence("partial"), attempts: 0 });
  assert.equal(action.type, "clarify_missing");
});

test("🔴🔴 the judge is ASKED for the move, and the menu carries no arithmetic", async () => {
  // The prompt is the other half of this change. It must offer the five moves and the condition
  // each is for — and it must NOT reintroduce the ladder in prose, which is the tempting way to
  // "help" the model and is exactly what was removed.
  const { readFile } = await import("node:fs/promises");
  const prompts = await readFile(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  const menu = prompts.slice(prompts.indexOf("const MOVE_CHOICE"), prompts.indexOf("export function evaluationMessages"));
  for (const move of ["advance", "clarify_missing", "correct", "repair_misconception", "retry"]) {
    assert.ok(menu.includes(`"${move}"`), `the move menu never offers ${move}`);
  }
  assert.match(menu, /next_move/, "the judge is never asked for a move");
  // Retrieval beats re-study (Rowland 2014, g = 0.50) — every corrective move ends in another
  // attempt, and that is the one rule the menu states as absolute.
  assert.match(menu, /attempting something again|ends with them attempting/i, "the retrieval rule is gone");
  for (const ladder of ["confidence >=", "attempts >=", "MAX_CORRECTIVE_ATTEMPTS"]) {
    assert.ok(!menu.includes(ladder), `the decision ladder came back into the prompt as "${ladder}"`);
  }
});

test("🔴🔴 the shared LLM valve lets JSON mode through", async () => {
  // The learning lane parsed JSON out of prose because `response_format` was dropped here, and a
  // failed scrape leaves the page silently untouched. Allow-listed rather than forwarded whole:
  // this valve is the shared front door and is where spend is enforced.
  const { readFile } = await import("node:fs/promises");
  const valve = await readFile(
    new URL("../../../../supabase/functions/nemesis-llm/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(valve, /body\.response_format = \{ type: 'json_object' \}/, "JSON mode is dropped again");
  assert.match(valve, /delete body\.response_format/, "an unknown response_format is forwarded blindly");
  assert.match(valve, /body\.tools = body\.tools\.slice\(0, MAX_TOOLS\)/, "tools are unbounded or dropped");
});
