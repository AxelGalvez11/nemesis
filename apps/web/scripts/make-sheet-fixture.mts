// Builds public/reader-sample.xlsx — the fixture the signed-out reader demo opens for a workbook.
//
// Generated rather than checked in from a real spreadsheet, for the same reasons as
// `make-reader-fixture.mts`: field-agnostic (the standing product rule), tiny, licence-free, and it
// deliberately contains the shapes the sheet view has to handle — two sheets, a header row, merged
// cells, a formula with a cached result, a hidden column, and enough rows to be worth scrolling.
//
// Written with fflate rather than with a spreadsheet library because a .xlsx is a zip of small XML
// parts and the whole file is 60 lines of them. `scripts/make-xlsx-fixtures.py` still exists for the
// PARSER's fixture set, which needs a real application's output; this one only has to be a valid
// workbook the reader can open.
//
// Run: pnpm --filter @nemesis/web exec tsx scripts/make-sheet-fixture.mts

import { writeFile } from "node:fs/promises";

import { strToU8, zipSync } from "fflate";

const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** A row of inline-string or numeric cells. */
function row(index: number, cells: (string | number | { formula: string; value: number })[]): string {
  const parts = cells.map((cell, column) => {
    const ref = `${String.fromCharCode(65 + column)}${index}`;
    if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
    if (typeof cell === "object") return `<c r="${ref}"><f>${cell.formula}</f><v>${cell.value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${cell.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`;
  });
  return `<row r="${index}">${parts.join("")}</row>`;
}

const marks = [
  ["Week", "Read", "Practised", "Total"],
  ["Week 1", 4, 2, { formula: "B2+C2", value: 6 }],
  ["Week 2", 6, 3, { formula: "B3+C3", value: 9 }],
  ["Week 3", 3, 5, { formula: "B4+C4", value: 8 }],
  ["Week 4", 7, 4, { formula: "B5+C5", value: 11 }],
  ["Week 5", 5, 6, { formula: "B6+C6", value: 11 }],
] as const;

const sheet1 =
  `${HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
  marks.map((cells, index) => row(index + 1, [...cells])).join("") +
  "</sheetData></worksheet>";

// A second sheet with a merged title across the top and a hidden column, so the view's merge and
// hidden-column handling has something real to be checked against.
const sheet2 =
  `${HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  '<cols><col min="3" max="3" hidden="1"/></cols>' +
  "<sheetData>" +
  row(1, ["Hours by subject"]) +
  row(2, ["Subject", "Hours", "Internal id"]) +
  row(3, ["Constitutional law", 12, "id-1"]) +
  row(4, ["Fluid mechanics", 9, "id-2"]) +
  row(5, ["Art history", 6, "id-3"]) +
  "</sheetData>" +
  '<mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>' +
  "</worksheet>";

const files: Record<string, Uint8Array> = {
  "[Content_Types].xml": strToU8(
    `${HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      "</Types>",
  ),
  "_rels/.rels": strToU8(
    `${HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      "</Relationships>",
  ),
  "docProps/core.xml": strToU8(
    `${HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      "<dc:title>Study hours</dc:title></cp:coreProperties>",
  ),
  "xl/workbook.xml": strToU8(
    `${HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      '<sheets><sheet name="Marks" sheetId="1" r:id="rId1"/><sheet name="Hours" sheetId="2" r:id="rId2"/></sheets></workbook>',
  ),
  "xl/_rels/workbook.xml.rels": strToU8(
    `${HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      "</Relationships>",
  ),
  "xl/worksheets/sheet1.xml": strToU8(sheet1),
  "xl/worksheets/sheet2.xml": strToU8(sheet2),
};

const out = new URL("../public/reader-sample.xlsx", import.meta.url);
await writeFile(out, zipSync(files));
console.log(`wrote ${out.pathname}`);
