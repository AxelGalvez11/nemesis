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
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  stagedPassage: "",
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
//
// 🔴🔴 THE FORMAT CHANGED ON 2026-08-20 AND THESE TESTS CHANGED WITH IT. The answer used to be a
// `say` STRING INSIDE the JSON object, where every backslash the model wrote had to be doubled —
// so `\frac` made JSON.parse refuse the entire decision and the raw envelope leaked onto the
// learner's screen. The decision is now a fenced block and the answer is everything outside it,
// which is what lets a reply contain real LaTeX and real SMILES.

/** A turn in the wire format: the decision block, then the answer. */
const turn = (decision: Record<string, unknown>, answer: string) =>
  "```json\n" + JSON.stringify(decision) + "\n```\n" + answer;

test("a plain decision is read", () => {
  const read = readTurnDecision(turn({ offer: null, then: "reply", topic: null }, "hey. what are you working on?"));
  // 🔴 `visuals` IS ALWAYS PRESENT AND USUALLY EMPTY, WHICH IS THE POINT OF A DEEP EQUAL HERE. A
  // turn that draws nothing must still produce a list, so every downstream reader can index into
  // it without a null check — the alternative is an optional field that is absent on the ordinary
  // path and therefore untested on it.
  //
  // 🔴 THE SAME ARGUMENT COVERS THE FOUR WEB FIELDS. A turn that did not ask for the web must say
  // so in the object rather than by omission, because the search loop reads `needsWeb` as its
  // condition and `undefined` there would end the loop for the wrong reason.
  //
  // 🔴 AND `milestones` JOINS THEM FOR THE SAME REASON, 2026-08-21. A turn that narrated nothing must
  // say so with an empty list: `undefined` would be indistinguishable from "the field has not
  // shipped yet" to every reader, and `previewWorthShowing` reads the length to decide whether this
  // turn gets a thinking preview at all. A greeting is exactly the turn that must not.
  assert.deepEqual(read, {
    milestones: [],
    needsWeb: false,
    say: "hey. what are you working on?",
    then: "reply",
    topic: null,
    visuals: [],
    webFreshness: null,
    webQuery: null,
    webResults: null,
  });
});

test("a study decision is read, and its answer comes from outside the block", () => {
  const read = readTurnDecision(turn({ then: "study", topic: "pharmacokinetics" }, "alright."));
  assert.equal(read?.then, "study");
  assert.equal(read?.topic, "pharmacokinetics");
  assert.equal(read?.say, "alright.");
});

test("🔴🔴 the contract says what `then` actually decides, and gives the checkable form of it", () => {
  // Measured in the browser: "I'm studying pharmacology" came back as a friendly clarifying
  // question AND `then: "study"`, which took the canvas over on turn 2 of the owner's own example.
  // The model was reading `then` as "is this about studying". Both sentences below are the fix.
  //
  // 🔴 THE SECOND ONE MOVED OUT OF STEP 2 ON 2026-08-21 AND THIS ASSERTION MOVED WITH IT. It read
  // "if you get here and find yourself asking the learner a question back" — and "if you get here"
  // was the defect: step 1 settles the explicit asks and never gets here, so the rule was absent
  // from exactly the turn that reproduced this same bug ("can you teach me a new language").
  // Matching on the checkable half of the sentence rather than on its old preamble is what lets
  // this guard keep proving the rule exists wherever it is stated.
  const last = turnRouterMessages({ context: EMPTY, utterance: "I'm studying pharmacology" }).at(-1)?.content ?? "";
  assert.match(last, /whether the canvas should change right now/);
  assert.match(last, /asking the learner a question back, "then" is "reply"/);
});

test("🔴 a topic is asked for on a plain reply too, because it gates the Learn this offer", () => {
  // The button under an answer used to appear whenever the turn had a question, which every turn
  // has — so a greeting came with an offer to learn "hello". Whether the turn NAMED something is a
  // different question, and it is the model's to answer.
  const last = turnRouterMessages({ context: EMPTY, utterance: "hello" }).at(-1)?.content ?? "";
  // 🔴 THE PHRASE MOVED WITH THE FEATURE. This pinned "what a Learn this button beside the answer
  // would start" — the offer was deleted on 2026-08-20 and the prompt kept describing it, which
  // only surfaced by grepping the LIVE bundle for "Learn this" after a deploy. A prompt is shipped
  // text that nothing renders, so nothing else could have caught it.
  assert.match(last, /it is what Nemesis would teach if the learner then asked to learn it/);
  assert.ok(!/Learn this/.test(last), "the prompt describes a button this product no longer has");
  assert.match(last, /leave it null for a greeting/);
});

test("🔴🔴 there is no `offer` field, and its removal is the finding", () => {
  // It named why a learner might be shown a "Learn this" button and rendered as one line above it.
  // That offer was deleted on 2026-08-20 and the whole chain behind it kept running for hours: the
  // model was still asked to compute `offer` every turn, this module still parsed it, the session
  // still stored it, and `offerLine` was still IMPORTED by learning-canvas.tsx and never called.
  //
  // 🔴 FOUND BY GREPPING THE LIVE BUNDLE, which is the only instrument that sees this. A prompt is
  // shipped text that nothing renders — no screenshot and no unit test looks at it — so a contract
  // describing a deleted button survives every check the product has.
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "hello" }).map((m) => m.content).join("\n");
  assert.ok(!/"offer"/.test(prompt), "the model is still being asked to compute a dead field");
  assert.ok(!/Learn this/.test(prompt), "the prompt still describes a button this product does not have");
  assert.ok(!("offer" in (readTurnDecision(turn({ then: "reply" }, "x")) ?? {})), "the decision still carries it");
});

test("🔴🔴 an unrecognised action falls back to conversation, never to teaching", () => {
  // Calibration: change `then ?? "reply"` in turn-router.ts to `then ?? "study"` and this reddens
  // on its own. It is the same asymmetry the deleted classifier stated and then got backwards —
  // answering someone who wanted a lesson costs one turn; teaching someone who said hello does not.
  assert.equal(readTurnDecision(turn({ then: "teach" }, "hey"))?.then, "reply");
  assert.equal(readTurnDecision(turn({}, "hey"))?.then, "reply");
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
    turn({}, "ok"),
    turn({ then: "reply" }, "ok"),
    turn({ then: "START_LEARNING" }, "ok"),
    turn({ then: "studying" }, "ok"),
    // 🔴 AND THE OLD FORMAT TOO. A model reaching for the retired shape must not be able to teach
    // by accident: `{"say":…,"then":"study"}` with no fence around it is not a decision any more.
    '{"say":"ok","then":"study"}',
  ];
  for (const raw of notStudy) {
    const read = decisionOrReply(raw);
    assert.notEqual(read?.then, "study", `"${raw}" was turned into a lesson`);
  }
  // ...and the positive case, so this cannot pass by refusing everything.
  assert.equal(decisionOrReply(turn({ then: "study" }, "alright."))?.then, "study");
});

test("🔴🔴🔴 the model IS told to write real LaTeX now, because the prose left the JSON", () => {
  // 🔴 THIS TEST HAS BEEN INVERTED TWICE AND BOTH INVERSIONS WERE EARNED, so the history stays.
  //
  // Reported: "i asked it to integrate x^2 but it only gave me the answer not a step by step
  // solution", then "what i need is for the math and any other things like chemistry to able to
  // render in the canvas".
  //
  // Round 1 — instruct `\(` delimiters. The model wrote `\int` and `\,` into the `say` STRING,
  // where they are invalid JSON escapes, so JSON.parse refused the whole decision and the raw
  // envelope leaked onto the screen. Round 2 — instruct `$$`. Same failure. Both were reverted and
  // a guard was written protecting the ABSENCE of any maths instruction.
  //
  // Round 3 is this one, and it removes the CAUSE rather than the symptom: the answer is no longer
  // inside the JSON object at all. Outside it there is no escaping to get wrong, so asking for
  // LaTeX is finally safe — and necessary, because told nothing the model substitutes Unicode
  // (∫x² dx), which reads correctly and is not typeset.
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "integrate x^2 dx" }).map((m) => m.content).join("\n");
  assert.match(prompt, /\$\$/, "the model is not told which math delimiter to use");
  assert.match(prompt, /outside the JSON/, "it is not told WHY the delimiter is safe, which is the part that changed");
  assert.ok(!/"say": "\.\.\."/.test(prompt), "the retired all-in-one-object format is back in the contract");
});


test("🔴🔴 a BROKEN envelope is never shown to the learner as the answer", () => {
  // 🔴 MEASURED, NOT IMAGINED. Driven in a browser, a turn whose JSON was broken by literal
  // newlines printed this on screen verbatim. No learner should ever read the word "topic" in a
  // reply. `decisionOrReply`'s "the prose IS the answer" rule is right for a model that IGNORED
  // the envelope and simply answered; it is exactly wrong for one that attempted it and mangled it.
  const broken = '{"say": "\n∫\n𝑥\n2\n,\n𝑑\n𝑥\n", "then": "reply", "topic": "integration", "visuals": []}';
  const read = decisionOrReply(broken);
  assert.ok(!read || !/"then"|"topic"/.test(read.say), `the envelope reached the learner: ${read?.say}`);
});

test("🔴 a recoverable sentence IS recovered rather than thrown away", () => {
  const broken = '{"say": "A mole is a counting unit, like a dozen but much bigger.", "then": "reply", "topic": ';
  assert.match(decisionOrReply(broken)?.say ?? "", /A mole is a counting unit/);
});

test("🔴🔴 plain prose is still passed straight through — that rule was right", () => {
  // The model that ignores the envelope and simply answers has still answered, and throwing that
  // away would be strictly worse for the learner. Only ATTEMPTED-and-mangled envelopes are caught.
  const prose = "A mole is a counting unit, like a dozen but much bigger.";
  assert.equal(decisionOrReply(prose)?.say, prose);
  // ...including prose that happens to be ABOUT JSON.
  const about = 'A JSON object looks like {"name": "value"} and is read by every language.';
  assert.equal(decisionOrReply(about)?.say, about);
});

test("🔴🔴 the contract shows the visuals field FILLED IN, never as an empty array", () => {
  // 🔴 THE EMPTY ARRAY WAS THE BUG, AND IT LOOKED LIKE DOCUMENTATION. The contract read
  // `"visuals": []` — in the highest-signal position in the whole prompt — and the model obliged on
  // every turn. Measured: asked to plot y = x², it wrote the answer, typeset the coordinates, put
  // `[figure 1]` in exactly the right place, and sent `visuals: []`. It had understood the marker
  // perfectly and been shown that the payload is empty.
  //
  // With one filled example in the same block: 1 figure, 14 painted marks.
  //
  // Calibration: put `"visuals": []` back and this reddens.
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "plot y = x squared" }).map((m) => m.content).join("\n");
  assert.ok(!/"visuals": \[\]/.test(prompt), "the visuals example is empty again; the model will copy it");
  assert.match(prompt, /"kind": "quantitative"/, "the contract no longer shows a figure being filled in");
  assert.match(prompt, /"points": \[\{"x":0,"y":0\}/, "the example does not show real points");
});

test("🔴 the answer is taken from OUTSIDE the block, on both sides of it", () => {
  // A model that writes a sentence, then the block, then the rest is describing one answer in two
  // halves. Dropping either loses part of it.
  const read = readTurnDecision('Here it is.\n```json\n{"then":"reply"}\n```\nAnd the working follows.');
  assert.match(read?.say ?? "", /Here it is\./);
  assert.match(read?.say ?? "", /And the working follows\./);
});

test("🔴🔴 LaTeX in the answer survives, because it is no longer inside a JSON string", () => {
  // The whole point of the format. `\int` and `\,` are invalid JSON escapes; out here they are just
  // characters, and AssistantMarkdown's rehype-katex typesets them.
  // Calibration: this is the exact string a model produced in a browser on 2026-08-20.
  const raw = '```json\n{"then":"reply","topic":"integration"}\n```\n$$\\int x^2 \\, dx = \\frac{x^3}{3} + C$$';
  const read = readTurnDecision(raw);
  assert.equal(read?.then, "reply");
  assert.match(read?.say ?? "", /\\int x\^2 \\, dx = \\frac\{x\^3\}\{3\} \+ C/, "the LaTeX did not survive");
});

test("🔴🔴 the model is told never to draw a picture out of characters", () => {
  // 🔴 MEASURED ON PRODUCTION, and the model's own closing line is the evidence. Asked to show the
  // structure of ethanol it drew an ASCII diagram in a code block and finished with "if you want it
  // as a proper structural diagram in the canvas, just say the word."
  //
  // It knew the real channel existed and picked characters anyway — so this was never a capability
  // gap, and describing [smiles: …] more clearly would not have caught it. The missing instruction
  // was the NEGATIVE one. Calibration: delete the clause and this reddens.
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "show me ethanol" }).map((m) => m.content).join("\n");
  assert.match(prompt, /Never draw a picture out of text characters/);
  assert.match(prompt, /ASCII diagrams/);
  // ...and code fences are explicitly still allowed, or this instruction would cost the product
  // every real snippet it prints.
  assert.match(prompt, /A code fence is for code and notation/);
  // 🔴 AND THE ONE CASE THAT MUST BE UNAMBIGUOUS. The first version aimed at the code FENCE and the
  // model simply put the ASCII art in prose instead — where the characters sit was never the point.
  // 🔴 REPOINTED after the owner's correction, 2026-08-20: *"dont add hardcoded instructions, make
  // sure prompt instructions drive behavior so deepseek handles the judgement."* The instruction
  // used to name four nouns — molecule, structure, functional group, compound — which is a keyword
  // list living in a prompt instead of in an `if`. It now names the CHANNEL and the intent and
  // leaves "is this a request to see something" where judgements about language belong.
  assert.match(prompt, /you MUST draw it with/, "the drawing instruction lost its force, which measured as a regression");
  assert.ok(!/a molecule, a structure, a functional group or a compound/.test(prompt), "the hardcoded noun list is back");
  assert.ok(!/half a dozen|most important half/.test(prompt), "a quota for how many drawings to make is back");
});

test("🔴🔴 a model that put its answer back INSIDE the object is not thrown away", () => {
  // 🔴 REPRODUCED ON PRODUCTION, 2026-08-20: "draw the functional groups" returned "Nemesis had
  // nothing to add." on one run out of two, with an empty canvas behind it.
  //
  // A regression from the format change of the same day. `say` used to live inside this object and
  // the model has years of habit saying so; when it writes the block with a `say` field and nothing
  // after it, the prose outside is empty and the reply branch reports having nothing to add — while
  // the answer sits in the field right there.
  const read = readTurnDecision('```json\n{"say":"Alcohols carry a hydroxyl group.","then":"reply","topic":"functional groups"}\n```');
  assert.equal(read?.say, "Alcohols carry a hydroxyl group.");
  assert.equal(read?.topic, "functional groups");
});

test("🔴 but prose OUTSIDE the block still wins, because that is the contract", () => {
  // The fallback recovers a turn that would be discarded; it does not make the old shape a second
  // supported format. LaTeX inside `say` is still mangled by JSON escaping, which is the whole
  // reason the contract moved.
  const read = readTurnDecision('```json\n{"say":"the old field","then":"reply"}\n```\nthe real answer');
  assert.equal(read?.say, "the real answer");
});

test("🔴 a decision with no answer anywhere is still refused", () => {
  // Otherwise this fallback would turn "the model said nothing" into a blank reply on screen.
  assert.equal(readTurnDecision('```json\n{"topic":"x"}\n```'), null);
});

// ── 🔴 searching until it has enough, rather than once with a guess ──────────
//
// Owner: *"deepseek should decide itself when it has enough information to answer."* A single
// upfront count was still a bet made blind — nothing has been read at the moment it is chosen. So
// the packet has to let the model say "not yet", and has to tell it how much rope is left.

test("with results in hand, the model is told it may search again", () => {
  const packet = turnRouterMessages({
    context: { ...EMPTY, searchesLeft: 3, webContext: "1. A page\nURL: https://a.test" },
    utterance: "has that guideline been revised?",
  });
  const state = packet.map((message) => message.content).join("\n");
  assert.match(state, /You may run 3 more searches/);
  // And the contract says what "again" is FOR, so a second search is aimed rather than reflexive.
  assert.match(state, /Say true AGAIN, with a different webQuery/);
  assert.match(state, /Stop as soon as you can answer properly/);
});

test("one search left is not phrased as 'searches'", () => {
  const packet = turnRouterMessages({
    context: { ...EMPTY, searchesLeft: 1, webContext: "1. A page" },
    utterance: "why?",
  });
  assert.match(packet.map((message) => message.content).join("\n"), /run 1 more search this turn/);
});

// 🔴 THE LAST ROUND MUST SAY SO, NOT GO QUIET. A model cut off without warning has already spent
// its final search on a query it thought was one of several; a model that knows says what it could
// not settle instead of implying it looked everywhere.
test("with no searches left the packet says so and asks for the gap to be named", () => {
  const packet = turnRouterMessages({
    context: { ...EMPTY, searchesLeft: 0, webContext: "1. A page" },
    utterance: "why?",
  });
  const state = packet.map((message) => message.content).join("\n");
  assert.match(state, /no further search is available this turn/);
  assert.match(state, /say plainly what it did not settle/);
});

// Before any search has run there is nothing to report, and the packet must not talk about
// results that do not exist.
test("a first pass says nothing about earlier searches", () => {
  const packet = turnRouterMessages({ context: { ...EMPTY, searchesLeft: 4 }, utterance: "hello" });
  assert.doesNotMatch(packet.map((message) => message.content).join("\n"), /earlier searches/);
});

/** The contract as the model receives it: the tail of the last user message. */
const DECISION_CONTRACT_TEXT = (() => {
  const messages = turnRouterMessages({ context: EMPTY, utterance: "x" });
  return messages.at(-1)?.content ?? "";
})();

// ── "teach me a new language" — measured in a browser, 2026-08-21 ────────────────────────────
//
// Owner: *"i asked it can you teach me a new language and it did an unneccesary web search and
// then it started fadeing between the two screens i attached."* One routing mistake produced all
// of it: the model chose "study" with the topic "new language learning", so the canvas was
// retitled, `needsGrounding` searched the web for that phrase, two marketing pages for a language
// app were ingested as study material, and the lesson built from them was a pricing page's list of
// languages. The model ALSO asked which language — so the learner ended up looking at a lesson it
// had started and a question it had asked, stacked, with one composer pointing at both.
//
// These are guards on the CONTRACT rather than on the model, which is the only half that is pure.
// What the model actually does with them is `scripts/conversation-acceptance.ts`'s job.

test("🔴🔴 step 1 exempts a category with no member chosen, and only that", () => {
  // The rule it carves out of is right and must survive: asked to teach a real subject, however
  // broad, the model must not ask the learner to narrow it down.
  assert.match(DECISION_CONTRACT_TEXT, /do not ask which part first and do not ask them to narrow it down/);
  assert.match(DECISION_CONTRACT_TEXT, /named a CATEGORY but not a member of it/);
  assert.match(DECISION_CONTRACT_TEXT, /a real subject, however broad, is still "study"/);
  // 🔴 IT SAYS WHY, IN TERMS OF WHAT HAPPENS. "Nemesis goes and finds material on the subject you
  // name" is the fact that makes choosing one for them expensive rather than merely premature.
  assert.match(DECISION_CONTRACT_TEXT, /starts a different lesson/);
});

test("🔴 and it names no field, no discipline and no example category", () => {
  // A list of category words would only ever cover the ones I thought of, and would make the rule
  // false for a trade, a language, a statute and a metallurgy course in different ways.
  const exception = DECISION_CONTRACT_TEXT.slice(DECISION_CONTRACT_TEXT.indexOf("One exception"));
  const clause = exception.slice(0, exception.indexOf("2. Otherwise"));
  assert.doesNotMatch(clause, /\b(?:language|law|case|drug|history|nursing|engineering|pharmacolog)\w*\b/i);
});

test("🔴🔴 the never-both rule applies to every step, not just the last one", () => {
  // As the tail of step 2 it was unreachable exactly when it mattered: step 1 settles the explicit
  // asks and never consults step 2. This is the whole reason one turn did both.
  const both = DECISION_CONTRACT_TEXT.indexOf("cannot ask someone what they want and take the screen over");
  assert.ok(both > -1, "the rule is gone entirely");
  assert.ok(
    both > DECISION_CONTRACT_TEXT.indexOf("2. Otherwise"),
    "the rule sits inside a numbered step again, so an earlier step will skip it",
  );
  assert.match(DECISION_CONTRACT_TEXT, /This holds whatever you chose above/);
});

// ── How recent the pages have to be ─────────────────────────────────────────────────────────
//
// Owner, 2026-08-21: *"let the model pick freshness."* Brave has had this filter the whole time
// and nothing in this product had ever set it, so a question about this week was answered from
// pages of any age. The vocabulary is validated in the search function — these guard the half that
// is ours: that the model is told the field exists, told when it is WRONG to use, and that a
// window without a search is dropped like the query and the count already are.

test("🔴 the freshness window is offered to the model, with its real vocabulary", () => {
  assert.match(DECISION_CONTRACT_TEXT, /"webFreshness"/);
  for (const code of ["pd", "pw", "pm", "py"]) {
    assert.ok(DECISION_CONTRACT_TEXT.includes(`"${code}"`), `${code} is not offered`);
  }
});

test("🔴🔴 and it is told when NOT to use one, which is the expensive half", () => {
  // A model given a filter and no reason to withhold it will filter everything, and a narrow
  // window on a settled question hides the source that actually explains it. The instruction that
  // matters is the negative one.
  assert.match(DECISION_CONTRACT_TEXT, /would be WRONG rather than merely less interesting/);
  assert.match(DECISION_CONTRACT_TEXT, /When in doubt, null/);
});

test("🔴 a window without a search is dropped, like the query and the count", () => {
  assert.equal(readTurnDecision(turn({ needsWeb: true, then: "reply", webFreshness: "pw" }, "x"))?.webFreshness, "pw");
  assert.equal(readTurnDecision(turn({ needsWeb: false, then: "reply", webFreshness: "pw" }, "x"))?.webFreshness, null);
  assert.equal(readTurnDecision(turn({ then: "reply" }, "x"))?.webFreshness, null);
});

test("🔴 nothing here checks the window against a list — that fact belongs to the provider", () => {
  // Deliberate: a second copy of Brave's vocabulary in this file is a second thing to update the
  // day Brave adds a value, and the two would drift. `readFreshness` in the search function drops
  // what Brave will not take, so an invented window becomes no filter rather than a live parameter
  // that quietly does nothing.
  assert.equal(
    readTurnDecision(turn({ needsWeb: true, then: "reply", webFreshness: "last_week" }, "x"))?.webFreshness,
    "last_week",
  );
});

console.log("turn-router.test.ts OK");

// 🔴🔴 THE THIRD REPORT OF THE SAME SYMPTOM HAD A DIFFERENT CAUSE FROM THE FIRST TWO, AND THAT IS
// why this test exists beside the ASCII-art one rather than inside it. Twice the fix was about
// FORCE — the model knew the channel and chose characters, so the prompt gained a negative rule and
// then an imperative. Reported a third time on 2026-08-21 ("nemesis is still not using smiles …
// asking 'show me basic functional groups' should indicate that user wants to see the structure"),
// force was no longer the missing thing: the model cannot draw what it cannot write, and nothing
// had ever told it how to write a group with an open bond.
//
// `R-OH` is what a chemist writes and what a model reaches for. It clears every check this codebase
// makes and then throws inside smiles-drawer, where no instruction can learn from it. `*O` draws.
// Calibration: delete the clause and this reddens.
test("🔴 the reply prompt teaches the attachment point, so a functional group is drawable at all", () => {
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "show me basic functional groups" })
    .map((message) => message.content)
    .join("\n");
  assert.match(prompt, /open attachment point/, "the model is not told how to write a generic group");
  assert.match(prompt, /\[smiles: \*O\]/, "the worked example went missing");
  assert.match(prompt, /"R" is not a SMILES atom/, "the negative half is what stops R-OH being written");
});

// 🔴🔴 §45's COMPUTATION LAYER WAS BUILT, HARDENED, TESTED, MERGED — AND UNREACHABLE FOR TWO DAYS,
// because nothing told the model it could write a formula. This is the same failure as the visual
// vocabulary naming three renderers out of nine, and the same failure as chemistry never being told
// about `*`: a capability nobody is told about is indistinguishable from one that was never built.
// Calibration: delete the clause and this reddens.
test("🔴 the reply prompt offers the computed-plot channel, or nothing can reach it", () => {
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "plot sin x from 0 to 2 pi" })
    .map((message) => message.content)
    .join("\n");
  assert.match(prompt, /may give a FORMULA instead of points/, "the model cannot reach the curve builder");
  assert.match(prompt, /"expression":"sin\(x\)"/, "the worked example went missing");
  assert.match(prompt, /"distribution"/, "distributions are built and would be unreachable");
  // 🔴 AND THE ALLOW LIST IS STATED RATHER THAN LEFT TO BE DISCOVERED. A model that reaches for
  // `integrate(...)`, gets no curve and is told nothing concludes that plotting does not work —
  // which is exactly how chemistry lost three reports to `R-OH`.
  for (const fn of ["sqrt", "ln", "tanh"]) assert.ok(prompt.includes(fn), `${fn} left the stated allow list`);
});

// 🔴🔴 §42's RULE — "where a name exists, the name is resolved" — HAD NO OBEDIENT CALLER UNTIL THE
// model was told the channel existed. A wrong plot looks wrong; a wrong molecule looks like
// chemistry, which is why this one is worth a guard of its own.
test("🔴 the reply prompt prefers a lookup over recall for a named compound", () => {
  const prompt = turnRouterMessages({ context: EMPTY, utterance: "show me aspirin" })
    .map((message) => message.content)
    .join("\n");
  assert.match(prompt, /\[compound: aspirin\]/, "the model cannot reach the resolver");
  assert.match(prompt, /more reliable than notation recalled from memory/, "the reason went missing");
  // 🔴 AND THE OTHER CHANNEL SURVIVES, because a generic group has no name to look up. Losing this
  // would undo the fix that made functional groups drawable in the first place.
  assert.match(prompt, /Use \[smiles: …\] for generic groups/, "the wildcard channel was pushed aside");
});

// ───────────────────────────────────────────────── the model is told it can be HEARD
//
// 🔴🔴 A CAPABILITY THE MODEL IS NOT TOLD ABOUT DOES NOT EXIST, HOWEVER COMPLETELY IT IS BUILT.
// That sentence is already in this file's history once, about `[figure n]`. §43's router and §47's
// Azure catalogue were unreachable for the same reason: nothing told the one participant that
// writes the sentence that it could mark one to be spoken.

test("🔴 the model is told it can mark a sentence to be heard, and in which variety", () => {
  const system = turnRouterMessages({ context: EMPTY, utterance: "how do I say hello in Spanish?" })[0]?.content ?? "";
  assert.match(system, /\[say: es-MX \| Buenos días\]/, "the exact token form is missing");
  assert.match(system, /BCP-47/, "nothing tells it what shape the tag takes");
});

test("🔴 naming the variety is stated as load-bearing, not as a formatting detail", () => {
  const system = turnRouterMessages({ context: EMPTY, utterance: "hello" })[0]?.content ?? "";
  assert.match(system, /no way to hear that they got the wrong one/);
});

test("🔴 it names the channel rather than a list of disciplines", () => {
  // The same correction the drawing instruction already took: a prompt that listed languages would
  // be a discipline hardcoded into a prompt, which CLAUDE.md's field-agnostic rule forbids outright.
  const system = turnRouterMessages({ context: EMPTY, utterance: "hello" })[0]?.content ?? "";
  assert.match(system, /how something SOUNDS is part of what you are teaching/);
  assert.match(system, /not a language-lesson feature/);
});

test("the model is told what must NOT go inside the token, because a synthesiser reads it literally", () => {
  const system = turnRouterMessages({ context: EMPTY, utterance: "hello" })[0]?.content ?? "";
  assert.match(system, /no quotation marks, no translation/);
});
