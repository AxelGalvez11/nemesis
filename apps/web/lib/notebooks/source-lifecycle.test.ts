// Run: npx tsx --test apps/web/lib/notebooks/source-lifecycle.test.ts
//
// THE LOCATOR LIFECYCLE, one stage at a time, on real bytes.
//
//   .xlsx bytes -> parse -> normalized units -> chunks -> library_chunks rows -> citation
//
// 🔴 A CITATION IS ONLY WORTH ANYTHING IF IT SURVIVES ALL OF IT. Every stage in that chain is a
// place a measured position can quietly be dropped, and the failure is invisible: the answer still
// arrives, still cites something, and the something is now the whole sheet instead of the eight
// cells the number actually came from. walkBlocks() lost the range exactly this way once -- it
// spread the UNIT's locator onto every block, and a sheet is not a range -- so this file exists to
// make that class of loss loud.
//
// The database half of the same chain (rows -> storage -> match_source_chunks -> back out with
// cell_range intact) is proven separately, against production, in
// supabase/tests/origin_retrieval_regression.sql. Between the two, nothing in the chain is assumed.
import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkDocument, CHUNKER_VERSION, citeLocator, type Locator } from "@nemesis/shared";
import { zipSync } from "fflate";

import { EMBEDDING_VERSION, sourceChunkRows, type SourceChunkRow } from "./ingest-plan";
import { parseXlsx, XLSX_PARSER_VERSION } from "./xlsx-parse";

const encode = (s: string) => new TextEncoder().encode(s);
const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

/**
 * A workbook whose one table sits at B12:F19 of a sheet called Forecast.
 *
 * Deliberately NOT anchored at A1: a table that starts in the first cell would pass even if the
 * range were being invented rather than measured, because A1 is what anyone would guess.
 */
function forecastWorkbook(): Uint8Array {
  const columns = ["B", "C", "D", "E", "F"];
  const headings = ["Month", "Revenue", "Cost", "Margin", "Note"];
  let rows = `<row r="12">${columns.map((c, i) => inline(`${c}12`, headings[i]!)).join("")}</row>`;
  for (let r = 13; r <= 19; r += 1) {
    const values = [`M${r - 12}`, `${1000 + r}`, `${900 + r}`, `${100}`, "ok"];
    rows += `<row r="${r}">${columns.map((c, i) => inline(`${c}${r}`, values[i]!)).join("")}</row>`;
  }
  return zipSync({
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Forecast" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/worksheets/sheet1.xml": encode(
      `<?xml version="1.0"?><worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData></worksheet>`,
    ),
  });
}

/** The whole pipeline up to the rows that get inserted, with nothing mocked. */
function runToRows(): { rows: SourceChunkRow[]; parsedRange: string } {
  const doc = parseXlsx(forecastWorkbook(), "Budget.xlsx");
  const chunks = chunkDocument(doc);
  const rows = sourceChunkRows({
    chunks,
    parsedDocumentId: "00000000-0000-0000-0000-0000000000aa",
    title: doc.title ?? "Budget",
    userId: "00000000-0000-0000-0000-0000000000bb",
    versions: { chunker: CHUNKER_VERSION, embedding: EMBEDDING_VERSION, parser: XLSX_PARSER_VERSION },
  });
  return { parsedRange: citeLocator(doc.tables[0]!.locator), rows };
}

test("stage 1 — the parser MEASURES Forecast!B12:F19 rather than guessing A1", () => {
  const doc = parseXlsx(forecastWorkbook(), "Budget.xlsx");
  assert.equal(doc.tables.length, 1);
  const locator = doc.tables[0]!.locator;
  assert.equal(locator.kind, "sheet");
  assert.equal(locator.label, "Forecast");
  assert.equal(locator.range, "B12:F19");
  assert.equal(citeLocator(locator), "Forecast!B12:F19");
});

test("stage 2 — chunking carries the range through, instead of falling back to the sheet", () => {
  const doc = parseXlsx(forecastWorkbook(), "Budget.xlsx");
  const chunks = chunkDocument(doc);
  assert.ok(chunks.length > 0);
  // 🔴 THIS IS THE ASSERTION walkBlocks() USED TO FAIL. Without the table's own locator, every
  // chunk here would carry the UNIT's -- kind "sheet", label "Forecast", and NO range -- and the
  // citation would silently degrade to "Forecast".
  for (const chunk of chunks) {
    assert.equal(chunk.locator.range, "B12:F19", `chunk ${chunk.chunkIndex} lost the range`);
    assert.equal(citeLocator(chunk.locator), "Forecast!B12:F19");
  }
});

test("stage 3 — the range lands in a queryable COLUMN, not inside the chunk's text", () => {
  const { rows } = runToRows();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.origin_type, "source");
    assert.equal(row.unit_kind, "sheet");
    assert.equal(row.unit_label, "Forecast");
    assert.equal(row.cell_range, "B12:F19");
    assert.equal(row.document_id, null, "a source chunk has no note");
    assert.equal(row.parser_version, XLSX_PARSER_VERSION);
    assert.equal(row.chunker_version, CHUNKER_VERSION);
    assert.equal(row.embedding_version, EMBEDDING_VERSION);
  }
  // The point of a column: "which chunks came from B12:F19" is a WHERE clause, never a regex over
  // prose. If the range were only in the text, this would be the only way to find it.
  assert.ok(!rows[0]!.content.includes("B12:F19"), "the range must not be smuggled into the text");
});

test("stage 4 — a citation renderer rebuilds the exact range from the stored columns alone", () => {
  const { rows } = runToRows();
  // Retrieval hands back columns, not a Locator. This is the reconstruction every citation renderer
  // has to do, done here from the row and nothing else -- no access to the parse.
  const row = rows[0]!;
  const rebuilt: Locator = {
    kind: row.unit_kind,
    ...(row.unit_index === null ? {} : { index: row.unit_index }),
    ...(row.unit_label === null ? {} : { label: row.unit_label }),
    ...(row.cell_range === null ? {} : { range: row.cell_range }),
    ...(row.heading_path === null ? {} : { headingPath: row.heading_path }),
  };
  assert.equal(citeLocator(rebuilt), "Forecast!B12:F19");
});

test("the range is identical at every stage — no silent drift anywhere in the chain", () => {
  const doc = parseXlsx(forecastWorkbook(), "Budget.xlsx");
  const chunks = chunkDocument(doc);
  const { rows } = runToRows();
  const atEveryStage = new Set<string>([
    citeLocator(doc.tables[0]!.locator),
    ...chunks.map((c) => citeLocator(c.locator)),
    ...rows.map((r) => citeLocator({ kind: r.unit_kind, label: r.unit_label ?? undefined, range: r.cell_range ?? undefined })),
  ]);
  assert.deepEqual([...atEveryStage], ["Forecast!B12:F19"], "the citation changed somewhere in the chain");
});

test("a sheet with no table still cites honestly, and never invents a range", () => {
  // The other half of "measured, never inferred": when there is no range to report, the citation
  // degrades to the sheet rather than making one up.
  const bytes = zipSync({
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/worksheets/sheet1.xml": encode(
      `<?xml version="1.0"?><worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="1">${inline("A1", "Prepared by the finance team")}</row></sheetData></worksheet>`,
    ),
  });
  const doc = parseXlsx(bytes, "Notes.xlsx");
  const chunks = chunkDocument(doc);
  assert.ok(chunks.length > 0);
  for (const chunk of chunks) {
    assert.equal(chunk.locator.range, undefined, "there is no range here to report");
    assert.equal(citeLocator(chunk.locator), "Notes");
  }
  const { rows } = runToRows();
  assert.ok(rows.every((r) => r.cell_range !== null), "the OTHER fixture does have a range — guard against a null-everywhere bug");
});
