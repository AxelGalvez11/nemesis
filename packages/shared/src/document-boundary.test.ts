/**
 * THE RULE: every structural field must survive the boundary, and this test is
 * what makes that enforceable rather than remembered.
 *
 * 🔴 "THE PARSER PRODUCED IT" IS NOT THE CLAIM ANYONE NEEDS. The claim is:
 *
 *     real file → parser → DocumentModel → JSON → readDocumentModel() →
 *     consumer → the locator still resolves
 *
 * Six fields have already proved why, each one silently:
 *
 *   `label`, `size`   — a unit validator rebuilt units field-by-field and
 *                       deleted both; the Deno indexer then read `undefined`.
 *   `SourceRef`'s     — two calendar decoders each dropped what the other
 *   four locator         added, so 48 of 48 events lost their page and blocks
 *   fields               between being written and being read.
 *   `parsedDocumentId`— same defect, same file.
 *   `headingPath`     — array HOLES serialised to `null`, one bad block
 *                       rejected the whole model, and three complete Word
 *                       documents came back as "no structure" while reporting
 *                       as data that merely predates the canonical model.
 *   `columns`,        — added for a continuation page's anonymous columns and
 *   `rowSpan/colSpan`    for merged cells; both would have died the same way.
 *
 * Every one of those passed its parser's own tests.
 *
 * ── HOW THIS ENFORCES IT ──────────────────────────────────────────────────
 *
 * The two guards below fail when a field is ADDED to `DocTable`, `DocUnit` or
 * `DocCell` without anyone deciding whether it crosses the boundary. They work
 * by construction rather than by listing what to check: a fully-populated value
 * is round-tripped and compared, so a new field is covered the moment it exists
 * — but only if it is added to the fixture, and the field-name assertion is what
 * forces that.
 *
 * If you are here because this test failed after adding a field: add it to the
 * fixture below with a REAL value, run it, and watch what happens. If it comes
 * back, you are done. If it does not, you have just found the next boundary
 * death before it shipped.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { readStructureEnvelope, structureEnvelope } from "./document-envelope.ts";
import { buildDocument, locate, projectCells, type DocCell, type DocTable, type DocUnit } from "./document-model.ts";

/** A table with EVERY field set to something distinguishable. */
const TABLE: DocTable = {
  cells: [
    { colSpan: 2, column: 0, row: 0, text: "Week 1" },
    { column: 0, row: 1, rowSpan: 2, text: "Dr. Farrar" },
    { column: 1, row: 1, text: "Session A" },
    { column: 1, row: 2, text: "Session B" },
  ],
  columns: ["Instructor", "Session"],
  continuesFromUnit: 0,
  headerRows: 0,
  headerSource: "inherited",
  rows: [["Week 1", ""], ["Dr. Farrar", "Session A"], ["", "Session B"]],
};

/** A unit with every field set. */
const UNIT: DocUnit = { index: 0, kind: "page", label: "Schedule", size: { height: 792, width: 612 } };

function roundTrip<T>(model: Parameters<typeof structureEnvelope>[0]["model"]): T {
  const envelope = readStructureEnvelope(
    JSON.parse(JSON.stringify(structureEnvelope({ model, text: "…", title: "T" }))),
  );
  assert.ok(envelope && envelope.shape === "units-blocks", "the envelope must read back as units-blocks");
  return envelope.model as unknown as T;
}

const MODEL = buildDocument({
  blocks: [
    { headingPath: ["Course", "Schedule"], kind: "table", table: TABLE, text: "", unit: 0 },
    {
      depth: 1,
      headingPath: ["Course"],
      kind: "listItem",
      marker: "3.",
      rect: { height: 0.02, width: 0.8, x: 0.1, y: 0.2 },
      text: "A nested item",
      unit: 0,
    },
    {
      figure: { description: "A cantilever.", ref: "img1" },
      headingPath: [],
      kind: "figure",
      text: "Figure 1",
      unit: 0,
    },
  ],
  format: "pdf",
  title: "T",
  units: [UNIT],
});

// ── the guards ──────────────────────────────────────────────────────────────

test("🔴 every DocTable field survives JSON → readDocumentModel", () => {
  const table = roundTrip<typeof MODEL>(MODEL).blocks[0]!.table!;
  assert.deepEqual(table, TABLE, "a table must come back exactly as it went in");

  // The field-name check is what makes this fail for a field nobody added here.
  assert.deepEqual(
    Object.keys(table).sort(),
    ["cells", "columns", "continuesFromUnit", "headerRows", "headerSource", "rows"],
    "DocTable gained or lost a field — add it to TABLE above with a real value, then re-run",
  );
});

test("🔴 every DocUnit field survives — this validator has deleted two before", () => {
  // `readDocumentModel` rebuilds units from a NAMED list of fields, unlike
  // blocks which pass through whole. That asymmetry is deliberate and
  // documented, and it is exactly why a new unit field dies silently.
  const unit = roundTrip<typeof MODEL>(MODEL).units[0]!;
  assert.deepEqual(unit, UNIT);
  assert.deepEqual(
    Object.keys(unit).sort(),
    ["index", "kind", "label", "size"],
    "DocUnit gained a field — it MUST be added to readDocumentModel's unit branch or it will be dropped",
  );
});

test("🔴 every DocCell field survives, spans included", () => {
  const cells = roundTrip<typeof MODEL>(MODEL).blocks[0]!.table!.cells!;
  assert.deepEqual(cells, TABLE.cells);
  const spanning = cells.find((c) => (c.rowSpan ?? 1) > 1)!;
  assert.deepEqual(
    Object.keys(spanning).sort(),
    ["column", "row", "rowSpan", "text"],
    "DocCell gained a field — add it to TABLE.cells above",
  );
});

test("optional block fields survive: level, marker, depth, rect, figure", () => {
  const blocks = roundTrip<typeof MODEL>(MODEL).blocks;
  const item = blocks[1]!;
  assert.equal(item.marker, "3.");
  assert.equal(item.depth, 1);
  assert.deepEqual(item.rect, { height: 0.02, width: 0.8, x: 0.1, y: 0.2 });
  const figure = blocks[2]!;
  assert.equal(figure.figure?.ref, "img1");
  assert.equal(figure.figure?.description, "A cantilever.");
});

// ── the last two steps, which the field checks alone do not cover ───────────

test("🔴 the locator still RESOLVES after the round trip, not merely exists", () => {
  // A broken locator is worse than a missing one: every later check of it passes
  // while it points at nothing. So this asserts the unit it names is real and
  // the block id is findable — the shape Gate J used to catch 48 dead calendar
  // refs that all looked perfectly well-formed.
  const model = roundTrip<typeof MODEL>(MODEL);
  for (const block of model.blocks) {
    const locator = locate(model, block);
    assert.ok(locator.unit >= 0 && locator.unit < model.units.length, `${block.id} points outside the document`);
    assert.equal(locator.unitKind, "page");
    assert.ok(model.blocks.some((b) => b.id === locator.blockId), "the block id must be findable");
  }
});

test("🔴 a consumer reading the round-tripped table gets the merge, not a blank", () => {
  // The end of the chain. Everything above can pass while the value a student
  // asked for is still empty, because `rows` alone cannot express a span.
  const table = roundTrip<typeof MODEL>(MODEL).blocks[0]!.table!;
  assert.deepEqual(table.rows, projectCells(table.cells!), "rows must remain exactly the projection");
  const covered = table.cells!.find((c: DocCell) => c.column === 0 && c.row === 1)!;
  assert.equal(covered.rowSpan, 2, "session B still knows who teaches it");
});

test("a format missing from FORMATS makes the whole model vanish — silently", () => {
  // 🔴 THE TRAP THE XLSX/CSV WORK WILL WALK INTO. `readDocumentModel` returns
  // null for an unknown format, and null is indistinguishable from "this parse
  // predates the canonical model" — so the failure reports as old data rather
  // than as a fault. Pinned here so the next format author meets it in a test
  // instead of in production.
  const stored = JSON.parse(JSON.stringify(structureEnvelope({ model: MODEL, text: "…", title: "T" })));
  stored.model.format = "xlsx";
  assert.equal(readStructureEnvelope(stored), null, "add the format to FORMATS in document-envelope.ts");
});
