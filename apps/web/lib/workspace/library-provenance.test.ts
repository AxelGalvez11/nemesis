import assert from "node:assert/strict";
import { test } from "node:test";

import { describeSourceLocation, sourceKindIcon, sourceKindLabel, sourceLabelFor } from "./library-provenance";

test("describeSourceLocation reads every documented shape", () => {
  assert.equal(describeSourceLocation({ page: 7 }), "p. 7");
  assert.equal(describeSourceLocation({ pages: [3, 9] }), "pp. 3–9");
  assert.equal(describeSourceLocation({ pages: [4, 4] }), "p. 4");
  assert.equal(describeSourceLocation({ slide: 12 }), "slide 12");
  assert.equal(describeSourceLocation({ slides: [2, 5] }), "slides 2–5");
  assert.equal(describeSourceLocation({ seconds: 750 }), "12:30");
  assert.equal(describeSourceLocation({ seconds: 59 }), "0:59");
  assert.equal(describeSourceLocation({ start_seconds: 60, end_seconds: 95 }), "1:00–1:35");
});

test("describeSourceLocation refuses junk instead of inventing text", () => {
  assert.equal(describeSourceLocation(null), null);
  assert.equal(describeSourceLocation(undefined), null);
  assert.equal(describeSourceLocation("p. 7"), null);
  assert.equal(describeSourceLocation({}), null);
  assert.equal(describeSourceLocation({ page: "7" }), null);
  assert.equal(describeSourceLocation({ pages: [1] }), null);
  assert.equal(describeSourceLocation({ pages: [1, "2"] }), null);
  assert.equal(describeSourceLocation({ seconds: Number.NaN }), null);
});

test("pill label prefers the file basename, then the excerpt, then the kind", () => {
  assert.equal(sourceLabelFor("upload", "courses/week4/Slides Final.pdf", null), "Slides Final.pdf");
  assert.equal(sourceLabelFor("recording", null, "Lecture 9 — commerce power"), "Lecture 9 — commerce power");
  assert.equal(sourceLabelFor("chat", null, null), "Chat");
  assert.equal(sourceLabelFor("upload", "  ", ""), "Uploaded file");
});

test("a long excerpt is trimmed to pill size with an ellipsis", () => {
  const label = sourceLabelFor("notebook_source", null, "x".repeat(90));
  assert.equal(label.length, 60);
  assert.ok(label.endsWith("…"));
});

test("every source kind carries a label and an icon", () => {
  const kinds = ["library_note", "upload", "lecture", "recording", "test", "study_deck", "notebook_source", "notebook_output", "chat"] as const;
  for (const kind of kinds) {
    assert.ok(sourceKindLabel(kind).length > 0);
    assert.ok(sourceKindIcon(kind).length > 0);
  }
});
