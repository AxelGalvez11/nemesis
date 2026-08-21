// The plan is a promise, and a promise nothing checks is theatre with better copy.
//
// 🔴🔴 THIS IS THE FILE THAT MAKES "SHOW WHAT YOU ARE DOING" SAFE TO BUILD. Owner, 2026-08-21:
// *"show the plan and hide internal thoughts."* Showing a plan is easy and is exactly the thing
// `thinking-phases.ts` spent a section forbidding in a weaker form — "a caption that walked
// 'Mapping what you know → Finding the next gap' on a 900ms interval would look exactly like a
// system thinking and would be theatre". A plan is that risk in a MORE persuasive shape, because it
// is a commitment rather than a label: a learner told "I'll check the current guidance" who then
// gets an answer from memory has been actively misled about where it came from.
//
// So every test here is about a claim being refused, not about one being displayed.

import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PLAN_LENGTH, readTurnDecision } from "./turn-router";

/** A decision block, as the model actually writes it: JSON fenced, answer outside. */
const turn = (decision: Record<string, unknown>, answer = "Here it is.") =>
  `\`\`\`json\n${JSON.stringify(decision)}\n\`\`\`\n\n${answer}`;

test("a plan survives on a turn that does the work it describes", () => {
  const read = readTurnDecision(turn({ needsWeb: true, plan: "Checking the current guidance, then comparing it with your notes", then: "reply", webQuery: "guidance" }));
  assert.equal(read?.plan, "Checking the current guidance, then comparing it with your notes");
});

test("a study turn may state a plan without searching", () => {
  const read = readTurnDecision(turn({ needsWeb: false, plan: "Building a short lesson on enzyme kinetics", then: "study", topic: "enzyme kinetics" }));
  assert.equal(read?.plan, "Building a short lesson on enzyme kinetics");
});

// 🔴🔴 THE ONE THAT MATTERS. A model that says it is looking something up on a turn that bought no
// search has described a system that does not exist, and it is the most believable lie this field
// can carry — "I'll search for the latest figures" is exactly what a working product would say.
test("🔴 a plan that claims a search is dropped when no search was asked for", () => {
  for (const plan of [
    "Searching for the current guidance",
    "Looking up the latest figures",
    "I'll check the latest recommendations",
    "Browsing for a source",
    "Checking the current dose online",
  ]) {
    const read = readTurnDecision(turn({ needsWeb: false, plan, then: "study", topic: "x" }));
    assert.equal(read?.plan, null, `"${plan}" claimed a search on a turn that ran none`);
  }
});

// 🔴 A PLAN ON A TURN THAT CHANGES NOTHING IS A PLAN ABOUT NOTHING. `reply` leaves the page exactly
// as it was, so announcing an intention for it trains learners to stop reading the line — which
// costs the plan its value on the turns that genuinely need one.
test("🔴 a plain reply gets no plan", () => {
  const read = readTurnDecision(turn({ needsWeb: false, plan: "Answering your question", then: "reply" }));
  assert.equal(read?.plan, null);
});

// 🔴 AND IT CANNOT BECOME THE ANSWER. A model that writes its whole reply into this field would get
// it printed twice — once as a promise during the wait, once as prose underneath.
test("🔴 a plan longer than a line is refused whole", () => {
  const essay = "Building a lesson. ".repeat(20);
  assert.ok(essay.length > MAX_PLAN_LENGTH);
  assert.equal(readTurnDecision(turn({ needsWeb: false, plan: essay, then: "study" }))?.plan, null);
});

test("a missing or empty plan is null, not an empty string", () => {
  assert.equal(readTurnDecision(turn({ needsWeb: false, then: "study" }))?.plan, null);
  assert.equal(readTurnDecision(turn({ needsWeb: false, plan: "   ", then: "study" }))?.plan, null);
  assert.equal(readTurnDecision(turn({ needsWeb: false, plan: 42, then: "study" }))?.plan, null);
});

// 🔴 A SALVAGED TURN ANNOUNCED NOTHING, SO IT PROMISES NOTHING. `decisionOrReply` recovers an answer
// from a model that ignored the envelope entirely; inventing a plan there would be the product
// narrating on the model's behalf, which is the exact thing this field exists to avoid.
test("🔴 a turn recovered from plain prose carries no plan", async () => {
  const { decisionOrReply } = await import("./turn-router");
  assert.equal(decisionOrReply("Ethanol is CCO.")?.plan, null);
});

test("the model is told what a plan is for, and what it must not do", async () => {
  const { turnRouterMessages } = await import("./turn-router");
  const prompt = turnRouterMessages({
    context: {
      canvasTitle: "", demonstrated: 0, history: [], lessonInProgress: false, materialContext: "",
      objectives: 0, passages: 0, searchesLeft: 4, sources: 0, stagedPassage: "", today: "Monday", webContext: "",
    },
    utterance: "teach me kinetics",
  }).map((message) => message.content).join("\n");
  assert.match(prompt, /"plan"/, "the field is not in the schema the model is shown");
  assert.match(prompt, /what you are ABOUT to do/);
  assert.match(prompt, /Leave it null for anything you can simply answer/);
  assert.match(prompt, /never promise a step this turn has not asked for/);
});
