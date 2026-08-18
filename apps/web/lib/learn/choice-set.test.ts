// The options a recognition task shows, and what each one MEANS.
//
// 🔴 EVERY ASSERTION HERE IS ABOUT ONE OF TWO CLAIMS, BECAUSE THOSE ARE THE TWO WAYS THIS FEATURE
// FAILS SILENTLY:
//
//   1. an option was invented to fill a seat        -> a tap on it means nothing, and the whole
//                                                      diagnostic argument for multiple choice dies
//   2. the ground was dropped somewhere in the      -> "which distractor did they pick" is
//      shape changes between build and read            unanswerable, which is the only reason this
//                                                      work is worth doing at all
//
// Both pass a test that merely checks "a set came back", which is why none of the tests below do.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  choiceCandidatesFrom,
  choiceSetsFor,
  isRefusal,
  MAX_OPTIONS,
  MIN_OPTIONS,
  neighbourhoodKey,
  optionsFor,
  readSelection,
  type ChoiceCandidate,
  type ChoicePoolEntry,
  type ChoiceSet,
} from "./choice-set";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import type { LearningObjective } from "./learning-objective";

function candidate(over: Partial<ChoiceCandidate> & { identityKey: string }): ChoiceCandidate {
  return {
    answer: "the answer",
    heldMisconceptions: [],
    neighbouringClasses: [],
    prompt: "a question about something",
    siblingAnswers: [],
    ...over,
  };
}

function built(result: ReturnType<typeof optionsFor>): ChoiceSet {
  assert.ok(!isRefusal(result), `expected a set, got refusal ${String(result)}`);
  return result;
}

// ── never padded ─────────────────────────────────────────────────────────────

test("🔴 three good distractors give four options, and nothing invents a fifth", () => {
  const set = built(
    optionsFor(candidate({ identityKey: "a", siblingAnswers: ["one", "two", "three"] })),
  );
  assert.equal(set.options.length, 4);
  assert.equal(set.options.filter((option) => option.correct).length, 1);
  // 🔴 THE OWNER'S RULE, ASSERTED RATHER THAN COMMENTED: five is preferred WHEN five exist, and is
  // never a target. A set that reached four and stopped is a correct result.
  assert.ok(set.options.length < MAX_OPTIONS);
});

test("🔴 two good distractors give THREE options, which is a success and not a shortfall", () => {
  const set = built(optionsFor(candidate({ identityKey: "a", siblingAnswers: ["one", "two"] })));
  assert.equal(set.options.length, MIN_OPTIONS);
});

test("🔴 one distractor is REFUSED rather than padded out to three", () => {
  // Two options is a coin flip, and a correct answer to a coin flip establishes almost nothing.
  const result = optionsFor(candidate({ identityKey: "a", siblingAnswers: ["one"] }));
  assert.equal(result, "too-few-distractors");
});

test("🔴 five good distractors are capped at five OPTIONS, not five distractors", () => {
  const set = built(
    optionsFor(candidate({ identityKey: "a", siblingAnswers: ["1", "2", "3", "4", "5", "6"] })),
  );
  assert.equal(set.options.length, MAX_OPTIONS);
});

test("an objective with no answer is refused, and the refusal says which failure it was", () => {
  assert.equal(optionsFor(candidate({ answer: "   ", identityKey: "a" })), "no-answer");
});

// ── the options are real, and none of them is the answer twice ───────────────

test("🔴 a distractor equal to the correct answer never takes a seat", () => {
  // Two objectives in one neighbourhood can share an answer. Left in, the learner would meet the
  // right answer twice and a correct tap could land on the option marked wrong.
  const result = optionsFor(
    candidate({ answer: "Cozaar", identityKey: "a", siblingAnswers: ["Cozaar", "Diovan"] }),
  );
  assert.equal(result, "too-few-distractors");
});

test("🔴 a distractor already printed in the QUESTION never takes a seat", () => {
  // Asked "what is the brand for losartan?", an option reading `losartan` is ruled out on sight. It
  // would occupy a seat and teach us nothing, which is an invented option in structural clothing.
  const result = optionsFor(
    candidate({
      answer: "Cozaar",
      identityKey: "a",
      prompt: "What is the brand for losartan?",
      siblingAnswers: ["Losartan", "Diovan"],
    }),
  );
  assert.equal(result, "too-few-distractors");
});

test("duplicate distractors are one option, however differently the source spelled them", () => {
  const set = built(
    optionsFor(candidate({ identityKey: "a", siblingAnswers: ["Alpha", "alpha ", "Beta"] })),
  );
  assert.equal(set.options.length, MIN_OPTIONS);
});

// ── the ground survives, which is the point ──────────────────────────────────

test("🔴🔴 every wrong option carries its ground and the correct one carries none", () => {
  const set = built(
    optionsFor(
      candidate({
        heldMisconceptions: ["it raises potassium"],
        identityKey: "a",
        neighbouringClasses: ["loop diuretic"],
        siblingAnswers: ["thiazide"],
      }),
    ),
  );
  for (const option of set.options) {
    if (option.correct) assert.equal(option.ground, undefined, "the correct option must carry no ground");
    else assert.ok(option.ground, `distractor "${option.text}" lost its ground`);
  }
  const grounds = set.options.map((option) => option.ground?.kind).filter(Boolean).sort();
  assert.deepEqual(grounds, ["held_misconception", "neighbouring_class", "sibling_answer"]);
});

test("🔴 the belief a judge named is carried verbatim, not merely flagged as a misconception", () => {
  const set = built(
    optionsFor(
      candidate({ heldMisconceptions: ["it raises potassium"], identityKey: "a", siblingAnswers: ["x"] }),
    ),
  );
  const held = set.options.find((option) => option.ground?.kind === "held_misconception");
  assert.ok(held?.ground && held.ground.kind === "held_misconception");
  assert.equal(held.ground.belief, "it raises potassium");
});

test("🔴 the most diagnostic distractors win the seats when there are more than four", () => {
  // A held belief outranks a source neighbour, which outranks a same-shape answer. With six on
  // offer the two that get dropped must be the weakest two, or the ceiling silently discards the
  // one option the whole feature exists to put on screen.
  const set = built(
    optionsFor(
      candidate({
        heldMisconceptions: ["belief"],
        identityKey: "a",
        neighbouringClasses: ["near-1", "near-2"],
        siblingAnswers: ["far-1", "far-2", "far-3"],
      }),
    ),
  );
  const kinds = set.options.filter((option) => !option.correct).map((option) => option.ground?.kind);
  assert.equal(kinds.filter((kind) => kind === "held_misconception").length, 1);
  assert.equal(kinds.filter((kind) => kind === "neighbouring_class").length, 2);
  assert.equal(kinds.filter((kind) => kind === "sibling_answer").length, 1);
});

// ── burden and difficulty are separate variables ─────────────────────────────

test("🔴🔴 demand is read off the GROUNDS, never off how many options there are", () => {
  // The owner's ruling: response burden and cognitive difficulty are separate. A three-option set of
  // near-neighbours is harder than a five-option set of unrelated answers, and this inversion is the
  // only way to check that nothing here is quietly counting seats.
  const fewAndClose = built(
    optionsFor(
      candidate({ heldMisconceptions: ["belief"], identityKey: "a", neighbouringClasses: ["near"] }),
    ),
  );
  const manyAndLoose = built(
    optionsFor(candidate({ identityKey: "b", siblingAnswers: ["1", "2", "3", "4"] })),
  );
  assert.equal(fewAndClose.options.length, MIN_OPTIONS);
  assert.equal(manyAndLoose.options.length, MAX_OPTIONS);
  assert.equal(fewAndClose.demand, "near");
  assert.equal(manyAndLoose.demand, "related");
});

// ── position, reusing the balancer rather than a second one ──────────────────

test("🔴🔴 the correct answer is NOT always in the same seat across a canvas", () => {
  // The defect this reuses `test-answer-balance.ts` to avoid. A per-question call degenerates to
  // "always first" — `balancedPositions(1, k, …)` is `[0]` however it is shuffled — so the batch is
  // the whole pool and the property worth pinning is the DISTRIBUTION, not any one item.
  const candidates = Array.from({ length: 24 }, (_, index) =>
    candidate({
      answer: `answer-${index}`,
      identityKey: `obj-${index}`,
      prompt: `question ${index}`,
      siblingAnswers: ["one", "two", "three"],
    }),
  );
  const sets = choiceSetsFor(candidates);
  assert.equal(sets.size, 24);
  const positions = [...sets.values()].map((set) => set.options.findIndex((option) => option.correct));
  const counts = [0, 1, 2, 3].map((seat) => positions.filter((position) => position === seat).length);
  for (const count of counts) {
    assert.ok(count > 0, `a seat never held the answer across 24 items: ${counts.join(",")}`);
  }
  // Balanced, not merely non-constant: every seat within one of an even share.
  for (const count of counts) {
    assert.ok(Math.abs(count - 6) <= 1, `seat share is lopsided: ${counts.join(",")}`);
  }
});

test("🔴 moving an option keeps its ground attached to its TEXT", () => {
  // The re-find after balancing is by text, because trusting an index across a reshuffle silently
  // inverts which option is correct. This is that invariant from the ground's side.
  const candidates = Array.from({ length: 8 }, (_, index) =>
    candidate({
      answer: `answer-${index}`,
      heldMisconceptions: [`belief-${index}`],
      identityKey: `obj-${index}`,
      prompt: `question ${index}`,
      siblingAnswers: ["one", "two"],
    }),
  );
  for (const [key, set] of choiceSetsFor(candidates)) {
    const index = key.split("-")[1];
    const correct = set.options.filter((option) => option.correct);
    assert.equal(correct.length, 1, `${key} has ${correct.length} correct options`);
    assert.equal(correct[0]!.text, `answer-${index}`);
    assert.equal(correct[0]!.ground, undefined);
    const held = set.options.find((option) => option.ground?.kind === "held_misconception");
    assert.equal(held?.text, `belief-${index}`);
  }
});

test("a candidate that cannot be built is absent from the batch rather than present and empty", () => {
  const sets = choiceSetsFor([
    candidate({ identityKey: "buildable", siblingAnswers: ["one", "two"] }),
    candidate({ identityKey: "not-buildable", siblingAnswers: ["only-one"] }),
  ]);
  assert.deepEqual([...sets.keys()], ["buildable"]);
});

// ── reading a tap ────────────────────────────────────────────────────────────

test("🔴 a tap is resolved by TEXT, so no layout has to be stored to read it back", () => {
  const set = built(
    optionsFor(
      candidate({ answer: "Cozaar", heldMisconceptions: ["Diovan"], identityKey: "a", siblingAnswers: ["Avapro"] }),
    ),
  );
  assert.deepEqual(readSelection(set, "Cozaar"), { kind: "correct", text: "Cozaar" });
  assert.deepEqual(readSelection(set, "Diovan"), {
    ground: { belief: "Diovan", kind: "held_misconception" },
    kind: "distractor",
    text: "Diovan",
  });
  assert.deepEqual(readSelection(set, "Avapro"), {
    ground: { kind: "sibling_answer" },
    kind: "distractor",
    text: "Avapro",
  });
});

test("🔴 an option that is not on the screen is `unrecognised`, NEVER a wrong answer", () => {
  // A stale render or a rebuilt pool means we do not know what was picked. Recording that as
  // incorrect would charge a learner for our own race.
  const set = built(optionsFor(candidate({ identityKey: "a", siblingAnswers: ["one", "two"] })));
  assert.equal(readSelection(set, "something else entirely").kind, "unrecognised");
});

// ── from a canvas's knowledge ────────────────────────────────────────────────

function objective(over: Partial<LearningObjective> & { identityKey: string }): LearningObjective {
  return {
    answer: "an answer",
    capability: "recall",
    cue: "a cue",
    identityVersion: 1,
    knowledgeIdentityKey: "k-1",
    label: "a label",
    parameters: {},
    ...over,
  };
}

function knowledge(over: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: "k-1",
    provenance: [],
    statement: "a statement",
    type: "association",
    unanchoredProvenance: [],
    ...over,
  } as KnowledgeObject;
}

function entry(over: Partial<ChoicePoolEntry> & { objective: LearningObjective }): ChoicePoolEntry {
  return {
    evidence: [],
    knowledge: knowledge(),
    prompt: "a question",
    ...over,
  };
}

test("🔴 sibling answers come from the same SHAPE, so a different kind of answer is never offered", () => {
  const pool: ChoicePoolEntry[] = [
    entry({ objective: objective({ answer: "Cozaar", identityKey: "a", parameters: { outputRole: "brand" } }) }),
    entry({ objective: objective({ answer: "Diovan", identityKey: "b", parameters: { outputRole: "brand" } }) }),
    entry({ objective: objective({ answer: "Avapro", identityKey: "c", parameters: { outputRole: "brand" } }) }),
    // A different column of the same table asks for a different kind of value. Offering it as an
    // option hands the learner a free elimination.
    entry({ objective: objective({ answer: "50 mg", identityKey: "d", parameters: { outputRole: "dose" } }) }),
  ];
  const first = choiceCandidatesFrom(pool)[0]!;
  assert.deepEqual([...first.siblingAnswers].sort(), ["Avapro", "Diovan"]);
});

test("🔴 a competing belief is taken only from rows a judge actually called a misconception", () => {
  const rows: LearnerEvidence[] = [
    {
      demonstrationObtained: true,
      id: "e1",
      misconceptions: ["not from an incorrect row"],
      objectiveIdentityKey: "a",
      occurredAt: "2026-08-01T10:00:00.000Z",
      verdict: "incorrect",
    },
    {
      demonstrationObtained: true,
      id: "e2",
      misconceptions: ["the belief they hold"],
      objectiveIdentityKey: "a",
      occurredAt: "2026-08-02T10:00:00.000Z",
      verdict: "misconception",
    },
  ];
  const pool: ChoicePoolEntry[] = [entry({ evidence: rows, objective: objective({ identityKey: "a" }) })];
  assert.deepEqual(choiceCandidatesFrom(pool)[0]!.heldMisconceptions, ["the belief they hold"]);
});

test("🔴 the source's own confusable classes become neighbouring-class options", () => {
  const contrast = {
    column: 1,
    featureColumns: [2],
    label: "thiazide",
    members: ["hydrochlorothiazide"],
    siblings: [
      { label: "loop", members: ["furosemide"] },
      { label: "potassium sparing", members: ["spironolactone"] },
    ],
  };
  const pool: ChoicePoolEntry[] = [
    entry({
      knowledge: knowledge({ contrast, type: "classification" }),
      objective: objective({ answer: "thiazide", capability: "discriminate", identityKey: "a" }),
    }),
  ];
  assert.deepEqual(choiceCandidatesFrom(pool)[0]!.neighbouringClasses, ["loop", "potassium sparing"]);
});

test("🔴 a law objective and a mechanical-engineering objective behave IDENTICALLY", () => {
  // The standing product rule, checked rather than asserted in a comment. Same structure, different
  // subject matter, and every structural output must match: same option count, same grounds, same
  // demand. If any rule in this module read a word's meaning, these two would diverge.
  const law: ChoicePoolEntry[] = [
    entry({ objective: objective({ answer: "strict liability", identityKey: "l1", parameters: { outputRole: "standard" } }) }),
    entry({ objective: objective({ answer: "negligence", identityKey: "l2", parameters: { outputRole: "standard" } }) }),
    entry({ objective: objective({ answer: "recklessness", identityKey: "l3", parameters: { outputRole: "standard" } }) }),
  ];
  const engineering: ChoicePoolEntry[] = [
    entry({ objective: objective({ answer: "shear stress", identityKey: "e1", parameters: { outputRole: "standard" } }) }),
    entry({ objective: objective({ answer: "tensile stress", identityKey: "e2", parameters: { outputRole: "standard" } }) }),
    entry({ objective: objective({ answer: "torsional stress", identityKey: "e3", parameters: { outputRole: "standard" } }) }),
  ];
  const shapeOf = (pool: ChoicePoolEntry[]) =>
    [...choiceSetsFor(choiceCandidatesFrom(pool))].map(([, set]) => ({
      correctSeat: set.options.findIndex((option) => option.correct),
      count: set.options.length,
      demand: set.demand,
      grounds: set.options.map((option) => option.ground?.kind ?? null),
    }));
  assert.deepEqual(shapeOf(law), shapeOf(engineering));
});

test("the neighbourhood key falls back structurally and never collapses two capabilities", () => {
  const recall = neighbourhoodKey(objective({ identityKey: "a" }), knowledge());
  const explain = neighbourhoodKey(
    objective({ capability: "explain", identityKey: "b" }),
    knowledge({ type: "conceptual_system" }),
  );
  assert.notEqual(recall, explain);
  // With no output role and no relation kind, the type is the last resort — loose on purpose, and
  // the looseness is what `demand: "related"` then reports rather than hides.
  assert.equal(recall, "recall|association");
});
