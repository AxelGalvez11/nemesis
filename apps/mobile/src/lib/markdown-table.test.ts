import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  addColumn,
  addRow,
  isTableBlock,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  setCell,
} from "./markdown-table.ts";

const SIMPLE = ["| Drug | Class |", "| --- | --- |", "| Lisinopril | ACE inhibitor |"].join("\n");

Deno.test("parseTable: header, delimiter and body", () => {
  const table = parseTable(SIMPLE);
  assertEquals(table?.header, ["Drug", "Class"]);
  assertEquals(table?.align, ["none", "none"]);
  assertEquals(table?.rows, [["Lisinopril", "ACE inhibitor"]]);
});

Deno.test("parseTable: the empty starter table the toolbar writes", () => {
  // Exactly what the note toolbar's table button inserts — and what the owner
  // saw as raw pipes on tapping it.
  const table = parseTable(["| Column | Column |", "| --- | --- |", "| | |"].join("\n"));
  assertEquals(table?.header, ["Column", "Column"]);
  assertEquals(table?.rows, [["", ""]]);
});

Deno.test("parseTable: header + delimiter with no body row is still a table", () => {
  const table = parseTable(["| A | B |", "| --- | --- |"].join("\n"));
  assertEquals(table?.header, ["A", "B"]);
  assertEquals(table?.rows, []);
});

Deno.test("parseTable: alignment markers", () => {
  const table = parseTable(["| L | C | R | P |", "| :--- | :---: | ---: | --- |"].join("\n"));
  assertEquals(table?.align, ["left", "center", "right", "none"]);
});

Deno.test("parseTable: unfenced tables (no leading or trailing pipe)", () => {
  const table = parseTable(["Drug | Class", "--- | ---", "Lisinopril | ACE"].join("\n"));
  assertEquals(table?.header, ["Drug", "Class"]);
  assertEquals(table?.rows, [["Lisinopril", "ACE"]]);
});

Deno.test("parseTable: an escaped pipe stays inside its cell", () => {
  const table = parseTable(["| Sign | Meaning |", "| --- | --- |", "| a \\| b | either |"].join("\n"));
  assertEquals(table?.rows, [["a | b", "either"]]);
});

Deno.test("parseTable: a short body row is padded out to the header width", () => {
  const table = parseTable(["| A | B | C |", "| --- | --- | --- |", "| one |"].join("\n"));
  assertEquals(table?.rows, [["one", "", ""]]);
});

Deno.test("parseTable: an over-long body row keeps its extra cell rather than losing text", () => {
  const table = parseTable(["| A | B |", "| --- | --- |", "| one | two | three |"].join("\n"));
  assertEquals(table?.rows, [["one", "two", "three"]]);
});

Deno.test("parseTable: null for anything that isn't a table — the fall-through contract", () => {
  assertEquals(parseTable("Just a paragraph."), null);
  assertEquals(parseTable(""), null);
  assertEquals(parseTable("# A heading"), null);
  // A pipe in prose is not a delimiter row.
  assertEquals(parseTable(["Costs $5 | $6", "and more prose"].join("\n")), null);
  // Header with no delimiter row underneath.
  assertEquals(parseTable(["| A | B |", "| one | two |"].join("\n")), null);
  // Delimiter row of the wrong width.
  assertEquals(parseTable(["| A | B |", "| --- |"].join("\n")), null);
  // A list, which also starts with a punctuation-heavy line.
  assertEquals(parseTable(["- one", "- two"].join("\n")), null);
});

Deno.test("isTableBlock: agrees with parseTable", () => {
  assertEquals(isTableBlock(SIMPLE), true);
  assertEquals(isTableBlock("Just prose."), false);
});

Deno.test("serializeTable: canonical spacing, and parse(serialize(x)) is x", () => {
  const table = parseTable(SIMPLE)!;
  assertEquals(serializeTable(table), SIMPLE);
  assertEquals(parseTable(serializeTable(table)), table);
});

Deno.test("serializeTable: alignment survives the round trip", () => {
  const source = ["| L | C | R |", "| :--- | :---: | ---: |", "| a | b | c |"].join("\n");
  assertEquals(serializeTable(parseTable(source)!), source);
});

Deno.test("serializeTable: a literal pipe is escaped on the way out", () => {
  const table = parseTable(["| A | B |", "| --- | --- |", "| x | y |"].join("\n"))!;
  const withPipe = setCell(table, 0, 0, "a | b");
  assertEquals(serializeTable(withPipe).includes("a \\| b"), true);
  // …and reads back as the single cell the student typed.
  assertEquals(parseTable(serializeTable(withPipe))?.rows, [["a | b", "y"]]);
});

Deno.test("serializeTable: a ragged row is squared up to the widest row", () => {
  const table = { align: ["none" as const], header: ["A"], rows: [["one", "two"]] };
  assertEquals(serializeTable(table), ["| A |  |", "| --- | --- |", "| one | two |"].join("\n"));
});

Deno.test("setCell: edits one cell and leaves the rest alone", () => {
  const table = parseTable(SIMPLE)!;
  const next = setCell(table, 0, 1, "ACE-I");
  assertEquals(next.rows, [["Lisinopril", "ACE-I"]]);
  assertEquals(table.rows, [["Lisinopril", "ACE inhibitor"]]);
});

Deno.test("setCell: row -1 addresses the header", () => {
  const table = parseTable(SIMPLE)!;
  assertEquals(setCell(table, -1, 0, "Medicine").header, ["Medicine", "Class"]);
});

Deno.test("addRow / addColumn grow the grid with empty cells", () => {
  const table = parseTable(SIMPLE)!;
  assertEquals(addRow(table).rows, [["Lisinopril", "ACE inhibitor"], ["", ""]]);
  const wider = addColumn(table);
  assertEquals(wider.header, ["Drug", "Class", ""]);
  assertEquals(wider.rows, [["Lisinopril", "ACE inhibitor", ""]]);
  assertEquals(wider.align, ["none", "none", "none"]);
});

Deno.test("removeRow drops one row and ignores an out-of-range index", () => {
  const table = parseTable(SIMPLE)!;
  assertEquals(removeRow(table, 0).rows, []);
  assertEquals(removeRow(table, 5).rows, table.rows);
});

Deno.test("removeColumn drops the column everywhere, but never the last one", () => {
  const table = parseTable(SIMPLE)!;
  const narrower = removeColumn(table, 1);
  assertEquals(narrower.header, ["Drug"]);
  assertEquals(narrower.rows, [["Lisinopril"]]);
  // A one-column table is left intact.
  assertEquals(removeColumn(narrower, 0), narrower);
});
