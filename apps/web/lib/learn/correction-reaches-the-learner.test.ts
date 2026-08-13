import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import { decideNext } from "./policy-runtime";

// DOES A LEARNER WHO GETS SOMETHING WRONG EVER SEE THE ANSWER?
//
// 🔴🔴 THEY DID NOT. Measured end to end against the real `decideNext` before anything was changed:
// twelve steps, two objectives, one wrong answer — **the correction never painted, ever.** Confirmed
// identical on `79bf80ad`, so it predates the auto-advance work rather than arriving with it.
//
// Two independent breaks, and FIXING EITHER ONE ALONE LEAVES THE LEARNER WITH NOTHING:
//
//   1. `acknowledge` recorded the correction as shown when the VERDICT was acknowledged, because it
//      asked `decision.action.type` — the QUEUED action — what was on screen. After a miss the
//      queued action is already `show_correction` while the verdict is still painted.
//   2. `actedOn` then moved the just-failed objective to the back, and any never-asked objective
//      won the `status !== "correct"` tier ahead of its correction. By the time it came round, other
//      material had intervened, the working-memory window had cleared, and it was owed a `retrieve`
//      — so the learner was asked again about the thing they were never told.
//
// 🔴 THIS FILE ASSERTS THE LEARNER-VISIBLE PROPERTY, NOT EITHER MECHANISM. "Was the answer put in
// front of them before they were asked anything else?" survives both fixes being refactored, and
// goes red if either is undone. A test on `correctionsShown`, or on the ordering, would have passed
// throughout the entire period the product had no corrections.

const KNOWLEDGE: KnowledgeObject = {
  id: "k1",
  identityKey: "association:v2:8589ff53b101b420",
  pair: { id: "t1:r1", left: "losartan", leftRole: "generic", right: "Cozaar", rightRole: "brand" },
  relationKind: "brand|generic",
  statement: "losartan — Cozaar",
  type: "association",
  unanchoredProvenance: [],
};
const [X, Y] = objectivesForKnowledge(KNOWLEDGE);
const OBJECTIVES: ResolvedObjective[] = [
  { knowledge: KNOWLEDGE, objective: { ...X!, rowId: "row-x" } },
  { knowledge: KNOWLEDGE, objective: { ...Y!, rowId: "row-y" } },
];

/**
 * One canvas session, driven through the REAL policy.
 *
 * 🔴 THE STATE IS THE HOOK'S STATE AND THE TRANSITIONS ARE THE HOOK'S TRANSITIONS. Nothing here
 * decides what to show — every screen comes from `decideNext`. What this replaces is React, not the
 * policy: a live session needs auth that `/dev-preview` cannot mint, so the alternative to this is
 * no measurement at all rather than a better one. Stated as a limit, not glossed.
 */
class Session {
  evidence: LearnerEvidence[] = [];
  actedOn: string[] = [];
  correctionsShown = new Set<string>();
  feedback: string | null = null;
  clock = new Date("2026-08-13T12:00:00Z");
  /** Every screen the learner was actually shown, in order. */
  readonly seen: { screen: string; objective: string }[] = [];

  private decide() {
    return decideNext({
      actedOn: this.actedOn,
      correctionsShown: this.correctionsShown,
      evidence: this.evidence,
      now: this.clock,
      objectives: OBJECTIVES,
    });
  }

  /** What is painted. Feedback outranks the decision — `PolicyScreen`'s own rule. */
  screen(): { screen: string; objective: string } {
    const decision = this.decide();
    if (this.feedback) return { objective: this.feedback, screen: "verdict" };
    if (!decision) return { objective: "-", screen: "nothing" };
    return { objective: decision.objective.identityKey, screen: decision.action.type };
  }

  private record() {
    this.seen.push(this.screen());
  }

  /** submit(): judge → feedback → write → re-read. `acknowledge` refuses while `recording` is true,
   *  so by the time it can run the evidence has landed — which is the state modelled here. */
  answerWrongly(objectiveKey: string) {
    this.clock = new Date(this.clock.getTime() + 5_000);
    this.evidence = [
      ...this.evidence,
      {
        demonstrationObtained: true,
        id: `e${this.evidence.length}`,
        objectiveIdentityKey: objectiveKey,
        occurredAt: this.clock.toISOString(),
        verdict: "incorrect",
      },
    ];
    this.feedback = objectiveKey;
    this.record();
  }

  /** acknowledge(), in the source's own order, with the gate reading WHAT IS PAINTED. */
  acknowledge() {
    const decision = this.decide();
    const seen = decision?.objective.identityKey;
    const presenting = this.feedback ? "verdict" : decision?.action.type;
    this.feedback = null;
    if (seen) this.actedOn = [...this.actedOn, seen];
    if (seen && presenting === "show_correction") {
      this.correctionsShown = new Set(this.correctionsShown).add(seen);
    }
    this.clock = new Date(this.clock.getTime() + 100);
    this.record();
  }
}

test("🔴🔴 a learner who answers wrongly is SHOWN THE ANSWER before being asked anything else", () => {
  const session = new Session();
  assert.equal(session.screen().screen, "retrieve");
  const asked = session.screen().objective;

  session.answerWrongly(asked);
  assert.equal(session.screen().screen, "verdict", "the verdict comes first");

  session.acknowledge();

  const now = session.screen();
  assert.equal(
    now.screen,
    "show_correction",
    `after a wrong answer the learner was shown "${now.screen}" instead of the answer they got wrong`,
  );
  assert.equal(now.objective, asked, "and it must be the answer to the question they just missed");
});

test("🔴 EVERY objective the learner fails gets its answer shown, not just the first one", () => {
  // The original failure was not "the correction came late" — it never came at all, for anything.
  // A one-step assertion could be satisfied by a fix that only reorders the first pair, so this
  // walks a whole session and requires each objective's FIRST failure to be answered.
  const session = new Session();
  const answered = new Set<string>();
  const corrected = new Set<string>();
  for (let step = 0; step < 12; step += 1) {
    const { objective, screen } = session.screen();
    if (screen === "show_correction") corrected.add(objective);
    if (screen === "retrieve" && !answered.has(objective)) {
      answered.add(objective);
      session.answerWrongly(objective);
      session.acknowledge(); // clears the verdict
      assert.equal(
        session.screen().screen,
        "show_correction",
        `step ${step}: ${objective.slice(-8)} was failed and the learner was not shown the answer`,
      );
      assert.equal(session.screen().objective, objective);
      corrected.add(objective);
    }
    session.acknowledge();
  }
  assert.deepEqual([...corrected].sort(), [...answered].sort(), "every failed objective was answered");
  assert.equal(answered.size, 2, "both objectives were exercised");
});

test("REPORTED, NOT ASSERTED — a SECOND failure in the same session is not answered again", () => {
  // 🔴 FOUND BY THE TEST ABOVE OVER-CLAIMING, AND LEFT AS AN OBSERVATION RATHER THAN A FIX.
  // `correctionsShown` is session-wide, so once an objective's answer has been shown the policy will
  // not show it again however many times the learner fails it afterwards — they are re-asked instead.
  //
  // Whether that is right is a POLICY question, not a wiring one: §39 says the answer is exposed and
  // the objective returns later, and it does not say what happens when the learner misses it twice.
  // Re-showing the same one-line answer may teach nothing; never re-showing it may leave someone
  // stuck. That is Brain's to rule, and inventing an answer here would be a curriculum decision
  // smuggled into a bug fix. Pinned so the current behaviour is a recorded choice, not an accident.
  const session = new Session();
  const asked = session.screen().objective;
  session.answerWrongly(asked);
  session.acknowledge();
  assert.equal(session.screen().screen, "show_correction", "first failure: answered");
  session.acknowledge();
  // Work the other objective so the working-memory window clears, then fail the first one again.
  const other = session.screen().objective;
  session.answerWrongly(other);
  session.acknowledge();
  session.acknowledge();
  const back = session.screen();
  if (back.objective === asked && back.screen === "retrieve") {
    session.answerWrongly(asked);
    session.acknowledge();
    assert.notEqual(
      session.screen().screen,
      "show_correction",
      "if this ever starts passing, the session-wide correction record has changed meaning",
    );
  }
});

test("🔴 and the answer is shown ONCE, not on a loop", () => {
  // The mechanism that stops the loop is `correctionsShown`, and it only works if the gate now
  // records at the moment the correction is actually painted. If the fix had simply removed the
  // gate, this would be the failure: "Got it" re-rendering the identical card for ever, which is
  // the defect `actedOn` was originally invented for.
  const session = new Session();
  const asked = session.screen().objective;
  session.answerWrongly(asked);
  session.acknowledge();
  assert.equal(session.screen().screen, "show_correction");
  session.acknowledge();
  assert.notEqual(
    session.screen().screen,
    "show_correction",
    "the same correction was served twice in a row",
  );
});

// ── each fix is necessary, and neither is sufficient ────────────────────────

test("🔴 a CONTRAST outranks a fresh question too, not only a correction", () => {
  // 🔴 FOUND BY CALIBRATION: dropping `contrast` from the precedence rule changed behaviour and
  // nothing went red. A misconception's explanation is an exposition Nemesis has already decided to
  // put in front of the learner — §39's one unconditional **Yes** — and it loses to an unasked
  // objective by exactly the same route a correction did.
  const wrongAt = new Date("2026-08-13T11:59:00Z");
  const evidence: LearnerEvidence[] = [
    {
      demonstrationObtained: true,
      id: "e0",
      misconceptions: ["valsartan"],
      objectiveIdentityKey: X!.identityKey,
      occurredAt: wrongAt.toISOString(),
      verdict: "misconception",
    },
  ];
  const decision = decideNext({
    // The learner has just acted on X, so `actedOn` puts it behind the never-asked Y.
    actedOn: [X!.identityKey],
    correctionsShown: new Set(),
    evidence,
    now: new Date("2026-08-13T12:00:00Z"),
    objectives: OBJECTIVES,
  });
  assert.equal(decision?.action.type, "contrast");
  assert.equal(
    decision?.objective.identityKey,
    X!.identityKey,
    "the explanation replacing a wrong model must not wait behind a question never asked",
  );
});

test("🔴 the ORDERING fix alone would not have restored it", () => {
  // With the gate still reading the queued action, acknowledging the verdict marks the correction
  // shown before it has been painted — and no amount of precedence can surface something the
  // policy has been told is already done. Modelled by running the OLD gate against the CURRENT
  // policy: if this ever stops failing, the gate is no longer load-bearing and this test is stale.
  const session = new Session();
  const asked = session.screen().objective;
  session.answerWrongly(asked);
  // the old gate: read the QUEUED action rather than what is painted
  const queued = decideNext({
    actedOn: session.actedOn,
    correctionsShown: session.correctionsShown,
    evidence: session.evidence,
    now: session.clock,
    objectives: OBJECTIVES,
  });
  assert.equal(
    queued?.action.type,
    "show_correction",
    "the queued action while the verdict is painted — this is what the old gate read",
  );
  session.correctionsShown = new Set([asked]); // what the old gate would have written
  session.feedback = null;
  session.actedOn = [asked];
  assert.notEqual(
    session.screen().screen,
    "show_correction",
    "with the old gate's write in place the correction is suppressed — the ordering fix cannot save it",
  );
});

test("🔴 the GATE fix alone would not have restored it either", () => {
  // Proved by removing the precedence rule's effect: with the just-failed objective moved to the
  // back by `actedOn`, a never-asked objective wins the tier below. `decideNext` is asked directly
  // with only the failed objective's peer available to compete.
  const session = new Session();
  const asked = session.screen().objective;
  session.answerWrongly(asked);
  session.feedback = null;
  session.actedOn = [asked];
  const chosen = decideNext({
    actedOn: session.actedOn,
    correctionsShown: new Set(),
    evidence: session.evidence,
    now: session.clock,
    objectives: OBJECTIVES,
  });
  assert.equal(chosen?.action.type, "show_correction");
  assert.equal(
    chosen?.objective.identityKey,
    asked,
    "the correction owed to the objective just failed must outrank a question never asked",
  );
});

// ── the gate reads what is painted, and R3 ─────────────────────────────────

test("🔴 the correction gate reads what is PAINTED, not what is queued", async () => {
  // 🔴 A STRUCTURAL ASSERTION BECAUSE THE SESSION ABOVE MODELS REACT, NOT BECAUSE IT IS ENOUGH ON
  // ITS OWN. The session proves the policy behaves; this proves the runtime asks the right question.
  // Together they cover the seam. The old expression is named so its return is a compile-visible
  // event rather than a silent regression.
  const source = await readFile(
    new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url),
    "utf8",
  );
  // 🔴 COMMENTS STRIPPED FIRST. The explanation above this gate necessarily QUOTES the expression it
  // replaced, and an earlier version of this guard went red on the corrected code because of its own
  // documentation. A guard that cannot tell a fix from a description of the fix gets "fixed" by
  // deleting the description — which is exactly the record the next reader needs.
  const acknowledge = source
    .slice(
      source.indexOf("const acknowledge = useCallback"),
      source.indexOf("const thinking = useDelayedFlag"),
    )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.match(
    acknowledge,
    /if \(seen && presenting\.kind === "show_correction"\)/,
    "the gate must read what is painted",
  );
  assert.equal(
    /decision\?\.action\.type === "show_correction"/.test(acknowledge),
    false,
    "the gate is back on the QUEUED action — after a miss that is show_correction while the verdict is painted",
  );
  // And there is exactly ONE definition of what is painted, so the two consumers cannot disagree.
  assert.equal(
    (source.match(/feedback\s*\?\s*\{ exposition: feedback\.exposition, kind: "verdict" \}/g) ?? []).length,
    1,
    "the precedence must be written once and consumed, never re-derived",
  );
});

test("🔴 R3 — a correction being shown is never evidence the learner understood", () => {
  // Contract R3: exposure is not demonstration. `correctionsShown` is session state about what
  // NEMESIS PUT ON SCREEN, and nothing may read it as a claim about the learner. Asserted on the
  // behaviour rather than on a comment: the projected learner state must be byte-identical whether
  // or not the correction was shown.
  const evidence: LearnerEvidence[] = [
    {
      demonstrationObtained: true,
      id: "e0",
      objectiveIdentityKey: X!.identityKey,
      occurredAt: new Date("2026-08-13T11:59:00Z").toISOString(),
      verdict: "incorrect",
    },
  ];
  const common = { actedOn: [X!.identityKey], evidence, now: new Date("2026-08-13T12:00:00Z"), objectives: OBJECTIVES };
  const untold = decideNext({ ...common, correctionsShown: new Set() });
  const told = decideNext({ ...common, correctionsShown: new Set([X!.identityKey]) });
  assert.ok(untold && told);
  const mine = (decision: NonNullable<typeof untold>) =>
    decision.objective.identityKey === X!.identityKey ? decision.state : null;
  // Whichever of the two the policy chose, any state it reports for X must be unchanged by exposure.
  for (const decision of [untold, told]) {
    const state = mine(decision);
    if (!state) continue;
    assert.equal(state.status, "incorrect", "seeing the answer must not improve the learner's state");
    assert.equal(state.demonstratedAt, null, "seeing the answer must not record a demonstration");
    assert.equal(state.evidenceCount, 1, "seeing the answer must not add a row");
  }
});
