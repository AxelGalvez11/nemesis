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
} from "./objective-task";
import { createLlmTeacherStrategy, brief, type TeacherTransport } from "./strategy-llm-teacher";
import { resolveStrategy, type TeachingContext } from "./teaching-strategy";
import { chooseNextTeachingAction } from "./teaching-policy";
import { teachingSnapshot } from "./teaching-snapshot";
import { workedExampleFor } from "./worked-example";

const NOW = new Date("2026-08-18T09:00:00.000Z");

const VIEW = readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8");
const RUNTIME = readFileSync(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");
const STORE = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");

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

test("🔴 the model's word becomes the action, for both grounded moves", async () => {
  const cases = [
    { action: "worked_example", entry: resolved(ASSAY, 1), move: "model" },
    { action: "complete", entry: resolved(PLEADING, 2), move: "complete" },
    { action: "complete", entry: resolved(OHM), move: "complete" },
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
  for (const move of ["model", "complete"] as const) {
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
  // complete; it says a two-column glossary has no process in it and no part that could be withheld
  // without withholding the whole answer, which is true whatever the right move would be.
  const snapshot = teachingSnapshot(context([resolved(ASSAY, 1), resolved(OHM), resolved(association("g5", "estoppel", "a bar to resiling"))]));
  const [steps, relation, glossary] = snapshot.objectives;

  assert.equal(steps!.canBeModelled, true);
  assert.equal(steps!.canBeCompleted, true);

  assert.equal(relation!.canBeModelled, true);
  assert.equal(relation!.canBeCompleted, true);

  assert.equal(glossary!.canBeModelled, false);
  assert.equal(glossary!.canBeCompleted, false);

  // And it reaches the words the model actually reads — a snapshot field no brief line prints is a
  // field the controller cannot see.
  assert.match(brief(steps!), /this material can also support: model, complete/);
  assert.match(brief(glossary!), /supports asking and telling only/);
  // 🔴 AND THE ADVERTISEMENT NEVER NAMES A MOVE THE VOCABULARY DOES NOT HAVE. A brief that offered
  // `transfer` would spend a turn per objective being refused for a verb that no longer exists.
  assert.doesNotMatch(brief(relation!), /transfer/);
});

// ── the screen exists ───────────────────────────────────────────────────────

test("🔴 every new action has a branch that paints it", () => {
  // 🔴 THE CHEAPEST GUARD AGAINST THE MOST EXPENSIVE DEFECT. A decision with no branch falls through
  // to the hold screen, and a learner is told to "come back shortly" in answer to a controller that
  // just decided to teach them something.
  assert.match(VIEW, /decision\.action\.type === "worked_example"/);
  assert.match(VIEW, /decision\.action\.type === "complete"/);
  // The worked example paints the demonstration it was built from, rather than the claim.
  assert.match(VIEW, /modelled\.modelled\.steps\.map/);
  // The completion paints the part of the solution that was supplied.
  assert.match(VIEW, /\{prompt\.given && prompt\.given\.length > 0 && \(/);

  // And the runtime mints a prompt for the one that asks for something.
  assert.match(RUNTIME, /completionPromptFor\(decision, crypto\.randomUUID\(\)\)/);
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

test("🔴 one completion answer credits ONE objective, and not its neighbours", () => {
  // 🔴 THE FAN-OUT INVARIANT, ON THE NEWEST TASK FORM. A completion is one question about one
  // objective; a runtime that spread its verdict across the canvas would credit steps the learner
  // never supplied, and the record would say they had produced work they never did.
  const asked = resolved(PLEADING, 2);
  const untouched = resolved(ASSAY, 1);
  const prompt = completionPromptFor(asked, "p-3")!;
  assert.equal(prompt.targets.length, 1);
  assert.equal(prompt.targets[0]!.identityKey, asked.objective.identityKey);

  const rows = evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf([{ objectiveIdentityKey: asked.objective.identityKey, verdict: "understood" }]),
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: "State any positive case relied on.",
    teachingStrategy: "llm_teacher",
  }).map((row, index) => evidenceFromRow({ ...evidenceRow("u", row), id: `x${index}` }, asked.objective.identityKey));

  assert.equal(projectLearnerState(untouched.objective.identityKey, rows).status, "unknown");
  assert.equal(projectLearnerState(asked.objective.identityKey, rows).status, "correct");
});

// ── the worked example reaches the NEXT decision ────────────────────────────

test("🔴🔴 a worked example that was shown changes what the next controller call can SEE", async () => {
  // 🔴 THE WHOLE RISK OF AN ACTION THAT WRITES NO EVIDENCE. `show_correction` has `correctionsShown`
  // and `retrieve` has the evidence row itself; a worked example has neither, so without this the
  // next turn would have no trace that one had just been shown — and the obvious failure is showing
  // it again, forever, because the state that produced the decision has not changed.
  //
  // 🔴 IT IS PROVEN BY READING THE BYTES THE MODEL RECEIVES, NOT BY ASSERTING THE SET WAS PASSED. A
  // context field that reaches `teachingSnapshot` and never reaches the prompt is invisible to the
  // controller, which is the same "carried but never read" defect one layer up.
  const entry = resolved(ASSAY, 1);
  const key = entry.objective.identityKey;

  const seen: string[] = [];
  const capture: TeacherTransport = async (_uid, messages) => {
    seen.push(messages.map((message) => String(message.content)).join("\n"));
    return { errorText: null, text: JSON.stringify({ because: "b", move: "ask", objective: key }) };
  };
  const strategy = createLlmTeacherStrategy(capture);

  await strategy.decide(context([entry]));
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0]!, /worked through in front of them/, "nothing was modelled yet");

  await strategy.decide({ ...context([entry]), modelled: new Set([key]) });
  assert.equal(seen.length, 2);
  // 🔴 CALIBRATION: delete the `modelled` block from `sittingNote` and this line reddens while every
  // other test in this file stays green.
  assert.match(seen[1]!, /Reasoning already worked through in front of them this sitting/);
  assert.ok(seen[1]!.includes(key), "the model is told WHICH objective was modelled, not merely that one was");
});

test("🔴🔴 having been shown a worked example is NOT durable, and is not mastery", async () => {
  // Two halves of one invariant, both checked against the real projection.
  const entry = resolved(ASSAY, 1);
  const key = entry.objective.identityKey;

  // 1. Exposure lives in the sitting, not in the record. `modelled` is a `TeachingContext` field —
  //    it never reaches `evidenceForSubmission`, `recordEvidence` or `EVIDENCE_SELECT`, so there is
  //    no row for a later session to read as a demonstration.
  assert.equal(RUNTIME.includes("recordEvidence(uid, { modelled"), false);
  assert.match(RUNTIME, /const \[modelled, setModelled\] = useState<ReadonlySet<string>>/);
  assert.equal(STORE.includes("modelled"), false, "exposure must not be a column");

  // 2. And after modelling, the learner's state is exactly what it was before: unknown.
  const before = teachingSnapshot(context([entry]));
  const after = teachingSnapshot({ ...context([entry]), modelled: new Set([key]) });
  assert.deepEqual(after.objectives[0]!.state, before.objectives[0]!.state);
  assert.equal(after.objectives[0]!.state.status, "unknown");
  assert.equal(after.objectives[0]!.state.demonstrationCount, 0);
  assert.equal(after.objectives[0]!.state.demonstratedAt, null);

  // 3. The controller can therefore still ask for it — being shown something is not a reason to stop
  //    asking, and this is where that would silently break if exposure ever became evidence.
  const outcome = await createLlmTeacherStrategy(says("ask", key)).decide({
    ...context([entry]),
    modelled: new Set([key]),
  });
  assert.equal(outcome.decision?.action.type, "retrieve");
});

test("🔴 the decision is recomputed when something has been modelled, not served from cache", () => {
  // 🔴 A SET THE CONTROLLER CAN SEE BUT THE MEMO CANNOT is worse than not having it: the snapshot
  // would change and the cached decision would not, so the model would never be asked again with
  // the new information. `decisionInputs` is the cache key, and exposure has to be in it.
  const inputs = RUNTIME.slice(RUNTIME.indexOf("const decisionInputs = useMemo("));
  const body = inputs.slice(0, inputs.indexOf("  const [decided,"));
  assert.match(body, /\[\.\.\.modelled\]\.sort\(\)\.join\(","\)/, "exposure is not part of the cache key");
  assert.match(body, /\[actedOn, correctionsShown, decidedAt, evidence, inFocus, modelled, strategy\]/);
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
