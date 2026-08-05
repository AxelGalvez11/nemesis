// Run: npx tsx --test apps/web/lib/notebooks/xlsx-cells.test.ts
//
// The pure half of the .xlsx parser: addresses, number formats, date serials, shared formulas and
// where the tables are. Every case here is a real spreadsheet behaviour, not a made-up one — the
// date cases in particular exist because a workbook that is read with the wrong calendar is wrong
// by four years and a day and never says so.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  columnToIndex,
  excelSerialToIso,
  findContiguousRegions,
  formatHasDate,
  formatHasTime,
  formatIsPercent,
  formatRangeRef,
  formatStoredNumber,
  indexToColumn,
  parseCellRef,
  parseRangeRef,
  plausibleHeaderRows,
  rangesOverlap,
  stripFormatLiterals,
  translateSharedFormula,
  type CellValueKind,
} from "./xlsx-cells";

test("column letters and indexes are inverses, including the last column", () => {
  assert.equal(columnToIndex("A"), 1);
  assert.equal(columnToIndex("Z"), 26);
  assert.equal(columnToIndex("AA"), 27);
  assert.equal(columnToIndex("XFD"), 16_384);
  for (const index of [1, 26, 27, 52, 703, 16_384]) {
    assert.equal(columnToIndex(indexToColumn(index)), index);
  }
});

test("addresses and ranges parse, anchors and all", () => {
  assert.deepEqual(parseCellRef("B12"), { col: 2, row: 12 });
  assert.deepEqual(parseCellRef("$B$12"), { col: 2, row: 12 });
  assert.equal(parseCellRef("B0"), null);
  assert.equal(parseCellRef("ZZZZ1"), null);
  assert.deepEqual(parseRangeRef("B12:F19"), { bottom: 19, left: 2, right: 6, top: 12 });
  // A backwards range is still that rectangle; Excel writes them both ways round.
  assert.deepEqual(parseRangeRef("F19:B12"), { bottom: 19, left: 2, right: 6, top: 12 });
  assert.equal(formatRangeRef({ bottom: 19, left: 2, right: 6, top: 12 }), "B12:F19");
  assert.equal(formatRangeRef({ bottom: 1, left: 1, right: 1, top: 1 }), "A1");
});

test("ranges know when they overlap", () => {
  const a = { bottom: 10, left: 1, right: 5, top: 1 };
  assert.equal(rangesOverlap(a, { bottom: 3, left: 5, right: 9, top: 3 }), true);
  assert.equal(rangesOverlap(a, { bottom: 3, left: 6, right: 9, top: 3 }), false);
  assert.equal(rangesOverlap(a, { bottom: 20, left: 1, right: 5, top: 11 }), false);
});

test("a format's literals never masquerade as date tokens", () => {
  // `0" days"` is a NUMBER of days. The d, a and y are inside a quoted run.
  assert.equal(formatHasDate('0.00" days"'), false);
  assert.equal(formatHasTime('0.00" days"'), false);
  // A colour, a condition and a currency tag are all bracketed, and none of them is a date.
  assert.equal(formatHasDate("[Red]#,##0.00"), false);
  assert.equal(formatHasDate('[$€-407]#,##0.00'), false);
  assert.equal(formatHasDate("General"), false);
  assert.equal(formatHasDate("@"), false);
  // An escaped character is a literal, not a token.
  assert.equal(formatHasDate("0\\d"), false);
  assert.equal(formatHasDate("_(#,##0_)"), false);

  assert.equal(formatHasDate("yyyy-mm-dd"), true);
  assert.equal(formatHasDate("mmm-yy"), true);
  assert.equal(formatHasDate('yyyy"年"m"月"d"日"'), true);
  assert.equal(formatHasDate("m/d/yy h:mm"), true);
  assert.equal(formatHasTime("m/d/yy h:mm"), true);

  // A clock, not a calendar: `mm` here is minutes and there is no day in sight.
  assert.equal(formatHasDate("mm:ss"), false);
  assert.equal(formatHasTime("mm:ss"), true);
  // Elapsed time keeps its brackets' contents — [h] is a token, [Red] is not.
  assert.equal(stripFormatLiterals("[h]:mm:ss"), "h:mm:ss");
  assert.equal(formatHasTime("[h]:mm:ss"), true);

  assert.equal(formatIsPercent("0.00%"), true);
  assert.equal(formatIsPercent('0.00" %"'), false);
});

test("the 1900 calendar, phantom leap day and all", () => {
  const asDate = (serial: number) => excelSerialToIso(serial, { date: true, time: false });
  assert.equal(asDate(1), "1900-01-01");
  assert.equal(asDate(59), "1900-02-28");
  // 1900 was not a leap year. The file format thinks it was, so serial 60 denotes a day that never
  // existed; printing what the sheet shows beats silently sliding it onto the 28th.
  assert.equal(asDate(60), "1900-02-29");
  assert.equal(asDate(61), "1900-03-01");
  // An independent anchor: 124 years of 365 days plus 30 leap days (1904…2020, and NOT 1900),
  // plus the two days from the 1899-12-30 origin, is 45292.
  assert.equal(asDate(45_292), "2024-01-01");
  assert.equal(asDate(45_292 + 365), "2024-12-31");
});

test("the 1904 calendar has no phantom day and no fudge", () => {
  const asDate = (serial: number) => excelSerialToIso(serial, { date: true, date1904: true, time: false });
  assert.equal(asDate(0), "1904-01-01");
  assert.equal(asDate(60), "1904-03-01"); // 1904 WAS a leap year, so the 60th day is March 1st
  // The same day is 1462 lower in this system. A workbook read with the wrong flag is off by that.
  assert.equal(asDate(45_292 - 1462), "2024-01-01");
  assert.notEqual(asDate(45_292), excelSerialToIso(45_292, { date: true, time: false }));
});

test("times, elapsed times and datetimes", () => {
  assert.equal(excelSerialToIso(0.5, { date: false, time: true }), "12:00:00");
  assert.equal(excelSerialToIso(0.25, { date: false, time: true }), "06:00:00");
  // An elapsed duration legitimately passes 24 hours; it accumulates rather than wrapping.
  assert.equal(excelSerialToIso(1.5, { date: false, time: true }), "36:00:00");
  assert.equal(excelSerialToIso(45_292.5, { date: true, time: true }), "2024-01-01T12:00:00");
  assert.equal(excelSerialToIso(-1, { date: true, time: false }), null);
});

test("stored numbers print without IEEE noise", () => {
  assert.equal(formatStoredNumber(0.1 + 0.2), "0.3");
  assert.equal(formatStoredNumber(1200), "1200");
  assert.equal(formatStoredNumber(1234.56), "1234.56");
});

test("a shared formula is translated to the cell that holds it", () => {
  // Excel stores a filled-down column once. Row 19's formula is not row 13's.
  assert.equal(translateSharedFormula("C13-D13", 6, 0), "C19-D19");
  assert.equal(translateSharedFormula("SUM(A1:A5)", 0, 1), "SUM(B1:B5)");
  // An anchored reference is the point of the anchor: it does not move.
  assert.equal(translateSharedFormula("$B$2*A2", 1, 1), "$B$2*B3");
  assert.equal(translateSharedFormula("A$1*$A2", 2, 0), "A$1*$A4");
  // A function whose name ends in digits is not a cell reference.
  assert.equal(translateSharedFormula("LOG10(A1)", 1, 0), "LOG10(A2)");
  assert.equal(translateSharedFormula("ATAN2(A1,B1)", 1, 0), "ATAN2(A2,B2)");
  // Text inside the formula is text. "B2" here is a value being compared, not a cell.
  assert.equal(translateSharedFormula('IF(A1="B2","yes","no")', 1, 0), 'IF(A2="B2","yes","no")');
  // A quoted sheet name survives; the reference after it still moves.
  assert.equal(translateSharedFormula("'My Sheet'!A1+1", 1, 0), "'My Sheet'!A2+1");
  assert.equal(translateSharedFormula("Sheet1!A1", 0, 1), "Sheet1!B1");
});

test("a shared formula that cannot be translated is refused, not guessed", () => {
  // Off the top of the sheet: there is no row 0, and inventing one would be a lie.
  assert.equal(translateSharedFormula("A2-B2", -5, 0), null);
  assert.equal(translateSharedFormula("B2", 0, -5), null);
  // A structured reference (`Table1[@Revenue]`) and an external link (`[1]Sheet1!A1`) do not shift
  // the way an A1 reference does, so they are left alone.
  assert.equal(translateSharedFormula("Table1[@Revenue]-Table1[@Cost]", 1, 0), null);
  assert.equal(translateSharedFormula("[1]Sheet1!A1", 1, 0), null);
  // No shift at all is the identity, not a rewrite.
  assert.equal(translateSharedFormula("C13-D13", 0, 0), "C13-D13");
});

test("blank rows and blank columns are what separates one table from another", () => {
  // Two blocks side by side with an empty column D between them, and a note far below.
  const cells = [
    ...grid(1, 1, 4, 3), // A1:C4
    ...grid(1, 5, 4, 7), // E1:G4
    { col: 1, row: 12 }, // A12, a stray note
  ];
  const regions = findContiguousRegions(cells);
  assert.deepEqual(regions.map(formatRangeRef), ["A1:C4", "E1:G4", "A12"]);
});

test("a region is found from the cells that exist, not from a rectangle", () => {
  // A ragged block: the used range is A1:D3 but only these cells are filled.
  const cells = [
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 4, row: 2 },
    { col: 3, row: 2 },
    { col: 2, row: 3 },
  ];
  assert.deepEqual(findContiguousRegions(cells).map(formatRangeRef), ["A1:D3"]);
});

test("a header row is a row of words above rows that are not", () => {
  const block = { bottom: 3, left: 1, right: 2, top: 1 };
  const cell = (row: number, col: number, kind: CellValueKind) => ({ col, kind, row });
  const labelled = [
    cell(1, 1, "text"),
    cell(1, 2, "text"),
    cell(2, 1, "text"),
    cell(2, 2, "number"),
    cell(3, 1, "text"),
    cell(3, 2, "number"),
  ];
  assert.equal(plausibleHeaderRows(block, labelled), 1);

  // Numbers in the top row: this block starts with data, so it has no header.
  const numericTop = labelled.map((c) => (c.row === 1 && c.col === 2 ? cell(1, 2, "number") : c));
  assert.equal(plausibleHeaderRows(block, numericTop), 0);

  // All words: a full first line above two more lines still reads as a header (a roster, a
  // checklist), but two lines of words on their own do not.
  const words = [cell(1, 1, "text"), cell(1, 2, "text"), cell(2, 1, "text"), cell(2, 2, "text")];
  assert.equal(plausibleHeaderRows({ bottom: 2, left: 1, right: 2, top: 1 }, words), 0);
  assert.equal(plausibleHeaderRows(block, [...words, cell(3, 1, "text"), cell(3, 2, "text")]), 1);

  // Cells outside the block never vote, however close they sit.
  assert.equal(plausibleHeaderRows({ bottom: 3, left: 1, right: 1, top: 1 }, [cell(1, 1, "text"), cell(2, 2, "number")]), 0);
});

/** Every address in a rectangle. */
function grid(top: number, left: number, bottom: number, right: number): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) out.push({ col, row });
  }
  return out;
}
