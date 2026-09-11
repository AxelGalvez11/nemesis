import assert from "node:assert/strict";
import test from "node:test";

import { detokenize, mergeRich, mergeText, tokenize, type RichText } from "./text-merge";

test("one side unchanged takes the other side", () => {
  assert.equal(mergeText("hello", "hello", "hello there"), "hello there");
  assert.equal(mergeText("hello", "hello world", "hello"), "hello world");
  assert.equal(mergeText("hello", "same", "same"), "same");
});

test("both typing at the end keeps both, mine first", () => {
  assert.equal(mergeText("Notes", "Notes for Monday", "Notes (draft)"), "Notes for Monday (draft)");
});

test("an edit at the start and a deletion at the end both land", () => {
  assert.equal(mergeText("The quick brown fox", "A quick brown fox", "The quick brown"), "A quick brown");
});

test("the same insertion typed on both sides appears once", () => {
  assert.equal(mergeText("abc", "abXc", "abXc"), "abXc");
  assert.equal(mergeText("abc", "abXcY", "abXc"), "abXcY");
});

test("emoji are whole characters, never split in half", () => {
  assert.equal(mergeText("Plan 📚", "Plan 📚 today", "My Plan 📚"), "My Plan 📚 today");
});

test("rich text round-trips through tokens", () => {
  const rich: RichText = [["plain "], ["bold", [["b"]]], [" and "], ["link", [["a", "https://example.com"]]]];
  assert.deepEqual(detokenize(tokenize(rich)), rich);
});

test("bold on one side and typing on the other both survive", () => {
  const base: RichText = [["review chapter three"]];
  const local: RichText = [["review "], ["chapter", [["b"]]], [" three"]];
  const remote: RichText = [["review chapter three tonight"]];
  assert.deepEqual(mergeRich(base, local, remote), [["review "], ["chapter", [["b"]]], [" three tonight"]]);
});

test("a mention stays one piece", () => {
  const mention: [string, [string, string][]] = ["‣", [["p", "11111111-1111-4111-8111-111111111111"]]];
  const base: RichText = [["see "], mention];
  const local: RichText = [["please see "], mention];
  const remote: RichText = [["see "], mention, [" first"]];
  assert.deepEqual(mergeRich(base, local, remote), [["please see "], mention, [" first"]]);
});

test("missing or broken values merge as empty text", () => {
  assert.deepEqual(mergeRich(null, [["a"]], undefined), [["a"]]);
  assert.deepEqual(mergeRich([["x"]], [["x"]], [[3 as unknown as string]] as RichText), []);
});
