// Question first, options on request — and the row saying which of the two actually happened.
//
// 🔴🔴 THE DEFECT THIS CLOSES WAS NOT COSMETIC. The recognition screen painted its options with the
// question, so the strongest performance the surface could elicit — producing the answer with
// nothing on screen but the question — was impossible to give. Every learner who could have produced
// it was recorded at the `recognition` rung instead, and `satisfies(state, "independent")` stayed
// false, so the policy came straight back to probe for a production that had already been given.
//
// 🔴 AND THE FIX IS A BUTTON RATHER THAN A TIMER, DELIBERATELY. The finding is about the OPPORTUNITY
// to retrieve, not about waiting; Nemesis optimises understanding per unit of attention, so a
// countdown would spend the very thing being optimised to reproduce a laboratory control.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isRefusal, optionsFor, type ChoiceSet } from "./choice-set";
import { projectLearnerState, satisfies, type LearnerEvidence } from "./learner-evidence";
import { evidenceFromRow, evidenceRow } from "./learner-store";
import { objectivesForKnowledge } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import {
  asUnaidedProduction,
  evidenceForSubmission,
  judgementOf,
  OPTIONS_ON_SCREEN,
  recognitionPromptFor,
  UNSUPPORTED_RETRIEVAL,
} from "./objective-task";
import { SHOW_CHOICES_LABEL } from "../../components/workspace/learn/canvas-policy-view";

const VIEW = readFileSync(new URL("../../components/workspace/learn/canvas-policy-view.tsx", import.meta.url), "utf8");
const RUNTIME = readFileSync(new URL("../../components/workspace/learn/use-policy-runtime.ts", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
const STORE = readFileSync(new URL("./learner-store.ts", import.meta.url), "utf8");
const TASKS = readFileSync(new URL("./objective-task.ts", import.meta.url), "utf8");

// Material from a field with no drugs, no courts and no circuits in it, so nothing here can be
// passing because of a subject-matter special case.
function term(id: string, left: string, right: string): KnowledgeObject {
  return {
    id,
    identityKey: `association:v2:${id}`,
    pair: { id: `${id}:r`, left, leftRole: "joint", right, rightRole: "use" },
    statement: `${left} is used for ${right}`,
    type: "association",
    unanchoredProvenance: [],
  } as KnowledgeObject;
}

const JOINERY = [
  term("j1", "dovetail", "drawer corners in solid timber"),
  term("j2", "mortise and tenon", "frame corners carrying racking load"),
  term("j3", "half lap", "flush crossing members"),
];

const POOL = JOINERY.map((knowledge, index) => ({
  knowledge,
  objective: { ...objectivesForKnowledge(knowledge)[0]!, rowId: `row-${index}` },
}));

const TARGET = POOL[0]!;
const KEY = TARGET.objective.identityKey;
const NOW = "2026-08-18T09:00:00.000Z";

function choicesFor(): ChoiceSet {
  const built = optionsFor({
    answer: TARGET.objective.answer,
    heldMisconceptions: ["frame corners carrying racking load"],
    identityKey: KEY,
    neighbouringClasses: [],
    prompt: "Which joint is it?",
    siblingAnswers: POOL.slice(1).map((entry) => entry.objective.answer),
  });
  assert.equal(isRefusal(built), false, `no options were built: ${String(built)}`);
  return built as ChoiceSet;
}

test("🔴 the screen shows the question with a way to ask for the options, not the options", () => {
  const from = VIEW.indexOf('decision.action.type === "recognise"');
  const to = VIEW.indexOf("if (decision.action.type ===", from + 10);
  assert.ok(from !== -1 && to > from, "the recognition branch moved");
  const branch = VIEW.slice(from, to);

  // The options are behind the reveal, and the reveal is an ordinary button — so keyboard, touch and
  // screen readers reach it with no extra work, which a hover or a long-press would not.
  assert.match(branch, /runtime\.choicesRevealed \?/, "the options must be conditional on the reveal");
  assert.match(branch, /onClick=\{runtime\.revealChoices\}/);
  assert.match(branch, /type="button"/);
  // The label is referenced, not re-typed — the exported constant is what a test may assert on, and
  // it is what voice mode or a future surface would read too.
  assert.match(branch, /\{SHOW_CHOICES_LABEL\}/);
  assert.equal(SHOW_CHOICES_LABEL.length > 0, true);

  // 🔴 AND NO TIMER ANYWHERE NEAR IT. A countdown, an auto-reveal or a disabled period would be the
  // laboratory protocol rather than the finding, and it would spend attention on every learner.
  for (const forbidden of ["setTimeout", "setInterval", "countdown", "delayMs"]) {
    assert.equal(branch.includes(forbidden), false, `the recognition screen grew a ${forbidden}`);
  }
});

test("🔴🔴 an answer produced before the options were opened is recorded as a PRODUCTION", () => {
  const planned = recognitionPromptFor(TARGET, "p-1", choicesFor());
  assert.equal(planned.rung, "recognition");
  assert.equal(planned.scaffoldingLevel, OPTIONS_ON_SCREEN);

  // What the learner actually met: the question, and nothing else.
  const met = asUnaidedProduction(planned);
  assert.equal(met.rung, "independent");
  assert.equal(met.scaffoldingLevel, UNSUPPORTED_RETRIEVAL);
  // 🔴 THE OPTIONS GO WITH THE RUNG. A prompt claiming `independent` while still carrying the answer
  // set is the pairing `RetrievalPrompt.choices` spends its own comment forbidding.
  assert.equal(met.choices, undefined);
  // Everything else about the question is untouched — same id, so the same idempotency key, and the
  // same words, so the row still says what was asked.
  assert.equal(met.id, planned.id);
  assert.equal(met.prompt, planned.prompt);
  assert.equal(met.expectedAnswer, planned.expectedAnswer);

  const rows = evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf([{ objectiveIdentityKey: KEY, verdict: "understood" }]),
    occurredAt: NOW,
    prompt: met,
    responseText: "drawer corners in solid timber",
    teachingStrategy: "llm_teacher",
  });
  const readBack: LearnerEvidence = evidenceFromRow({ ...evidenceRow("u", rows[0]!), id: "e1" }, KEY);
  const state = projectLearnerState(KEY, [readBack]);

  // 🔴 THE WHOLE POINT: this learner is done with this objective for now. Recorded the old way they
  // would have been probed again for a production they had already given.
  assert.equal(satisfies(state, "independent"), true);
});

test("🔴 once the options are on screen the attempt can never be an unaided one again", () => {
  const planned = recognitionPromptFor(TARGET, "p-2", choicesFor());
  const rows = evidenceForSubmission({
    canvasId: "c1",
    judgement: judgementOf([{ objectiveIdentityKey: KEY, verdict: "understood" }]),
    occurredAt: NOW,
    prompt: planned,
    responseText: "drawer corners in solid timber",
    teachingStrategy: "llm_teacher",
  });
  const readBack: LearnerEvidence = evidenceFromRow({ ...evidenceRow("u", rows[0]!), id: "e2" }, KEY);
  assert.equal(readBack.scaffoldRung, "recognition");
  assert.equal(satisfies(projectLearnerState(KEY, [readBack]), "independent"), false);
});

test("🔴🔴 the reveal is one-way: nothing can put the options back in the box", () => {
  // 🔴 THE ATTACK: reveal → hide → type, and the row says `independent` while the learner has read
  // the answer set. It is closed by there being no hide at all — `choicesRevealed` has exactly one
  // transition to true, it is guarded against re-entry, and the ONLY thing that sets it false is the
  // question in front of the learner being replaced.
  const stripped = RUNTIME.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((stripped.match(/setChoicesRevealed\(true\)/g) ?? []).length, 1);
  assert.equal((stripped.match(/setChoicesRevealed\(false\)/g) ?? []).length, 1);
  // The single reset is keyed on the PROMPT ID, not on the decision, the round or a render. A
  // decision recomputes for reasons that have nothing to do with the learner; the prompt id changes
  // exactly when the question does.
  assert.match(stripped, /useEffect\(\(\) => \{\s*setChoicesRevealed\(false\);\s*\}, \[promptId\]\);/);
  assert.match(stripped, /const promptId = prompt\?\.id \?\? null;/);
  // And the view offers no way back — one control, one direction.
  assert.equal(VIEW.includes("revealChoices(false)"), false);
  assert.equal(/hideChoices|collapseChoices/.test(VIEW), false);
});

test("🔴 a re-mint is a NEW question, so a lost reveal cannot silently upgrade an old attempt", () => {
  // 🔴 THE OTHER HALF OF THE ATTACK: refresh, reconnect, or a decision recomputed mid-question. All
  // three land in the same place — the effect that mints a prompt calls `crypto.randomUUID()`, so a
  // re-mint carries a new id, and the id is the `response_id` an evidence row is keyed on.
  //
  // 🔴 WHICH MEANS THE OLD ROW CANNOT BE REWRITTEN. `recordEvidence` upserts with
  // `ignoreDuplicates` on `(user_id, objective_id, response_id)` — ON CONFLICT DO NOTHING. A stale
  // client replaying an answer against an id that already has a `recognition` row cannot turn it
  // into an `independent` one; the write is discarded, not applied.
  const stripped = RUNTIME.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((stripped.match(/crypto\.randomUUID\(\)/g) ?? []).length >= 1, true);
  assert.match(STORE, /ignoreDuplicates: true, onConflict: "user_id,objective_id,response_id"/);
  // The row's `response_id` is the prompt id, which is what ties the two facts together.
  assert.match(TASKS, /responseId: prompt\.id/);
});

test("🔴 a spoken answer takes the same single road as a typed one", () => {
  // 🔴 VOICE IS NOT A SECOND SUBMIT PATH, AND THAT IS THE ONLY REASON IT IS SAFE. Dictation and
  // voice mode both hand their text to the composer's `onAnswer`, which has exactly ONE call to
  // `policy.submit` — so the `asMet` correction applies to a spoken answer given while the options
  // are visible without anything having to remember it. A second call site would be a second chance
  // to record the planned rung instead of the met one.
  const calls = (CANVAS.match(/policy\.submit\(/g) ?? []).length;
  assert.equal(calls, 1, "a second submit path would need its own copy of the assistance correction");
  assert.match(CANVAS, /if \(sink\.kind === "policy"\) void policy\.submit\(text, via, tookMs\);/);
  // And the sink only names the policy when the runtime is hosting a task, which it does for every
  // asking action including this one.
  assert.match(CANVAS, /hosted: policy\.task/);
});

test("🔴 every write path asks what was ACTUALLY on screen, not what was planned", () => {
  // 🔴 THE PRODUCED-TEXT PATHS ALL HAVE TO MAKE THE SAME CORRECTION. A judged answer and an
  // "I don't know" are two call sites writing rows for the same prompt, and either could arrive
  // before the options were opened. One that forgot would file a real unaided performance at the
  // recognition rung, which is the understatement this whole change removes.
  const stripped = RUNTIME.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const corrected = [...stripped.matchAll(/prompt: asMet\(active, choicesRevealed\)/g)].length;
  assert.equal(corrected, 2, "a produced answer is still recorded from the planned prompt, not the met one");
  assert.match(stripped, /function asMet\(active: RetrievalPrompt, choicesRevealed: boolean\)/);

  // 🔴 THE TAP PATH IS THE ONE EXCEPTION, AND IT IS AN EXCEPTION BECAUSE IT CANNOT HAPPEN EARLY. A
  // tap is only reachable once the options are painted, so `active` — which still says `recognition`
  // — is exactly right there. The guard is what makes that true rather than assumed.
  const chooseAt = stripped.indexOf("const choose = useCallback(");
  assert.notEqual(chooseAt, -1, "the tap path moved");
  const guardAt = stripped.indexOf("if (!choicesRevealed) return;", chooseAt);
  const writeAt = stripped.indexOf("prompt: active", chooseAt);
  assert.notEqual(guardAt, -1, "a tap can reach the row without the options ever having been shown");
  assert.ok(guardAt < writeAt, "the guard must come before the row is built");
});
