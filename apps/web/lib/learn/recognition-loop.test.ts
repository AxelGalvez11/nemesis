// The whole recognition loop, end to end, through the real modules.
//
// 🔴🔴 THIS EXISTS BECAUSE OF THE RULE THIS REPO PAID SIX TIMES TO LEARN: a structural field needs a
// ROUND TRIP, not a test on each side of the boundary it dies at. Every one of those six was
// computed correctly, tested on both sides, and dropped where one shape became another. The two
// crossings here are exactly the ones `objective-task.ts` names in its own header:
//
//     knowledge + evidence ─→ options the learner sees ─→ a policy decision to show them
//     one tap ─→ an outcome ─→ a durable row ─→ read back ─→ learner state ─→ the next decision
//
// 🔴 AND THE FIELD THAT MUST SURVIVE IS *WHICH DISTRACTOR WAS PICKED*. That is the entire reason
// multiple choice is worth building here rather than being refused as `canvas-model.ts` refuses it.
// A test asserting "a row was written" passes while that field is silently gone.

import assert from "node:assert/strict";
import { test } from "node:test";

import { choiceSetsForPool, evidenceForSubmission, outcomeForSelection, recognitionPromptFor } from "./objective-task";
import { isRefusal, optionsFor, readSelection } from "./choice-set";
import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import { evidenceFromRow, evidenceRow } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext } from "./policy-runtime";
import { establishesMastery, masteryEvidenceIn } from "./recognition-value";
import { createLlmTeacherStrategy, type TeacherTransport } from "./strategy-llm-teacher";
import { chooseNextTeachingAction } from "./teaching-policy";

// ── a canvas whose material is genuinely confusable ─────────────────────────
//
// Three associations from one column of one table, which is the ordinary shape of a glossary or a
// reference grid in any discipline. Same `outputRole`, so their answers are the same KIND of thing
// and each is a plausible answer to the others.

function association(id: string, left: string, right: string): KnowledgeObject {
  return {
    id,
    identityKey: `association:v2:${id}`,
    pair: { id: `${id}:r`, left, leftRole: "generic", right, rightRole: "brand" },
    relationKind: "brand|generic",
    statement: `${left} is sold as ${right}`,
    type: "association",
    unanchoredProvenance: [],
  } as KnowledgeObject;
}

const MATERIAL = [
  association("k1", "losartan", "Cozaar"),
  association("k2", "valsartan", "Diovan"),
  association("k3", "irbesartan", "Avapro"),
  association("k4", "candesartan", "Atacand"),
];

/** Only the forward direction, so the pool is one question per pair. */
const POOL: ResolvedObjective[] = MATERIAL.map((knowledge, index) => ({
  knowledge,
  objective: { ...objectivesForKnowledge(knowledge)[0]!, rowId: `row-${index}` },
}));

const TARGET = POOL[0]!;
const KEY = TARGET.objective.identityKey;

const NOW = new Date("2026-08-17T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

function row(over: Partial<LearnerEvidence> & { id: string }): LearnerEvidence {
  return {
    demonstrationObtained: true,
    misconceptions: [],
    objectiveIdentityKey: KEY,
    occurredAt: ago(4 * HOUR),
    verdict: "incorrect",
    ...over,
  };
}

/**
 * A learner who has answered wrongly, named a specific competing belief once, and missed twice since.
 *
 * 🔴 THE ORDER IS DELIBERATE AND THE LATEST ROW IS NOT THE MISCONCEPTION. A misconception as the most
 * recent verdict projects to `status: "misconception"`, which the policy answers with `contrast` —
 * a different, already-correct branch. What this fixture describes is the harder case: the belief was
 * seen once, teaching has moved on, and unaided asking still is not settling it.
 */
const STRUGGLING: LearnerEvidence[] = [
  row({ id: "e1", misconceptions: ["Diovan"], occurredAt: ago(6 * HOUR), verdict: "misconception" }),
  row({ id: "e2", occurredAt: ago(5 * HOUR), scaffoldRung: "independent" }),
  row({ id: "e3", occurredAt: ago(4 * HOUR), scaffoldRung: "independent" }),
];

/**
 * The sitting so far: this objective was worked, then three others were.
 *
 * 🔴 REQUIRED FOR THE POLICY TO OFFER THIS OBJECTIVE AT ALL, AND THAT IS THE SELECTOR WORKING RATHER
 * THAN A FIXTURE TRICK. Without intervening work `next-action-value.ts` applies its `just-worked`
 * penalty and an UNTOUCHED objective outranks the struggling one — correctly: asking again with
 * nothing in between measures whether the learner can still hear their own voice. So the scenario is
 * stated in full, and it is the same one the branch's own reason says out loud ("other material has
 * come between").
 */
const SITTING = [KEY, ...POOL.slice(1).map((entry) => entry.objective.identityKey)];

// ── the options that reach the learner ──────────────────────────────────────

test("🔴 the belief a judge named ends up as an option on the screen", () => {
  const sets = choiceSetsForPool({ evidence: STRUGGLING, objectives: POOL });
  const set = sets.get(KEY);
  assert.ok(set, "no options were built for an objective with a named belief and three siblings");
  const held = set.options.find((option) => option.ground?.kind === "held_misconception");
  assert.ok(held, "the competing belief never reached the screen");
  assert.equal(held.text, "Diovan");
  assert.equal(set.demand, "near");
  // The right answer is there exactly once, and every other option is a real answer from the pool.
  assert.equal(set.options.filter((option) => option.correct).length, 1);
  assert.equal(set.options.find((option) => option.correct)!.text, "Cozaar");
});

test("🔴 an objective with nothing confusable near it gets NO options rather than invented ones", () => {
  const lonely: ResolvedObjective[] = [POOL[0]!];
  const sets = choiceSetsForPool({ evidence: [], objectives: lonely });
  assert.equal(sets.size, 0, "a single objective produced options, which can only mean they were invented");
});

// ── the policy chooses it, and only when it should ──────────────────────────

test("🔴🔴 the policy asks with options once unaided asking has stopped settling anything", () => {
  const decision = decideNext({ actedOn: SITTING, evidence: STRUGGLING, now: NOW, objectives: POOL });
  assert.equal(decision?.action.type, "recognise", `expected a recognition ask, got ${decision?.action.type}`);
  assert.equal(decision.objective.identityKey, KEY);
  assert.ok(decision.action.type === "recognise" && decision.action.rung === "recognition");
  // 🔴 THE TRACE SAYS SO. "Why was I shown a list?" has to be answerable from the same record as
  // "why was I asked this at all".
  assert.ok(
    decision.rationale.by === "nemesis_policy" && decision.rationale.selection.reasons.includes("options-offered"),
  );
});

test("🔴 the FIRST time an objective is met, the ask is production even though options exist", () => {
  // Options exist for every objective in this pool. What stops them being offered is that nothing
  // has been tried yet, and a recognition item put first records a weaker demonstration than the
  // learner may have been capable of.
  const decision = decideNext({ evidence: [], now: NOW, objectives: POOL });
  assert.equal(decision?.action.type, "retrieve");
  assert.ok(decision.action.type === "retrieve" && decision.action.rung === "independent");
});

test("🔴 with no options available the same struggling learner still gets a retrieval, not silence", () => {
  // The refusal path, end to end: identical evidence, a pool with nothing to draw distractors from.
  const alone: ResolvedObjective[] = [TARGET];
  const decision = decideNext({ actedOn: SITTING, evidence: STRUGGLING, now: NOW, objectives: alone });
  assert.equal(decision?.action.type, "retrieve");
});

// ── one tap, all the way to durable state ───────────────────────────────────

/** The prompt a learner actually meets, built the way the runtime builds it. */
function promptForTarget(evidence: readonly LearnerEvidence[]) {
  const decision = decideNext({ actedOn: SITTING, evidence, now: NOW, objectives: POOL });
  assert.ok(decision && decision.action.type === "recognise", "expected a recognition decision");
  return recognitionPromptFor(decision, "response-1", decision.action.choices);
}

test("🔴🔴 tapping a distractor preserves WHICH distractor, through the database shape and back", () => {
  // The round trip this file exists for. Anything less than the full path passes while the field is
  // dropped: `evidenceRow` is what is written, `evidenceFromRow` is what comes back, and the two
  // have already lost three fields to each other in this codebase's history.
  const prompt = promptForTarget(STRUGGLING);
  assert.ok(prompt.choices, "a recognition prompt with no options is a question with no answer surface");
  assert.equal(prompt.rung, "recognition");

  const selection = readSelection(prompt.choices, "Diovan");
  const outcome = outcomeForSelection(TARGET.objective, selection);
  assert.ok(outcome, "a tap on a real option produced no outcome");

  const built = evidenceForSubmission({
    canvasId: "canvas-1",
    judgement: { judged: true, outcomes: [outcome] },
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: "Diovan",
    teachingStrategy: "nemesis_policy",
  });
  assert.equal(built.length, 1);

  const stored = evidenceRow("user-1", built[0]!);
  const readBack = evidenceFromRow({ ...stored, id: "e4" }, KEY);

  // 🔴 THE ONE THAT MATTERS: which option was pressed, verbatim, out of the database shape.
  assert.equal(readBack.responseText, "Diovan");
  // And the belief it re-confirmed, in the field the teaching policy already reads to build a
  // contrast — so this is not a new lane, it is the existing one finally being fed.
  assert.deepEqual(readBack.misconceptions, ["Diovan"]);
  assert.equal(readBack.verdict, "misconception");
  // The demand the learner actually met, so nothing downstream can read this as production.
  assert.equal(readBack.scaffoldRung, "recognition");
  // 🔴 NO MODALITY. A tap is not typed, spoken or written, and inventing one would be a claim about
  // how the answer arrived that nothing observed.
  assert.equal(readBack.responseModality, undefined);
});

test("🔴 tapping a wrong option that is NOT a named belief is `incorrect`, never a misconception", () => {
  // The restraint that keeps a diagnosis from becoming an accusation. Picking a neighbouring answer
  // once is an error and may be nothing more; filing it as a held belief would teach the learner
  // against a model nobody has shown they hold.
  const prompt = promptForTarget(STRUGGLING);
  const sibling = prompt.choices!.options.find((option) => option.ground?.kind === "sibling_answer");
  assert.ok(sibling, "the fixture no longer produces a sibling distractor");
  const outcome = outcomeForSelection(TARGET.objective, readSelection(prompt.choices!, sibling.text));
  assert.equal(outcome?.verdict, "incorrect");
  assert.equal(outcome?.misconceptions, undefined);

  // 🔴 AND THE TEXT IS STILL KEPT. The verdict is only what may be CONCLUDED today; which option was
  // pressed is an observation, and it survives whether or not a belief is claimed.
  const built = evidenceForSubmission({
    canvasId: null,
    judgement: { judged: true, outcomes: [outcome!] },
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: sibling.text,
    teachingStrategy: "nemesis_policy",
  });
  const readBack = evidenceFromRow({ ...evidenceRow("user-1", built[0]!), id: "e5" }, KEY);
  assert.equal(readBack.responseText, sibling.text);
});

test("🔴 a tap on an option that is not on record writes NOTHING at all", () => {
  // A stale render or a rebuilt pool. Nobody answered anything wrongly, so no row may say they did.
  const prompt = promptForTarget(STRUGGLING);
  const outcome = outcomeForSelection(TARGET.objective, readSelection(prompt.choices!, "something else"));
  assert.equal(outcome, null);
});

// ── a correct pick is weaker evidence, and the system acts on that ──────────

test("🔴🔴 a correct pick does NOT establish production, and the policy then asks for it", () => {
  // The asymmetry, end to end and through durable state rather than through a comment. This branch
  // of `chooseNextTeachingAction` documented itself as "UNREACHABLE ON TODAY'S DATA, AND SAID SO
  // RATHER THAN COUNTED AS COVERAGE" because nothing staged a task below `independent`. It is
  // reachable now, and this is the test that says so.
  const prompt = promptForTarget(STRUGGLING);
  const outcome = outcomeForSelection(TARGET.objective, readSelection(prompt.choices!, "Cozaar"));
  assert.equal(outcome?.verdict, "understood");

  const built = evidenceForSubmission({
    canvasId: null,
    judgement: { judged: true, outcomes: [outcome!] },
    occurredAt: NOW.toISOString(),
    prompt,
    responseText: "Cozaar",
    teachingStrategy: "nemesis_policy",
  });
  const landed = evidenceFromRow({ ...evidenceRow("user-1", built[0]!), id: "e6" }, KEY);
  const log = [...STRUGGLING, landed];

  const state = projectLearnerState(KEY, log);
  assert.equal(state.status, "correct", "a correct pick is still a demonstration");
  // 🔴 AND IT ESTABLISHES ONLY WHAT IT ESTABLISHED.
  assert.equal(state.demonstratedAt, "recognition");
  assert.equal(satisfies(state, "independent"), false);
  assert.equal(establishesMastery(masteryEvidenceIn(log)), false);

  // The policy's own move: ask them to produce it, unaided. Not "why?", and not another list.
  const next = chooseNextTeachingAction({
    interveningActs: 3,
    knowledgeObject: TARGET.knowledge,
    learnerState: state,
    now: new Date(NOW.getTime() + HOUR),
    objective: TARGET.objective,
    recentEvidence: log,
  });
  assert.equal(next.type, "retrieve");
  assert.ok(next.type === "retrieve" && next.rung === "independent");
});

/**
 * The discriminating pair for "do not mechanically ask for production after every correct pick".
 *
 * 🔴🔴 TWO LOGS THAT DIFFER BY EXACTLY ONE ROW, AND BY NOTHING ABOUT THE TAP. Both end with the same
 * correct recognition, at the same instant, with the same intervening work. The only difference is
 * whether unaided production is anywhere on record — which is the point: what is owed is decided from
 * DURABLE STATE, never from "the last answer was a tap".
 *
 * 🔴 THE PICK IS DELIBERATELY RECENT (a minute), SO THE TWO ANSWERS ARE STRUCTURALLY DIFFERENT
 * RATHER THAN DIFFERENT ONLY IN PROSE. At this recency an ordinary demonstrated objective is not yet
 * due, so the non-provisional learner gets `advance`; the provisional one is probed anyway, because
 * confirming a recognition is not a scheduling decision and must not wait for a spacing interval.
 * Asserting on `because` instead would be asserting on a sentence this codebase explicitly reserves
 * for humans to read.
 */
function afterACorrectPick(alsoProducedEarlier: boolean) {
  const picked = row({
    id: "e6",
    occurredAt: ago(60_000),
    scaffoldRung: "recognition",
    verdict: "understood",
  });
  const produced = row({
    id: "e0",
    occurredAt: ago(8 * HOUR),
    scaffoldRung: "independent",
    verdict: "understood",
  });
  const log = alsoProducedEarlier ? [produced, ...STRUGGLING, picked] : [...STRUGGLING, picked];
  const state = projectLearnerState(KEY, log);
  return {
    action: chooseNextTeachingAction({
      // Other material has intervened, so nothing is being held in working memory. Both sides.
      interveningActs: 3,
      knowledgeObject: TARGET.knowledge,
      learnerState: state,
      now: NOW,
      objective: TARGET.objective,
      recentEvidence: log,
    }),
    state,
  };
}

test("🔴🔴 a learner who has ALREADY produced it unaided is not probed again after a correct pick", () => {
  const { action, state } = afterACorrectPick(true);
  assert.equal(state.demonstratedAt, "independent", "the highest rung ever reached, not the latest");
  // Nothing is owed. Not a probe, and specifically not one demanded because the last thing they did
  // happened to be a tap.
  assert.equal(action.type, "advance");
});

test("🔴🔴 the SAME pick, from a learner who has only ever recognised it, IS probed", () => {
  // One row different, and the decision changes shape. Without this half the test above passes for a
  // policy that never probes anything.
  const { action, state } = afterACorrectPick(false);
  assert.equal(state.demonstratedAt, "recognition");
  assert.equal(action.type, "retrieve");
  assert.ok(action.type === "retrieve" && action.rung === "independent");
});

// ── the arm a real learner actually meets ───────────────────────────────────
//
// 🔴🔴 `DEFAULT_STRATEGY` IS `llm_teacher`, SO EVERY TEST ABOVE THIS LINE EXERCISES THE ARM MOST
// LEARNERS DO NOT GET. A verb added to that controller with no coverage is precisely the shape this
// codebase keeps re-finding: implemented, merged, deployed, dead — and dead in the DEFAULT path,
// where nobody would look. `TeacherTransport` is injectable for exactly this reason, in its own
// words: *"so a test can prove this arm actually reaches a model"*.

/** A transport that replies with one scripted decision. */
function saying(reply: unknown): TeacherTransport {
  return async () => ({ errorText: null, text: JSON.stringify(reply) });
}

function teachingContext(objectives: readonly ResolvedObjective[], evidence: readonly LearnerEvidence[]) {
  return { evidence, now: NOW, objectives, uid: "learner-1" };
}

test("🔴🔴 the model arm can choose options, and gets the same set the structured arm would", async () => {
  const outcome = await createLlmTeacherStrategy(
    saying({ because: "unaided asking is not settling this", move: "recognise", objective: KEY }),
  ).decide(teachingContext(POOL, STRUGGLING));

  assert.equal(outcome.refusal, null);
  assert.equal(outcome.decision?.action.type, "recognise", "the verb reached no action");
  const action = outcome.decision!.action;
  assert.ok(action.type === "recognise" && action.rung === "recognition");
  // 🔴 REAL OPTIONS, BUILT BY THE SAME BUILDER. If the two arms could put different questions in
  // front of two cohorts, the comparison between them would mean nothing.
  const fromPolicy = choiceSetsForPool({ evidence: STRUGGLING, objectives: POOL }).get(KEY);
  assert.deepEqual(action.type === "recognise" ? action.choices : null, fromPolicy);
});

test("🔴 the model may not conjure options: with nothing confusable, the move is REFUSED and counted", async () => {
  // The same discipline the `contrast` verb already follows when no competing belief was observed.
  // Silently substituting a plain retrieval would let the arm report a move it never made.
  const outcome = await createLlmTeacherStrategy(
    saying({ because: "options would help", move: "recognise", objective: TARGET.objective.identityKey }),
  ).decide(teachingContext([TARGET], STRUGGLING));

  assert.equal(outcome.decision, null);
  assert.equal(outcome.refusal, "unknown-action");
});

test("🔴 every verb the model is offered maps to a real action or a counted refusal", async () => {
  // 🔴 NOTHING SWEPT THE VERB LIST BEFORE THIS, so a verb could be added to the vocabulary and to
  // the prompt while `actionFor` had no case for it — a move the model is invited to make and that
  // can only ever come back as `unknown-action`. Checked over the two verbs this change touches
  // rather than the whole list, because the others already have their own tests.
  for (const move of ["recognise", "ask"]) {
    const outcome = await createLlmTeacherStrategy(
      saying({ because: "because", move, objective: KEY }),
    ).decide(teachingContext(POOL, STRUGGLING));
    assert.ok(
      outcome.decision !== null,
      `the verb "${move}" is offered to the model and produces no action on material that supports it`,
    );
  }
});

// ── the same material in another discipline behaves identically ─────────────

test("🔴 a law canvas and a mechanical-engineering canvas produce the same structural decision", () => {
  const build = (pairs: readonly [string, string][]): ResolvedObjective[] =>
    pairs.map(([left, right], index) => {
      const knowledge = association(`x${index}`, left, right);
      return { knowledge, objective: { ...objectivesForKnowledge(knowledge)[0]!, rowId: `r${index}` } };
    });

  const law = build([
    ["intentional tort", "battery"],
    ["strict liability", "abnormally dangerous activity"],
    ["negligence per se", "statutory violation"],
    ["res ipsa loquitur", "exclusive control"],
  ]);
  const engineering = build([
    ["ductile failure", "necking"],
    ["brittle failure", "cleavage"],
    ["fatigue failure", "beach marks"],
    ["creep failure", "grain boundary sliding"],
  ]);

  const shapeOf = (pool: ResolvedObjective[]) => {
    const key = pool[0]!.objective.identityKey;
    const evidence = STRUGGLING.map((entry, index) => ({
      ...entry,
      // The competing belief is whatever the OTHER answer in that discipline is. Structurally the
      // same fixture; nothing here knows what any of these words mean.
      ...(index === 0 ? { misconceptions: [pool[1]!.objective.answer] } : {}),
      objectiveIdentityKey: key,
    }));
    const acted = pool.map((entry) => entry.objective.identityKey);
    const decision = decideNext({ actedOn: acted, evidence, now: NOW, objectives: pool });
    const action = decision?.action;
    return {
      // 🔴 SORTED, AND THE REASON IS A REAL PROPERTY RATHER THAN A LOOSENED ASSERTION. The SEAT the
      // correct answer sits in legitimately differs between these two: `balanceAnswerPositions` seeds
      // from a hash of the question text, so two papers with different words lay out differently by
      // design. That is the balancer working, not a dependence on the field. What must be identical
      // is which KINDS of option exist and how many, which is what a multiset compares.
      grounds: action?.type === "recognise"
        ? action.choices.options.map((o) => o.ground?.kind ?? "correct").sort()
        : null,
      options: action?.type === "recognise" ? action.choices.options.length : null,
      type: action?.type ?? null,
    };
  };

  assert.deepEqual(shapeOf(law), shapeOf(engineering));
  // 🔴 AND THE SEATS REALLY DO DIFFER, so the sort above is not quietly hiding a system that lays
  // every paper out the same way. Asserting the property this test relaxes is what stops the
  // relaxation from becoming a hole.
  const seatOf = (pool: ResolvedObjective[]): number => {
    const acted = pool.map((entry) => entry.objective.identityKey);
    const evidence = STRUGGLING.map((entry, index) => ({
      ...entry,
      ...(index === 0 ? { misconceptions: [pool[1]!.objective.answer] } : {}),
      objectiveIdentityKey: pool[0]!.objective.identityKey,
    }));
    const action = decideNext({ actedOn: acted, evidence, now: NOW, objectives: pool })?.action;
    return action?.type === "recognise" ? action.choices.options.findIndex((o) => o.correct) : -1;
  };
  assert.notEqual(seatOf(law), -1);
  assert.notEqual(seatOf(engineering), -1);
  assert.equal(shapeOf(law).type, "recognise", "the fixture no longer reaches the branch it is testing");
});

// ── the option builder is reused, not reimplemented ─────────────────────────

test("🔴 nothing outside `choice-set.ts` builds an option set of its own", () => {
  // A second builder is how the two come to disagree about what a distractor is, and the
  // disagreement is silent: both produce four plausible strings.
  const direct = optionsFor({
    answer: "Cozaar",
    heldMisconceptions: ["Diovan"],
    identityKey: KEY,
    neighbouringClasses: [],
    prompt: "What is the brand for losartan?",
    siblingAnswers: ["Avapro", "Atacand"],
  });
  assert.ok(!isRefusal(direct));
  const viaPool = choiceSetsForPool({ evidence: STRUGGLING, objectives: POOL }).get(KEY);
  assert.ok(viaPool);
  assert.deepEqual(
    [...direct.options.map((o) => o.text)].sort(),
    [...viaPool.options.map((o) => o.text)].sort(),
    "the pool builder and the direct builder disagree about which options exist",
  );
});
