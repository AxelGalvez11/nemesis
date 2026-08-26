import assert from "node:assert/strict";
import test from "node:test";

import { readModelJson } from "./model-json";

// The failure this exists for: the model does its work, the answer is cut off mid-object, and
// twelve slides of real content become "came back unusable".

test("a complete object is read as-is", () => {
  assert.deepEqual(readModelJson('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test("prose or a fence around the object does not stop it", () => {
  assert.deepEqual(readModelJson('Here you go:\n```json\n{"a":1}\n```\nHope that helps.'), { a: 1 });
});

test("🔴🔴 a truncated array keeps every element that arrived whole", () => {
  // The real shape of the bug: the last slide was still being written when the cap hit.
  const cut = '{"slides":[{"title":"One"},{"title":"Two"},{"title":"Thr';
  assert.deepEqual(readModelJson(cut), { slides: [{ title: "One" }, { title: "Two" }] });
});

test("🔴 a value cut mid-string is dropped, never guessed", () => {
  // Repairing CONTENT would mean inventing the rest of somebody's sentence and presenting it as
  // the model's. Structure is repaired; text never is.
  const cut = '{"slides":[{"title":"One","points":["a","bcd';
  assert.deepEqual(readModelJson(cut), { slides: [{ title: "One", points: ["a"] }] });
});

test("🔴 a cut before anything completed returns null rather than an empty shell", () => {
  // `{"slides":[` parses fine once closed, and would hand the caller a deck with no slides —
  // which reads as "the model returned nothing" when in fact nothing was recovered. The caller's
  // own minimum (three slides) then reports honestly.
  assert.equal(readModelJson('{"slides":[{"title":"Thr'), null);
  assert.equal(readModelJson("no json here"), null);
});

test("a brace inside a string does not open a structure", () => {
  assert.deepEqual(readModelJson('{"a":"a { brace","b":2}'), { a: "a { brace", b: 2 });
  assert.deepEqual(readModelJson('{"a":"escaped \\" quote","b":2}'), { a: 'escaped " quote', b: 2 });
});

test("trailing prose after a balanced object is ignored", () => {
  assert.deepEqual(readModelJson('{"a":1} and then some words with a } in them'), { a: 1 });
});

test("🔴 a bare array root is read too — flashcards arrive that way", () => {
  // An object-only helper would have left `readCardsJson` on the old JSON.parse: the same
  // truncation bug, still live in one place, behind a fix that reads as complete.
  assert.deepEqual(readModelJson('[{"front":"a","back":"b"}]'), [{ front: "a", back: "b" }]);
});

test("🔴 repair may keep a HALF-FILLED element, and the caller is what rejects it", () => {
  // 🔴 THIS ASSERTION WAS WRONG BEFORE IT WAS RIGHT. I expected the half-written card to be
  // dropped here and had to look at what the code actually returned: the cut lands after `"c"`'s
  // comma, so `{"front":"c"}` survives — structurally valid, semantically incomplete.
  //
  // That is the correct division of labour, not a leak. This file repairs STRUCTURE; whether an
  // element is USABLE is a question only the caller can answer, and all three already do —
  // `readCardsJson` drops a card missing front or back, `readDeckJson` drops a slide with no body,
  // `readSheetJson` drops an empty row. Teaching this file those rules would put the same
  // knowledge in two places, to disagree later.
  assert.deepEqual(readModelJson('[{"front":"a","back":"b"},{"front":"c","back":"d'), [
    { front: "a", back: "b" },
    { front: "c" },
  ]);
});
