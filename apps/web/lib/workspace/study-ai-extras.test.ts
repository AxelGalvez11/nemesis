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
