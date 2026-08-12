/**
 * A real .csv, all the way to a cell locator.
 *
 *   file → readCsv → csvToModel → storage JSON → readDocumentModel →
 *   buildSourceContext → cellAtRef
 *
 * 🔴 THE CHAIN, NOT THE PARSER (owner's standing rule). Six structural fields
 * have now died AFTER passing their own parser's tests, so a test that stops at
 * `readCsv` proves the least interesting half. Every assertion below runs on the
 * model that came BACK through the envelope.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readDocumentModel, structureEnvelope, type DocumentModel } from "@nemesis/shared";

import { buildSourceContext, cellAtRef, unitContent } from "@/lib/sources/source-context";

import { csvToModel } from "./csv-model";
import { chooseDelimiter, readCsv } from "./csv-structure";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/csv/${name}`, import.meta.url)));

/** Exactly what production stores, round-tripped through JSON and the validator. */
function stored(name: string): DocumentModel {
  const model = csvToModel(readCsv(fixture(name)));
  const envelope = JSON.parse(JSON.stringify(structureEnvelope({ model, text: "", title: null })));
  const back = readDocumentModel(envelope.model);
  assert.ok(back, `${name} must survive readDocumentModel`);
  return back!;
}

const tableOf = (model: DocumentModel) => model.blocks.find((b) => b.kind === "table")?.table ?? null;

// ── the format is registered everywhere it has to be ───────────────────────

test("🔴 a csv model survives the envelope at all — FORMATS and DocFormat are two lists", () => {
  // The trap this repo has hit before: a format in the type but not the runtime
  // Set makes `readDocumentModel` return null for the ENTIRE model, so the
  // document does not arrive degraded — it does not arrive.
  const model = stored("quoting.csv");
  assert.equal(model.format, "csv");
  assert.equal(model.units.length, 1);
  assert.equal(model.units[0]!.kind, "sheet");
});

// ── the grid, and what it refuses to invent ───────────────────────────────

test("🔴 the file does not declare a header, so none is claimed", () => {
  const table = tableOf(stored("duplicate-headers.csv"))!;
  // The owner's rule: no header unless the file says so, and a CSV never does.
  assert.equal(table.headerRows, 0);
  assert.equal(table.columns, undefined, "columns must not be named after data");
  // And the duplicate stays a duplicate rather than being renamed or dropped.
  assert.deepEqual(table.rows[0], ["", "Quiz 1", "Quiz 1", "Final"]);
});

test("🔴 a missing cell and an empty cell are different facts", () => {
  const table = tableOf(stored("ragged.csv"))!;
  const at = (row: number, column: number) =>
    (table.cells ?? []).find((c) => c.row === row && c.column === column);

  // `B2,Burette` has two fields: there is NO third cell on that row.
  assert.equal(at(2, 1)?.text, "Burette");
  assert.equal(at(2, 2), undefined, "a short row must not be padded with invented cells");
  // `B3,Flask,7,extra,fields` is longer than the header and is kept whole.
  assert.equal(at(3, 4)?.text, "fields");
  assert.equal(table.rows[0]!.length, 5, "the grid is as wide as its WIDEST row");
});

test("🔴 an empty middle field is present and empty", () => {
  const table = tableOf(stored("quoting.csv"))!;
  const edsger = (table.cells ?? []).filter((c) => c.row === 4);
  assert.equal(edsger.length, 3, "Edsger,,70 has three fields");
  assert.equal(edsger[1]!.text, "", "the middle one exists and is empty");
});

test("🔴 a blank line is a ROW — deleting it would move every citation below it", () => {
  const table = tableOf(stored("blank-lines.csv"))!;
  const rows = (table.cells ?? []).map((c) => c.row);
  // a,b at row 0 · blank · c,d at row 2 · blank · blank · e,f at row 5
  assert.deepEqual([...new Set(rows)], [0, 2, 5]);
});

// ── quoting, exactly as the format defines it ─────────────────────────────

test("quoted delimiters, doubled quotes and multi-line fields all survive", () => {
  const table = tableOf(stored("quoting.csv"))!;
  const at = (row: number, column: number) =>
    (table.cells ?? []).find((c) => c.row === row && c.column === column)?.text;
  assert.equal(at(1, 1), "Comma, inside a field", "a quoted comma is not a delimiter");
  assert.equal(at(2, 1), 'She said "well done"', "a doubled quote is one character");
  assert.equal(at(3, 1), "Two\nlines in one cell", "a quoted newline does not end the row");
});

test("a quoted field may contain CRLF, and a fully quoted field keeps its quotes", () => {
  const table = tableOf(stored("quoted-crlf.csv"))!;
  const at = (row: number) => (table.cells ?? []).find((c) => c.row === row && c.column === 1)?.text;
  assert.equal(at(1), "first line\r\nsecond line");
  assert.equal(at(2), '"fully quoted"');
  assert.equal(at(3), 'ends with a quote "');
});

test("🔴 nothing is trimmed — ' 007 ' is what the author wrote", () => {
  const table = tableOf(stored("spaces-and-numbers.csv"))!;
  const at = (row: number, column: number) =>
    (table.cells ?? []).find((c) => c.row === row && c.column === column)?.text;
  assert.equal(at(0, 1), " Padded ", "unquoted spaces are content");
  assert.equal(at(1, 0), "007", "a numeric-looking string stays a string");
  assert.equal(at(2, 0), "  quoted spaces  ");
});

test("a byte-order mark is removed, not left inside the first cell", () => {
  const table = tableOf(stored("bom-crlf.csv"))!;
  const first = (table.cells ?? []).find((c) => c.row === 0 && c.column === 0)!;
  assert.equal(first.text, "Student");
  // The failure this prevents reads identically in every log it appears in.
  assert.notEqual(first.text, "﻿Student");
  assert.equal(readCsv(fixture("bom-crlf.csv")).encoding, "utf-8-bom", "and it is recorded");
});

test("LF, CRLF and non-ASCII all read the same way", () => {
  const table = tableOf(stored("lf-unicode.csv"))!;
  const at = (row: number) => (table.cells ?? []).find((c) => c.row === row && c.column === 0)?.text;
  assert.equal(at(1), "résumé");
  assert.equal(at(3), "日本語");
  // 🔴 The independently-written file. LibreOffice picks LF where Python picks
  // CRLF, which is exactly the kind of disagreement our own fixtures cannot show.
  const lo = tableOf(stored("libreoffice-export.csv"))!;
  assert.equal(lo.rows[1]![1], 'Comma, and "quotes"');
  assert.equal(lo.rows[2]![1], "Two\nlines");
});

// ── the delimiter rule, and its refusal ───────────────────────────────────

test("a comma file is read as one, and says so", () => {
  assert.deepEqual(chooseDelimiter("a,b\r\nc,d\r\n"), { delimiter: ",", evidence: "comma" });
  assert.equal(tableOf(stored("quoting.csv"))!.delimiter, undefined, "absent for the common case");
});

test("🔴 a semicolon export is detected only because COMMA FAILED", () => {
  const grid = readCsv(fixture("semicolon.csv"));
  assert.equal(grid.delimiter, ";");
  assert.equal(grid.delimiterEvidence, "comma-failed-one-alternative");
  const table = tableOf(stored("semicolon.csv"))!;
  assert.deepEqual(table.rows[0], ["Datum", "Thema", "Gewichtung"]);
  assert.equal(table.delimiter, ";", "and the decision is preserved in the model");
});

test("🔴 comma wins by STATED PRIORITY when another candidate also fits", () => {
  // Both comma and semicolon split this into a consistent 2-column grid. A
  // "most consistent candidate" rule would coin-flip, and every ordinary comma
  // file whose rows contain one semicolon would be at risk.
  const grid = readCsv(fixture("ambiguous-comma-wins.csv"));
  assert.equal(grid.delimiterEvidence, "comma");
  assert.deepEqual(
    grid.cells.filter((c) => c.row === 1).map((c) => c.text),
    ["lists;arrays", "see chapter 2"],
  );
});

test("🔴 when there is no evidence, the columns are REFUSED rather than guessed", () => {
  // Comma is inconsistent; semicolon AND tab each give a consistent 3-column
  // grid and contradict each other. There is no evidence here, only a choice.
  const grid = readCsv(fixture("ambiguous-no-comma.csv"));
  assert.equal(grid.delimiterEvidence, "ambiguous-not-split");
  assert.equal(grid.columns, 1, "each record stays whole");
  assert.deepEqual(grid.unsupported, [{ count: 1, kind: "ambiguous-delimiter" }]);
  // 🔴 AND THE ROWS SURVIVE. A refusal is not a deletion: the lines are still
  // there, verbatim, for anything that can do better later.
  assert.equal(grid.cells[1]!.text, "d;e\tf,g");
});

// ── the ends of the range ─────────────────────────────────────────────────

test("an empty file produces no grid, and a newlines-only file produces no cells", () => {
  assert.equal(readCsv(fixture("empty.csv")).rows, 0);
  assert.equal(csvToModel(readCsv(fixture("empty.csv"))).blocks.length, 0);
  const blank = readCsv(fixture("newlines-only.csv"));
  assert.equal(blank.cells.length, 0);
  assert.equal(csvToModel(blank).blocks.length, 0, "no cells means no table block");
});

test("a trailing newline terminates the last record rather than adding an empty one", () => {
  assert.equal(readCsv(new TextEncoder().encode("a,b\r\nc,d\r\n")).rows, 2);
  assert.equal(readCsv(new TextEncoder().encode("a,b\r\nc,d")).rows, 2, "and one may be absent");
  assert.equal(readCsv(fixture("one-cell.csv")).rows, 1);
});

// ── the far end: a consumer addressing a cell ─────────────────────────────

test("🔴 CSV → … → source context → a cell locator that resolves", () => {
  const model = stored("quoting.csv");
  const envelope = JSON.parse(JSON.stringify(structureEnvelope({ model, text: "", title: null })));
  const context = buildSourceContext({ sourceId: "s1", sourceKind: "csv", structure: envelope });

  // 🔴 A CSV UNIT HAS NO LABEL, AND MUST NOT. `xlsx-model` states the rule this
  // follows — never the filename — and a CSV has no internal name to use. So a
  // consumer finds the SOLE table unit rather than looking one up by sheet name;
  // a CSV has exactly one grid, which is what makes that unambiguous.
  const tables = context.units.filter((unit) => unit.type === "table");
  assert.equal(tables.length, 1, "exactly one grid, addressable without a name");
  assert.equal(tables[0]!.unitLabel, undefined, "and no invented name");

  const unit = tables[0]!;
  assert.equal(cellAtRef(unit, "A1"), "Student", "row 1 column 1 is A1");
  assert.equal(cellAtRef(unit, "B2"), "Comma, inside a field");
  assert.equal(cellAtRef(unit, "C5"), "70", "Edsger's score, past the empty middle cell");
  assert.equal(cellAtRef(unit, "Z99"), null, "and nothing outside the grid resolves");

  // The table's content arrives as cells, not as a string to re-split.
  const content = unitContent(unit);
  assert.equal(content.kind, "table");
});
