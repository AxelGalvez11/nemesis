import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readDeliverableAsk, readResearchAsk } from "../learn/canvas-deliverables";

// When a turn becomes a five-minute, twelve-search research run instead of an answer.
//
// Both mistakes are expensive and they are expensive in opposite directions. Missing a real
// research ask wastes nothing but disappoints; firing on an ordinary question spends real money and
// five minutes of somebody's time on a two-line answer they wanted immediately.

test("an explicit research verb starts a run, and carries the topic", () => {
  assert.equal(readResearchAsk("research the commerce clause"), "the commerce clause");
  assert.equal(readResearchAsk("Research: how tariffs changed after 2018"), "how tariffs changed after 2018");
  assert.equal(readResearchAsk("do a deep dive on beam deflection methods"), "beam deflection methods");
  assert.equal(readResearchAsk("can you look into the causes of the Bronze Age collapse"), "the causes of the Bronze Age collapse");
  assert.equal(readResearchAsk("please investigate lithium supply chain constraints"), "lithium supply chain constraints");
  assert.equal(readResearchAsk("dig into what the evidence says about spaced repetition"), "what the evidence says about spaced repetition");
});

test("🔴 an ordinary question is NOT a research ask", () => {
  // This is the guard that keeps the feature from taking over the product. A learner typing a
  // question wants an answer now; five minutes and a dozen searches is the same failure as not
  // listening. They have to actually say the word.
  for (const said of [
    "why did the Roman Republic fall",
    "what is the commerce clause",
    "explain beam deflection to me",
    "teach me thermodynamics",
    "how does a four-stroke engine work",
    "summarise this lecture",
  ]) {
    assert.equal(readResearchAsk(said), null, `"${said}" was turned into a research run`);
  }
});

test("🔴 a question ABOUT researching is not an instruction to research", () => {
  // The same trap readDeliverableAsk documents: "how do I make a good presentation" wants teaching.
  for (const said of [
    "how do I research a topic properly",
    "what research methods should I use",
    "why is research so hard to start",
  ]) {
    assert.equal(readResearchAsk(said), null, `"${said}" was read as an order`);
  }
});

test("a research verb with nothing after it does nothing", () => {
  assert.equal(readResearchAsk("research"), null);
  assert.equal(readResearchAsk("research it"), null, "too short to be a topic");
  assert.equal(readResearchAsk("look into"), null);
  assert.equal(readResearchAsk(""), null);
});

test("🔴 the two parsers do not fight over the same sentence", () => {
  // "Research X and make me slides" is an order to go and find things out. Building a deck from an
  // empty canvas instead produces a confident presentation about nothing, so research wins, and
  // use-canvas-session checks it first.
  const both = "research the Gracchi and make me slides";
  assert.ok(readResearchAsk(both), "the research ask stopped being recognised");
  assert.equal(readDeliverableAsk(both), "slides", "both still match, which is why order matters");

  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  const researchAt = session.indexOf("readResearchAsk(said)");
  const deliverableAt = session.indexOf("readDeliverableAsk(said)");
  assert.ok(researchAt > 0 && deliverableAt > 0, "one of the parsers is no longer called");
  assert.ok(researchAt < deliverableAt, "🔴 research must be checked BEFORE the artifact ask");
});

test("a plain artifact ask is untouched by the research parser", () => {
  assert.equal(readResearchAsk("make me slides about photosynthesis"), null);
  assert.equal(readDeliverableAsk("make me slides about photosynthesis"), "slides");
});
