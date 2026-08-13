import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext } from "./policy-runtime";
import { RETRIEVAL_ELIGIBLE_AFTER_MS } from "./retrieval-eligibility";
import { ACT_AGAIN_AFTER_MS } from "./teaching-policy";
import { answerStillHeld, interveningActs, INTERVENING_ACTS_REQUIRED } from "./working-memory";

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [FAILED, PASSED] = objectivesForKnowledge(KNOWLEDGE);
const RESOLVED: ResolvedObjective[] = [
  { knowledge: KNOWLEDGE, objective: { ...FAILED!, rowId: "row-failed" } },
  { knowledge: KNOWLEDGE, objective: { ...PASSED!, rowId: "row-passed" } },
];
const NOW = new Date("2026-08-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;

function ev(key: string, at: string, verdict: LearnerEvidence["verdict"]): LearnerEvidence {
  return { demonstrationObtained: verdict !== null, id: `${key}:${at}`, objectiveIdentityKey: key, occurredAt: at, verdict };
}

/** One objective failed and corrected, one demonstrated, both the same age. What is offered? */
function offeredAfter(minutes: number, actedOn: readonly string[]) {
  const at = ago(minutes * MIN);
  const decision = decideNext({
    actedOn,
    correctionsShown: new Set([FAILED!.identityKey]),
    evidence: [ev(FAILED!.identityKey, at, "incorrect"), ev(PASSED!.identityKey, at, "understood")],
    now: NOW,
    objectives: RESOLVED,
  });
  return {
    action: decision?.action.type ?? null,
    which: decision === null ? null : decision.objective.identityKey === FAILED!.identityKey ? "failed" : "passed",
  };
}

// ── 🔴 THE DEFECT, MEASURED ACROSS THE DECISION ─────────────────────────────

test("🔴🔴 a FAILED objective comes back sooner than a PASSED one", async () => {
  // 🔴 THIS IS §39 CONSEQUENCE 1, AND IT WAS INVERTED IN PRODUCTION. Before this change:
  //
  //     answered CORRECTLY  ->  askable again after 10 minutes  (the owner's ruled tempo)
  //     answered WRONGLY    ->  correction shown, then `defer` for the rest of SIXTY minutes
  //
  // and `decideNext` filters `defer` out of `owed`, so from ten minutes to sixty the canvas
  // offered the objective the learner had already demonstrated and withheld the one they had just
  // failed. Getting something wrong made Nemesis LESS likely to ask about it.
  //
  // 🔴 A SWEEP OF THE DECISION, NOT A READ OF THE CONSTANT — the standard `retrieval-eligibility.ts`
  // sets for itself, and the reason is that the constant was never the whole story: the branch
  // conjoined it with another. Only the decision can be wrong, so only the decision is measured.
  //
  // The comparison is like-for-like: same age, same canvas, one failed and one passed.
  const worked = [PASSED!.identityKey, FAILED!.identityKey, PASSED!.identityKey];

  // Well inside the passed objective's own tempo, so it is not yet due — and the failed one is
  // owed the moment other material has come between.
  const early = offeredAfter(1, worked);
  assert.equal(early.which, "failed", "the objective the learner failed must be the one offered");
  assert.equal(early.action, "retrieve", "and it must be ASKED, not shown its answer a second time");

  // 🔴 THE WINDOW WHERE THE INVERSION LIVED. Every minute from the passed objective's tempo up to
  // the old hour used to answer "passed". Not one of them may now.
  for (let minutes = 1; minutes < ACT_AGAIN_AFTER_MS / MIN; minutes += 1) {
    const offered = offeredAfter(minutes, worked);
    assert.equal(
      offered.which,
      "failed",
      `at ${minutes} min the canvas offered the ${offered.which} objective — exposure reduced priority`,
    );
  }
});

test("🔴 and it is still not asked while its answer is being held", () => {
  // The other half, and it must not be traded away for the half above. Immediately after the
  // correction, with NOTHING else worked, re-asking measures whether the learner can still hear
  // their own voice — §39 consequence 2, and §34 invariant 3 as it now reads.
  const held = offeredAfter(0.1, [FAILED!.identityKey]);
  assert.notEqual(
    `${held.which}:${held.action}`,
    "failed:retrieve",
    "the identical question came back with its answer still in working memory",
  );
});

test("🔴 the window can only ever OPEN sooner than the guard it replaced, never later", () => {
  // A disjunction, so it cannot become the "longer of two intervals" that made the owner's own
  // tempo ruling inert. Swept over the whole range rather than argued.
  for (let minutes = 0; minutes <= 120; minutes += 1) {
    const sinceMs = minutes * MIN;
    const oldGuardHeld = sinceMs < ACT_AGAIN_AFTER_MS;
    for (const acts of [0, 1, 5]) {
      const held = answerStillHeld({ decayAfterMs: ACT_AGAIN_AFTER_MS, interveningActs: acts, sinceMs });
      if (!oldGuardHeld) {
        assert.equal(held, false, `at ${minutes} min the new window holds where the old one released`);
      }
    }
  }
});

test("nothing can intervene on a single-objective canvas, so the clock is the only way back", () => {
  // 🔴 STATED RATHER THAN HIDDEN. Displacement needs something to displace with. Where a canvas
  // holds one objective, the decay term — the SAME `ACT_AGAIN_AFTER_MS` that already governed this
  // branch — is what eventually reopens it. "Sooner than a passed objective" has nothing to be
  // sooner than in that case, so no ordering is being violated; the learner simply waits as long
  // as they always did.
  assert.equal(answerStillHeld({ decayAfterMs: ACT_AGAIN_AFTER_MS, interveningActs: 0, sinceMs: 30 * MIN }), true);
  assert.equal(answerStillHeld({ decayAfterMs: ACT_AGAIN_AFTER_MS, interveningActs: 0, sinceMs: 61 * MIN }), false);
});

// ── counting intervening material ───────────────────────────────────────────

test("🔴 counted from the LAST time this objective was acted on", () => {
  // An objective returned to three times has three positions in the log; only the work after the
  // most recent one has displaced anything. Counting from the start would report an objective as
  // long-displaced the moment it came back.
  assert.equal(interveningActs("a", ["a", "b", "c"]), 2);
  assert.equal(interveningActs("a", ["a", "b", "c", "a"]), 0);
  assert.equal(interveningActs("a", ["a", "b", "c", "a", "d"]), 1);
});

test("distinct objectives, which is the conservative direction", () => {
  // Answering the same other fact three times is plausibly three interference episodes; counting it
  // once can only make this wait LONGER before re-asking, which is the safe way to be wrong.
  assert.equal(interveningActs("a", ["a", "b", "b", "b"]), 1);
});

test("an objective never acted on is holding nothing", () => {
  assert.equal(interveningActs("a", []), 0);
  assert.equal(interveningActs("a", ["b", "c"]), 2);
});

test("one intervening objective is the line, and it is the owner's sentence", () => {
  // "comes back within the same sitting, after other material has intervened." One is where the
  // line between "immediately" and "after other material" falls; every larger value is a tuning
  // parameter nobody ruled. Pinned so raising it is a deliberate act with a red test attached.
  assert.equal(INTERVENING_ACTS_REQUIRED, 1);
  assert.equal(answerStillHeld({ decayAfterMs: ACT_AGAIN_AFTER_MS, interveningActs: 1, sinceMs: 0 }), false);
  assert.equal(answerStillHeld({ decayAfterMs: ACT_AGAIN_AFTER_MS, interveningActs: 0, sinceMs: 0 }), true);
});

// ── no second interval, and nothing durable ─────────────────────────────────

test("🔴 no new time constant was minted for this", async () => {
  // `retrieval-eligibility.ts` records what a second interval costs: the learner waits the LONGER
  // of the two, and the owner's ruling becomes inert. The only durations this module may name are
  // ones that already existed, and it must take them as arguments rather than importing a clock.
  const source = await readFile(new URL("./working-memory.ts", import.meta.url), "utf8");
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.equal(/_MS\s*=/.test(code), false, "working memory must not define its own interval");
  assert.equal(/\d{3,}/.test(code), false, "a bare millisecond literal is a second tempo in disguise");
  assert.equal(code.includes("Date"), false, "the window is measured against a caller's clock, never its own");
});

test("🔴 the ordered log is session-local and never persisted", async () => {
  // It is a record of what a learner worked and in what order. Written to a row it would be learner
  // state living outside the evidence log, claiming something no judge ever said — the exact
  // absence-as-evidence defect the whole model refuses.
  const source = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  const declaration = source.slice(
    source.indexOf("const [actedOn, setActedOn]"),
    source.indexOf("const [correctionsShown"),
  );
  assert.ok(declaration.includes("useState"), "it is React state, not a store");
  // 🔴 THE WHOLE CALLBACK, NOT A WINDOW AROUND ONE SPELLING. An earlier version of this sliced 200
  // characters from the literal `if (seen) setActedOn` — and calibration proved it blind: writing
  // `if (seen) { localStorage.setItem(...); setActedOn(...) }` moves the anchor, `indexOf` returns
  // -1, and the guard silently inspects the wrong region and passes. Anchoring a guard to an exact
  // spelling is how a reformatted defect walks past it.
  const acknowledge = source.slice(
    source.indexOf("const acknowledge = useCallback"),
    source.indexOf("const thinking = useDelayedFlag"),
  );
  assert.ok(acknowledge.includes("setActedOn"), "the acted-on log is written from acknowledge");
  for (const forbidden of ["recordEvidence", "supabase", "localStorage", "sessionStorage", "saveCanvas", "recordEvent", "fetch("]) {
    assert.equal(acknowledge.includes(forbidden), false, `acting on an objective must not ${forbidden}`);
  }
});

test("🔴 the failed objective is retrieved, and the exposure wrote no evidence to make it so", () => {
  // §39 consequence 1's first half: seeing the answer is not evidence. The re-retrieval above is
  // driven entirely by session state — the evidence handed in is identical before and after, and
  // the projected state is still `incorrect`.
  const at = ago(MIN);
  const evidence = [ev(FAILED!.identityKey, at, "incorrect"), ev(PASSED!.identityKey, at, "understood")];
  const before = decideNext({ actedOn: [], correctionsShown: new Set(), evidence, now: NOW, objectives: RESOLVED });
  const after = decideNext({
    actedOn: [FAILED!.identityKey, PASSED!.identityKey],
    correctionsShown: new Set([FAILED!.identityKey]),
    evidence,
    now: NOW,
    objectives: RESOLVED,
  });
  assert.equal(before?.action.type, "show_correction");
  assert.equal(after?.action.type, "retrieve");
  assert.equal(after?.state.status, "incorrect", "the exposure must not have improved the learner's state");
  assert.equal(after?.state.evidenceCount, before?.state.evidenceCount, "no row was written by showing it");
});

test("the passed objective still waits out the owner's ruled tempo", () => {
  // Nothing here touches the `correct` branch. Ten minutes is the owner's number and stays.
  const fresh = decideNext({
    actedOn: [],
    correctionsShown: new Set(),
    evidence: [
      ev(FAILED!.identityKey, ago(RETRIEVAL_ELIGIBLE_AFTER_MS / 2), "understood"),
      ev(PASSED!.identityKey, ago(RETRIEVAL_ELIGIBLE_AFTER_MS / 2), "understood"),
    ],
    now: NOW,
    objectives: RESOLVED,
  });
  assert.equal(fresh, null, "both demonstrated and neither due — nothing is owed");
});
