import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readDocumentModel } from "@nemesis/shared";

import { headingTrail } from "./structure";

// The heading trail of a PDF block. Small, pure, and it silently deleted five of seven real
// lecture PDFs before this file existed — see the note on `headingTrail` for the measurement.

test("a document that starts at H2 produces no holes", () => {
  // 🔴 THE EXACT SHAPE THAT POISONED PRODUCTION. `headingPath.length = level - 1` followed by
  // `headingPath[level - 1] = text` leaves array HOLES for every level that was never opened. A
  // hole spreads as `undefined` and stores as `null`.
  const headings = headingTrail();
  const ancestors = headings.open(2, "Insulin");
  assert.deepEqual(ancestors, [], "a first heading has no ancestors");
  assert.deepEqual(headings.path(), ["Insulin"]);
  for (const entry of headings.path()) assert.equal(typeof entry, "string");
});

test("a document that skips a level keeps every entry a real heading", () => {
  // 1 → 3 is ordinary in lecture decks, resumes and worksheets. The skipped level has no heading,
  // so it contributes no ancestor: the trail gets SHORTER, it does not grow a hole.
  const headings = headingTrail();
  headings.open(1, "Pharmacology");
  const ancestors = headings.open(3, "Sulfonylureas");
  assert.deepEqual(ancestors, ["Pharmacology"], "the skipped level invented an ancestor");
  assert.deepEqual(headings.path(), ["Pharmacology", "Sulfonylureas"]);
  assert.ok(
    headings.path().every((entry) => typeof entry === "string"),
    "a skipped heading level still produces a non-string entry",
  );
});

test("a sibling closes its predecessor rather than nesting under it", () => {
  const headings = headingTrail();
  headings.open(1, "Diabetes");
  headings.open(2, "Type 1");
  assert.deepEqual(headings.open(2, "Type 2"), ["Diabetes"], "a sibling heading nested under its sibling");
  assert.deepEqual(headings.path(), ["Diabetes", "Type 2"]);
});

test("closing out to a shallower level drops the deeper trail", () => {
  const headings = headingTrail();
  headings.open(1, "Diabetes");
  headings.open(2, "Type 2");
  headings.open(3, "Metformin");
  assert.deepEqual(headings.open(1, "Thyroid"), [], "a new top-level heading kept the old trail");
  assert.deepEqual(headings.path(), ["Thyroid"]);
});

test("🔴 one hole in one breadcrumb throws away the WHOLE document", () => {
  // This is why the bug hid for weeks rather than showing up as a bad heading. `readDocumentModel`
  // rejects a block whose headingPath contains a non-string — correctly — and rejecting one block
  // rejects the model. The indexer then reports `no-model`, whose documented meaning is "this parse
  // predates the canonical model", so a live parser bug renders as an expected backlog of old data.
  const block = (id: string, headingPath: unknown[]) => ({
    headingPath,
    id,
    kind: "paragraph",
    text: "Insulin is secreted by beta cells.",
    unit: 0,
  });
  const model = (paths: unknown[][]) => ({
    blocks: paths.map((path, index) => block(`b${index}`, path)),
    format: "pdf",
    title: "Lecture",
    units: [{ index: 0, kind: "page" }],
  });

  assert.ok(readDocumentModel(model([["A"], ["A", "B"]])), "a clean model must read");
  assert.equal(
    readDocumentModel(model([["A"], [null, "B"], ["A", "C"]])),
    null,
    "a null breadcrumb no longer costs the document — if this is intentional, the parser fix is the one that matters",
  );
});

test("the sparse-slot pattern is gone from the PDF structure builder", () => {
  // 🔴 PINNED BECAUSE THE SAME FIX ALREADY EXISTED ONE DIRECTORY OVER AND WAS NOT CARRIED ACROSS.
  // `docx-structure.ts` replaced exactly this pattern after it discarded 3 of 205 Word documents;
  // the PDF builder kept it and discarded 5 of 7 real lecture PDFs. A regression here is silent, so
  // the shape itself is guarded rather than only its effect.
  // 🔴 COMMENTS STRIPPED FIRST, because the note explaining the bug QUOTES the pattern it bans and
  // a "must not appear" guard that reads its own explanation fails the moment you document the fix.
  const source = readFileSync(new URL("./structure.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/headingPath\.length\s*=\s*Math\.max/.test(source),
    "one-slot-per-level is back: a document whose first heading is H2 will be silently discarded",
  );
  assert.ok(!/headingPath\[level - 1\]\s*=/.test(source), "one-slot-per-level assignment is back");
  assert.ok(source.includes("headingTrail()"), "the PDF builder no longer uses the open-headings trail");
});
