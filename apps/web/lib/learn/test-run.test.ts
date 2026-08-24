// A test the learner clicks through: what gets asked, what a miss earns, and what may never exist.
//
// 🔴🔴 THE CONTRACT GUARD IS THE MOST IMPORTANT TEST IN THIS FILE. §38 bans a control that steers
// the learning machine and names "quiz me, test me" outright, then says where a test request DOES
// belong: *"If the learner wants to say 'test me on this again', that is a phrase to the composer,
// not a control."* The owner's instruction — *"the 'tests' are supposed to be in chat chips for
// users to click through"* — is about how a test is ANSWERED, not about a button that starts one.
// The two readings build different products, and only one of them is legal. See the last test.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { groundedMiss } from "@/components/workspace/learn/canvas-check";

import type { ResolvedObjective } from "./canvas-knowledge";
import type { DistractorGround } from "./choice-set";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import { objectivesForKnowledge } from "./learning-objective";
import {
  buildTestRun,
  isTestRefusal,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  missedObjectives,
  scoreTestRun,
  verdictFor,
  type TestRun,
} from "./test-run";

// ── material that is genuinely confusable, and deliberately not medical ──────
//
// Trade names for engineering polymers: four entries from one column of one reference table, which
// is the ordinary shape of a glossary in any discipline (CLAUDE.md's field-agnostic rule — this
// fixture would read the same if it held case citations or alloy designations).

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
  association("k1", "polytetrafluoroethylene", "Teflon"),
  association("k2", "cyanoacrylate", "Super Glue"),
  association("k3", "polymethyl methacrylate", "Perspex"),
  association("k4", "para-aramid", "Kevlar"),
];

const POOL: ResolvedObjective[] = MATERIAL.map((knowledge, index) => ({
  knowledge,
  objective: { ...objectivesForKnowledge(knowledge)[0]!, rowId: `row-${index}` },
}));

const KEYS = POOL.map((entry) => entry.objective.identityKey);
const NO_EVIDENCE: LearnerEvidence[] = [];

function built(input: Parameters<typeof buildTestRun>[0]): TestRun {
  const run = buildTestRun(input);
  assert.ok(!isTestRefusal(run), `expected a run, got refusal "${run as string}"`);
  return run;
}

// ── what gets asked ─────────────────────────────────────────────────────────

test("a canvas that has taught nothing has nothing to test", () => {
  assert.equal(buildTestRun({ evidence: NO_EVIDENCE, objectives: [] }), "nothing-taught");
});

test("🔴🔴 an objective with no honest options is left OFF the test, never padded", () => {
  // One association has no siblings to draw distractors from, so `choice-set.ts` refuses it. The
  // correct outcome is a refusal to build a test at all — NOT a test with one real question and two
  // invented options, whose score would be a lie the learner then acts on.
  const lonely = POOL.slice(0, 1);
  assert.equal(buildTestRun({ evidence: NO_EVIDENCE, objectives: lonely }), "too-few-questions");
});

test("🔴 too few survivors refuses rather than shipping a two-question 'test'", () => {
  const run = buildTestRun({ evidence: NO_EVIDENCE, objectives: POOL.slice(0, 2) });
  assert.ok(isTestRefusal(run) || run.questions.length >= MIN_QUESTIONS, "a run shorter than the floor escaped");
});

test("every question carries the objective it tests, and real options", () => {
  const run = built({ evidence: NO_EVIDENCE, objectives: POOL });
  assert.ok(run.questions.length >= MIN_QUESTIONS, "the pool produced fewer questions than the floor");
  for (const question of run.questions) {
    assert.ok(KEYS.includes(question.objectiveIdentityKey), "a question names an objective the pool never held");
    assert.ok(question.prompt.trim().length > 0, "a question reached the learner with no prompt");
    assert.ok(question.options.length >= 3, "a question shipped with fewer options than choice-set's floor");
    assert.equal(question.options.filter((option) => option.correct).length, 1, "a question has other than exactly one right answer");
  }
});

test("🔴 questions arrive in teaching order, not shuffled", () => {
  // Reproducibility, and the learner feeling WHERE they fell off. Math.random is banned in this
  // lane besides — a shuffled run could not be rebuilt from the same inputs.
  const first = built({ evidence: NO_EVIDENCE, objectives: POOL });
  const second = built({ evidence: NO_EVIDENCE, objectives: POOL });
  assert.deepEqual(
    first.questions.map((q) => q.objectiveIdentityKey),
    second.questions.map((q) => q.objectiveIdentityKey),
    "two runs over identical input asked different questions",
  );
  const asked = first.questions.map((q) => q.objectiveIdentityKey);
  assert.deepEqual(asked, KEYS.filter((key) => asked.includes(key)), "the run reordered the pool");
});

test("size is a ceiling, and it cannot push the run below the floor", () => {
  const short = built({ evidence: NO_EVIDENCE, objectives: POOL, size: 3 });
  assert.equal(short.questions.length, 3, "size did not cap the run");
  const clamped = built({ evidence: NO_EVIDENCE, objectives: POOL, size: 1 });
  assert.ok(clamped.questions.length >= MIN_QUESTIONS, "size 1 produced a one-question test");
  const capped = built({ evidence: NO_EVIDENCE, objectives: POOL, size: 999 });
  assert.ok(capped.questions.length <= MAX_QUESTIONS, "a huge size escaped the ceiling");
});

// ── what a miss earns ───────────────────────────────────────────────────────

test("scoring counts the right answers and names the missed objectives", () => {
  const run = built({ evidence: NO_EVIDENCE, objectives: POOL });
  const allRight = run.questions.map((q) => q.options.find((option) => option.correct)!.text);
  const perfect = scoreTestRun(run, allRight);
  assert.equal(perfect.correct, run.questions.length);
  assert.deepEqual(perfect.missed, [], "a perfect run reported misses");

  const allWrong = run.questions.map((q) => q.options.find((option) => !option.correct)!.text);
  const failed = scoreTestRun(run, allWrong);
  assert.equal(failed.correct, 0);
  assert.deepEqual(failed.missed, run.questions.map((q) => q.objectiveIdentityKey), "the miss list lost an objective");
});

test("🔴🔴 an unanswered question counts as missed, and so does a short answer list", () => {
  // Silence is not neutral: a learner who skipped did not demonstrate the objective. Treating it as
  // neutral would let a run of skips report a perfect score, which is the worst possible lie here.
  const run = built({ evidence: NO_EVIDENCE, objectives: POOL });
  const skipped = scoreTestRun(run, run.questions.map(() => null));
  assert.equal(skipped.correct, 0, "skipping scored points");
  assert.equal(skipped.missed.length, run.questions.length, "a skipped question escaped the miss list");

  const abandoned = scoreTestRun(run, []);
  assert.equal(abandoned.missed.length, run.questions.length, "abandoning the run reported nothing missed");
});

test("an unrecognised answer is a miss, not a crash", () => {
  const run = built({ evidence: NO_EVIDENCE, objectives: POOL });
  const score = scoreTestRun(run, run.questions.map(() => "something nobody offered"));
  assert.equal(score.correct, 0);
  assert.equal(score.missed.length, run.questions.length);
});

test("one objective missed twice earns one card, not two", () => {
  const key = KEYS[0]!;
  assert.deepEqual(missedObjectives({ correct: 0, missed: [key, key, KEYS[1]!], total: 3 }), [key, KEYS[1]!]);
});

test("the verdict names what they picked AND what was right", () => {
  const run = built({ evidence: NO_EVIDENCE, objectives: POOL });
  const question = run.questions[0]!;
  const answer = question.options.find((option) => option.correct)!;
  const distractor = question.options.find((option) => !option.correct)!;

  const right = verdictFor(question, answer.text);
  assert.equal(right.correct, true);
  assert.equal(right.chosen?.text, answer.text);

  const wrong = verdictFor(question, distractor.text);
  assert.equal(wrong.correct, false);
  // 🔴 THE GROUND IS WHY THIS IS WORTH SAYING OUT LOUD. A distractor here was minted from a named
  // competing model, so the tap is a belief stated in advance — the verdict can tell them which
  // belief they just acted on rather than only "incorrect".
  assert.ok(wrong.chosen?.ground, "a wrong option arrived with no ground, so the verdict can say nothing useful");
  assert.equal(wrong.answer?.text, answer.text, "the verdict could not name the right answer");
});

// ── what may never exist ────────────────────────────────────────────────────

test("🔴🔴 there is no Test button, and §38 is the reason", () => {
  // Calibration: add "test" to COMPOSER_CAPABILITIES and this reddens.
  //
  // §38: *"no button on the learning surface that selects what happens next"*, narrowed in 2026-08
  // to permit ONE-SHOT capabilities that declare what a submission IS (attach files, Course) while
  // keeping "quiz me, test me, easier, harder" banned. A test chip would be the banned object: it
  // tells the teaching engine what to do next. The learner asks in words instead.
  const capability = readFileSync(new URL("./composer-capability.ts", import.meta.url), "utf8");
  const list = capability.slice(capability.indexOf("COMPOSER_CAPABILITIES"), capability.indexOf("CapabilityCopy"));
  assert.ok(!/"test"|"quiz"|"exam"/.test(list), "a test/quiz capability was added to the composer — §38 bans exactly this");
  assert.ok(!/"test"|"quiz"|"exam"/.test(capability.slice(capability.indexOf("export type ComposerCapability"), capability.indexOf("COMPOSER_CAPABILITIES"))), "the capability union grew a test member");

  // And nothing in the run builder may reach for a capability either. Comments are stripped first:
  // the module's own header EXPLAINS that there is no ComposerCapability for tests, and a guard
  // that a doc comment can trip is a guard that gets deleted the first time it cries wolf.
  assert.ok(!/ComposerCapability/.test(stripped()), "the test runner started depending on a composer control");
});

/** test-run.ts with its comments removed, so a rule written down cannot fail the rule. */
function stripped(): string {
  return readFileSync(new URL("./test-run.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("🔴🔴 every kind of wrong answer gets its own sentence, and no branch is dead", () => {
  // Calibration, and the reason this test exists: the first draft of `groundedMiss` branched on
  // "same_output_role", which is not a kind — the real one is `sibling_answer` — so every sibling
  // miss silently fell through to the generic sentence. tsc could not see it because the parameter
  // was typed `{ kind: string }`. This reads the kinds out of choice-set.ts itself, so a NEW ground
  // added there fails here until someone writes a sentence for it.
  const choiceSource = readFileSync(new URL("./choice-set.ts", import.meta.url), "utf8");
  const union = choiceSource.slice(
    choiceSource.indexOf("export type DistractorGround"),
    choiceSource.indexOf("export interface ChoiceOption"),
  );
  const kinds = [...new Set([...union.matchAll(/\{ kind: "([a-z_]+)"/g)].map((match) => match[1]!))];
  assert.ok(kinds.length >= 3, "the ground union could not be read — this guard is pointed at nothing");

  const sentences = new Map(kinds.map((kind) => [kind, groundedMiss({ kind } as DistractorGround)]));
  const generic = groundedMiss(undefined);
  for (const kind of kinds) {
    assert.notEqual(sentences.get(kind), generic, `"${kind}" falls through to the generic sentence — its branch is dead`);
  }
  assert.equal(new Set(sentences.values()).size, kinds.length, "two grounds share one sentence, so one of them says nothing specific");
});

test("🔴 the run mints no questions of its own", () => {
  // Every question must come from choiceSetsForPool — the same grounded distractors and answer
  // balancing the policy's recognition path uses. A second generator here would be a second place
  // "is this a fair question" gets decided, and the two would drift.
  const source = stripped();
  assert.match(source, /choiceSetsForPool\(/, "the run builder stopped using the shared option minter");
  assert.ok(!/postChatCompletion|fetch\(/.test(source), "the run builder started calling a model directly");
});
