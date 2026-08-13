import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext, supportedObjectives } from "./policy-runtime";
import { RETRIEVAL_ELIGIBLE_AFTER_MS } from "./retrieval-eligibility";

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [FORWARD, REVERSE] = objectivesForKnowledge(KNOWLEDGE);
const NOW = new Date("2026-08-11T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/**
 * 🔴 DERIVED FROM THE TEMPO, NEVER WRITTEN AS A LITERAL, AND THE REASON IS A REAL FAILURE.
 *
 * These fixtures used to read `ago(10 * 60_000)` — chosen when the tempo was a provisional one hour
 * and the policy ALSO conjoined a separate one-hour churn guard. Ten minutes looked "comfortably
 * recent" because the real boundary was sixty, and the fixture had fifty minutes of slack nobody
 * knew about. The assumption it silently encoded: *ten minutes is strictly inside the suppression
 * window*.
 *
 * When the owner ruled the tempo to be exactly ten minutes and the churn guard left this branch,
 * that slack vanished and these fixtures landed exactly ON an inclusive boundary — describing a
 * demonstration that is DUE while claiming it is recent. Three tests went red at once.
 *
 * So the age is expressed as a FRACTION of the tempo. These tests are about whether suppression
 * exists at all, not about what the tempo is — the tempo itself is asserted in exactly one place,
 * by the sweep in `retrieval-eligibility.test.ts`. Any future ruling moves these with it.
 */
const RECENT_MS = RETRIEVAL_ELIGIBLE_AFTER_MS / 2;
const MORE_RECENT_MS = RETRIEVAL_ELIGIBLE_AFTER_MS / 4;

const RESOLVED: ResolvedObjective[] = [
  { knowledge: KNOWLEDGE, objective: { ...FORWARD!, rowId: "row-forward" } },
  { knowledge: KNOWLEDGE, objective: { ...REVERSE!, rowId: "row-reverse" } },
].sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));

function ev(id: string, key: string, occurredAt: string, verdict: LearnerEvidence["verdict"]): LearnerEvidence {
  return { demonstrationObtained: verdict !== null, id, objectiveIdentityKey: key, occurredAt, verdict };
}

// ── nothing known yet ───────────────────────────────────────────────────────

test("🔴 with no evidence at all, the first thing asked is a retrieval", () => {
  // No orientation screen, no level question, no Learn stage. Nemesis has no evidence, and asking
  // is the fastest honest way to get some.
  const decision = decideNext({ evidence: [], now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
  assert.equal(decision?.state.status, "unknown");
});

test("the decision is the same however often it is asked", () => {
  // Stateless: if calling it repeatedly walked forwards, that would be a sequence in a new file.
  const first = decideNext({ evidence: [], now: NOW, objectives: RESOLVED });
  for (let i = 0; i < 4; i += 1) {
    assert.deepEqual(decideNext({ evidence: [], now: NOW, objectives: RESOLVED }), first);
  }
});

// ── evidence for one direction does not become evidence for the other ───────

test("🔴 demonstrating one direction leaves the REVERSE still asked", () => {
  // The single strongest acceptance case for the whole objective model. A learner model that
  // collapsed the pair into "knows losartan/Cozaar" would answer `advance` here and never ask.
  const evidence = [ev("e1", FORWARD!.identityKey, ago(2 * 3600_000), "understood")];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
  assert.equal(decision?.objective.identityKey, REVERSE!.identityKey);
  assert.equal(decision?.state.status, "unknown");
});

test("🔴 evidence is matched by objective, never merely 'this canvas has evidence'", () => {
  // Handing the whole log to every objective would make one demonstration mark them all correct.
  const evidence = [ev("e1", FORWARD!.identityKey, ago(2 * 3600_000), "understood")];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.evidence.length, 0, "the reverse objective has no evidence of its own");
});

test("both directions demonstrated means nothing is owed — while the demonstrations are recent", () => {
  // 🔴 THE CLOCK IN THIS FIXTURE IS LOAD-BEARING. It used to read 1-2 hours, which was safe only
  // because a demonstrated objective never came back at all. Now that one can become eligible again,
  // "nothing is owed" is a claim about a WINDOW, and the fixture has to sit inside it or it is
  // asserting the absence of a feature rather than the presence of suppression.
  //
  // It then read a literal ten minutes, which put it exactly ON the window's inclusive edge the
  // moment the owner ruled that number. Both ages are now fractions of the tempo — see `RECENT_MS`.
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(RECENT_MS), "understood"),
    ev("e2", REVERSE!.identityKey, ago(MORE_RECENT_MS), "understood"),
  ];
  assert.equal(decideNext({ evidence, now: NOW, objectives: RESOLVED }), null);
});

test("🔴 …and once they are no longer recent, the SAME log owes a retrieval again", () => {
  // The other half, and the one that would have caught the original defect. Identical evidence,
  // identical objectives — only the age differs. A canvas whose every objective was demonstrated
  // long ago must not be permanently empty, which is exactly what it was.
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(30 * 24 * 3600_000), "understood"),
    ev("e2", REVERSE!.identityKey, ago(30 * 24 * 3600_000), "understood"),
  ];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.notEqual(decision, null, "a month later this canvas still had nothing to ask — that was the defect");
  assert.equal(decision?.action.type, "retrieve");
  assert.equal(decision?.state.status, "correct", "eligible again WITHOUT its status being rewritten");
});

test("a demonstrated objective is never re-tested to fill a stage", () => {
  // Recent, for the same reason as above: this is about `advance` not being an ACTION, not about
  // whether a review ever comes due. Ages derived from the tempo so a future ruling cannot silently
  // turn "recent" into "due" and leave this test asserting something it was never about.
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(RECENT_MS), "understood"),
    ev("e2", REVERSE!.identityKey, ago(MORE_RECENT_MS), "understood"),
  ];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision, null, "advance is the absence of a next action, not an action");
});

// ── correction outranks a fresh question, holding outranks nothing ──────────

test("a wrong answer is corrected before another objective is opened", () => {
  // 🔴 DATED TO THE MOMENT IT TESTS. This used to place the wrong answer two hours back, where the
  // answer is no longer what is owed — the correction belongs to the moment the attempt fell short.
  // What the test is for is the ARBITRATION: a learner who has just got something wrong is dealt
  // with before an untouched objective is opened. That is unchanged.
  const evidence = [ev("e1", RESOLVED[0]!.objective.identityKey, ago(60_000), "incorrect")];
  const decision = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "show_correction");
  assert.equal(decision?.objective.identityKey, RESOLVED[0]!.objective.identityKey);
});

test("🔴 an objective being held does not block one that is actually owed something", () => {
  // `defer` means "not this, not now". Returning it while another objective has never been asked
  // would stall the session on a technicality.
  //
  // 🔴 THE HOLD IS NOW CAUSED BY WHAT ACTUALLY CAUSES IT. Reaching `defer` used to depend on the
  // objective having more than one piece of evidence, which was standing in for "they have been
  // shown the answer". `correctionsShown` says it directly.
  const held = RESOLVED[0]!.objective.identityKey;
  const evidence = [
    ev("e1", held, ago(5 * 3600_000), "incorrect"),
    ev("e2", held, ago(60_000), "incorrect"),
  ];
  const decision = decideNext({
    correctionsShown: new Set([held]),
    evidence,
    now: NOW,
    objectives: RESOLVED,
  });
  assert.equal(decision?.action.type, "retrieve");
  assert.notEqual(decision?.objective.identityKey, held);
});

test("when everything is held, holding is what is reported", () => {
  const [a, b] = [RESOLVED[0]!.objective.identityKey, RESOLVED[1]!.objective.identityKey];
  const evidence = [
    ev("e1", a!, ago(5 * 3600_000), "incorrect"),
    ev("e2", a!, ago(60_000), "incorrect"),
    ev("e3", b!, ago(5 * 3600_000), "incorrect"),
    ev("e4", b!, ago(90_000), "incorrect"),
  ];
  assert.equal(
    decideNext({ correctionsShown: new Set([a!, b!]), evidence, now: NOW, objectives: RESOLVED })?.action.type,
    "defer",
  );
});

test("🔴 a correction shown for ONE objective does not hold a different one", () => {
  // The set is per objective, and a set consulted with the wrong key would silently hold everything
  // the moment any single correction had been read.
  const [a, b] = [RESOLVED[0]!.objective.identityKey, RESOLVED[1]!.objective.identityKey];
  const evidence = [ev("e1", a!, ago(60_000), "incorrect"), ev("e2", b!, ago(60_000), "incorrect")];
  const decision = decideNext({
    correctionsShown: new Set([a!]),
    evidence,
    now: NOW,
    objectives: RESOLVED,
  });
  assert.equal(decision?.action.type, "show_correction");
  assert.equal(decision?.objective.identityKey, b, "the objective whose correction has NOT been shown");
});

// ── order comes from identity, not from arrival ─────────────────────────────

test("the decision does not depend on the order evidence arrives in", () => {
  const evidence = [
    ev("e1", FORWARD!.identityKey, ago(6 * 3600_000), "incorrect"),
    ev("e2", FORWARD!.identityKey, ago(3 * 3600_000), "understood"),
  ];
  assert.deepEqual(
    decideNext({ evidence: [...evidence].reverse(), now: NOW, objectives: RESOLVED }),
    decideNext({ evidence, now: NOW, objectives: RESOLVED }),
  );
});

// ── reading a correction is not evidence, but it must still move ────────────

test("🔴 an acknowledged correction does not serve the identical card again", () => {
  // Found by clicking "Got it" in the running app. Showing a correction produces no new evidence —
  // correctly, because reading one says nothing about what the learner can now do — so the state
  // that asked for it is unchanged and it asks again. The card looped for ever.
  const held = RESOLVED[0]!.objective.identityKey;
  const evidence = [ev("e1", held, ago(60_000), null)];
  const before = decideNext({ evidence, now: NOW, objectives: RESOLVED });
  assert.equal(before?.action.type, "show_correction");
  assert.equal(before?.objective.identityKey, held);

  // 🔴 THE LOOP-BREAKER IS `correctionsShown`, AND THIS TEST USED TO SIMULATE A BROKEN ACKNOWLEDGE.
  // It passed `actedOn` alone — modelling a runtime that reorders after showing a correction but
  // never records having shown it. That was faithful when `actedOn` was the only mechanism; it
  // stopped being faithful when `correctionsShown` arrived, and it has now stopped being harmless:
  // an owed exposition outranks a question (§39 `fail -> EXPOSE ANSWER -> move on`), so reordering
  // alone can no longer suppress a correction and must not be expected to.
  //
  // What `acknowledge` really does is fill BOTH, which is what is passed here. The property the test
  // was written for is unchanged and still asserted: the identical card does not come back.
  const after = decideNext({
    actedOn: [held],
    correctionsShown: new Set([held]),
    evidence,
    now: NOW,
    objectives: RESOLVED,
  });
  assert.notEqual(after?.objective.identityKey, held, "the same card came back immediately");
  assert.equal(after?.action.type, "retrieve");

  // 🔴 AND THE OPPOSITE ERROR, WHICH IS THE ONE THAT WAS LIVE FOR MONTHS. Reordering WITHOUT the
  // record must NOT suppress the correction — that is the state the runtime is in between painting
  // the verdict and painting the answer, and treating it as "already shown" is precisely how the
  // product lost its corrections. See correction-reaches-the-learner.test.ts.
  const owed = decideNext({ actedOn: [held], evidence, now: NOW, objectives: RESOLVED });
  assert.equal(owed?.objective.identityKey, held);
  assert.equal(owed?.action.type, "show_correction", "an answer that is owed must not be postponed by a reorder");
});

test("acting on everything comes back round rather than ending in a blank page", () => {
  // 🔴 A REORDERING, NOT A FILTER. Being shown something twice is a far smaller failure than a
  // surface with nothing on it and no way forward.
  const all = RESOLVED.map(({ objective }) => objective.identityKey);
  const decision = decideNext({ actedOn: all, evidence: [], now: NOW, objectives: RESOLVED });
  assert.equal(decision?.action.type, "retrieve");
});

test("acknowledging is session state and never reaches the learner's record", async () => {
  // If this ever became evidence it would assert that reading an answer is a demonstration.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");
  const ack = source.slice(source.indexOf("const acknowledge = useCallback"), source.indexOf("return {", source.indexOf("const acknowledge")));
  for (const forbidden of ["recordEvidence", "unobtainedEvidence", "evidenceFromEvaluation"]) {
    assert.equal(ack.includes(forbidden), false, `acknowledging must not write ${forbidden}`);
  }
});

// ── the supported slice ─────────────────────────────────────────────────────

test("🔴 a knowledge type with no built interaction yields nothing to act on", () => {
  // Shipping the next knowledge type means building its interaction, not flipping a flag and
  // letting it fall back to a quiz.
  const causal: ResolvedObjective[] = [
    {
      knowledge: { ...KNOWLEDGE, id: "k2", type: "causal" },
      objective: { ...FORWARD!, rowId: "row-causal" },
    },
  ];
  assert.equal(supportedObjectives(causal).length, 0);
  assert.equal(decideNext({ evidence: [], now: NOW, objectives: supportedObjectives(causal) }), null);
});

test("an association with a recall objective is acted on", () => {
  assert.equal(supportedObjectives(RESOLVED).length, 2);
});

// ── the runtime actually asks ───────────────────────────────────────────────
//
// 🔴 EVERY TEST ABOVE COULD BE GREEN WHILE PRODUCTION IGNORED ALL OF IT. A strict ownership rule
// that nothing calls changes nothing; the previous version of this pivot shipped a guard that
// checked only the first occurrence of a stage component and stayed green through a duplicate
// rendered outside the branch. So the wiring is asserted, not assumed.

test("🔴 the runtime refuses BEFORE it goes ready, on having something supported to ask", () => {
  // 🔴 THIS TEST CHANGED AT STEP 7b, AND THE CHANGE IS THE MIGRATION — read this before restoring
  // the old assertion. It used to require `if (!resolved.ownership.owns && !forced)` to run before
  // the runtime went active: whole-page ownership, in which one unsupported paragraph refused the
  // entire canvas. §12 measured the result as owning 0 of 6 production canvases, and §14.1 says the
  // answer to that is composition, NEVER a lower coverage bar.
  //
  // So ownership stopped gating presentation. What survives is the refusal still true on any canvas,
  // owned or not: nothing supported means nothing to ask, and hosting an empty task shell over a
  // document is the defect this guards.
  const source = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const refusal = source.indexOf("if (supported.length === 0)");
  const ready = source.indexOf('setStatus("ready")');
  assert.notEqual(refusal, -1, "the runtime must refuse when nothing is supported");
  assert.notEqual(ready, -1);
  assert.ok(refusal < ready, "the refusal must be checked before the runtime offers a task");

  // 🔴 OWNERSHIP IS STILL COMPUTED AND STILL CARRIED OUT. Removing the gate must not remove the
  // fact: it is what `forced` discloses against, and losing it would make a bypassed session
  // indistinguishable from an ordinary one — precisely what `?policy=1` cost.
  assert.match(source, /ownership: knowledge\.ownership/, "ownership is no longer reported at all");
});

test("🔴 a bypassed session declares itself all the way to the screen", () => {
  // The one property that makes an override safe to have. `?policy=1` was untrustworthy because a
  // forced session looked exactly like an owned one; anything showing this runtime must be able to
  // tell them apart, and must actually do it.
  const runtime = readFileSync(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    runtime.includes("forced: forced && !knowledge.ownership.owns"),
    "the runtime must disclose running without ownership, and only then",
  );

  const view = readFileSync(
    new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(view.includes("runtime.forced &&"), "the surface must show it");
});

test("🔴 no permissive ownership predicate has grown back beside the filter", () => {
  // `canUsePolicyRuntime` was `objectives.some(supported)` — one association handed the runtime a
  // whole canvas, and a lecture containing a single glossary table satisfied it exactly as well as
  // a glossary did. Ownership belongs in knowledge-coverage.ts, decided from what the SOURCE holds.
  // This is here because deleting a function does not stop the next edit reintroducing it.
  const source = readFileSync(new URL("./policy-runtime.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(/\.some\s*\(/.test(code), false, "policy-runtime must not decide ownership with .some()");
  assert.equal(code.includes("canUsePolicyRuntime"), false);
});
