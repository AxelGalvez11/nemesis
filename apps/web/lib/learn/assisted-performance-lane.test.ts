// The three new cognitive actions, followed from the controller's word to the next decision.
//
// 🔴🔴 THIS FILE EXISTS BECAUSE OF THE DEFECT THIS REPOSITORY KEEPS FINDING: a lane that is designed,
// typed, unit-tested on both sides of every boundary, merged — and never reached, because one link
// in the middle was never made. A `worked_example` the controller can name and the Canvas cannot
// paint is worse than no worked example, because every other test is green.
//
// So each action is followed the whole way:
//
//     controller vocabulary → decision → task construction → grounding → rendering →
//     judged response → durable row → read back → learner state → the NEXT decision
//
// and the refusals are followed too, because "the model asked for something this material cannot
// support" must produce a named refusal rather than a silently different move.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ASSAY,
  OHM,
  PHARMACOKINETICS,
  PLEADING,
  association,
  resolved,
} from "./__fixtures__/three-disciplines";
import type { ResolvedObjective } from "./canvas-knowledge";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import { evidenceFromRow, evidenceRow } from "./learner-store";
import {
  completionPromptFor,
  evidenceForSubmission,
  judgementOf,
  transferPromptFor,
} from "./objective-task";
import { createLlmTeacherStrategy, brief, type TeacherTransport } from "./strategy-llm-teacher";
import { resolveStrategy, type TeachingContext } from "./teaching-strategy";
import { chooseNextTeachingAction } from "./teaching-policy";
import { teachingSnapshot } from "./teaching-snapshot";
import { workedExampleFor } from "./worked-example";

const NOW = new Date("2026-08-18T09:00:00.000Z");

const VIEW = readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8");
const RUNTIME = readFileSync(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");

function says(move: string, objective: string): TeacherTransport {
  return async () => ({
    errorText: null,
    text: JSON.stringify({ because: "the next minute is worth spending here", move, objective }),
  });
}

function context(objectives: readonly ResolvedObjective[], evidence: readonly LearnerEvidence[] = []): TeachingContext {
  return { evidence, now: NOW, objectives, uid: "user-1" };
}

// ── the controller can actually name them ───────────────────────────────────

test("🔴 the model's word becomes the action, for all three moves", async () => {
  const cases = [
    { action: "worked_example", entry: resolved(ASSAY, 1), move: "model" },
    { action: "complete", entry: resolved(PLEADING, 2), move: "complete" },
    { action: "transfer", entry: resolved(OHM), move: "transfer" },
  ] as const;

  for (const { action, entry, move } of cases) {
    const strategy = createLlmTeacherStrategy(says(move, entry.objective.identityKey));
    const outcome = await strategy.decide(context([entry]));
    assert.equal(outcome.refusal, null, `${move} was refused over material that supports it`);
    assert.equal(outcome.decision?.action.type, action);
    assert.equal(outcome.decision?.objective.identityKey, entry.objective.identityKey);
  }
});

test("🔴🔴 an unsupported move is a NAMED refusal, never a quietly different move", async () => {
  // 🔴 THE FAILURE MODE THIS GUARDS: `actionFor` returning something else — an ordinary retrieval, a
  // correction — when the grounded builder cannot produce a task. The learner would then be asked a
  // question nobody chose, and the row would record it as though it had been chosen.
  const glossary = resolved(association("g4", "novation", "substitution of a new contract"));
  for (const move of ["model", "complete", "transfer"] as const) {
    const strategy = createLlmTeacherStrategy(says(move, glossary.objective.identityKey));
    const outcome = await strategy.decide(context([glossary]));
    assert.equal(outcome.decision, null, `${move} produced a decision over material that cannot support it`);
    assert.equal(
      outcome.refusal,
      "ungroundable-action",
      `${move} must refuse by its own name, not as an unknown action`,
    );
  }
});

test("🔴 the controller is TOLD what the material can support, so refusals stay rare", () => {
  // 🔴 A FACT ABOUT THE SOURCE, NOT A TEACHING RULE. Nothing here says when to model or when to
  // transfer; it says a two-column glossary has no process in it, which is true whatever the right
  // move would be.
  const snapshot = teachingSnapshot(context([resolved(ASSAY, 1), resolved(OHM), resolved(association("g5", "estoppel", "a bar to resiling"))]));
  const [steps, relation, glossary] = snapshot.objectives;

  assert.equal(steps!.canBeModelled, true);
  assert.equal(steps!.canBeCompleted, true);
  assert.equal(steps!.canBeTransferred, false, "an ordered run asserts no direction to carry to a new case");

  assert.equal(relation!.canBeTransferred, true);
  assert.equal(relation!.canBeCompleted, true);

  assert.equal(glossary!.canBeModelled, false);
  assert.equal(glossary!.canBeCompleted, false);
  assert.equal(glossary!.canBeTransferred, false);

  // And it reaches the words the model actually reads — a snapshot field no brief line prints is a
  // field the controller cannot see.
  assert.match(brief(steps!), /this material can also support: model, complete/);
  assert.match(brief(glossary!), /supports asking and telling only/);
});

// ── the screen exists ───────────────────────────────────────────────────────

test("🔴 every new action has a branch that paints it", () => {
  // 🔴 THE CHEAPEST GUARD AGAINST THE MOST EXPENSIVE DEFECT. A decision with no branch falls through
  // to the hold screen, and a learner is told to "come back shortly" in answer to a controller that
  // just decided to teach them something.
  assert.match(VIEW, /decision\.action\.type === "worked_example"/);
  assert.match(VIEW, /decision\.action\.type === "complete"/);
  assert.match(VIEW, /decision\.action\.type === "transfer"/);
  // The worked example paints the demonstration it was built from, rather than the claim.
  assert.match(VIEW, /modelled\.modelled\.steps\.map/);
  // The completion paints the part of the solution that was supplied.
  assert.match(VIEW, /\{prompt\.given && prompt\.given\.length > 0 && \(/);

  // And the runtime mints a prompt for the two that ask for something.
  assert.match(RUNTIME, /completionPromptFor\(decision, crypto\.randomUUID\(\)\)/);
  assert.match(RUNTIME, /transferPromptFor\(decision, crypto\.randomUUID\(\)\)/);
});

test("🔴 the worked example the controller chose is the one the screen can build", () => {
  // The renderer calls the same builder the controller consulted. If the two could disagree, a
  // decision would reach a branch that renders nothing — and fall through to a screen that says the
  // opposite of what was decided.
  assert.match(VIEW, /workedExampleFor\(decision\)/);
  const built = workedExampleFor(resolved(ASSAY, 1));
  assert.ok(built.modelled && built.modelled.steps.length > 0);
});

// ── the loop closes ─────────────────────────────────────────────────────────

test("🔴🔴 a completion answer changes what the controller sees next", async () => {
  const entry = resolved(PHARMACOKINETICS);
  const key = entry.objective.identityKey;

  // Before: nothing known.
  const before = teachingSnapshot(context([entry])).objectives[0]!;
  assert.equal(before.state.status, "unknown");
  assert.equal(before.completionAttempts, 0);

  // The move, the prompt, the answer, the row.
  const prompt = completionPromptFor(entry, "p-1")!;
  const written = evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf([{ objectiveIdentityKey: key, verdict: "understood" }]),
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: "steady-state plasma concentration",
    teachingStrategy: "llm_teacher",
  });
  const readBack = written.map((row, index) =>
    evidenceFromRow({ ...evidenceRow("user-1", row), id: `e${index}` }, key),
  );

  // After: the controller can see that it happened, and that it was assisted.
  const after = teachingSnapshot(context([entry], readBack)).objectives[0]!;
  assert.equal(after.state.status, "correct");
  assert.equal(after.completionAttempts, 1);
  assert.equal(after.lastRung, "completion");
  assert.equal(satisfies(after.state, "independent"), false);
  // 🔴 AND THE BRIEF SAYS IT IN WORDS. A field the model never reads is a field that does not exist.
  assert.match(brief(after), /answered 1 times with part of the solution already on screen/);
  assert.match(brief(after), /last asked at demand: completion/);
});

test("🔴🔴 a transfer answer is visible to the controller as transfer, not as another right answer", async () => {
  const entry = resolved(OHM);
  const key = entry.objective.identityKey;
  const prompt = transferPromptFor(entry, "p-2")!;
  const readBack = evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf([{ objectiveIdentityKey: key, verdict: "strong" }]),
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: "the current rises again, since the resistance was what suppressed it",
    teachingStrategy: "llm_teacher",
  }).map((row, index) => evidenceFromRow({ ...evidenceRow("user-1", row), id: `t${index}` }, key));

  const after = teachingSnapshot(context([entry], readBack)).objectives[0]!;
  assert.equal(after.transferAttempts, 1);
  assert.equal(after.transferDemonstrations, 1);
  assert.match(after.state.status, /correct/);
  assert.match(brief(after), /met 1 cases the material never stated, and got 1 of them right/);

  // 🔴 CALIBRATION: drop `taskForm: prompt.form` from `rowForTarget` in objective-task.ts and this
  // assertion reddens while every verdict-shaped assertion above stays green — which is exactly the
  // shape of the loss it protects against.
  assert.equal(readBack[0]!.taskForm, "transfer");
});

test("🔴 one transfer answer credits ONE objective, and not its neighbours", () => {
  // 🔴 THE FAN-OUT INVARIANT, ON THE NEWEST TASK FORM. A transfer probe is one question about one
  // relation; a runtime that spread its verdict across the canvas would credit relations the learner
  // never touched, and the record would say they had used ideas they had never met.
  const asked = resolved(OHM);
  const untouched = resolved(PHARMACOKINETICS);
  const prompt = transferPromptFor(asked, "p-3")!;
  assert.equal(prompt.targets.length, 1);
  assert.equal(prompt.targets[0]!.identityKey, asked.objective.identityKey);

  const rows = evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf([{ objectiveIdentityKey: asked.objective.identityKey, verdict: "understood" }]),
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: "it goes back up",
    teachingStrategy: "llm_teacher",
  }).map((row, index) => evidenceFromRow({ ...evidenceRow("u", row), id: `x${index}` }, asked.objective.identityKey));

  assert.equal(projectLearnerState(untouched.objective.identityKey, rows).status, "unknown");
  assert.equal(projectLearnerState(asked.objective.identityKey, rows).status, "correct");
});

// ── attempt before tell, without a "pretesting mode" ───────────────────────

test("🔴 an unknown objective is ASKED, not told — and the controller may still choose to tell", async () => {
  // 🔴🔴 THE INVARIANT: "unknown" means Nemesis lacks evidence, never that the learner lacks
  // knowledge. So the structured arm's own answer to an untouched objective is to ASK, which is
  // productive attempt-before-instruction without a mode, a phase or a flag anywhere.
  const entry = resolved(ASSAY, 1);
  const opening = chooseNextTeachingAction({
    knowledgeObject: entry.knowledge,
    learnerState: projectLearnerState(entry.objective.identityKey, []),
    now: NOW,
    objective: entry.objective,
    recentEvidence: [],
  });
  assert.equal(opening.type, "retrieve");
  assert.equal(opening.type === "retrieve" && opening.rung, "independent");

  // 🔴 AND IT IS NOT A RULE. The general teacher can decide the opposite on the same untouched
  // objective — model it first, or teach it first — because prerequisites, repeated failures or high
  // assistance needs can make probing a poor use of a minute. Nothing in the vocabulary or the
  // action builder makes "unknown" mean "must ask first"; if it did, these two would refuse.
  for (const move of ["model", "teach"] as const) {
    const outcome = await createLlmTeacherStrategy(says(move, entry.objective.identityKey)).decide(
      context([entry]),
    );
    assert.equal(outcome.refusal, null, `${move} was refused on an untouched objective`);
    assert.ok(outcome.decision, `${move} produced no decision`);
  }
});

// ── the experiment is undisturbed ───────────────────────────────────────────

test("🔴 the A/B assignment is exactly what it was before these actions existed", () => {
  // 🔴 THE CONTROL ARM MUST NOT MOVE. The three new moves are available to the general teacher only;
  // `chooseNextTeachingAction` is untouched, so the structured arm asks the same questions it asked
  // yesterday and the comparison stays a comparison. These pins fail if the arms, the hash or the
  // default ever change.
  const pins = [
    { canvasId: "canvas-a", learnerId: "learner-1" },
    { canvasId: "canvas-b", learnerId: "learner-1" },
    { canvasId: "canvas-a", learnerId: "learner-2" },
  ];
  const assigned = pins.map((pin) => resolveStrategy({ ...pin, override: null, randomise: true }));
  assert.deepEqual(
    assigned.map((entry) => entry.strategy),
    ["nemesis_policy", "llm_teacher", "llm_teacher"],
  );
  for (const entry of assigned) assert.equal(entry.assignedBy, "randomised");
  assert.equal(
    resolveStrategy({ canvasId: "c", learnerId: "l", override: null, randomise: false }).strategy,
    "llm_teacher",
  );
});
