import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readWorkbook } from "@/lib/notebooks/xlsx-structure";
import { readerKind } from "@/lib/reader/reader-source";
import { librarySourceKind } from "@/lib/workspace/library-sources";

import { columnLetter, sheetText } from "./sheet-document-view";
import { at } from "@/lib/reader/test-helpers";

// 🔴 THE LAST FORMAT THE PANEL COULD NOT SHOW. Owner, 2026-08-27: *"users should be able to view
// slides, docs, pdf, xlxs, etc."* Everything else landed the next day; a workbook fell through to a
// kind with no view at all and got the "no reader for this format" card.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const VIEW = strip(readFileSync(new URL("./sheet-document-view.tsx", import.meta.url), "utf8"));
const PARSER = readFileSync(new URL("../../../lib/notebooks/xlsx-structure.ts", import.meta.url), "utf8");

test("🔴🔴 a workbook opens in the sheet lane, and .xls deliberately does not", () => {
  assert.equal(readerKind("Study hours by week.xlsx"), "sheet");
  assert.equal(librarySourceKind("Study hours by week.xlsx"), "sheet");
  assert.equal(readerKind("macros.xlsm"), "sheet");
  // 🔴 THE OLD BINARY FORMAT IS NOT A ZIP OF XML and `readWorkbook` cannot open it. Calling it a
  // spreadsheet would promise a viewer that then says it cannot read the file; "file" is the truth.
  assert.equal(readerKind("ancient.xls"), "file");
  assert.equal(librarySourceKind("ancient.xls"), "file");
});

test("🔴🔴 the view uses the PARSER THE ANSWERS ARE GROUNDED ON, not a second one", () => {
  // `xlsx-structure.ts` has read workbooks for months for the extraction pipeline. A second reader
  // written for the screen would be a second opinion about what a cell says, free to disagree with
  // the one the citations resolve against.
  assert.match(VIEW, /from "@\/lib\/notebooks\/xlsx-structure"/, "the sheet view has grown its own parser");
  // 🔴 AND IT REACHES THE BROWSER ONLY BECAUSE THE UNZIP MOVED. `office.ts` imports node:crypto at
  // module scope; importing it from a client component takes the whole extraction pipeline into the
  // bundle, or fails the build outright. Calibration: point this import back at "./office".
  assert.match(PARSER, /import \{ unzipBounded \} from "\.\/office-unzip";/, "the parser imports the server-only office module again");
});

test("🔴 the cap is printed, never silent", () => {
  // A modelling workbook is tens of thousands of rows and every cell is a DOM node. What is not
  // acceptable is a viewer that draws 200 of 12,000 and looks complete.
  assert.match(VIEW, /Showing \{shown\.length\} of \{rows\.length\} rows/, "the row cap stopped saying what it dropped");
});

test("🔴 unsupported is not absent", () => {
  // A workbook can be perfectly readable while some of what it holds is not. A viewer that says
  // nothing turns "we did not draw your chart" into "your chart is gone".
  assert.match(VIEW, /workbook\.unsupported\.length > 0/, "the view stopped reporting what it did not draw");
});

test("column letters are Excel's own, past Z", () => {
  // A reference like C14 or AA3 is how a person names a cell; anonymous columns make one unusable.
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(27), "AB");
  assert.equal(columnLetter(51), "AZ");
  assert.equal(columnLetter(52), "BA");
});

test("🔴🔴 the real fixture workbook reads back as sheets, merges, hidden columns and formulas", () => {
  // The one test that proves the whole lane: `public/reader-sample.xlsx` is what the signed-out
  // reader demo opens, and it deliberately carries the four things this view has to get right.
  const bytes = readFileSync(new URL("../../../public/reader-sample.xlsx", import.meta.url));
  const workbook = readWorkbook(new Uint8Array(bytes));
  assert.equal(workbook.title, "Study hours");
  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), ["Marks", "Hours"]);

  const marks = at(workbook.sheets, 0);
  // A formula cell shows its CACHED RESULT, which is what the spreadsheet shows, and keeps the
  // formula beside it — the thing a spreadsheet hides and a student needs.
  const total = marks.cells.find((cell) => cell.row === 1 && cell.column === 3);
  assert.equal(total?.text, "6");
  assert.equal(total?.formula, "B2+C2");

  const hours = at(workbook.sheets, 1);
  assert.deepEqual(hours.merges, [{ row: 0, column: 0, rowSpan: 1, colSpan: 3 }]);
  assert.deepEqual(hours.hiddenColumns, [2]);

  // And a sheet is searchable as one unit of text, the way a page is.
  assert.match(sheetText(marks), /Week 1\t4\t2\t6/);
});

test("🔴 a citation into a workbook says Sheet, in both places that name a unit", async () => {
  // The note's pill and the reader's own sentence must call the same thing by the same name — the
  // two tables say so in their comments. Adding a kind to one and not the other is how "Sheet 2"
  // becomes "Part 2" on exactly one surface.
  const { unitNoun } = await import("@/lib/reader/reader-anchor");
  const { describeCitation } = await import("@/lib/workspace/note-citations");
  assert.equal(unitNoun("sheet"), "sheet");
  assert.equal(
    describeCitation({ kind: "sheet", name: "Study hours by week.xlsx" }, { unit: 2, seconds: null, query: null }),
    "Study hours by week · Sheet 2",
  );
});
