// Run: npx tsx --test apps/web/lib/notebooks/xlsx-parse.test.ts
//
// A REAL workbook is built here with fflate rather than stubbed, because the thing under test is
// what a .xlsx actually contains: shared strings, a style table whose first list is a decoy, dates
// that are only dates because of that table, a formula written once for seven cells, a merged
// banner, two tables sharing a sheet, a sheet with holes in it, a hidden sheet and an empty one.
// A stub would only test the stub.
//
// The fixture deliberately scrambles the sheet FILENAMES against the tab order, because that is
// the mistake the format invites: xl/worksheets/sheet1.xml is not sheet one.
import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkDocument, citeLocator, type DocTable, type ParsedDocument } from "@nemesis/shared";
import { zipSync } from "fflate";

import { MAX_FORMULA_LINES, MAX_TABLE_TEXT_ROWS, parseXlsx, XLSX_PARSER_VERSION, xlsxParser } from "./xlsx-parse";

const encode = (s: string) => new TextEncoder().encode(s);

/** Shared strings, in index order. Index 9 is rich text with a phonetic guide attached. */
const SHARED_STRINGS = [
  "Q3 Forecast",
  "Month",
  "Revenue",
  "Cost",
  "Margin",
  "Updated",
  "July",
  "August",
  "September",
  "__rich__",
  "October",
  "November",
  "December",
  "January",
];

function sharedStringsXml(): string {
  const items = SHARED_STRINGS.map((value) =>
    value === "__rich__"
      ? // One string wearing two fonts, plus <rPh> — a reading aid stored beside the word (furigana
        // over kanji). The runs join; the reading aid must not appear at all.
        '<si><r><t>Rich</t></r><r><t xml:space="preserve"> text</t></r><rPh sb="0" eb="4"><t>リッチ</t></rPh></si>'
      : `<si><t>${value}</t></si>`,
  ).join("");
  return `<?xml version="1.0"?><sst count="${SHARED_STRINGS.length}" uniqueCount="${SHARED_STRINGS.length}">${items}</sst>`;
}

/**
 * The style table.
 *
 * 🔴 `<cellStyleXfs>` comes FIRST and holds a date format. A cell's `s` indexes `<cellXfs>`, the
 * second list. Read the wrong one and every plain number in the workbook becomes a date.
 */
const STYLES_XML = `<?xml version="1.0"?><styleSheet>
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>
    <numFmt numFmtId="165" formatCode="0.00&quot; days&quot;"/>
  </numFmts>
  <cellStyleXfs count="1"><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" xfId="0"/>
    <xf numFmtId="14" xfId="0"/>
    <xf numFmtId="164" xfId="0"/>
    <xf numFmtId="10" xfId="0"/>
    <xf numFmtId="165" xfId="0"/>
  </cellXfs>
</styleSheet>`;

function worksheet(rows: string, tail = ""): string {
  return `<?xml version="1.0"?><worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${tail}</worksheet>`;
}

/** Revenue that falls in the middle — the question the whole parser exists to make answerable. */
const FORECAST_ROWS = [
  { cost: 900, month: 6, revenue: 1200 },
  { cost: 950, month: 7, revenue: 1100 },
  { cost: 980, month: 8, revenue: 700 },
  { cost: 940, month: 10, revenue: 1500 },
  { cost: 930, month: 11, revenue: 1450 },
  { cost: 910, month: 12, revenue: 1400 },
  { cost: 905, month: 13, revenue: 1380 },
];

function forecastSheet(): string {
  // Row 11 is a merged banner across the block; row 12 is the header; rows 13-19 are the data.
  let rows = `<row r="11"><c r="B11" t="s"><v>0</v></c></row>`;
  rows += `<row r="12">${[1, 2, 3, 4, 5].map((si, i) => `<c r="${"BCDEF"[i]}12" t="s"><v>${si}</v></c>`).join("")}</row>`;
  FORECAST_ROWS.forEach((entry, i) => {
    const row = 13 + i;
    // The margin column is ONE shared formula: written out on E13, referred to by id on E14-E19.
    const formula =
      i === 0
        ? `<f t="shared" ref="E13:E19" si="0">C13-D13</f>`
        : `<f t="shared" si="0"/>`;
    rows +=
      `<row r="${row}">` +
      `<c r="B${row}" t="s"><v>${entry.month}</v></c>` +
      `<c r="C${row}"><v>${entry.revenue}</v></c>` +
      `<c r="D${row}"><v>${entry.cost}</v></c>` +
      `<c r="E${row}">${formula}<v>${entry.revenue - entry.cost}</v></c>` +
      `<c r="F${row}" s="1"><v>${45_292 + 30 * i}</v></c>` +
      `</row>`;
  });
  return worksheet(rows, `<mergeCells count="1"><mergeCell ref="B11:F11"/></mergeCells>`);
}

function ledgerSheet(): string {
  const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  return worksheet(
    `<row r="1">${inline("A1", "Item")}${inline("B1", "Qty")}${inline("C1", "In stock")}` +
      `${inline("E1", "Code")}${inline("F1", "Rate")}${inline("G1", "Days")}</row>` +
      `<row r="2">${inline("A2", "Bolt")}<c r="B2"><v>12</v></c><c r="C2" t="b"><v>1</v></c>` +
      `${inline("E2", "AL")}<c r="F2" s="3"><v>0.25</v></c><c r="G2" s="4"><v>45292</v></c></row>` +
      `<row r="3">${inline("A3", "Nut")}<c r="B3"><v>0</v></c><c r="C3" t="b"><v>0</v></c>` +
      `<c r="E3" t="s"><v>9</v></c><c r="F3" s="3"><v>0.5</v></c><c r="G3" s="0"><v>45292</v></c></row>` +
      // A cell that failed. An error is a value, and hiding it would make the sheet look healthy.
      `<row r="4">${inline("A4", "Washer")}<c r="B4"><v>5</v></c><c r="C4" t="e"><v>#DIV/0!</v></c></row>` +
      // Rows 5-11 do not exist at all. A used range is not a rectangle.
      `<row r="12">${inline("A12", "Prepared by the finance team")}</row>`,
  );
}

function inventorySheet(): string {
  const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  return worksheet(
    `<row r="1">${inline("A1", "Part")}${inline("B1", "Count")}</row>` +
      `<row r="2">${inline("A2", "Screw")}<c r="B2"><v>40</v></c></row>` +
      `<row r="3">${inline("A3", "Nail")}<c r="B3"><v>60</v></c></row>`,
    `<tableParts count="1"><tablePart r:id="rId1"/></tableParts>`,
  );
}

function filteredSheet(): string {
  const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  // Row 3 is empty, so shape alone would split this into two blocks. The autofilter says it is one.
  return worksheet(
    `<row r="1">${inline("A1", "Name")}${inline("B1", "Score")}</row>` +
      `<row r="2">${inline("A2", "Ada")}<c r="B2"><v>91</v></c></row>` +
      `<row r="4">${inline("A4", "Grace")}<c r="B4"><v>88</v></c></row>`,
    `<autoFilter ref="A1:B4"/>`,
  );
}

/** The whole workbook. Sheet FILENAMES are scrambled against tab order on purpose. */
function workbook(): Uint8Array {
  const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  return zipSync({
    "docProps/core.xml": encode(
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>Regional budget</dc:title></cp:coreProperties>`,
    ),
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships>
        <Relationship Id="rId1" Target="worksheets/sheet6.xml"/>
        <Relationship Id="rId2" Target="/xl/worksheets/sheet3.xml"/>
        <Relationship Id="rId3" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId4" Target="worksheets/sheet2.xml"/>
        <Relationship Id="rId5" Target="worksheets/sheet5.xml"/>
        <Relationship Id="rId6" Target="worksheets/sheet4.xml"/>
      </Relationships>`,
    ),
    "xl/sharedStrings.xml": encode(sharedStringsXml()),
    "xl/styles.xml": encode(STYLES_XML),
    "xl/tables/table1.xml": encode(
      `<?xml version="1.0"?><table id="1" name="Parts" displayName="Parts" ref="A1:B3" headerRowCount="1"><tableColumns count="2"><tableColumn id="1" name="Part"/><tableColumn id="2" name="Count"/></tableColumns></table>`,
    ),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="Forecast" sheetId="1" r:id="rId1"/>
          <sheet name="Ledger" sheetId="2" r:id="rId2"/>
          <sheet name="Inventory" sheetId="3" r:id="rId3"/>
          <sheet name="Filtered" sheetId="4" r:id="rId4"/>
          <sheet name="Notes" sheetId="5" state="hidden" r:id="rId5"/>
          <sheet name="Blank" sheetId="6" r:id="rId6"/>
        </sheets>
        <definedNames><definedName name="TaxRate">Forecast!$C$1</definedName></definedNames>
      </workbook>`,
    ),
    // The declared table is reached through the SHEET's own rels, with a relative target.
    "xl/worksheets/_rels/sheet1.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="../tables/table1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": encode(inventorySheet()),
    "xl/worksheets/sheet2.xml": encode(filteredSheet()),
    "xl/worksheets/sheet3.xml": encode(ledgerSheet()),
    "xl/worksheets/sheet4.xml": encode(worksheet("")),
    "xl/worksheets/sheet5.xml": encode(worksheet(`<row r="1">${inline("A1", "Ask the vendor about pricing.")}</row>`)),
    "xl/worksheets/sheet6.xml": encode(forecastSheet()),
  });
}

const parsed: ParsedDocument = parseXlsx(workbook(), "Budget.xlsx");
const tablesOn = (sheet: string): DocTable[] => parsed.tables.filter((t) => t.locator.label === sheet);

test("the workbook is a normalized document, one unit per sheet, in TAB order", () => {
  assert.equal(parsed.kind, "xlsx");
  assert.equal(parsed.parserVersion, XLSX_PARSER_VERSION);
  assert.equal(parsed.title, "Regional budget");
  assert.match(parsed.contentHash, /^[0-9a-f]{64}$/);
  // Sorting the sheetN.xml filenames would have produced Inventory, Filtered, Ledger, Blank, …
  assert.deepEqual(
    parsed.units.map((u) => u.locator.label),
    ["Forecast", "Ledger", "Inventory", "Filtered", "Notes", "Blank"],
  );
  assert.deepEqual(
    parsed.units.map((u) => u.locator.index),
    [1, 2, 3, 4, 5, 6],
  );
  for (const unit of parsed.units) assert.equal(unit.locator.kind, "sheet");
});

test("a table cites the sheet and the range it was measured at", () => {
  const forecast = tablesOn("Forecast");
  assert.equal(forecast.length, 1);
  const table = forecast[0]!;
  // 🔴 THE BAR: this exact string is what a retrieved answer has to be able to point at.
  assert.equal(citeLocator(table.locator), "Forecast!B12:F19");
  // The merged banner above the header is the table's TITLE, not its first row of data.
  assert.equal(table.title, "Q3 Forecast");
  assert.equal(table.method, "cell");
});

test("shared strings, headers and the header row's own flag", () => {
  const table = tablesOn("Forecast")[0]!;
  const header = table.rows[0]!;
  assert.deepEqual(
    header.map((c) => c.text),
    ["Month", "Revenue", "Cost", "Margin", "Updated"],
  );
  assert.ok(header.every((c) => c.header === true));
  // Table-relative coordinates, absolute address on `ref` — so a renderer never asks which parser
  // made the table, and a citation can still name the cell.
  assert.deepEqual(header[0], { col: 0, header: true, ref: "B12", row: 0, text: "Month" });
  assert.ok(table.rows.slice(1).every((row) => row.every((c) => c.header === undefined)));
  assert.equal(table.rows.length, 8); // one header row plus seven months
});

test("a number is a date only because the style table says so", () => {
  const table = tablesOn("Forecast")[0]!;
  const first = table.rows[1]!;
  assert.equal(first[0]?.text, "July");
  assert.equal(first[1]?.text, "1200");
  // 45292 under built-in format 14. Getting this wrong is what turns every date into 45000.
  assert.equal(first[4]?.text, "2024-01-01");
  assert.equal(first[4]?.ref, "F13");
  assert.equal(table.rows[2]?.[4]?.text, "2024-01-31");
});

test("a number stays a number when its own style is not a date", () => {
  const ledger = tablesOn("Ledger");
  const rates = ledger.find((t) => t.rows[0]?.some((c) => c.text === "Days"))!;
  const days = rates.rows.flat().filter((c) => c.text === "45292");
  // Two cells hold 45292: one under `0.00" days"` (a quoted literal, not a date) and one under
  // style 0, whose numFmtId is General — while <cellStyleXfs> entry 0 is a date format decoy.
  assert.equal(days.length, 2);
  assert.deepEqual(days.map((c) => c.ref).sort(), ["G2", "G3"]);
});

test("a shared formula is recorded for every cell that shares it", () => {
  const table = tablesOn("Forecast")[0]!;
  const margins = table.rows.slice(1).map((row) => row[3]!);
  assert.deepEqual(
    margins.map((c) => c.formula),
    ["C13-D13", "C14-D14", "C15-D15", "C16-D16", "C17-D17", "C18-D18", "C19-D19"],
  );
  // The cached value the sheet displays is kept alongside the formula.
  assert.equal(margins[0]?.text, "300");
  assert.equal(margins[2]?.text, String(700 - 980));
  assert.ok(parsed.coverage.notes?.some((note) => note.includes("share a formula")));
});

test("the block a chunker reads carries the sheet, the range, the values and the formulas", () => {
  const unit = parsed.units[0]!;
  const block = unit.blocks.find((b) => b.kind === "table")!;
  assert.equal(block.method, "cell");
  assert.ok(block.tableId);
  const [head, header, july] = block.text.split("\n");
  assert.equal(head, "Forecast!B12:F19 — Q3 Forecast");
  assert.equal(header, "Month | Revenue | Cost | Margin | Updated");
  assert.equal(july, "July | 1200 | 900 | 300 | 2024-01-01");
  // Without this line, "why did revenue fall" can never surface the arithmetic behind the number.
  assert.match(block.text, /Formulas: E13=C13-D13;/);
  assert.match(block.text, /E19=C19-D19/);
});

test("two tables on one sheet, split by the blank column between them", () => {
  const ledger = tablesOn("Ledger");
  assert.equal(ledger.length, 2);
  // Each block is measured from the cells that exist: the left one runs a row deeper than the
  // right one, and neither is padded out to match the other.
  assert.deepEqual(ledger.map((t) => t.locator.range), ["A1:C4", "E1:G3"]);
  const [items, rates] = ledger as [DocTable, DocTable];
  assert.deepEqual(items.rows[0]?.map((c) => c.text), ["Item", "Qty", "In stock"]);
  // Booleans and errors are values, typed by the file rather than by looking at the characters.
  assert.equal(items.rows[1]?.[2]?.text, "TRUE");
  assert.equal(items.rows[2]?.[2]?.text, "FALSE");
  assert.equal(items.rows[3]?.[2]?.text, "#DIV/0!");
  // A percentage is stored as a fraction; printing 0.25 for it would be a different claim.
  assert.equal(rates.rows[1]?.[1]?.text, "25%");
  assert.equal(rates.rows[2]?.[1]?.text, "50%");
  // Rich text joins its runs; the phonetic guide beside it is not part of the word.
  assert.equal(rates.rows[2]?.[0]?.text, "Rich text");
});

test("a sheet with holes in it keeps the text that is not in any table", () => {
  const ledger = parsed.units[1]!;
  const notes = ledger.blocks.filter((b) => b.kind === "paragraph");
  assert.deepEqual(notes.map((b) => b.text), ["Prepared by the finance team"]);
  // Reading order: the two tables first, then the note eight rows below them.
  assert.deepEqual(ledger.blocks.map((b) => b.kind), ["table", "table", "paragraph"]);
  assert.deepEqual(ledger.blocks.map((b) => b.ordinal), [0, 1, 2]);
});

test("a declared table is used as declared, and is not also found again by shape", () => {
  const inventory = tablesOn("Inventory");
  assert.equal(inventory.length, 1); // not two: the fallback must not re-claim declared cells
  assert.equal(citeLocator(inventory[0]!.locator), "Inventory!A1:B3");
  assert.equal(inventory[0]?.title, "Parts");
  assert.ok(inventory[0]?.rows[0]?.every((c) => c.header === true));
});

test("an autofilter range holds a table together that shape alone would split", () => {
  const filtered = tablesOn("Filtered");
  assert.equal(filtered.length, 1);
  assert.equal(citeLocator(filtered[0]!.locator), "Filtered!A1:B4");
  assert.equal(filtered[0]?.rows.length, 3); // the empty row 3 contributes nothing
});

test("a hidden sheet is read and said out loud; an empty one is counted, not invented", () => {
  const notes = parsed.units[4]!;
  assert.equal(notes.locator.label, "Notes");
  assert.deepEqual(notes.blocks.map((b) => b.text), ["Ask the vendor about pricing."]);
  assert.ok(parsed.coverage.notes?.some((note) => note.includes("hidden")));
  assert.equal(parsed.meta?.hiddenSheets, "Notes");

  const blank = parsed.units[5]!;
  assert.equal(blank.blocks.length, 0);
  assert.equal(parsed.coverage.unitsFound, 6);
  assert.equal(parsed.coverage.unitsRead, 5);
  assert.deepEqual(parsed.coverage.unitsUnread, [6]);
  assert.equal(parsed.coverage.tablesFound, 5);
  // Charts and drawings are out of scope, so this is a measured zero, not an unknown.
  assert.equal(parsed.coverage.visualsFound, 0);
  assert.deepEqual(parsed.visuals, []);
});

test("the workbook's own facts are kept where they cannot drive control flow", () => {
  assert.equal(parsed.meta?.sheetCount, 6);
  assert.equal(parsed.meta?.date1904, false);
  assert.equal(parsed.meta?.formulaCount, 7);
  assert.equal(parsed.meta?.definedNames, "TaxRate=Forecast!$C$1");
});

test("a 1904 workbook is read on its own calendar", async () => {
  const bytes = zipSync({
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/styles.xml": encode(STYLES_XML),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="1"/><sheets><sheet name="Mac" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/worksheets/sheet1.xml": encode(
      worksheet(
        `<row r="1"><c r="A1" t="inlineStr"><is><t>Signed</t></is></c><c r="B1" t="inlineStr"><is><t>Due</t></is></c></row>` +
          `<row r="2"><c r="A2" s="2"><v>43830</v></c><c r="B2" s="2"><v>43861</v></c></row>`,
      ),
    ),
  });
  // Through the DocumentParser face, which is what everything downstream actually holds.
  const doc = await xlsxParser.parse(bytes, "Mac.xlsx");
  assert.equal(doc.meta?.date1904, true);
  const row = doc.tables[0]!.rows[1]!;
  // The same serial under the 1900 calendar would be 2020-01-01: four years and a day out.
  assert.deepEqual(row.map((c) => c.text), ["2024-01-01", "2024-02-01"]);
});

test("a declared range far bigger than its contents is trimmed, not walked", () => {
  // Excel writes a table's ref as the author drew it, and deleting rows leaves the ref behind. A
  // ref like this covers seventeen billion positions: anything that visits them never returns, and
  // a citation to A1:XFD1048576 names nothing.
  const bytes = zipSync({
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/tables/table1.xml": encode(
      `<?xml version="1.0"?><table id="1" displayName="Roster" ref="A1:XFD1048576" headerRowCount="1"/>`,
    ),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Wide" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/worksheets/_rels/sheet1.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="/xl/tables/table1.xml"/></Relationships>`,
    ),
    // No `r` on the rows or the cells: some generators leave them off entirely, and then position
    // IS the address. A cell that carries a formula whose result was never cached still counts.
    "xl/worksheets/sheet1.xml": encode(
      worksheet(
        `<row><c t="inlineStr"><is><t>Name</t></is></c><c t="inlineStr"><is><t>Score</t></is></c><c t="inlineStr"><is><t>Total</t></is></c></row>` +
          `<row><c t="inlineStr"><is><t>Ada</t></is></c><c><v>91</v></c><c><f>B2*2</f></c></row>`,
        `<tableParts count="1"><tablePart r:id="rId1"/></tableParts>`,
      ),
    ),
  });
  const started = Date.now();
  const doc = parseXlsx(bytes, "Wide.xlsx");
  assert.ok(Date.now() - started < 5_000, "an oversized declared range must not be walked position by position");
  assert.equal(doc.tables.length, 1);
  assert.equal(citeLocator(doc.tables[0]!.locator), "Wide!A1:C2");
  assert.equal(doc.tables[0]?.title, "Roster");
  const [name, score, total] = doc.tables[0]!.rows[1]!;
  assert.deepEqual([name?.ref, score?.ref, total?.ref], ["A2", "B2", "C2"]);
  assert.equal(score?.text, "91");
  // A formula with no cached value keeps the formula and admits the value is missing.
  assert.equal(total?.formula, "B2*2");
  assert.equal(total?.text, "");
});

test("a table too big for one block says what it left out, in both directions", () => {
  // Taller than both ceilings. The full grid survives on DocTable.rows either way; what is tested
  // here is that the SHORTENED rendering admits it is shortened, rather than reading as complete.
  const overflow = MAX_TABLE_TEXT_ROWS + 25;
  let rows = `<row r="1"><c r="A1" t="inlineStr"><is><t>Day</t></is></c><c r="B1" t="inlineStr"><is><t>Spend</t></is></c></row>`;
  for (let i = 0; i < overflow; i += 1) {
    const row = i + 2;
    rows +=
      `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Day ${i + 1}</t></is></c>` +
      `<c r="B${row}"><f>${i + 1}*2</f><v>${(i + 1) * 2}</v></c></row>`;
  }
  const bytes = zipSync({
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Spend" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/worksheets/sheet1.xml": encode(worksheet(rows)),
  });
  const doc = parseXlsx(bytes, "Spend.xlsx");
  const table = doc.tables[0]!;
  assert.equal(table.rows.length, overflow + 1); // nothing is lost from the parse itself
  const text = doc.units[0]!.blocks[0]!.text;
  assert.match(text, new RegExp(`… ${overflow + 1 - MAX_TABLE_TEXT_ROWS} more rows`));
  assert.match(text, new RegExp(`… ${overflow - MAX_FORMULA_LINES} more formulas`));
  assert.equal(text.split("\n").length, MAX_TABLE_TEXT_ROWS + 3); // heading, rows, "more rows", formulas
});

test("bytes that are not a workbook are refused with something a person can read", () => {
  const notAWorkbook = zipSync({ "word/document.xml": encode("<w:document/>") });
  assert.throws(() => parseXlsx(notAWorkbook, "essay.docx"), /Excel/);
  assert.throws(() => parseXlsx(encode("hello"), "notes.txt"));
});

// ── Merged ranges ────────────────────────────────────────────────────────────
//
// 🔴 A MERGE IS ONE SHORT ATTRIBUTE THAT CAN NAME SEVENTEEN BILLION CELLS.
// `<mergeCell ref="A1:XFD1048576"/>` is legal, valid, and takes a moment to type;
// the obvious loop over every coordinate inside it never returns. These tests
// exist to prove the sweep costs what the sheet CONTAINS, not what it DECLARES.

/** A one-sheet workbook: rows as given, plus whatever tail XML (mergeCells, etc). */
function mergeBook(rows: string, tail = ""): Uint8Array {
  return zipSync({
    "xl/_rels/workbook.xml.rels": encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/styles.xml": encode(STYLES_XML),
    "xl/workbook.xml": encode(
      `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Merged" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/worksheets/sheet1.xml": encode(worksheet(rows, tail)),
  });
}

const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

/**
 * Every piece of text the parse holds, from BOTH places it can live.
 *
 * A handful of cells is not a table — the region finder needs a shape to find — so a small fixture
 * comes back as blocks on the unit and `tables` is empty. Looking only at tables would make these
 * assertions pass vacuously, which is the failure mode a coverage helper is most prone to.
 */
function allCellText(parsed: ParsedDocument): string[] {
  return [
    ...parsed.tables.flatMap((t: DocTable) => t.rows.flatMap((row) => row.map((c) => c.text))),
    ...parsed.units.flatMap((u) => u.blocks.map((b) => b.text)),
  ];
}

/** A workbook whose sheet is big enough to be recognised as a table, with a merged cell inside the
 *  BODY — which is where a merge actually threatens column alignment. */
function tableWithInternalMerge(): Uint8Array {
  const columns = ["A", "B", "C", "D"];
  const headings = ["Region", "Q3", "Q4", "Note"];
  let rows = `<row r="1">${columns.map((c, i) => inline(`${c}1`, headings[i]!)).join("")}</row>`;
  for (let r = 2; r <= 7; r += 1) {
    if (r === 4) {
      // A4:B4 merged, so column B is absent from this row entirely and 9.9 sits in column C.
      rows += `<row r="4">${inline("A4", "Combined")}${inline("C4", "9.9")}${inline("D4", "checked")}</row>`;
      continue;
    }
    rows += `<row r="${r}">${columns.map((c, i) => inline(`${c}${r}`, `v${r}${i}`)).join("")}</row>`;
  }
  return mergeBook(rows, `<mergeCells count="1"><mergeCell ref="A4:B4"/></mergeCells>`);
}

test("a merge covering the whole sheet is bounded by what the sheet contains", () => {
  const rows =
    `<row r="1">${inline("A1", "Banner")}${inline("C1", "covered")}</row>` +
    `<row r="5">${inline("B5", "also covered")}</row>`;
  const started = Date.now();
  const parsed = parseXlsx(mergeBook(rows, `<mergeCells count="1"><mergeCell ref="A1:XFD1048576"/></mergeCells>`), "Full.xlsx");
  const elapsed = Date.now() - started;

  // 17 billion coordinates declared, three cells present. Anything proportional to the rectangle
  // would still be running.
  assert.ok(elapsed < 5_000, `full-sheet merge took ${elapsed}ms — the sweep is walking the rectangle`);
  const texts = allCellText(parsed);
  assert.ok(texts.includes("Banner"), "the anchor's value must survive");
  assert.ok(!texts.includes("covered"), "a covered cell is dropped, not rendered blank");
  assert.ok(!texts.includes("also covered"));
});

test("a merged cell keeps its measured span, and the cell after it keeps its column", () => {
  const parsed = parseXlsx(tableWithInternalMerge(), "Span.xlsx");
  const merged = parsed.tables[0]!.rows.find((row) => row.some((c) => c.text === "Combined"))!;
  const anchor = merged.find((c) => c.text === "Combined")!;
  assert.equal(anchor.colSpan, 2, "A4:B4 is a two-column span");
  assert.equal(anchor.col, 0);
  // 🔴 THE ROW IS SPARSE: column B is simply absent. 9.9 must still declare column 2, because that
  // is what stops anything downstream reading it as a Q3 figure.
  assert.equal(merged.find((c) => c.text === "9.9")?.col, 2);
  assert.equal(merged.length, 3, "three cells across four columns — the gap is real");
});

// 🔴 THE WHOLE CHAIN, IN ONE ASSERTION: parse -> normalized units -> chunk -> the text a model is
// actually shown. Every earlier test checks one joint; this one checks that a value measured in
// column C of the sheet is still under the Q4 heading by the time it reaches an embedder.
test("a sparse row keeps its values under the right headings all the way to model-facing text", async () => {
  const doc = await xlsxParser.parse(tableWithInternalMerge(), "Budget.xlsx");
  const chunks = chunkDocument(doc, { targetTokens: 4_000 });
  const lines = chunks.flatMap((c) => c.text.split("\n"));

  const header = lines.find((l) => l.startsWith("Region | Q3 | Q4"));
  assert.ok(header, `no header line. lines: ${JSON.stringify(lines)}`);
  const q4Column = header!.split(" | ").indexOf("Q4");
  assert.equal(q4Column, 2);

  const mergedLine = lines.find((l) => l.startsWith("Combined"));
  assert.ok(mergedLine, "the merged row must survive chunking");
  const values = mergedLine!.split(" | ");
  assert.equal(values[q4Column], "9.9", `9.9 must land under Q4, got "${mergedLine}"`);
  assert.equal(values[1]!.trim(), "", "the Q3 column is empty in the sheet and must stay empty");
  // The naive join would have produced exactly this, and it reads as Q3 = 9.9.
  assert.notEqual(mergedLine, "Combined | 9.9 | checked");

  // And the citation still names the measured range the parser found.
  assert.equal(citeLocator(doc.tables[0]!.locator), "Merged!A1:D7");
});

test("cells outside a merged range are untouched; cells inside it are dropped", () => {
  const rows =
    `<row r="1">${inline("A1", "outside-before")}</row>` +
    `<row r="2">${inline("B2", "anchor")}${inline("C2", "inside")}</row>` +
    `<row r="3">${inline("C3", "inside too")}</row>` +
    `<row r="5">${inline("E5", "outside-after")}</row>`;
  const parsed = parseXlsx(mergeBook(rows, `<mergeCells count="1"><mergeCell ref="B2:D4"/></mergeCells>`), "Mixed.xlsx");
  const texts = allCellText(parsed);
  assert.ok(texts.includes("outside-before"));
  assert.ok(texts.includes("anchor"));
  assert.ok(texts.includes("outside-after"));
  assert.ok(!texts.includes("inside"), "a cell inside the range is covered by the merge");
  assert.ok(!texts.includes("inside too"));
});

test("malformed and overlapping merge metadata is survived, not thrown on", () => {
  const rows = `<row r="1">${inline("A1", "kept")}${inline("B1", "second")}</row>`;
  const tail =
    `<mergeCells count="5">` +
    `<mergeCell ref=""/>` + // no range at all
    `<mergeCell ref="not-a-range"/>` + // unparseable
    `<mergeCell/>` + // no ref attribute
    `<mergeCell ref="A1:B1"/>` + // real
    `<mergeCell ref="A1:C1"/>` + // overlaps the previous one
    `</mergeCells>`;
  const parsed = parseXlsx(mergeBook(rows, tail), "Malformed.xlsx");
  const texts = allCellText(parsed);
  assert.ok(texts.includes("kept"), "the anchor survives every malformed neighbour");
  assert.ok(!texts.includes("second"), "B1 is covered by the valid merge");
});

test("a reversed range is normalised rather than silently skipped", () => {
  // "D4:A1" — some generators write the corners in the order the author dragged them.
  const rows = `<row r="1">${inline("A1", "anchor")}</row><row r="2">${inline("B2", "covered")}</row>`;
  const parsed = parseXlsx(mergeBook(rows, `<mergeCells count="1"><mergeCell ref="D4:A1"/></mergeCells>`), "Rev.xlsx");
  const texts = allCellText(parsed);
  assert.ok(texts.includes("anchor"));
  assert.ok(!texts.includes("covered"), "the range still covers B2 whichever way round it was written");
});

test("thousands of enormous merges hit the ceiling, finish fast, and SAY they fell short", () => {
  // Merges parked far from the data (columns ZZ..AAA), so no cell is ever removed and every one of
  // them pays the full cell-walk. Each declares 2 x 100,000 = 200,000 coordinates, which is far
  // more than the 2,000 populated cells — so the sweep takes the cell-walk branch and each merge
  // costs 2,000. 1,100 x 2,000 = 2.2M steps against the 2M ceiling.
  //
  // (The first draft of this fixture used ZZ1:AAA2 — FOUR coordinates — and cost 4 per merge. It
  // proved only that 4,400 is less than two million.)
  const rows = Array.from({ length: 2_000 }, (_, i) => `<row r="${i + 1}">${inline(`A${i + 1}`, `v${i}`)}</row>`).join("");
  const merges = Array.from({ length: 1_100 }, () => `<mergeCell ref="ZZ1:AAA100000"/>`).join("");

  const started = Date.now();
  const parsed = parseXlsx(mergeBook(rows, `<mergeCells count="1100">${merges}</mergeCells>`), "Ceiling.xlsx");
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 10_000, `pathological merge set took ${elapsed}ms`);
  const notes = parsed.coverage.notes ?? [];
  assert.ok(
    notes.some((n) => /merged cell block/.test(n) && /may appear as blanks/.test(n)),
    `no unresolved-merge note. notes: ${JSON.stringify(notes)}`,
  );
  assert.equal(parsed.coverage.truncated, true, "an unresolved merge is a partial read and must say so");
  // The data itself is still there: hitting the ceiling stops COLLAPSING merges, it does not stop
  // reading the sheet.
  assert.ok(allCellText(parsed).includes("v0"));
  assert.ok(allCellText(parsed).includes("v1999"));
});

test("an ordinary workbook never reports an unresolved merge", () => {
  const rows = `<row r="1">${inline("A1", "Heading")}</row><row r="2">${inline("A2", "body")}</row>`;
  const parsed = parseXlsx(mergeBook(rows, `<mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>`), "Plain.xlsx");
  const notes = parsed.coverage.notes ?? [];
  assert.ok(!notes.some((n) => /may appear as blanks/.test(n)));
  assert.notEqual(parsed.coverage.truncated, true);
});
