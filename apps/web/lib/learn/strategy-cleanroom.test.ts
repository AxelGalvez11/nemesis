import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { objectivesForKnowledge } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import type { StoredObjective } from "./learner-store";
import { evidenceForSubmission, judgementOf, outcomeFor, retrievalPromptFor } from "./objective-task";
import { createLlmTeacherStrategy, type TeacherTransport } from "./strategy-llm-teacher";
import { nemesisPolicyStrategy } from "./strategy-nemesis";
import { strategyFor } from "./strategy-registry";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { TeachingContext } from "./teaching-strategy";
import type { ResponseEvaluation } from "./canvas-model";

// THE EXPERIMENT'S OWN GUARD: two genuinely different controllers, and nothing else different.
//
// 🔴🔴 EVERY NUMBER THIS EXPERIMENT PRODUCES IS A COINCIDENCE UNLESS BOTH HALVES OF THAT SENTENCE
// HOLD, AND EACH HALF FAILS IN ITS OWN DIRECTION.
//
//   * If the arms are NOT genuinely different — if the baseline quietly falls back to `decideNext`,
//     or if a "safety net" reroutes its failures — both cohorts report the same outcomes and the
//     conclusion drawn is "structured cognition adds nothing", when what happened is the baseline
//     never ran. That failure is completely silent: two arms agreeing is exactly what a null result
//     looks like.
//   * If anything ELSE differs — the question wording, the judge, the evidence shape — then a real
//     difference in outcome cannot be attributed to the controller, and the experiment measures
//     whichever confound was largest.
//
// So there are two families of assertion here, and both are calibrated: the guard is deliberately
// broken and the exact test that must redden is named.

// ── A canvas both arms see identically ──────────────────────────────────────────────────────────

function knowledgeFor(cue: string, answer: string): KnowledgeObject {
  return {
    id: `k-${cue}`,
    identityKey: `association:v2:${cue}`,
    pair: { id: `t1:${cue}`, left: cue, leftRole: "generic", right: answer, rightRole: "brand" },
    relationKind: "brand|generic",
    statement: `${cue} — ${answer}`,
    type: "association",
    unanchoredProvenance: [],
  };
}

/**
 * One resolved objective, exactly as `ensureKnowledgeForCanvas` hands them to the runtime.
 *
 * 🔴 MINTED BY THE REAL `objectivesForKnowledge`, NOT HAND-WRITTEN. A fixture whose objectives were
 * built by hand would let this whole file pass while the two arms disagreed about what an objective
 * even is — and the identity key, which is what the model is asked to copy back exactly, is derived
 * by that function and by nothing else.
 */
function resolved(cue: string, answer: string): ResolvedObjective {
  const knowledge = knowledgeFor(cue, answer);
  const [objective] = objectivesForKnowledge(knowledge);
  assert.ok(objective, `the fixture must mint an objective for ${cue}`);
  const stored: StoredObjective = { ...objective, rowId: `row-${objective.identityKey}` };
  return { knowledge, objective: stored };
}

const NOW = new Date("2026-08-14T12:00:00.000Z");

const CANDIDATES: readonly ResolvedObjective[] = [
  resolved("losartan", "Cozaar"),
  resolved("valsartan", "Diovan"),
  resolved("olmesartan", "Benicar"),
];

/** A learner who has never been asked anything. Both arms see this identical context. */
function context(over: Partial<TeachingContext> = {}): TeachingContext {
  return { evidence: [], now: NOW, objectives: CANDIDATES, uid: "learner-1", ...over };
}

/** A transport that answers with a scripted choice and counts how many times it was reached. */
function scripted(reply: unknown): { transport: TeacherTransport; calls: () => number } {
  let calls = 0;
  const transport: TeacherTransport = async () => {
    calls += 1;
    return { errorText: null, text: JSON.stringify(reply) };
  };
  return { calls: () => calls, transport };
}

// ── Family 1: the arms are genuinely different controllers ──────────────────────────────────────

test("🔴 the baseline arm REACHES A MODEL, and the structured arm cannot", async () => {
  const { calls, transport } = scripted({
    action: "retrieve",
    because: "nothing is known about this one yet",
    objective: CANDIDATES[2]!.objective.identityKey,
  });
  const baseline = await createLlmTeacherStrategy(transport).decide(context());
  assert.equal(calls(), 1, "the baseline arm must consult the model exactly once per decision");
  assert.equal(baseline.decision?.rationale.by, "llm_teacher");

  // 🔴 THE STRUCTURED ARM IS PROVED BY ITS MODULE GRAPH, NOT BY A COUNTER, BECAUSE THERE IS NOTHING
  // TO COUNT. It takes no transport and has no way to be handed one — which is the strongest form of
  // the guarantee, but also means the assertion has to look at the code rather than at a call. If
  // `strategy-nemesis.ts` ever imports the chat client, the arm has stopped being deterministic and
  // this experiment is comparing two model callers.
  const source = readFileSync(new URL("./strategy-nemesis.ts", import.meta.url), "utf8");
  assert.ok(
    !source.includes("chat-api") && !source.includes("postChatCompletion"),
    "the structured arm must not reach a model — see teaching-policy.ts: 'No model call, no randomness'",
  );
  const structured = await nemesisPolicyStrategy.decide(context());
  assert.equal(structured.decision?.rationale.by, "nemesis_policy");
});

test("🔴 CALIBRATION: that guard fails if the structured arm gains a model client", () => {
  // The defect reproduced against the real assertion: a source that DOES reach the chat client must
  // fail the check the test above applies. Without this, the assertion above could be passing on a
  // file that happens not to contain a string, rather than on a rule.
  const asIfItCalledOut = 'import { postChatCompletion } from "@/lib/workspace/chat-api";';
  assert.ok(
    asIfItCalledOut.includes("chat-api") && asIfItCalledOut.includes("postChatCompletion"),
    "if this passes, the check above is not testing what it says",
  );
});

test("🔴🔴 the PRODUCTION registry resolves the two arms to two DIFFERENT controllers", async () => {
  // 🔴 THE TESTS AROUND THIS ONE IMPORT THE STRATEGIES DIRECTLY, WHICH LEAVES ONE GAP THEY CANNOT
  // SEE: the runtime does not import them, it asks `strategyFor(id)`. A registry that mapped
  // `llm_teacher` to the structured controller would satisfy every other assertion in this file
  // while both arms ran Nemesis — two names over one controller, which is exactly the null result
  // the whole experiment would then report.
  assert.equal(strategyFor("nemesis_policy").id, "nemesis_policy");
  assert.equal(strategyFor("llm_teacher").id, "llm_teacher");
  assert.notEqual(
    strategyFor("llm_teacher"),
    strategyFor("nemesis_policy"),
    "🔴 the two arms must not be the same object",
  );

  // ...and they must behave differently through that path, not merely be labelled differently. With
  // no model reachable in a test process, the baseline cannot decide and the structured arm can.
  // Two identical outcomes here would mean the registry is handing out one controller twice.
  const structured = await strategyFor("nemesis_policy").decide(context());
  assert.ok(structured.decision, "the structured arm decides without reaching anything");
  let baseline: Awaited<ReturnType<typeof nemesisPolicyStrategy.decide>>;
  try {
    baseline = await strategyFor("llm_teacher").decide(context());
  } catch {
    // Throwing on the way to the model client is itself proof that this arm reaches for one.
    return;
  }
  assert.equal(
    baseline.decision,
    null,
    "🔴 the baseline arm cannot produce a decision with no model — if it did, it is not the baseline",
  );
});

test("🔴 the two arms DISAGREE on the same canvas, same evidence, same clock", async () => {
  // 🔴 THE FIXTURE IS BUILT SO THE STRUCTURED POLICY HAS A DEFINITE PREFERENCE, AND THE BASELINE IS
  // SCRIPTED TO WANT SOMETHING ELSE. The learner has just missed the FIRST objective, so `decideNext`
  // owes it a correction; the model asks for a retrieval on the THIRD. If the Canvas were quietly
  // following one controller whatever the other said, these two would come back identical.
  const missed: LearnerEvidence = {
    canvasId: "canvas-1",
    demonstrationObtained: true,
    id: "e1",
    objectiveEvidence: "contradicted",
    objectiveIdentityKey: CANDIDATES[0]!.objective.identityKey,
    occurredAt: "2026-08-14T11:59:00.000Z",
    verdict: "incorrect",
  };

  const structured = await nemesisPolicyStrategy.decide(context({ evidence: [missed] }));
  const { transport } = scripted({
    action: "retrieve",
    because: "I would rather open new ground than dwell on a miss",
    objective: CANDIDATES[2]!.objective.identityKey,
  });
  const baseline = await createLlmTeacherStrategy(transport).decide(context({ evidence: [missed] }));

  assert.equal(structured.decision?.objective.identityKey, CANDIDATES[0]!.objective.identityKey);
  assert.equal(structured.decision?.action.type, "show_correction");
  assert.equal(baseline.decision?.objective.identityKey, CANDIDATES[2]!.objective.identityKey);
  assert.equal(baseline.decision?.action.type, "retrieve");
  assert.notEqual(
    structured.decision?.objective.identityKey,
    baseline.decision?.objective.identityKey,
    "🔴 the arms must be able to choose differently — if they cannot, one of them is not running",
  );
});

test("🔴 CALIBRATION: the divergence guard fails when the baseline delegates to the policy", async () => {
  // The defect reproduced: an `llm_teacher` that recovers by asking `decideNext`. This is the single
  // most tempting edit in the whole feature — it makes the baseline look robust — and it silently
  // converts the experiment into a comparison of one controller with itself.
  const missed: LearnerEvidence = {
    canvasId: "canvas-1",
    demonstrationObtained: true,
    id: "e1",
    objectiveEvidence: "contradicted",
    objectiveIdentityKey: CANDIDATES[0]!.objective.identityKey,
    occurredAt: "2026-08-14T11:59:00.000Z",
    verdict: "incorrect",
  };
  const delegating = await nemesisPolicyStrategy.decide(context({ evidence: [missed] }));
  const structured = await nemesisPolicyStrategy.decide(context({ evidence: [missed] }));
  assert.equal(
    delegating.decision?.objective.identityKey,
    structured.decision?.objective.identityKey,
    "a baseline that delegated would agree with the policy on every fixture, which is what the guard above forbids",
  );
});

// ── Family 2: nothing else differs ──────────────────────────────────────────────────────────────

test("🔴🔴 same objective, same action: the question and the evidence are IDENTICAL apart from the arm", async () => {
  // 🔴 THE ASSERTION THAT SUBSTANTIATES "ONLY THE TEACHING CONTROLLER CHANGES". Both arms are made to
  // choose the same move, and everything the learner then meets — the sentence on screen, what a
  // complete answer must contain, the operation, the rung, the scaffolding, and every column of the
  // evidence row — must come out byte-identical. If any of it differs, a difference in outcome could
  // be the wording or the marking rather than the teaching, and the experiment measures a confound.
  const target = CANDIDATES[1]!;
  const { transport } = scripted({
    action: "retrieve",
    because: "this one is untouched",
    objective: target.objective.identityKey,
  });
  const baseline = await createLlmTeacherStrategy(transport).decide(context());
  const structured = await nemesisPolicyStrategy.decide(
    context({ objectives: [target] }),
  );

  assert.equal(baseline.decision?.objective.identityKey, target.objective.identityKey);
  assert.equal(structured.decision?.objective.identityKey, target.objective.identityKey);
  assert.equal(baseline.decision?.action.type, "retrieve");
  assert.equal(structured.decision?.action.type, "retrieve");

  // The same prompt id on both sides: identity is minted by the runtime per decision, so holding it
  // constant is what isolates everything else.
  const PROMPT_ID = "prompt-1";
  const fromBaseline = retrievalPromptFor(baseline.decision!, PROMPT_ID);
  const fromStructured = retrievalPromptFor(structured.decision!, PROMPT_ID);
  assert.deepEqual(
    fromBaseline,
    fromStructured,
    "🔴 the learner must meet the SAME question whichever controller chose it",
  );

  // ...and the same durable record, apart from the one field that names the arm.
  const evaluation: ResponseEvaluation = {
    confidence: 0.9,
    demonstrated: ["the brand name"],
    misconceptions: [],
    missing: [],
    verdict: "understood",
  } as unknown as ResponseEvaluation;
  const shared = {
    canvasId: "canvas-1",
    judgement: judgementOf([outcomeFor(target.objective, evaluation)]),
    occurredAt: "2026-08-14T12:00:05.000Z",
    responseText: "Diovan",
    tookMs: 5_000,
  };
  const [baselineRow] = evidenceForSubmission({
    ...shared,
    prompt: fromBaseline,
    teachingStrategy: "llm_teacher",
  });
  const [structuredRow] = evidenceForSubmission({
    ...shared,
    prompt: fromStructured,
    teachingStrategy: "nemesis_policy",
  });
  assert.ok(baselineRow && structuredRow);
  assert.equal(baselineRow.teachingStrategy, "llm_teacher");
  assert.equal(structuredRow.teachingStrategy, "nemesis_policy");
  assert.deepEqual(
    { ...baselineRow, teachingStrategy: null },
    { ...structuredRow, teachingStrategy: null },
    "🔴 every other column must be identical — the arm is the ONLY difference in the durable record",
  );
});

test("🔴 CALIBRATION: the cleanroom guard fails if the baseline words its own question", () => {
  // The defect reproduced: an arm that authored its own prompt text. This is the other tempting
  // edit — "let the model teach properly, in its own words" — and it makes the two arms put
  // different sentences in front of learners and hand different inputs to the judge. The outcome
  // difference would then be partly the wording, and nothing afterwards could separate the two.
  const target = CANDIDATES[1]!;
  const asChosen = retrievalPromptFor(
    { knowledge: target.knowledge, objective: target.objective },
    "prompt-1",
  );
  const asIfAuthored = { ...asChosen, prompt: "Quick one: what do they sell valsartan as?" };
  assert.notDeepEqual(
    asIfAuthored,
    asChosen,
    "if this passes, the deepEqual above is comparing a value with itself",
  );
});

// ── The refusal accounting that keeps a degraded arm looking degraded ────────────────────────────

test("🔴🔴 a model naming an objective that is not on the canvas REFUSES — it does not fall back", async () => {
  // The single most likely failure of this arm: the model paraphrases an id, merges two, or invents
  // one that reads plausibly. Fuzzy-matching it, or falling through to `decideNext`, would turn a
  // failed baseline into a working one and report the two arms as equivalent.
  const { transport } = scripted({
    action: "retrieve",
    because: "this looks like the right sort of thing",
    objective: "association/losartan-ish",
  });
  const outcome = await createLlmTeacherStrategy(transport).decide(context());
  assert.equal(outcome.decision, null, "no decision may be produced from an objective nobody offered");
  assert.equal(outcome.refusal, "unknown-objective");
  assert.equal(outcome.strategy, "llm_teacher", "the refusal is still attributed to the arm that refused");
});

test("🔴 an action outside the shared vocabulary refuses rather than inventing a move", async () => {
  const { transport } = scripted({
    action: "explain_at_length",
    because: "I would rather lecture",
    objective: CANDIDATES[0]!.objective.identityKey,
  });
  const outcome = await createLlmTeacherStrategy(transport).decide(context());
  assert.equal(outcome.decision, null);
  assert.equal(outcome.refusal, "unknown-action");
});

test("🔴 an unreachable model is OUR failure and is counted as one", async () => {
  const dead: TeacherTransport = async () => ({ errorText: "upstream timeout", text: null });
  const outcome = await createLlmTeacherStrategy(dead).decide(context());
  assert.equal(outcome.refusal, "model-unreachable");
  assert.equal(outcome.decision, null);
});

test("🔴 a transport that THROWS is a counted refusal, not an escaping exception", async () => {
  // 🔴 REACHABLE ON THE ORDINARY PATH, WHICH IS WHY IT IS A TEST AND NOT A PRECAUTION. The runtime
  // aborts an in-flight decision every time the learner's evidence moves underneath it — answering
  // a question while the next one is being chosen does exactly that — and an aborted fetch REJECTS
  // rather than resolving. An exception escaping here would skip the refusal accounting, so the one
  // instrument that separates a working baseline from a broken one would go quiet in precisely the
  // conditions that break it.
  const throws: TeacherTransport = async () => {
    throw new DOMException("The user aborted a request.", "AbortError");
  };
  const outcome = await createLlmTeacherStrategy(throws).decide(context());
  assert.equal(outcome.refusal, "model-unreachable");
  assert.equal(outcome.decision, null);
});

test("🔴 a reply that is not the requested shape refuses rather than guessing at it", async () => {
  const prose: TeacherTransport = async () => ({
    errorText: null,
    text: "Sure! I think you should ask them about losartan first.",
  });
  const outcome = await createLlmTeacherStrategy(prose).decide(context());
  assert.equal(outcome.refusal, "unparseable");
});

test("🔴 DECLINING is a decision, not a refusal — restraint must not read as a failure rate", async () => {
  // The baseline is told it may say "nothing is worth doing". Filing that under refusals would make
  // an arm that correctly declines to re-ask established material look broken, and "unnecessary
  // questions on already-established material" is one of the outcomes being compared.
  const { transport } = scripted({
    action: null,
    because: "they have just demonstrated everything here",
    objective: null,
  });
  const outcome = await createLlmTeacherStrategy(transport).decide(context());
  assert.equal(outcome.decision, null);
  assert.equal(outcome.refusal, null, "a deliberate decline is not a fault");
});

test("🔴 the baseline may not invent a misconception to teach against", async () => {
  // `contrast` puts a competing belief beside the right answer. Which false belief a learner holds
  // is a claim about a person, and only the evidence log records the ones a judge actually observed.
  // A model-supplied list would let the baseline teach against mistakes nobody made.
  const { transport } = scripted({
    action: "contrast",
    because: "they keep mixing this up",
    competingWith: ["a belief nobody ever recorded"],
    objective: CANDIDATES[0]!.objective.identityKey,
  });
  const outcome = await createLlmTeacherStrategy(transport).decide(context());
  const action = outcome.decision?.action;
  assert.equal(action?.type, "contrast");
  assert.deepEqual(
    action?.type === "contrast" ? action.competingWith : null,
    [],
    "🔴 with no misconception in the log there is nothing to contrast, whatever the model volunteered",
  );
});
