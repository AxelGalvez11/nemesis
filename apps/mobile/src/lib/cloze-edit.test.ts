// Deno unit tests (repo convention) for the cloze-writing toolbar's pure half.
// Run from the REPO ROOT: deno test --no-check --allow-env apps/mobile/src/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  addClozeHint,
  currentClozeNumber,
  hasClozeDeletion,
  nextClozeNumber,
  usedClozeNumbers,
  wrapCloze,
} from "./cloze-edit.ts";

Deno.test("usedClozeNumbers reads every number, deduped and in order", () => {
  assertEquals(usedClozeNumbers("nothing here"), []);
  assertEquals(usedClozeNumbers("{{c1::a}} and {{c3::b}} and {{c1::c}}"), [1, 3]);
});

Deno.test("usedClozeNumbers counts a HALF-TYPED deletion", () => {
  // Mid-edit text is the normal case for this module: the student has tapped
  // the button and hasn't typed the answer yet. Ignoring an unclosed deletion
  // would hand the next blank a number already in use.
  assertEquals(usedClozeNumbers("The capital is {{c1::"), [1]);
});

Deno.test("nextClozeNumber takes one past the highest, currentClozeNumber reuses it", () => {
  assertEquals(nextClozeNumber(""), 1);
  assertEquals(nextClozeNumber("{{c1::a}}"), 2);
  // Past a gap, still one past the HIGHEST — never refilling the hole, which
  // is what Anki does and what keeps a re-edited note stable.
  assertEquals(nextClozeNumber("{{c1::a}} {{c4::b}}"), 5);
  assertEquals(currentClozeNumber(""), 1);
  assertEquals(currentClozeNumber("{{c1::a}} {{c4::b}}"), 4);
});

Deno.test("wrapCloze wraps a selection and puts the caret after it", () => {
  const out = wrapCloze({ text: "The heart has four chambers", start: 19, end: 27 });
  assertEquals(out.text, "The heart has four {{c1::chambers}}");
  assertEquals(out.start, out.text.length);
  assertEquals(out.start, out.end);
});

Deno.test("wrapCloze with NO selection leaves the caret inside the blank", () => {
  // Tap-then-type has to work as well as select-then-tap: the next keystroke
  // should land in the deletion, not after it.
  const out = wrapCloze({ text: "Capital: ", start: 9, end: 9 });
  assertEquals(out.text, "Capital: {{c1::}}");
  assertEquals(out.text.slice(0, out.start), "Capital: {{c1::");
  assertEquals(out.start, out.end);
});

Deno.test("wrapCloze numbers each new deletion, and sameNumber reuses the last", () => {
  const first = wrapCloze({ text: "A and B", start: 0, end: 1 });
  assertEquals(first.text, "{{c1::A}} and B");
  const second = wrapCloze({ text: first.text, start: 14, end: 15 });
  assertEquals(second.text, "{{c1::A}} and {{c2::B}}");
  const together = wrapCloze({ text: first.text, start: 14, end: 15 }, { sameNumber: true });
  assertEquals(together.text, "{{c1::A}} and {{c1::B}}");
});

Deno.test("wrapCloze handles a backwards drag and an out-of-range selection", () => {
  // A right-to-left drag reports end < start on some platforms.
  assertEquals(wrapCloze({ text: "abcdef", start: 4, end: 2 }).text, "ab{{c1::cd}}ef");
  // A stale selection must never slice outside the string.
  const clamped = wrapCloze({ text: "abc", start: 10, end: 99 });
  assertEquals(clamped.text, "abc{{c1::}}");
});

Deno.test("addClozeHint appends ::hint to the deletion the caret is in", () => {
  const text = "The capital is {{c1::Paris}}.";
  const out = addClozeHint({ text, start: 22, end: 22 }, "city");
  assertEquals(out.text, "The capital is {{c1::Paris::city}}.");
});

Deno.test("addClozeHint is a no-op outside a deletion, or when one already has a hint", () => {
  const plain = { text: "no cloze here", start: 3, end: 3 };
  assertEquals(addClozeHint(plain, "x"), plain);
  const hinted = { text: "{{c1::Paris::city}}", start: 8, end: 8 };
  assertEquals(addClozeHint(hinted, "again"), hinted);
  // Caret sits AFTER a completed deletion, so it is not inside one.
  const after = { text: "{{c1::Paris}} is nice", start: 18, end: 18 };
  assertEquals(addClozeHint(after, "x"), after);
});

Deno.test("hasClozeDeletion is what gates the Add button", () => {
  assertEquals(hasClozeDeletion("The capital is Paris"), false);
  // Opened but never closed — not a card yet.
  assertEquals(hasClozeDeletion("The capital is {{c1::"), false);
  assertEquals(hasClozeDeletion("The capital is {{c1::Paris}}"), true);
  // An empty deletion still generates a (blank) card, so it counts — the
  // student is mid-sentence, not in error.
  assertEquals(hasClozeDeletion("{{c1::}}"), true);
  // Multi-line text: the body must match across newlines.
  assertEquals(hasClozeDeletion("line one\n{{c1::line\ntwo}}"), true);
});
