import assert from "node:assert/strict";
import test from "node:test";

import {
  autoTagTargets,
  buildAutoTagMessages,
  explainCardContext,
  explainQuestionContext,
  explainTranscript,
  parseRevisedCard,
  parseRevisedQuestion,
  reviseCardMessages,
  reviseQuestionMessages,
  explainSeedMessages,
  isLeechCard,
  LEECH_LAPSES,
  parseAutoTags,
  previewAutoTags,
  stripClozeMarkers,
} from "./study-ai-extras";

test("leech threshold matches Anki's default", () => {
  assert.equal(LEECH_LAPSES, 8);
  assert.equal(isLeechCard({ lapses: 7 }), false);
  assert.equal(isLeechCard({ lapses: 8 }), true);
});

test("cloze markers strip down to their answers", () => {
  assert.equal(stripClozeMarkers("{{c1::ACE}} inhibitors block {{c2::kininase::enzyme}}"), "ACE inhibitors block kininase");
  assert.equal(stripClozeMarkers("no cloze here"), "no cloze here");
});

test("card context carries both sides without cloze noise", () => {
  const context = explainCardContext({ back: "bradykinin builds up", front: "{{c1::Lisinopril}} causes cough" });
  assert.ok(context.includes("Flashcard front: Lisinopril causes cough"));
  assert.ok(context.includes("Flashcard back: bradykinin builds up"));
  const oneSided = explainCardContext({ back: "", front: "{{c1::ACE}} inhibitors" });
  assert.ok(oneSided.includes("the answer is inside the front text"));
});

test("question context labels the correct option and a wrong pick", () => {
  const context = explainQuestionContext({
    answerIndex: 2,
    options: ["Aspirin", "No anticoagulation", "Start a DOAC", "Warfarin"],
    pickedIndex: 1,
    q: "Next step for a CHA2DS2-VASc of 3?",
  });
  assert.ok(context.includes("C. Start a DOAC (correct)"));
  assert.ok(context.includes("B. No anticoagulation (the student's pick)"));
  assert.match(context, /tempting but wrong/);
  const rightFirstTry = explainQuestionContext({ answerIndex: 0, options: ["a", "b"], pickedIndex: 0, q: "q" });
  assert.ok(rightFirstTry.includes("A. a (correct, the student's pick)"));
  assert.doesNotMatch(rightFirstTry, /tempting but wrong/);
});

// Owner 2026-08-04: "make it be a dynamic answer not hardcoded format." The
// prompt must NOT march every item through a fixed template — that is the
// exact complaint this revision fixes — while keeping the standing values:
// simple technical English (owner 2026-07-28), field-agnostic, no invention.
test("the explain prompt adapts its shape instead of forcing a template", () => {
  const [system, seed] = explainSeedMessages("Flashcard front: f\nFlashcard back: b");
  assert.ok(system);
  assert.ok(seed?.content.endsWith("Explain this to me."));
  assert.match(system.content, /the way THIS item needs explaining/);
  assert.match(system.content, /Do not follow a fixed template/);
  assert.doesNotMatch(system.content, /\(1\)|\(2\)|\(3\)|\(4\)/);
  // Follow-ups are first-class now — the mini side chat is a conversation.
  assert.match(system.content, /follow-up questions/i);
});

test("the explain prompt keeps the technical terms and stays field-agnostic", () => {
  const [system] = explainSeedMessages("x");
  assert.ok(system);
  // "Simple technical English" is not "simple English": the term is what the
  // exam asks for, so the language AROUND it is what gets simplified.
  assert.match(system.content!, /KEEP the technical terms/);
  assert.match(system.content!, /plain words/);
  // The app serves a law student and a mech-eng student too — the old prompt
  // said "health-sciences student" and biased every analogy toward medicine.
  assert.doesNotMatch(system.content!, /health[- ]sciences/i);
  assert.match(system.content!, /law, engineering, medicine/);
  assert.match(system.content!, /never invent a fact/);
});

test("auto-tag targets only untagged cards, capped", () => {
  const cards = Array.from({ length: 70 }, (_, index) => ({ id: `c${index}`, tags: index % 2 === 0 ? [] : ["done"] }));
  const targets = autoTagTargets(cards);
  assert.equal(targets.length, 35);
  assert.ok(targets.every((card) => card.tags.length === 0));
  const capped = autoTagTargets(Array.from({ length: 70 }, (_, index) => ({ id: `c${index}`, tags: [] })));
  assert.equal(capped.length, 60);
});

test("auto-tag prompt lists every card id", () => {
  const messages = buildAutoTagMessages([
    { back: "beta blocker", front: "Metoprolol", id: "card-1" },
    { back: "loop diuretic", front: "{{c1::Furosemide}}", id: "card-2" },
  ]);
  assert.ok(messages[1]?.content.includes("card-1\tMetoprolol"));
  assert.ok(messages[1]?.content.includes("card-2\tFurosemide"));
  assert.ok(messages[1]?.content.includes('{"tags":'));
});

test("auto-tag replies parse tolerantly and filter to known ids", () => {
  const reply = '```json\n{"tags":{"card-1":["#Beta-Blockers","cardio","extra","fourth"],"card-9":["ignored"],"card-2":[]}}\n```';
  const parsed = parseAutoTags(reply, ["card-1", "card-2"]);
  assert.deepEqual(parsed.get("card-1"), ["beta-blockers", "cardio", "extra"]);
  assert.equal(parsed.has("card-9"), false);
  assert.equal(parsed.has("card-2"), false);
  assert.equal(parseAutoTags("no json at all", ["card-1"]).size, 0);
  const bare = parseAutoTags('{"card-1":["renal"]}', ["card-1"]);
  assert.deepEqual(bare.get("card-1"), ["renal"]);
});

test("preview auto-tags are deterministic and non-empty", () => {
  const cards = [
    { back: "", front: "Metoprolol blocks beta-1", id: "a" },
    { back: "", front: "{{c1::Furosemide}} acts on the loop", id: "b" },
  ];
  const first = previewAutoTags(cards);
  assert.deepEqual(first.get("a"), ["metoprolol"]);
  assert.deepEqual(first.get("b"), ["furosemide"]);
  assert.deepEqual(previewAutoTags(cards), first);
});

test("revise messages carry the item, the conversation, and the strict-JSON contract", () => {
  const question = reviseQuestionMessages({ answer: 2, options: ["A", "B", "C"], q: "Which?", transcript: "Student: make it harder" });
  assert.equal(question[0]!.role, "system");
  assert.match(question[0]!.content, /fenced ```json/);
  assert.match(question[1]!.content, /"q":"Which\?"/);
  assert.match(question[1]!.content, /make it harder/);
  assert.match(question[1]!.content, /complete replacement/);
  const card = reviseCardMessages({ back: "b", front: "f", transcript: "" });
  assert.match(card[1]!.content, /improve the card's accuracy and clarity/);
  assert.match(card[1]!.content, /cloze markers/);
});

test("🔴🔴 a card revision says whether the learner told us what was wrong", () => {
  // TWO DOORS, AND THE MODEL MUST BE ABLE TO TELL THEM APART. Thumbs-down sends no note ("this card
  // is bad, work out why"); the note box sends one ("the answer is wrong, it is the neutral axis").
  // Sending the second as if it were the first is how a precise complaint becomes a vague rewrite.
  const guessing = reviseCardMessages({ back: "b", front: "f", transcript: "" });
  assert.match(guessing[1]!.content, /did not say what is wrong/, "a note-less rewrite does not admit it is guessing");
  assert.doesNotMatch(guessing[1]!.content, /must act on/, "an absent note is presented as an instruction");

  const told = reviseCardMessages({ back: "b", front: "f", note: "  the answer is the neutral axis  ", transcript: "" });
  assert.match(told[1]!.content, /the answer is the neutral axis/, "the learner's words never reached the model");
  assert.match(told[1]!.content, /instruction, which is what you must act on/, "the note is not marked as the thing to act on");
  assert.doesNotMatch(told[1]!.content, /did not say what is wrong/, "the model is told both that it has a note and that it has none");
  // 🔴 THE NOTE COMES LAST. Models follow the last clear instruction, and a note buried above the
  // card JSON reads as background rather than as the ask.
  assert.ok(told[1]!.content.indexOf("neutral axis") > told[1]!.content.indexOf('"front"'), "the note is buried above the card");

  // Whitespace-only is not an instruction; it is somebody pressing send on an empty box.
  assert.match(reviseCardMessages({ back: "b", front: "f", note: "   ", transcript: "" })[1]!.content, /did not say what is wrong/);
});

test("explainTranscript labels the two voices", () => {
  const text = explainTranscript([
    { role: "assistant", text: "Because X." },
    { role: "user", text: "Make it harder." },
  ]);
  assert.equal(text, "Coach: Because X.\n\nStudent: Make it harder.");
});

test("parseRevisedQuestion accepts a complete item and rejects anything less", () => {
  const good = parseRevisedQuestion('```json\n{"q":"New?","options":["one","two","three"],"answer":1,"why":"Because."}\n```');
  assert.deepEqual(good, { answer: 1, options: ["one", "two", "three"], q: "New?", why: "Because." });
  const prose = parseRevisedQuestion('Here you go: {"q":"New?","options":["one","two"],"answer":0,"why":""}');
  assert.equal(prose?.q, "New?");
  assert.equal(parseRevisedQuestion('{"q":"","options":["one","two"],"answer":0,"why":""}'), null);
  assert.equal(parseRevisedQuestion('{"q":"x","options":["only"],"answer":0,"why":""}'), null);
  assert.equal(parseRevisedQuestion('{"q":"x","options":["a","b"],"answer":2,"why":""}'), null);
  assert.equal(parseRevisedQuestion('{"q":"x","options":["a","b"],"answer":"0","why":""}'), null);
  assert.equal(parseRevisedQuestion("not json"), null);
});

test("parseRevisedCard needs a front and keeps an empty back", () => {
  assert.deepEqual(parseRevisedCard('```json\n{"front":"F","back":"B"}\n```'), { back: "B", front: "F" });
  assert.deepEqual(parseRevisedCard('{"front":"F","back":""}'), { back: "", front: "F" });
  assert.equal(parseRevisedCard('{"front":"","back":"B"}'), null);
  assert.equal(parseRevisedCard("nope"), null);
});
