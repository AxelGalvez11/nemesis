// A list item's marker must survive the whole way to an extractor, or no procedure can be read.
//
// 🔴 THE FULL CHAIN, THROUGH JSON, BECAUSE THAT IS WHERE THESE DIE. `DocBlock.marker` has existed
// since the model did, and every parser test that produced one passed. It still never reached any
// consumer: `unitsFromModel` copies field by field — deliberately, so table geometry cannot cross
// unnoticed — and a field nobody listed is a field that silently does not exist downstream. Testing
// the parser proves the marker was PRODUCED; only this proves it can be READ.
//
// 🔴 AND IT GOES THROUGH `JSON.parse(JSON.stringify(...))` ON PURPOSE. The model is persisted as
// JSONB and read back by `readDocumentModel`; a test holding the in-memory object would pass while
// the stored shape dropped the field, which is the same class of gap one layer down.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, readDocumentModel } from "@nemesis/shared";

import { sourceContextFromModel } from "./source-context";

function filingProcedure() {
  return buildDocument({
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Filing a motion", unit: 0 },
      { depth: 0, headingPath: ["Filing a motion"], kind: "listItem", marker: "1.", text: "Serve the opposing party.", unit: 0 },
      { depth: 0, headingPath: ["Filing a motion"], kind: "listItem", marker: "2.", text: "File proof of service.", unit: 0 },
      { depth: 0, headingPath: ["Filing a motion"], kind: "listItem", marker: "3.", text: "Notice the hearing date.", unit: 0 },
      { depth: 0, headingPath: ["Filing a motion"], kind: "listItem", marker: "•", text: "Local rules may vary.", unit: 0 },
    ],
    format: "docx",
    title: "Civil procedure",
    units: [{ index: 0, kind: "page" }],
  });
}

/** model → JSON → readDocumentModel → the units an extractor is actually handed. */
function unitsAcrossTheBoundary() {
  const stored = JSON.parse(JSON.stringify(filingProcedure()));
  const model = readDocumentModel(stored);
  assert.ok(model, "the stored model should read back");
  return sourceContextFromModel({ model, sourceId: "s1", sourceKind: "docx" }).units;
}

test("a numbered step arrives at the extractor still carrying its number", () => {
  const steps = unitsAcrossTheBoundary().filter((unit) => unit.marker);

  assert.deepEqual(steps.map((unit) => unit.marker), ["1.", "2.", "3.", "•"]);
  // 🔴 The order the document printed them in, because a procedure IS that order.
  //
  // 🔴 AND THE MARKER IS ALSO INSIDE `text`, WHICH IS PRECISELY WHY THE FIELD IS NEEDED. `unitText`
  // renders it into the sentence, so a lane could in principle recover the numbering by matching a
  // leading `1.` off the front of a string — and that is the flattening this boundary exists to
  // prevent, one dimension over from re-splitting a markdown table on pipe characters. A bullet, a
  // right-parenthesis form and a roman numeral would each need another pattern, and a step whose
  // own sentence begins with a year would be misread as numbered.
  assert.deepEqual(
    steps.map((unit) => unit.text),
    [
      "1. Serve the opposing party.",
      "2. File proof of service.",
      "3. Notice the hearing date.",
      "• Local rules may vary.",
    ],
  );
});

test("the bullet is distinguishable from the numbered steps after the crossing", () => {
  const steps = unitsAcrossTheBoundary().filter((unit) => unit.marker);

  // 🔴 THIS IS THE WHOLE REASON THE FIELD IS CARRIED. Four items sit under one heading; three are
  // an ordered procedure and the fourth is an aside the author bulleted. Without the marker they
  // are four identical list items, and any lane reading them would teach a fourth step that the
  // document never claimed followed the third.
  const numbered = steps.filter((unit) => /^[0-9]/.test(unit.marker ?? ""));
  assert.equal(numbered.length, 3);
  assert.equal(steps.length - numbered.length, 1);
});

test("nesting depth survives, so two runs at different depths are not read as one list", () => {
  const steps = unitsAcrossTheBoundary().filter((unit) => unit.marker);

  assert.deepEqual([...new Set(steps.map((unit) => unit.depth))], [0]);
});
