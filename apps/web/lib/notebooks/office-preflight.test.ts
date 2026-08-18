/**
 * When an Office file is worth a paid parser, pinned from both sides.
 *
 * 🔴 THE MEASUREMENT THIS RULE RESTS ON: `scripts/office-calibrate.mts` over the real OOXML corpus
 * that `scripts/make-office-corpus.mts` writes with pptxgenjs and docx — libraries that do not know
 * this parser exists. Every file in it comes back with everything it declares: 12/12 Word tables,
 * 4/4 Word pictures, 8/8 deck pictures, 19,281 characters of speaker notes on a 60-slide deck.
 * 8 of 8 stay local. So the tests that matter here are the ESCALATION ones — a rule that never
 * fires is indistinguishable from a rule that is switched off.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import type { ContentClaim } from "./mistral-quality";
import { preflightOffice } from "./office-preflight";

function claim(overrides: Partial<ContentClaim> = {}): ContentClaim {
  return { docxImages: 0, images: 0, notesChars: 0, notesSlides: 0, tables: 0, ...overrides };
}

function model(blocks: readonly { kind: DocBlock["kind"]; text?: string }[], units = 1): DocumentModel {
  return buildDocument({
    blocks: blocks.map((block) => ({
      headingPath: [],
      kind: block.kind,
      text: block.text ?? "",
      unit: 0,
    })),
    format: "docx",
    title: null,
    units: Array.from({ length: units }, (_, index) => ({ index, kind: "body" as const })),
  });
}

const PROSE = "The structure of a page is separate from the words printed on it. ".repeat(20);

test("🔴 a file whose content all arrived is never sent to a vendor", () => {
  const verdict = preflightOffice(
    "docx",
    claim({ docxImages: 2, tables: 3 }),
    model([
      { kind: "paragraph", text: PROSE },
      { kind: "table" },
      { kind: "table" },
      { kind: "table" },
      { kind: "figure" },
      { kind: "figure" },
    ]),
    PROSE,
  );
  assert.equal(verdict.route, "native");
  assert.equal(verdict.reason, "native-read-sufficient");
});

test("🔴 a Word document whose grids did not arrive escalates", () => {
  const verdict = preflightOffice("docx", claim({ tables: 6 }), model([{ kind: "paragraph", text: PROSE }]), PROSE);
  assert.equal(verdict.route, "vendor");
  assert.equal(verdict.reason, "tables");
  assert.equal(verdict.signals.recoveredTables, 0);
  assert.equal(verdict.signals.claimedTables, 6);
});

test("🔴 a Word document whose pictures did not arrive escalates — the claim the vendor gate cannot make", () => {
  // `judgeMistralRead` deliberately never sets `images` for DOCX, because `modelFromLlama` has no
  // picture branch and asking would reject every vendor read of a picture-bearing Word file. Asking
  // it of OUR read is answerable, and is the whole point of a separate `docxImages`.
  const verdict = preflightOffice("docx", claim({ docxImages: 4 }), model([{ kind: "paragraph", text: PROSE }]), PROSE);
  assert.equal(verdict.route, "vendor");
  assert.equal(verdict.reason, "figures");
  assert.equal(verdict.signals.claimedImages, 4);
});

test("a Word document with only decorative art below the glyph floor makes no claim", () => {
  // `claimOf` applies the same media filter the deck lane does, so a 3x3 bullet glyph never
  // reaches this rule at all — asserted here as the rule's precondition rather than re-tested.
  const verdict = preflightOffice("docx", claim({ docxImages: 0 }), model([{ kind: "paragraph", text: PROSE }]), PROSE);
  assert.equal(verdict.route, "native");
});

test("🔴 a deck that states it carries speaker notes and returned none escalates", () => {
  const verdict = preflightOffice(
    "pptx",
    claim({ notesChars: 38910, notesSlides: 35 }),
    model([{ kind: "paragraph", text: "Slide title" }]),
    "Slide title",
  );
  assert.equal(verdict.route, "vendor");
  assert.equal(verdict.reason, "speaker-notes");
});

test("a deck with a couple of stray notes is not a lecture missing its teaching", () => {
  // The shared gate's floor: PowerPoint writes an empty notes part for slides nobody typed on, so
  // presence is not evidence. Below MIN_NOTES_SLIDES / MIN_NOTES_CHARS nothing escalates.
  const verdict = preflightOffice(
    "pptx",
    claim({ notesChars: 120, notesSlides: 1 }),
    model([{ kind: "paragraph", text: PROSE }]),
    PROSE,
  );
  assert.equal(verdict.route, "native");
});

test("🔴 a deck whose pictures did not arrive escalates", () => {
  const verdict = preflightOffice(
    "pptx",
    claim({ images: 9 }),
    model([{ kind: "paragraph", text: PROSE }]),
    PROSE,
  );
  assert.equal(verdict.route, "vendor");
  assert.equal(verdict.reason, "figures");
});

test("🔴 a file that declares content and read as nothing escalates — the case no count catches", () => {
  // Zero against zero passes every comparison. A Word document whose body lives entirely inside
  // text boxes looks exactly like an empty document to a counter, and is not one.
  const verdict = preflightOffice("docx", claim({ docxImages: 3 }), model([]), "   ");
  assert.equal(verdict.route, "vendor");
  assert.equal(verdict.reason, "nothing-readable");
});

test("a genuinely empty file is not escalated to be told it is empty", () => {
  const verdict = preflightOffice("docx", claim(), model([]), "");
  assert.equal(verdict.route, "native");
  assert.equal(verdict.reason, "native-read-sufficient");
});

test("🔴 the routing record carries the comparison, not just the verdict", () => {
  const verdict = preflightOffice(
    "pptx",
    claim({ images: 4, notesChars: 900, notesSlides: 3 }),
    model([{ kind: "paragraph", text: PROSE }, { kind: "figure" }, { kind: "figure" }]),
    PROSE,
  );
  assert.equal(verdict.signals.claimedImages, 4);
  assert.equal(verdict.signals.recoveredFigures, 2);
  assert.equal(verdict.signals.notesChars, 900);
  assert.ok(verdict.signals.textChars > 0);
});
