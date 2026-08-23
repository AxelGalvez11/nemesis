import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HISTORY_TURNS,
  decisionOrReply,
  readTurnDecision,
  stateBlock,
  turnRouterMessages,
  type TurnContext,
} from "./turn-router";

// What this file can and cannot prove.
//
// 🔴 IT CANNOT PROVE THAT `hello` IS UNDERSTOOD AS A GREETING. That is a claim about a model, and a
// unit test asserting it would either need a live call or would be testing a pure function that no
// longer decides anything — a guard that passes whatever the product does. The semantic behaviour
// is measured against the real model by `scripts/conversation-acceptance.ts`, which reports a per
// utterance pass rate rather than a green tick.
//
// 🔴 WHAT IT DOES PROVE is everything around that decision that IS deterministic: that the model is
// asked the right question with the right facts, that a decision is read faithfully, and — the
// part that matters most — that nothing here can invent a "study" the model did not ask for.

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  objectives: 0,
  passages: 0,
  sources: 0,
  today: "Tuesday, 18 August 2026",
  webContext: "",
};

// ── The packet ──────────────────────────────────────────────────────────────

test("the utterance stays distinct from course and web source context", () => {
  const messages = turnRouterMessages({
    context: {
      ...EMPTY,
      canvasTitle: "Hypertension",
      materialContext: "The lecture says target X.",
      webContext: "1. Current guidance says Y.",
    },
    sourceRule: "Course expects: …\nExternal/current evidence: …",
    utterance: "What do current guidelines say?",
  });
  const last = messages.at(-1);
  assert.equal(last?.role, "user");
  assert.doesNotMatch(last?.content ?? "", /target X|guidance says Y/);
  assert.ok(messages.some((m) => m.role === "system" && /ATTACHED COURSE/.test(m.content)));
  assert.ok(messages.some((m) => m.role === "system" && /PROVISIONAL EXTERNAL/.test(m.content)));
  assert.match(messages[0]?.content ?? "", /Course expects:/);
});

test("🔴 the action vocabulary rides with the utterance, so the model is told what each choice does", () => {
  const messages = turnRouterMessages({ context: EMPTY, utterance: "hello" });
  const last = messages.at(-1)?.content ?? "";
  assert.ok(last.startsWith("hello"), "the learner's own words are no longer first");
  assert.match(last, /"then"/, "the decision contract is missing");
  assert.match(last, /changes nothing on the page/, '"reply" is not described by what it does');
  assert.match(last, /takes over the canvas/, '"study" is not described by what it does');
});

test("🔴🔴 the model is told to prefer conversation when nothing was actually asked for", () => {
  // The single most load-bearing sentence in the prompt. Deleting it is how `hello` becomes a
  // lesson again, and nothing else in this suite would notice. It is SCOPED rather than a blanket
  // "when in doubt" — measured, the blanket version suppressed explicit teaching requests too.
  const last = turnRouterMessages({ context: EMPTY, utterance: "hello" }).at(-1)?.content ?? "";
  assert.match(last, /Decide in this order/);
  assert.match(last, /2\. Otherwise "reply"/);
  assert.match(last, /Starting a lesson for someone who said hello/);
});

test("🔴 the conversation rides as real alternating turns, not as a summary of one", () => {
  const messages = turnRouterMessages({
    context: {
      ...EMPTY,
      history: [
        { replied: "A dollar is a unit of account.", said: "what is a dollar" },
        { replied: "Because people accept it.", said: "why does paper have value" },
      ],
    },
    utterance: "why?",
  });
  const roles = messages.filter((m) => m.role !== "system").map((m) => `${m.role}:${m.content}`);
  assert.deepEqual(roles, [
    "user:what is a dollar",
    "assistant:A dollar is a unit of account.",
    "user:why does paper have value",
    "assistant:Because people accept it.",
    // The current turn, carrying the contract.
    roles.at(-1) ?? "",
  ]);
  assert.match(roles.at(-1) ?? "", /^user:why\?/);
});

test("a turn where Nemesis acted instead of speaking contributes only the learner's side", () => {
  const messages = turnRouterMessages({
    context: { ...EMPTY, history: [{ replied: "", said: "teach me glycolysis" }] },
    utterance: "keep going",
  });
  const conversational = messages.filter((m) => m.role === "assistant");
  assert.equal(conversational.length, 0, "an empty reply was sent to the model as a blank assistant turn");
});

test("the conversation is bounded", () => {
  const history = Array.from({ length: HISTORY_TURNS + 4 }, (_, i) => ({
    replied: `reply ${i}`,
    said: `turn ${i}`,
  }));
  const messages = turnRouterMessages({ context: { ...EMPTY, history }, utterance: "and?" });
  assert.ok(!messages.some((m) => m.content === "turn 0"), "an unbounded transcript is being sent");
  assert.ok(messages.some((m) => m.content === `turn ${HISTORY_TURNS + 3}`), "the newest turn was dropped");
});

// ── The state block ─────────────────────────────────────────────────────────

test("the state block states what the canvas holds", () => {
  const block = stateBlock({
    ...EMPTY,
    canvasTitle: "Pharmacokinetics",
    demonstrated: 3,
    lessonInProgress: true,
    objectives: 9,
    passages: 14,
    sources: 2,
  });
  assert.match(block, /"Pharmacokinetics"/);
  assert.match(block, /2 sources attached/);
  assert.match(block, /14 passages/);
  assert.match(block, /lesson is in progress/);
  assert.match(block, /3 of 9/);
});

test("🔴 the day is stated, because the model does not have one", () => {
  // Measured against the real model before this existed: "what day is it?" answered with a
  // confident, invented date. A listed acceptance case that is plausible and wrong.
  assert.match(stateBlock(EMPTY), /Today is Tuesday, 18 August 2026\./);
});

test("🔴🔴 an explicit ask to be taught is named as a case that is NOT in doubt", () => {
  // Measured 2026-08-18: 0 of 4 explicit learning requests started anything, because the state
  // block truthfully said no material was attached and the model read that as nothing to teach
  // from. Both sentences below are what changed that. Deleting either one reddens this.
  const last = turnRouterMessages({ context: EMPTY, utterance: "teach me innate immunity" }).at(-1)?.content ?? "";
  assert.match(last, /An empty canvas is not a reason to refuse/);
  // 🔴 STEP 1, WHICH IS WHY IT IS NUMBERED. It is settled before the question-back rule in step 2
  // is consulted; when the two were unordered maxims each fixed one direction and broke the other.
  assert.match(last, /1\. Did the learner[\s\S]*Then "study"/);
  assert.match(last, /do not ask which part first/);
});

test("an untouched canvas says so, which is what makes a first turn readable", () => {
  const block = stateBlock(EMPTY);
  assert.match(block, /No material attached yet/);
  assert.match(block, /has not begun teaching/);
  assert.ok(!/lesson is in progress/.test(block));
});

test("🔴 no internal action name leaks into the prompt", () => {
  // `retrieve` / `recognise` / `show_correction` are how a question is staged, not vocabulary the
  // model should be speaking back at us.
  const block = stateBlock({ ...EMPTY, lessonInProgress: true, objectives: 4 });
  for (const internal of ["retrieve", "recognise", "show_correction", "simplify", "contrast"]) {
    assert.ok(!block.includes(internal), `the prompt names the internal action "${internal}"`);
  }
});

// ── Reading the decision ────────────────────────────────────────────────────

test("a plain decision is read", () => {
  const read = readTurnDecision('{"say":"hey. what are you working on?","then":"reply","topic":null,"offer":null}');
  assert.deepEqual(read, {
    offer: null,
    question: null,
    say: "hey. what are you working on?",
    then: "reply",
    topic: null,
  });
});

test("a fenced decision is read", () => {
  const read = readTurnDecision('```json\n{"say":"alright.","then":"study","topic":"pharmacokinetics"}\n```');
  assert.equal(read?.then, "study");
  assert.equal(read?.topic, "pharmacokinetics");
  assert.equal(read?.say, "alright.");
});

test("🔴🔴 the contract says what `then` actually decides, and gives the checkable form of it", () => {
  // Measured in the browser: "I'm studying pharmacology" came back as a friendly clarifying
  // question AND `then: "study"`, which took the canvas over on turn 2 of the owner's own example.
  // The model was reading `then` as "is this about studying". Both sentences below are the fix.
  const last = turnRouterMessages({ context: EMPTY, utterance: "I'm studying pharmacology" }).at(-1)?.content ?? "";
  assert.match(last, /whether the canvas should change right now/);
  assert.match(last, /find yourself asking the learner a question back, that settles it/);
});

test("🔴 a topic is asked for on a plain reply too, because it gates the Learn this offer", () => {
  // The button under an answer used to appear whenever the turn had a question, which every turn
  // has — so a greeting came with an offer to learn "hello". Whether the turn NAMED something is a
  // different question, and it is the model's to answer.
  const last = turnRouterMessages({ context: EMPTY, utterance: "hello" }).at(-1)?.content ?? "";
  assert.match(last, /on a "reply" it is what a Learn this button beside the answer would start/);
  assert.match(last, /leave it null for a greeting/);
});

test("an offer is read only when it is one of the two things it can be", () => {
  assert.equal(readTurnDecision('{"say":"x","then":"reply","offer":"returning"}')?.offer, "returning");
  assert.equal(readTurnDecision('{"say":"x","then":"reply","offer":"confused"}')?.offer, null);
});

test("🔴🔴 an unrecognised action falls back to conversation, never to teaching", () => {
  // Calibration: change `then ?? "reply"` in turn-router.ts to `then ?? "study"` and this reddens
  // on its own. It is the same asymmetry the deleted classifier stated and then got backwards —
  // answering someone who wanted a lesson costs one turn; teaching someone who said hello does not.
  assert.equal(readTurnDecision('{"say":"hey","then":"teach"}')?.then, "reply");
  assert.equal(readTurnDecision('{"say":"hey"}')?.then, "reply");
});

test("🔴 text that is not a decision is not a decision", () => {
  assert.equal(readTurnDecision("hey, what are you working on?"), null);
  assert.equal(readTurnDecision("{}"), null);
  assert.equal(readTurnDecision(""), null);
});

test("🔴🔴 prose the model wrote instead of a decision is shown as the answer, and only as an answer", () => {
  // A model that ignored the envelope still answered the question, and throwing that away to show
  // an error would be strictly worse for the learner. What it must never do is start a lesson.
  const read = decisionOrReply("Hey. What are you working on?");
  assert.equal(read?.then, "reply");
  assert.equal(read?.say, "Hey. What are you working on?");
  assert.equal(decisionOrReply("   "), null);
});

test("🔴 nothing in this module can produce a study turn the model did not ask for", () => {
  // Every input that is not an explicit `"then":"study"` must come back as conversation. This is the
  // property the deleted `bare-topic => teach` rule violated by construction.
  const notStudy = [
    "hello",
    "innate immunity",
    "this sucks",
    '{"say":"ok"}',
    '{"say":"ok","then":"reply"}',
    '{"say":"ok","then":"START_LEARNING"}',
    '{"then":"studying"}',
  ];
  for (const raw of notStudy) {
    const read = decisionOrReply(raw);
    assert.notEqual(read?.then, "study", `"${raw}" was turned into a lesson`);
  }
  assert.equal(decisionOrReply('{"say":"alright.","then":"study"}')?.then, "study");
});

// ── Clarification rides the envelope, and never invents a turn ──────────────

test("a question is read alongside the action it parks, not instead of it", () => {
  // 🔴 `then` KEEPS ITS MEANING. The turn is still a "study"; it simply happens after one answer.
  // A `"clarify"` action would have made every consumer learn a third destination and then work out
  // which of the two real ones to run once the answer landed.
  const decision = readTurnDecision(JSON.stringify({
    question: {
      allowOther: true,
      id: "course-depth",
      options: [
        { description: "The major ideas.", id: "survey", label: "Overview" },
        { description: "Comparable to a college course.", id: "academic", label: "Academic" },
      ],
      prompt: "How deep should this course go?",
    },
    say: "One thing first.",
    then: "study",
    topic: "biology",
  }));
  assert.equal(decision?.then, "study");
  assert.equal(decision?.question?.id, "course-depth");
  assert.equal(decision?.question?.options.length, 2);
});

test("🔴🔴 a clarification on a \"reply\" turn is dropped — the gate is COST, not vagueness", () => {
  // Owner, 2026-08-22: it should ask when the result is a course structure, not for "throwaway
  // questions for a websearch". A reply produces a sentence; a sentence guessed wrong costs one
  // more turn. A study turn builds something the learner has to throw away to escape. So the
  // permission is tied to `then`, and it is enforced here rather than merely asked for in the
  // contract — asking is the cheapest way for a model to look careful, and one drifting sentence in
  // a long prompt is all it takes to put a card in front of "what is the half-life of caffeine".
  const ask = {
    options: [{ label: "Cell and molecular" }, { label: "Human biology" }],
    prompt: "Which kind of biology?",
  };

  const reply = readTurnDecision(JSON.stringify({
    question: ask,
    say: "Caffeine's half-life is about five hours.",
    then: "reply",
    topic: "caffeine",
  }));
  assert.equal(reply?.question, null, "a throwaway answer was held up by a card");
  // 🔴 AND THE TURN STILL RUNS. Dropping the question must never drop the answer with it.
  assert.equal(reply?.then, "reply");
  assert.match(reply?.say ?? "", /five hours/);

  const study = readTurnDecision(JSON.stringify({
    question: ask,
    say: "One thing first.",
    then: "study",
    topic: "biology",
  }));
  assert.equal(study?.question?.options.length, 2, "a course-shaped turn lost its question");
});

test("🔴 every turn without one carries question: null, so nothing parks by accident", () => {
  for (const raw of [
    JSON.stringify({ say: "Hello.", then: "reply", topic: null }),
    JSON.stringify({ question: null, say: "Right.", then: "study", topic: "immunity" }),
    JSON.stringify({ question: { prompt: "Which one?" }, say: "Right.", then: "study" }),
    JSON.stringify({ question: { options: [{ label: "Only one" }], prompt: "Which?" }, say: "Hi", then: "study" }),
  ]) {
    assert.equal(readTurnDecision(raw)?.question ?? null, null, `${raw} parked a turn`);
  }
});

test("🔴 a question alone is not a decision — a parked turn needs a turn behind it", () => {
  assert.equal(
    readTurnDecision(JSON.stringify({
      question: { options: [{ label: "A" }, { label: "B" }], prompt: "Which?" },
    })),
    null,
  );
});

test("🔴 prose never becomes a card", () => {
  // A model that answered in prose asked for nothing. Manufacturing a question from text nobody
  // parsed would park a turn behind a choice the model never offered.
  const decision = decisionOrReply("Overview, Academic or Deep — which would you like?");
  assert.equal(decision?.then, "reply");
  assert.equal(decision?.question, null);
});

test("the contract tells the model when NOT to ask, and caps how much it may ask", () => {
  const contract = turnRouterMessages({ context: EMPTY, utterance: "teach me Python" })
    .at(-1)?.content ?? "";
  assert.match(contract, /"question"/);
  assert.match(contract, /Use\s+null on nearly every turn/);
  assert.match(contract, /Ask at most one question/);
  assert.match(contract, /Two to four options/);
  // 🔴 THE COST GATE IS SPELLED OUT TO THE MODEL TOO, NOT ONLY ENFORCED BEHIND IT. A model that
  // believes it may ask on any turn writes cards that are silently binned, and the sentence it
  // wrote to introduce them ("One thing first.") arrives with nothing behind it.
  assert.match(contract, /ONLY EVER ASK ON A "study" TURN/);
  assert.match(contract, /half-life of caffeine/);
});
