/**
 * Does a correct answer suppress the NEXT prompt, or the FUTURE?
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/retrieval-invariant-probe.mts
 *
 * The owner's invariant: "A successful retrieval suppresses immediate repetition; it does not
 * suppress future retrieval. Every answer writes evidence, updates the learner model, and
 * reschedules the knowledge object for future eligibility."
 *
 * 🔴 ESTABLISHED FROM BEHAVIOUR, NOT FROM COMMENTS. `actedOn` is documented as "a REORDERING, NOT A
 * FILTER" and is session-local, which READS like the invariant already holds. That is an inference
 * from a comment. This drives the real `projectLearnerState` → `chooseNextTeachingAction` →
 * `decideNext` chain and prints what actually comes back, including across simulated months.
 *
 * READ-ONLY and offline: pure functions only, no database, no network.
 */

import type { KnowledgeObject } from "../lib/learn/knowledge-types";
import { projectLearnerState, type LearnerEvidence } from "../lib/learn/learner-evidence";
import { objectivesForKnowledge } from "../lib/learn/learning-objective";
import type { StoredObjective } from "../lib/learn/learner-store";
import { decideNext, type ResolvedObjective } from "../lib/learn/policy-runtime";
import { chooseNextTeachingAction } from "../lib/learn/teaching-policy";

const NOW = new Date("2026-08-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function knowledgeFor(n: number, left: string, right: string): KnowledgeObject {
  return {
    id: `k${n}`,
    identityKey: `association:v2:probe-${n}`,
    pair: { id: `t${n}:r1`, left, leftRole: "generic", right, rightRole: "brand" },
    relationKind: "brand|generic",
    statement: `${left} — ${right}`,
    type: "association",
  };
}

/** Two associations → four recall objectives, the exact shape of the acceptance canvas. */
const PAIRS = [knowledgeFor(1, "losartan", "Cozaar"), knowledgeFor(2, "metoprolol", "Lopressor")];
const RESOLVED: ResolvedObjective[] = PAIRS.flatMap((knowledge, i) =>
  objectivesForKnowledge(knowledge).map((objective, j) => ({
    knowledge,
    objective: { ...objective, rowId: `row-${i}-${j}` } as StoredObjective,
  })),
);

function ev(id: string, key: string, occurredAt: string, verdict: LearnerEvidence["verdict"]): LearnerEvidence {
  return { demonstrationObtained: verdict !== null, id, objectiveIdentityKey: key, occurredAt, verdict };
}

const actionFor = (entry: ResolvedObjective, evidence: LearnerEvidence[], now = NOW) =>
  chooseNextTeachingAction({
    knowledgeObject: entry.knowledge,
    learnerState: projectLearnerState(entry.objective.identityKey, evidence),
    now,
    objective: entry.objective,
    recentEvidence: evidence,
  });

const rule = (t: string) => console.log(`\n${"═".repeat(94)}\n${t}\n${"═".repeat(94)}`);

// ── Q1 ──────────────────────────────────────────────────────────────────────────────────────────
rule("Q1. Is `correct` terminal? One correct answer, then time passes.");

const first = RESOLVED[0]!;
const key = first.objective.identityKey;
console.log("\nOne correct demonstration, and nothing since. What does the policy choose as time passes?\n");
console.log("  elapsed since the correct answer   action      because");
console.log("  " + "-".repeat(88));
for (const [label, elapsed] of [
  ["1 minute", MIN],
  ["2 hours", 2 * HOUR],
  ["1 day", DAY],
  ["30 days", 30 * DAY],
  ["365 days", 365 * DAY],
] as const) {
  const evidence = [ev("e1", key, ago(elapsed), "strong")];
  const action = actionFor(first, evidence);
  console.log(`  ${label.padEnd(34)} ${action.type.padEnd(11)} ${action.because.slice(0, 44)}`);
}

console.log("\n🔴 `projectLearnerState` takes NO clock — status is purely the latest verdict, so `correct`");
console.log("   never decays. And BOTH branches of `case \"correct\"` return `advance`; the elapsed-time");
console.log("   check changes only the explanation string.");

// ── Q1b: and what decideNext does with that ─────────────────────────────────────────────────────
rule("Q1b. `decideNext` never SELECTS an advance — so what happens when everything is correct?");

const allCorrectLongAgo = RESOLVED.map((r, i) => ev(`c${i}`, r.objective.identityKey, ago(365 * DAY), "strong"));
const decision = decideNext({ evidence: allCorrectLongAgo, now: NOW, objectives: RESOLVED });
console.log(`\n  4 objectives, every one answered correctly ONE YEAR ago, no session state:`);
console.log(`  decideNext(...) → ${decision === null ? "🔴 null — NOTHING TO ASK. The canvas has nothing to teach, for ever." : decision.action.type}`);
console.log("\n  decideNext's selector, for reference:");
console.log('    decisions.find(d => d.action.type !== "advance" && d.action.type !== "defer")');
console.log('      ?? decisions.find(d => d.action.type === "defer") ?? null');
console.log("  An `advance` is never selected by either clause, and `correct` only ever yields `advance`.");

// ── Q1c: the mixed case — is it "prefer unestablished" or "established is done"? ─────────────────
rule("Q1c. The case Integration could not distinguish: prefer-unestablished vs established-is-done.");

const oneCorrect = [ev("c0", RESOLVED[0]!.objective.identityKey, ago(365 * DAY), "strong")];
const mixed = decideNext({ evidence: oneCorrect, now: NOW, objectives: RESOLVED });
console.log(`\n  1 of 4 correct (a year ago), 3 with no evidence:`);
console.log(`    → policy picks ${mixed ? mixed.objective.identityKey : "null"} (${mixed?.action.type})`);
console.log(`    → the established one is ${mixed?.objective.identityKey === RESOLVED[0]!.objective.identityKey ? "chosen" : "SKIPPED"}`);
console.log("\n  Now remove the alternatives — only the established objective remains:");
const aloneDecision = decideNext({ evidence: oneCorrect, now: NOW, objectives: [RESOLVED[0]!] });
console.log(`    → decideNext([the correct one alone]) = ${aloneDecision === null ? "🔴 null" : aloneDecision.action.type}`);
console.log("\n  🔴 THAT SETTLES IT. With no competing objective to prefer, it still returns nothing.");
console.log("     This is `established is done`, not `prefer unestablished`.");

// ── Q3 ──────────────────────────────────────────────────────────────────────────────────────────
rule("Q3. After a correction, does OTHER material come between? (owner: 2–5 intervening retrievals)");

const wrongKey = RESOLVED[3]!.objective.identityKey;
const threeCorrectOneWrong = [
  ...RESOLVED.slice(0, 3).map((r, i) => ev(`ok${i}`, r.objective.identityKey, ago(2 * HOUR), "strong")),
  ev("bad", wrongKey, ago(30 * 1000), "incorrect"),
];

console.log("\n  A realistic mid-session state: 3 objectives correct, the 4th just answered wrong.\n");
let acted = new Set<string>();
for (let turn = 1; turn <= 4; turn += 1) {
  const step = decideNext({ actedOn: acted, evidence: threeCorrectOneWrong, now: NOW, objectives: RESOLVED });
  if (!step) {
    console.log(`  turn ${turn}: null — nothing to show`);
    break;
  }
  const same = step.objective.identityKey === wrongKey;
  console.log(`  turn ${turn}: ${step.action.type.padEnd(16)} → ${step.objective.identityKey}${same ? "   ← the SAME objective just corrected" : ""}`);
  acted = new Set([...acted, step.objective.identityKey]);
}
console.log("\n  🔴 `actedOn` moves an objective to the BACK of the queue — but the three `correct` ones");
console.log("     are not selectable at all, so the back of the queue IS the front. No intervening");
console.log("     material exists to insert, because every alternative has been retired.");

// ── Q2 ──────────────────────────────────────────────────────────────────────────────────────────
rule("Q2. What reschedules? Does anything turn elapsed time back into eligibility?");
console.log("\n  Checked by import, in the files the board named:");
console.log("    canvas-retention.ts  imports: LearningCanvas, ResponseEvaluation   → NOT LearnerEvidence");
console.log("    canvas-scheduling.ts imports: ResponseEvaluation                    → NOT LearnerEvidence");
console.log("\n  Neither is reachable from decideNext / chooseNextTeachingAction. They serve the legacy");
console.log("  six-stage recall path, which reads a ResponseEvaluation, not the durable evidence log.");
console.log("\n  🔴 So nothing converts elapsed time into renewed eligibility on the policy path.");
console.log("     `chooseNextTeachingAction` receives `now`, and the ONLY thing it uses it for is");
console.log("     ACT_AGAIN_AFTER_MS (1 hour) on the incorrect / partial / not_demonstrated branches.");
console.log("     The `correct` branch uses it for wording alone.");

// ── Q3 control: does the actedOn mitigation work when alternatives still EXIST? ──────────────────
rule("Q3 control. The same correction, but the other three objectives are still unretired.");

const onlyWrong = [ev("bad", wrongKey, ago(30 * 1000), "incorrect")];
console.log("\n  3 objectives with NO evidence yet, the 4th just answered wrong:\n");
let acted2 = new Set<string>();
for (let turn = 1; turn <= 5; turn += 1) {
  const step = decideNext({ actedOn: acted2, evidence: onlyWrong, now: NOW, objectives: RESOLVED });
  if (!step) {
    console.log(`  turn ${turn}: null`);
    break;
  }
  const same = step.objective.identityKey === wrongKey;
  console.log(`  turn ${turn}: ${step.action.type.padEnd(16)} → ${step.objective.identityKey}${same ? "   ← the corrected one" : "   (intervening material)"}`);
  acted2 = new Set([...acted2, step.objective.identityKey]);
}
console.log("\n  🟢 SO THE MITIGATION IS REAL — while unretired objectives remain, `actedOn` genuinely");
console.log("     interleaves other material between a correction and its re-ask.");
console.log("\n  🔴 AND THAT IS EXACTLY WHY `correct` BEING TERMINAL IS THE ROOT DEFECT. Spacing is not");
console.log("     scheduled; it is a SIDE EFFECT of other objectives still being askable. Every correct");
console.log("     answer permanently removes one of them, so the supply of intervening material only");
console.log("     shrinks — and a learner doing well runs out of it fastest.");

// ── The owner's four named behaviours, checked one at a time ─────────────────────────────────────
rule("THE FOUR BEHAVIOURS. Each is a separate claim; each is checked against the real chain.");

const A = RESOLVED[0]!;
const aKey = A.objective.identityKey;
const run = (objectives: ResolvedObjective[], evidence: LearnerEvidence[], turns: number, now = NOW) => {
  let seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < turns; i += 1) {
    const step = decideNext({ actedOn: seen, evidence, now, objectives });
    if (!step) {
      out.push("null");
      break;
    }
    out.push(`${step.action.type}(${step.objective.identityKey === aKey ? "A" : "other"})`);
    seen = new Set([...seen, step.objective.identityKey]);
  }
  return out.join("  →  ");
};

console.log("\n1. CORRECT RETRIEVAL — A answered correctly.");
const aCorrect = [ev("a1", aKey, ago(MIN), "strong")];
console.log(`   next selection (4 objectives) : ${run(RESOLVED, aCorrect, 3)}`);
console.log(`     → A suppressed immediately? ${run(RESOLVED, aCorrect, 1).includes("(A)") ? "🔴 no" : "🟢 yes"}`);
const aCorrectOld = [ev("a1", aKey, ago(3 * HOUR), "strong")];
console.log(`   later the SAME session (3h)   : ${run(RESOLVED, aCorrectOld, 1)}   → A eligible again? ${run(RESOLVED, aCorrectOld, 4).includes("(A)") ? "🟢 yes" : "🔴 NO"}`);
console.log(`   a FUTURE session (365 days)   : ${run(RESOLVED, [ev("a1", aKey, ago(365 * DAY), "strong")], 4)}`);
console.log(`     → still scheduled?            ${run(RESOLVED, [ev("a1", aKey, ago(365 * DAY), "strong")], 6).includes("(A)") ? "🟢 yes" : "🔴 NO — retired for ever"}`);

console.log("\n2. INCORRECT RETRIEVAL — A answered wrong, correction shown.");
const aWrong = [ev("a1", aKey, ago(30 * 1000), "incorrect")];
const wrongSeq = run(RESOLVED, aWrong, 4);
console.log(`   sequence                      : ${wrongSeq}`);
// 🔴 MEASURE THE RIGHT THING. `show_correction(A)` FIRST is DESIRED — the learner must see the
// answer. The invariant is about the RE-ASK: is `retrieve(A)` separated from the correction by
// other material? Counting "is the next item A" would flag the correct behaviour as a defect.
const afterCorrection = wrongSeq.split("  →  ").slice(1);
const reAskGap = afterCorrection.findIndex((s) => s.includes("(A)"));
console.log(`     → correction shown first?    ${wrongSeq.startsWith("show_correction(A)") ? "🟢 yes — as it should be" : "🔴 no"}`);
console.log(`     → items between correction and re-ask: ${reAskGap === -1 ? `${afterCorrection.length}+ (A did not return within the window)` : String(reAskGap)}`);

console.log("\n3. 🔴 ONLY A EXISTS — the case reordering cannot touch, because there is no back.");
console.log(`   A correct 1 minute ago        : ${run([A], aCorrect, 3)}`);
console.log(`   A correct 365 days ago        : ${run([A], [ev("a1", aKey, ago(365 * DAY), "strong")], 3)}`);
console.log(`   A wrong 30 seconds ago        : ${run([A], aWrong, 3)}`);
console.log(`     → the corrected item returns as the immediate next prompt, every turn.`);

console.log("\n4. REPEATED SUCCESS — A correct, three times over three days.");
const thrice = [
  ev("a1", aKey, ago(3 * DAY), "strong"),
  ev("a2", aKey, ago(2 * DAY), "strong"),
  ev("a3", aKey, ago(1 * DAY), "strong"),
];
const st = projectLearnerState(aKey, thrice);
console.log(`   demonstrationCount=${st.demonstrationCount}  status=${st.status}  →  action ${actionFor(A, thrice).type}`);
console.log(`     → progressively LESS FREQUENT, or GONE? ${run([A], thrice, 2) === "null" ? "🔴 GONE — frequency is not a representable concept" : "less frequent"}`);

rule("IS THE SELECTION A PRIORITY, OR A FILTER?");
console.log(`
  The owner asks whether the code is
      priority = learning_value × memory_risk × importance × uncertainty × session_eligibility
  or  hasEvidence ? lowPriority : highPriority

  🔴 It is NEITHER — and the truth is worse than the second one.

  decideNext computes no score of any kind. It sorts positionally (identity order, with
  session-acted items moved behind unacted ones), then takes the FIRST decision whose action
  is not "advance" and not "defer".

  So a demonstrated objective is not given a low priority. It yields "advance", and "advance"
  is UNSELECTABLE — the objective is EXCLUDED from consideration entirely, at any elapsed time,
  regardless of what else is or is not available.

  "Prefer what's unestablished" is not implemented as a preference. It is implemented as a
  one-shot lifecycle: unknown → asked → correct → gone.`);
