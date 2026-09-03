// The end-of-batch report: names, not just a count, and silence when nothing went wrong.
import assert from "node:assert/strict";
import { test } from "node:test";

import { attachOutcomeMessage } from "./attach-outcome";

test("🔴 nothing to say when every file attached", () => {
  assert.equal(attachOutcomeMessage(50, []), null);
});

test("🔴🔴 the report says how many are in and names the ones that are not", () => {
  const message = attachOutcomeMessage(47, ["week 3.pdf", "lab notes.docx", "slides.pptx"]);
  assert.equal(message, "47 documents attached. 3 couldn't be read: week 3.pdf, lab notes.docx, slides.pptx.");
});

test("a single failure reads as one sentence about one file", () => {
  assert.equal(attachOutcomeMessage(0, ["scan.pdf"]), "That file couldn't be read: scan.pdf.");
  assert.equal(attachOutcomeMessage(1, ["scan.pdf"]), "1 document attached. 1 couldn't be read: scan.pdf.");
});

test("🔴 a long list is capped by name and counted past the cap", () => {
  const names = Array.from({ length: 9 }, (_, index) => `file ${index + 1}.pdf`);
  const message = attachOutcomeMessage(41, names)!;
  assert.match(message, /file 6\.pdf and 3 more\./);
  assert.doesNotMatch(message, /file 7\.pdf/);
});
