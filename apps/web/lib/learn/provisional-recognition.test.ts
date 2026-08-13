// §31.2 — the sweep's ✓ and ✕ are not symmetric.
//
//     sweep ✕  →  act immediately            start teaching
//     sweep ✓  →  PROVISIONAL                triggers a production probe before it counts
//
// 🔴 WHY, IN THE OWNER'S TERMS: a false ✕ costs re-teaching something known — annoying, and
// self-correcting. A false ✓ costs skipping something unknown — invisible, and compounding under
// §22 scheduling and §25 evidence reuse. The asymmetry also makes the probes cheap, because
// production is spent ONLY on what looked strong.
//
// 🔴 AND IT IS NOT A SECOND MECHANISM. There is no `provisional` flag anywhere: §33's rung already
// records that the learner discriminated rather than produced, so "has this been shown at
// production level?" is answerable from the log. A flag would be session state that a reload loses,
// and §22 would inherit the inflated confidence anyway.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { KnowledgeObject } from "./knowledge-types";
import { projectLearnerState, type LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import type { CanvasState } from "./canvas-model";
import { canTransition } from "./canvas-state";
import { RETRIEVAL_ELIGIBLE_AFTER_MS } from "./retrieval-eligibility";
import type { ScaffoldRung } from "./scaffold-rung";
import { ACT_AGAIN_AFTER_MS, chooseNextTeachingAction } from "./teaching-policy";

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "hypertension", leftRole: "condition", right: "ACE inhibitor", rightRole: "first line" },
  relationKind: "condition|first line",
  statement: "hypertension — ACE inhibitor",
  type: "association",
  unanchoredProvenance: ["model"],
};
const [OBJECTIVE] = objectivesForKnowledge(KNOWLEDGE);

const NOW = new Date("2026-08-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
/** Long enough that the churn guard has released, so a probe is not merely being deferred. */
const SETTLED_MS = ACT_AGAIN_AFTER_MS * 2;

function answered(over: Partial<LearnerEvidence> & { id: string }): LearnerEvidence {
  return {
    canvasId: null,
    demonstrationObtained: true,
    evaluatorVersion: "eval/1",
    misconceptions: [],
    objectiveIdentityKey: OBJECTIVE!.identityKey,
    occurredAt: ago(SETTLED_MS),
    verdict: "understood",
    ...over,
  };
}

/** Every state a stored canvas could arrive in, including ones only the retired machine wrote. */
const ALL_STATES: readonly CanvasState[] = [
  "empty",
  "sources_attached",
  "orient",
  "learn",
  "recall",
  "test",
  "diagnose",
  "targeted_relearn",
  "retest",
  "complete",
];


function decide(evidence: readonly LearnerEvidence[], now = NOW) {
  return chooseNextTeachingAction({
    knowledgeObject: KNOWLEDGE,
    learnerState: projectLearnerState(OBJECTIVE!.identityKey, evidence),
    now,
    objective: OBJECTIVE!,
    recentEvidence: evidence,
  });
}

// ── the ✓ half: provisional until produced ──────────────────────────────────

test("🔴 A RECOGNISED ✓ OWES A PRODUCTION PROBE — it does not count as knowing", () => {
  // The owner's case verbatim: "You recognized the first-line hypertension material." Do NOT
  // conclude they know HTN. This is the line between `recognition ✓ / retrieval ✕` being a real
  // learner-state distinction and being a footnote nothing acts on.
  const action = decide([answered({ id: "e1", scaffoldRung: "recognition" })]);
  assert.equal(action.type, "retrieve", "a recognition tap must be confirmed by production");
});

test("🔴 the probe is owed even though the answer was CORRECT and RECENT", () => {
  // Calibrates the guard above against the behaviour it replaces. Before this, a correct answer
  // inside the eligibility window produced `advance` — the objective was considered settled and the
  // learner moved past it. That is precisely the invisible, compounding false ✓.
  const justNow = decide([answered({ id: "e1", occurredAt: ago(RETRIEVAL_ELIGIBLE_AFTER_MS / 4), scaffoldRung: "recognition" })]);
  assert.notEqual(justNow.type, "advance", "a provisional ✓ must never read as settled");
});

test("🔴 but not while the answer is still on screen — invariant 3", () => {
  // "Do not immediately ask a question whose answer is still visible." The probe is owed; it is not
  // owed this second. Deferring is the honest shape: it keeps the objective in play rather than
  // marking it done.
  const action = decide([answered({ id: "e1", occurredAt: ago(1_000), scaffoldRung: "recognition" })]);
  assert.equal(action.type, "defer");
});

test("cued and narrowed are also below production, so they are provisional too", () => {
  // The rule is the ladder, not a special case for multiple choice. A fill-in-the-blank is not an
  // independent retrieval either.
  for (const rung of ["cued", "narrowed", "taught"] as ScaffoldRung[]) {
    assert.equal(decide([answered({ id: "e1", scaffoldRung: rung })]).type, "retrieve", rung);
  }
});

test("🔴 an INDEPENDENT ✓ is not probed — the asymmetry must not become 'always ask again'", () => {
  // If production were probed too, the rule would be indistinguishable from ignoring the rung, and
  // the learner would be re-asked everything for ever. A produced answer inside the spacing window
  // advances, exactly as before.
  const action = decide([answered({ id: "e1", occurredAt: ago(RETRIEVAL_ELIGIBLE_AFTER_MS / 4), scaffoldRung: "independent" })]);
  assert.equal(action.type, "advance");
});

test("an independent ✓ still returns on the spacing schedule — §18, not permanently finished", () => {
  const action = decide([answered({ id: "e1", occurredAt: ago(RETRIEVAL_ELIGIBLE_AFTER_MS * 2), scaffoldRung: "independent" })]);
  assert.equal(action.type, "retrieve", "correct is a change of priority, never a permanent filter");
});

test("🔴 once produced, the recognition no longer owes anything", () => {
  // The probe has to be able to END, or it is a loop rather than a confirmation. `demonstratedAt`
  // keeps the HIGHEST rung ever reached, so the later production settles it.
  const action = decide([
    answered({ id: "e1", occurredAt: ago(SETTLED_MS * 2), scaffoldRung: "recognition" }),
    answered({ id: "e2", occurredAt: ago(RETRIEVAL_ELIGIBLE_AFTER_MS / 4), scaffoldRung: "independent" }),
  ]);
  assert.equal(action.type, "advance");
});

test("🔴 a demonstration with NO recorded rung keeps today's behaviour", () => {
  // 🔴 DELIBERATELY DIFFERENT FROM `satisfies`, WHICH REFUSES A RUNGLESS ROW. What may be CLAIMED
  // must under-claim; what to DO is a different question, and the fact on the ground settles it —
  // this runtime has only ever staged unaided retrieval, so every pre-§33 row IS an independent
  // production that predates the label. Probing them would re-ask hundreds of genuinely
  // demonstrated objectives to relabel history.
  const action = decide([answered({ id: "e1", occurredAt: ago(RETRIEVAL_ELIGIBLE_AFTER_MS / 4) })]);
  assert.equal(action.type, "advance");
});

// ── the ✕ half: act immediately ─────────────────────────────────────────────

test("🔴 a ✕ acts IMMEDIATELY — it does not wait for a spacing window", () => {
  // The other half of the asymmetry, and the reason the two are tested together: if a wrong answer
  // also waited, the policy would be symmetric and §31.2 would be unimplemented however well the ✓
  // half worked.
  const wrong = decide([
    answered({ demonstrationObtained: true, id: "e1", occurredAt: ago(SETTLED_MS), verdict: "incorrect" }),
  ]);
  assert.ok(["retrieve", "show_correction"].includes(wrong.type), `acted on, not deferred: ${wrong.type}`);
});

test("🔴 a recognition ✕ is not treated as a provisional anything — it is simply wrong", () => {
  // A failed recognition is the strongest negative evidence there is: they could not even pick it
  // out. Nothing about the rung should soften that into "we are not sure yet".
  const action = decide([
    answered({ id: "e1", occurredAt: ago(SETTLED_MS), scaffoldRung: "recognition", verdict: "incorrect" }),
  ]);
  assert.ok(["retrieve", "show_correction"].includes(action.type));
});

// ── §31.3 — there is no diagnose PHASE ──────────────────────────────────────
//
// 🔴 "The diagnostic never really ends. Every subsequent interaction continues updating the
// estimate." If diagnosis were a state it would acquire an entrance and an exit, and the code would
// treat post-exit interactions as a different kind of thing. What varies across a session is how
// much uncertainty remains — not which mode is active.
//
// 🔴 THE VALUE STILL EXISTS IN `CanvasState`, AND THAT IS WHY THIS GUARD EXISTS RATHER THAN A
// DELETION. Removing it from the union touches `FORWARD`, `EVIDENCE_STAGES` and the legacy
// six-stage machine that is kept deliberately as the record of how that runtime worked. The
// property §31.3 actually asks for is that nothing can ENTER such a phase, and that is provable
// here without a refactor whose risk is out of proportion to a rename. Filed as a follow-up.

test("🔴 §31.3 — no state can transition into `diagnose`, from anywhere", () => {
  const reachable = new Set<CanvasState>(["empty"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const from of [...reachable]) {
      for (const to of ALL_STATES) {
        if (!reachable.has(to) && canTransition(from, to)) {
          reachable.add(to);
          grew = true;
        }
      }
    }
  }
  assert.equal(reachable.has("diagnose"), false, "a diagnose phase must not be enterable");

  // 🔴 ASSERTED OVER EVERY `from`, NOT ONLY THE REACHABLE ONES. A canvas can be loaded from storage
  // in any state the column happens to hold, including one written by the retired machine, so
  // "unreachable from empty" is not on its own the property that matters.
  for (const from of ALL_STATES) {
    assert.equal(canTransition(from, "diagnose"), false, `${from} → diagnose must be refused`);
  }
});

test("🔴 STRONGER NOW: the direct-assignment path does not exist at all", () => {
  // 🔴 THE OLD ASSERTION WAS WEAKER AND IS RECORDED. It read: *"the UI is never offered the move
  // either"*, and checked that `nextAction` never returned `{ to: "diagnose" }` — because
  // `finishTest` set `state: "diagnose"` by DIRECT ASSIGNMENT, bypassing `canTransition`, so the
  // guard above was not sufficient on its own.
  //
  // `finishTest` is now deleted (owner, §38 — the control that called it was "See where I stand",
  // and the only button is Continue). So the bypass has no caller AND no body: the property is
  // guaranteed by absence rather than by a predicate returning null, which is the strongest form
  // available. Asserted on the source, because "the function is gone" is what changed.
  const session = readFileSync(
    join(import.meta.dirname, "..", "..", "components", "workspace", "learn", "use-canvas-session.ts"),
    "utf8",
  );
  assert.ok(!/const finishTest = useCallback/.test(session), "finishTest must stay deleted");
  assert.ok(!/state: "diagnose"/.test(session), "and nothing may assign the retired stage directly");
});

// ── nothing about this reaches the learner ──────────────────────────────────

test("🔴 no mode name, phase name or counter appears in anything the learner is shown", () => {
  // §30: avoid `INITIAL ASSESSMENT`, `Question 3 of 10`, `Progress: 30%`. The policy's `because` is
  // the closest thing to prose it produces, and it must read as a reason rather than as a mode.
  const reasons = [
    decide([answered({ id: "e1", scaffoldRung: "recognition" })]),
    decide([answered({ id: "e1", occurredAt: ago(1_000), scaffoldRung: "recognition" })]),
  ].map((a) => a.because);

  for (const because of reasons) {
    assert.doesNotMatch(because, /provisional|diagnostic|assessment|probe|rung|scaffold|mode|phase/i, because);
  }
});
