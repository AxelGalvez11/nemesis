import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { StoredObjective } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";
import { controllerFor } from "./strategy-registry";
import { createLlmTeacherStrategy, relevantWindowOf, type TeacherTransport } from "./strategy-llm-teacher";
import { teachingSnapshot } from "./teaching-snapshot";
import {
  ASSIGNABLE_STRATEGIES,
  FALLBACK_RECORDED_AS,
  FALLBACK_STRATEGY,
  TEACHING_STRATEGIES,
  type TeachingContext,
} from "./teaching-strategy";

// WHAT HAPPENS WHEN THE CONTROLLER CANNOT DECIDE, AND WHAT HAPPENS WHEN IT DECIDES TO MOVE ON.
//
// 🔴🔴 THE TWO WAYS THE NEW DEFAULT COULD FAIL SILENTLY, AND THEY FAIL IN OPPOSITE DIRECTIONS. A
// fallback that is invisible makes the model arm quietly BE the structured arm and reports the two
// as equivalent — the catastrophe `teaching-strategy.ts` argues against at length. A "move on" that
// nothing records makes the controller decline the same objective on every turn for ever, which is
// the drill trap rebuilt out of the mechanism meant to end it.

function resolved(cue: string, answer: string): ResolvedObjective {
  const knowledge: KnowledgeObject = {
    id: `k-${cue}`,
    identityKey: `association:v2:${cue}`,
    pair: { id: `t1:${cue}`, left: cue, leftRole: "generic", right: answer, rightRole: "brand" },
    relationKind: "brand|generic",
    statement: `${cue} — ${answer}`,
    type: "association",
    unanchoredProvenance: [],
  };
  // 🔴 MINTED BY THE REAL MINTER. The identity key is what the model is asked to copy back exactly,
  // and it is derived by this function and nothing else — a hand-written fixture could pass while
  // disagreeing with production about what an objective even is.
  const [objective] = objectivesForKnowledge(knowledge);
  assert.ok(objective, `the fixture must mint an objective for ${cue}`);
  return { knowledge, objective: { ...objective, rowId: `row-${objective.identityKey}` } as StoredObjective };
}

const CANDIDATES: readonly ResolvedObjective[] = [
  resolved("losartan", "Cozaar"),
  resolved("valsartan", "Diovan"),
  resolved("olmesartan", "Benicar"),
];
const NOW = new Date("2026-08-16T12:00:00.000Z");

function context(over: Partial<TeachingContext> = {}): TeachingContext {
  return { evidence: [], now: NOW, objectives: CANDIDATES, uid: "learner-1", ...over };
}

/** A transport that answers a scripted queue, one reply per call. */
function queued(replies: readonly unknown[]): { transport: TeacherTransport; calls: () => number } {
  let calls = 0;
  const transport: TeacherTransport = async () => {
    const reply = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    return { errorText: null, text: JSON.stringify(reply) };
  };
  return { calls: () => calls, transport };
}

test("🔴🔴 a fallback is recorded as a FALLBACK, never as the structured arm being chosen", () => {
  // The row must be excludable. `compareStrategies` filters on the exact id, so a fallback stamped
  // `nemesis_policy` would file a turn the model failed to decide as a result for the arm that never
  // ran — and every number afterwards would look completely ordinary and be wrong.
  assert.notEqual(FALLBACK_RECORDED_AS, FALLBACK_STRATEGY);
  assert.equal(FALLBACK_RECORDED_AS, "nemesis_policy_fallback");
  assert.equal(FALLBACK_STRATEGY, "nemesis_policy");
  assert.ok(TEACHING_STRATEGIES.includes(FALLBACK_RECORDED_AS));
  assert.ok(!(ASSIGNABLE_STRATEGIES as readonly string[]).includes(FALLBACK_RECORDED_AS));
});

test("🔴🔴 an unreachable controller produces a real screen, stamped as a rescue", async () => {
  const outcome = await controllerFor("llm_teacher", context({ uid: null }));
  assert.equal(outcome.strategy, FALLBACK_RECORDED_AS, "🔴 the rescue must not claim to be the model arm");
  assert.ok(outcome.decision, "a learner must not meet a blank canvas because a provider blinked");
  assert.equal(outcome.refusal, null);
  assert.equal(
    outcome.decision?.rationale.by === "nemesis_policy_fallback" ? outcome.decision.rationale.after : null,
    "model-unreachable",
    "🔴 the refusal that caused the rescue is carried, so the failure stays a count and not a guess",
  );
});

test("🔴 a controller that correctly found nothing is NOT rescued", async () => {
  // `no-candidates` means the knowledge layer handed the controller nothing, which the structured
  // policy would meet identically. Rescuing it would file a fallback where no controller failed.
  const outcome = await controllerFor("llm_teacher", context({ objectives: [] }));
  assert.equal(outcome.refusal, "no-candidates");
  assert.equal(outcome.strategy, "llm_teacher");
  assert.equal(outcome.decision, null);
});

test("🔴🔴 deciding to move on ends that objective's turn WITHOUT ending the sitting", async () => {
  // The behaviour the owner asked for by name: *"advance and defer must be first-class decisions.
  // They must not merely occur because every other action disappeared."*
  const { calls, transport } = queued([
    { because: "not worth the minute", move: "advance", objective: CANDIDATES[0]!.objective.identityKey },
    { because: "this one is", move: "ask", objective: CANDIDATES[1]!.objective.identityKey },
  ]);
  const outcome = await createLlmTeacherStrategy(transport).decide(context());
  assert.equal(outcome.decision?.action.type, "advance");
  assert.equal(outcome.decision?.objective.identityKey, CANDIDATES[0]!.objective.identityKey);
  assert.equal(calls(), 1);
});

test("🔴 a canvas-wide decline is a DECISION, not a failure rate", async () => {
  const { transport } = queued([{ because: "they have shown all of this", move: "advance", objective: null }]);
  const outcome = await createLlmTeacherStrategy(transport).decide(context());
  assert.equal(outcome.decision, null);
  assert.equal(outcome.refusal, null, "restraint must never read as a fault");
});

test("🔴 the snapshot reports UNOBSERVED as absent, never as zero", () => {
  // The defect this repo has paid for more often than any other. A model handed `retrievability: 0`
  // reasons that the learner has forgotten something they were never asked.
  const snapshot = teachingSnapshot(context());
  const first = snapshot.objectives[0]!;
  assert.equal(first.retrievability, null, "never demonstrated is not certain to fail");
  assert.equal(first.minutesSinceLastEvidence, null, "never met is not met zero minutes ago");
  assert.equal(first.medianResponseMs, null, "unrecorded latency is not instant");
  assert.equal(first.lastRung, null, "no recorded rung is not `independent` by assumption");
  assert.equal(first.importance, null, "unread importance is not unimportant");
});

test("🔴 coverage counts are absent until something has actually read importance", () => {
  // "We cannot yet tell what matters in this document" and "none of it matters" are opposite facts,
  // and racing through trivia while calling it coverage is the specific failure the owner named.
  const snapshot = teachingSnapshot(context());
  assert.equal(snapshot.scope.importantTotal, null);
  assert.equal(snapshot.scope.importantDemonstrated, null);
  assert.equal(snapshot.scope.total, CANDIDATES.length);
  assert.equal(snapshot.scope.touched, 0);
});

test("🔴🔴 a real importance reading REACHES the controller, and one knowledge object's reading covers every objective it minted", () => {
  // 🔴 THE SEAM WHERE TWO LANES MEET, AND IT WAS BROKEN THE FIRST TIME. The snapshot read
  // `importance.rank` through a structural cast while the shipped field is `standing`: it compiled,
  // every test passed, and it returned `null` for every objective in the corpus for ever. Reading a
  // real value here is what makes that impossible to reintroduce silently.
  const [first] = CANDIDATES;
  assert.ok(first);
  const withReading: ResolvedObjective = {
    knowledge: {
      ...first.knowledge,
      importance: { blindSpots: [], observations: [], standing: "central" },
    },
    objective: first.objective,
  };
  const snapshot = teachingSnapshot(context({ objectives: [withReading, CANDIDATES[1]!] }));
  assert.equal(snapshot.objectives[0]?.importance, "central", "🔴 a real reading must not read as absent");
  assert.equal(snapshot.objectives[1]?.importance, null, "an unread one stays unread");
  // Counted, and counted only because SOMETHING was read — a document nothing has looked at reports
  // `null`, which is a different fact from a document with nothing central in it.
  assert.equal(snapshot.scope.importantTotal, 1);
  assert.equal(snapshot.scope.importantDemonstrated, 0);
});

test("🔴 the model is given the same objectives it must choose from, and no others", () => {
  // A snapshot describing objectives the controller cannot act on would invite it to name one and
  // be refused for it — a self-inflicted refusal rate that looks like a broken controller.
  const snapshot = teachingSnapshot(context());
  assert.deepEqual(
    snapshot.objectives.map((entry) => entry.identityKey),
    CANDIDATES.map((entry) => entry.objective.identityKey),
  );
});

test("🔴 open-world semantic structure reaches the general teaching model", async () => {
  const [first] = CANDIDATES;
  assert.ok(first);
  const relationshipType = "countercurrent_multiplier_disruption";
  const structured: ResolvedObjective = {
    knowledge: {
      ...first.knowledge,
      semanticRelations: [{
        id: "novel-relation",
        relationshipType,
        roles: [
          { role: "disruptor", value: { text: "NKCC2 inhibition" } },
          { role: "system", value: { text: "medullary concentration gradient" } },
        ],
      }],
    },
    objective: first.objective,
  };
  let sent = "";
  const transport: TeacherTransport = async (_uid, messages) => {
    sent = messages.map((message) => String(message.content)).join("\n");
    return {
      errorText: null,
      text: JSON.stringify({ because: "it unlocks the mechanism", move: "ask", objective: first.objective.identityKey }),
    };
  };
  const outcome = await createLlmTeacherStrategy(transport).decide(context({ objectives: [structured] }));
  assert.ok(outcome.decision);
  assert.match(sent, new RegExp(relationshipType));
  assert.match(sent, /disruptor=NKCC2 inhibition/);
});

test("🔴🔴 the per-turn prompt is BOUNDED, and the controller is told its window is not the canvas", async () => {
  // 🔴 MEASURED BEFORE THIS EXISTED, at the brief's real field width: 24 objectives is ~2,950
  // tokens, 83 is ~10,200, 229 is ~28,400, and the owner's real 474-objective immunology lecture is
  // **~58,900 tokens PER TURN**. Every decision. A learner working through one lecture would have
  // sent millions of tokens through the metered door before finishing it, and the unit-economics
  // audit closed a far smaller hole than that.
  const many: ResolvedObjective[] = Array.from({ length: 300 }, (_, i) => resolved(`term-${i}`, `Answer ${i}`));
  let sent = "";
  const transport: TeacherTransport = async (_uid, messages) => {
    sent = messages.map((m) => String(m.content)).join("\n");
    return { errorText: null, text: JSON.stringify({ because: "x", move: "ask", objective: many[0]!.objective.identityKey }) };
  };
  const outcome = await createLlmTeacherStrategy(transport).decide(context({ objectives: many }));
  assert.ok(outcome.decision, "a bounded brief must still produce a decision");

  const briefed = (sent.match(/^- id: /gm) ?? []).length;
  assert.ok(briefed <= 40, `at most 40 objectives may be briefed, saw ${briefed}`);
  assert.ok(briefed > 1, "and it must not be so tight there is nothing to choose between");

  // 🔴 THE WINDOW IS DISCLOSED. A controller shown 40 of 300 and not told so would report the
  // material nearly covered when it had seen an eighth of it — a false coverage claim, about the
  // exact objective it is being asked to optimise.
  assert.match(sent, /Nemesis retrieved 40 of 300 objectives/);
});

test("🔴 the 40-objective bound retrieves a connected knowledge neighborhood, not the first flat checklist entries", () => {
  const unrelated: ResolvedObjective[] = Array.from({ length: 60 }, (_, index) => resolved(`unrelated-${index}`, `U${index}`));
  const hubBase = resolved("organizing principle", "shared mechanism");
  const leafTerms = Array.from({ length: 15 }, (_, index) => `downstream-${index}`);
  const hub: ResolvedObjective = {
    ...hubBase,
    knowledge: {
      ...hubBase.knowledge,
      semanticRelations: [{
        id: "hub-relations",
        relationshipType: "organizes",
        roles: [
          { role: "principle", value: { text: "organizing principle" } },
          ...leafTerms.map((term) => ({ role: "downstream", value: { text: term } })),
        ],
      }],
    },
  };
  const leaves = leafTerms.map((term, index) => {
    const base = resolved(term, `detail-${index}`);
    return {
      ...base,
      knowledge: {
        ...base.knowledge,
        semanticRelations: [{
          id: `leaf-${index}`,
          relationshipType: "depends_on",
          roles: [
            { role: "dependent", value: { text: term } },
            { role: "detail", value: { text: `detail-${index}` } },
          ],
        }],
      },
    } satisfies ResolvedObjective;
  });
  const all = [...unrelated, hub, ...leaves];
  const snapshot = teachingSnapshot(context({ objectives: all }));
  const retrieved = relevantWindowOf(snapshot.objectives, []);
  assert.equal(retrieved.length, 40);
  assert.equal(retrieved[0]?.identityKey, hub.objective.identityKey, "the organizing node has the largest exact fan-out");
  assert.ok(
    leaves.every((leaf) => retrieved.some((entry) => entry.identityKey === leaf.objective.identityKey)),
    "its downstream neighborhood must arrive with it even though all of it appears after 60 unrelated objectives",
  );
});
