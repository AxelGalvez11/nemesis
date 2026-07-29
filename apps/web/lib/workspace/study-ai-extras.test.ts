import assert from "node:assert/strict";
import test from "node:test";

import {
  autoTagTargets,
  buildAutoTagMessages,
  buildExplainMessages,
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

test("explain messages carry both sides without cloze noise", () => {
  const messages = buildExplainMessages({ back: "bradykinin builds up", front: "{{c1::Lisinopril}} causes cough" });
  assert.equal(messages.length, 2);
  assert.ok(messages[1]?.content.includes("Front: Lisinopril causes cough"));
  assert.ok(messages[1]?.content.includes("Back: bradykinin builds up"));
  const oneSided = buildExplainMessages({ back: "", front: "{{c1::ACE}} inhibitors" });
  assert.ok(oneSided[1]?.content.includes("the answer is inside the front text"));
});

// Owner 2026-07-28: "research skills for ai for better mnemonics, analogies,
// explanations should be in simple technical english." The four moves are the
// whole point of the prompt, so they are pinned here rather than left to drift.
test("the explain prompt asks for meaning, mechanism, analogy and an optional hook", () => {
  const [system] = buildExplainMessages({ back: "b", front: "f" });
  assert.ok(system);
  assert.match(system.content, /what the answer MEANS/);
  assert.match(system.content, /explain WHY it is true/);
  assert.match(system.content, /ONE concrete analogy/);
  assert.match(system.content, /ONE memory hook only if a genuinely good one exists/);
  // A forced mnemonic is one more thing to memorise — skipping must be allowed.
  assert.match(system.content, /skip this step entirely/);
});

test("the explain prompt keeps the technical terms and stays field-agnostic", () => {
  const [system] = buildExplainMessages({ back: "b", front: "f" });
  assert.ok(system);
  // "Simple technical English" is not "simple English": the term is what the
  // exam asks for, so the language AROUND it is what gets simplified.
  assert.match(system.content!, /KEEP the technical terms/);
  assert.match(system.content!, /define each one in plain words/);
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
