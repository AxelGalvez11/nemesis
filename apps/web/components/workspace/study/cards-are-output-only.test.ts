// Nemesis writes the cards. The learner studies them, rates them, and can take them away.
//
// 🔴🔴🔴 THE OWNER HAS NOW SAID THIS TWICE, IN TWO DIFFERENT WORDS, AND THE SECOND TIME WAS
// BECAUSE A NEW EDITING SURFACE HAD APPEARED IN BETWEEN.
//
//   2026-08-24: *"I don't really want the user to be able to edit them"* — the inline
//   front/back/tags form came out of the review screen.
//   2026-08-25: *"I don't want users to edit flashcards, really. Mainly just download them if
//   they want to… similar to notebook where you don't have to edit cards. That's not what I want
//   users to do in my app. Mainly just a thumbs up or a thumbs down if a card was badly
//   generated."*
//
// Between those two messages the Library grew a box-dragging occlusion editor, because a
// DIFFERENT question ("can I do image occlusion?") was answered by giving the learner a drawing
// tool. That is how an output-only product acquires an authoring surface: not by anyone deciding
// to reverse the rule, but by a feature arriving that nobody checked against it.
//
// So this guard is not about any one control. It is about the SHAPE: the review screen offers a
// verdict and never a text field, and there is exactly one way for a learner to change what a
// card says — by telling Nemesis it is wrong and letting Nemesis rewrite it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const REVIEW = strip(readFileSync(new URL("./review-session.tsx", import.meta.url), "utf8"));
const STORE = strip(readFileSync(new URL("../../../lib/workspace/study-cloud-store.ts", import.meta.url), "utf8"));

test("🔴🔴🔴 the review screen has no way to type into a card", () => {
  // Calibration: add an <input> or <textarea> bound to front/back and this reddens. The Explain
  // panel has its own composer and lives in its own file, which is why this reads only this one.
  assert.ok(!/<textarea/i.test(REVIEW), "a text area appeared on the review screen");
  assert.ok(!/<input/i.test(REVIEW), "an input appeared on the review screen");
  assert.ok(!/Edit card/.test(REVIEW), "the card editor came back");
});

test("🔴🔴🔴 the thumbs are the only verdict a learner may give a card", () => {
  // Owner's words: "Mainly just a thumbs up or a thumbs down if a card was badly generated."
  assert.match(REVIEW, /data-testid="rate-card-up"/, "the thumbs-up is gone");
  assert.match(REVIEW, /data-testid="rate-card-down"/, "the thumbs-down is gone");
  assert.match(REVIEW, /void rate\(1\)/, "the thumbs-up is not wired");
  assert.match(REVIEW, /void rate\(-1\)/, "the thumbs-down is not wired");
});

test("🔴🔴 a bad card is REPAIRED, not merely reported", () => {
  // A complaint with no consequence is a suggestion box. Thumbs-down runs the rewrite that used
  // to sit behind a menu item reading "This card is wrong".
  assert.match(REVIEW, /rewriteCurrent\(\)/, "nothing repairs a card the learner called bad");
  assert.ok(!/This card is wrong/.test(REVIEW), "the old menu item is back alongside the thumbs");
  // …and the learner still never types the fix.
  assert.match(REVIEW, /reviseCardMessages\(/, "the rewrite stopped going through the model");
});

test("🔴🔴 an image card is rated but never rewritten", () => {
  // Its content is a picture plus mask coordinates; `parseRevisedCard` returns front/back TEXT,
  // so applying a rewrite would blank the labels and orphan the image. Rating it must still work
  // — the whole point of collecting the vote is that MODEL-MADE image cards can be bad too.
  const rate = REVIEW.slice(REVIEW.indexOf("async function rate("), REVIEW.indexOf("async function rewriteCurrent"));
  assert.ok(rate.length > 0, "the rate() function is gone — this guard is pointed at nothing");
  assert.match(rate, /await rateCard\(/, "an image card's vote is not recorded");
  assert.match(rate, /cardType !== "image_occlusion"/, "an image card is now sent through the text rewrite");
});

test("🔴🔴 the vote is a toggle, and it never touches scheduling", () => {
  // 🔴 A ONE-WAY CONTROL MAKES A MIS-TAP PERMANENT, and a learner who cannot take back a verdict
  // stops giving them. Pressing the lit thumb clears it, the same as `setCardFlag`.
  const rateCard = STORE.slice(STORE.indexOf("const rateCard = useCallback"), STORE.indexOf("const logStudyPress"));
  assert.ok(rateCard.length > 0, "rateCard is gone — this guard is pointed at nothing");
  assert.match(rateCard, /card\.quality === quality \? 0 : quality/, "the vote stopped being a toggle");
  // 🔴 RATING PROSE MUST NOT MOVE A CARD'S NEXT APPEARANCE. `due_at`, `interval_days`,
  // `repetitions` and `lapses` belong to the scheduler; an opinion about the writing is not a
  // review, and writing `updated_at` here would make a rated card look freshly studied.
  for (const column of ["due_at", "interval_days", "repetitions", "lapses", "updated_at"]) {
    assert.ok(!new RegExp(`${column}`).test(rateCard), `rating a card writes ${column}`);
  }
});

test("🔴🔴 quality is its own column, never an eighth flag colour", () => {
  // `flag` is the learner talking to themselves; `quality` is the learner talking to us about a
  // card Nemesis wrote. Overloading one onto the other makes them impossible to count apart, and
  // counting them is the only reason the vote is collected.
  assert.match(STORE, /quality: normalizeCardQuality\(raw\.quality\)/, "quality stopped being read off the row");
  assert.match(STORE, /"[^"]*,flag,quality,/, "quality is not selected, so every card loads as unvoted");
});

test("🔴 an unreadable vote reads as unvoted rather than crashing a review", () => {
  // Preview fixtures and imported decks reach `toCard` too, and a `quality: 3` arriving from
  // either would render as neither thumb pressed while failing the next write against the check
  // constraint.
  const normalize = STORE.slice(STORE.indexOf("export function normalizeCardQuality"), STORE.indexOf("function toCard("));
  assert.ok(normalize.length > 0, "normalizeCardQuality is gone");
  assert.match(normalize, /value === 1 \|\| value === -1 \? value : 0/, "an out-of-range vote is trusted");
});

console.log("cards-are-output-only.test.ts OK");
