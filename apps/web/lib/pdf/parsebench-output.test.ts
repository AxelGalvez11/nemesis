/**
 * The renderer is a consumer, and until now it had no round-trip test.
 *
 * 🔴 THREE SILENT DEATHS HAVE HAPPENED AT THIS ONE BOUNDARY, AND THAT MAKES IT A SEAM RATHER
 * THAN THREE BUGS:
 *
 *   1. tables   — the serializer emitted markdown pipes, the metric reads `<table`, and **179
 *                 tables the parser genuinely found scored zero**. Read as a parser deficiency.
 *   2. spans    — a pipe grid cannot express `rowSpan`, so every merged cell died here, in the
 *                 file whose own header says "A RENDERER IS A BOUNDARY".
 *   3. furniture— `pageHeader`/`pageFooter` joined `DocBlockKind` in #485, `labelOf` never
 *                 mentioned them, and its trailing `return "Text"` reported every running header
 *                 as body text. Page-header and Page-footer could only ever score 0.00.
 *
 * Each was fixed by improving the renderer. None was fixed by a shape that cannot forget the
 * NEXT kind — which is why it kept happening. This file is that shape:
 *
 *     every block kind the parser can emit must survive the renderer AS ITSELF.
 *
 * A vocabulary the parser knows and the renderer cannot express is a red test here, never a
 * silent downgrade to "Text".
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, storedDocumentModel, structureEnvelope, type DocBlock } from "@nemesis/shared";

import { toParseBench } from "./parsebench-output";

/**
 * One block of every kind the model can hold.
 *
 * 🔴 THIS LIST IS HAND-WRITTEN AND THAT IS THE POINT OF THE NEXT TEST. It is checked against the
 * runtime vocabulary rather than trusted, because a hand-written list of a union's members is
 * exactly what drifted in `document-envelope.test.ts` (five of six `DocFormat`s, missing "csv").
 */
const EVERY_KIND: { kind: DocBlock["kind"]; label: string }[] = [
  { kind: "heading", label: "Section-header" },
  { kind: "paragraph", label: "Text" },
  { kind: "listItem", label: "List-item" },
  { kind: "table", label: "Table" },
  { kind: "figure", label: "Picture" },
  { kind: "caption", label: "Caption" },
  { kind: "equation", label: "Formula" },
  { kind: "note", label: "Text" },
  { kind: "pageHeader", label: "Page-header" },
  { kind: "pageFooter", label: "Page-footer" },
];

/** Kinds that are genuinely body text. Anything ELSE arriving as "Text" is a forgotten kind. */
const LEGITIMATELY_TEXT = new Set(["paragraph", "note"]);

function modelOfEveryKind() {
  return buildDocument({
    blocks: EVERY_KIND.map(({ kind }, index) => ({
      headingPath: [],
      kind,
      rect: { height: 0.05, width: 0.5, x: 0.1, y: 0.1 + index * 0.06 },
      text: `text for ${kind}`,
      unit: 0,
      ...(kind === "table"
        ? { table: { cells: [{ column: 0, row: 0, text: "cell" }], headerRows: 0, rows: [["cell"]] } }
        : {}),
    })),
    format: "pdf",
    title: "every kind",
    units: [{ index: 0, kind: "page", size: { height: 792, width: 612 } }],
  });
}

test("🔴 EVERY block kind survives the renderer as ITSELF — none is silently downgraded", () => {
  const out = toParseBench(modelOfEveryKind());
  const items = out.layout_pages[0]?.items ?? [];
  assert.equal(items.length, EVERY_KIND.length, "every block reached the renderer");

  EVERY_KIND.forEach(({ kind, label }, index) => {
    const item = items[index]!;
    assert.equal(item.type, label, `${kind} must be reported as ${label}, not ${item.type}`);
    // The bbox carries its own copy of the label. They came from one call once and could drift.
    assert.equal(item.bbox?.label, label, `${kind}'s bbox label disagrees with its type`);
  });
});

test("🔴 nothing arrives as 'Text' unless it genuinely IS text", () => {
  // This is the assertion that would have caught the furniture death on the day it landed.
  // `pageHeader` mapped to "Text" is indistinguishable from a paragraph in the output, so the
  // only way to see the loss is to insist that the set of things claiming to be Text is exactly
  // the set of things that should be.
  const out = toParseBench(modelOfEveryKind());
  const items = out.layout_pages[0]?.items ?? [];
  const arrivedAsText = EVERY_KIND.filter((_, i) => items[i]?.type === "Text").map((e) => e.kind);
  assert.deepEqual(
    [...arrivedAsText].sort(),
    [...LEGITIMATELY_TEXT].sort(),
    "a kind collapsed into Text that is not body text — that is a silent loss at the renderer",
  );
});

test("🔴 the hand-written kind list above agrees with the RUNTIME vocabulary", () => {
  // 🔴 GUARDS BOTH HAND-WRITTEN LISTS AT ONCE, THROUGH THE REAL BOUNDARY. `BLOCK_KINDS` in
  // document-envelope.ts is the runtime half of `DocBlockKind` and is not exported, so it cannot
  // be compared directly — but `readDocumentModel` returns null for the WHOLE model when one
  // block's kind is not in it. So a model containing every kind either survives the envelope
  // intact or vanishes entirely, and "vanishes" is indistinguishable from "this parse predates
  // the model" at every call site. That is how three complete Word documents were lost once.
  const model = modelOfEveryKind();
  const readBack = storedDocumentModel(
    JSON.parse(JSON.stringify(structureEnvelope({ model, text: "t", title: model.title }))),
  );
  assert.ok(readBack, "🔴 a kind is missing from BLOCK_KINDS — the whole model reads back as null");
  assert.equal(readBack.blocks.length, EVERY_KIND.length, "no block was dropped at the envelope");
  assert.deepEqual(
    readBack.blocks.map((b) => b.kind).sort(),
    EVERY_KIND.map((e) => e.kind).sort(),
    "the kinds that survived storage are not the kinds we sent",
  );

  // And the stored-and-reread model still renders to the same labels. A kind can survive the
  // envelope and still be lost by the renderer; these are two boundaries, not one.
  const items = toParseBench(readBack).layout_pages[0]?.items ?? [];
  assert.deepEqual(
    items.map((i) => i.type).sort(),
    EVERY_KIND.map((e) => e.label).sort(),
    "labels changed across the storage boundary",
  );
});

test("a table still renders as HTML, because the metric reads `<table` and a pipe grid is invisible", () => {
  // The first death, pinned. 179 detected tables scored zero for exactly this.
  const out = toParseBench(modelOfEveryKind());
  const table = out.layout_pages[0]?.items.find((i) => i.type === "Table");
  assert.ok(table, "the table block is present");
  assert.match(table.md, /<table/, "a markdown pipe grid here scores zero and looks like a parser fault");
});
