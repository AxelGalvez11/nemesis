// Reading and writing a markdown table as a GRID rather than as text (owner
// 2026-07-23: "in editing mode the tables should not show markdown at all").
//
// The phone's note editor reveals syntax one block at a time: every block
// renders as markdown, and the block you tap swaps into a raw-source TextInput.
// For a paragraph that is exactly right. For a table it is the worst case — the
// pipes and dashes ARE the table, so tapping one replaced a tidy grid with
// `| Column | Column |` and left the student aligning dashes by hand on a phone
// keyboard. This module is the half that lets the editor put a real grid of
// per-cell fields there instead, which is what the web editor already does.
//
// The round trip is deliberately NOT byte-preserving: a table you actually edit
// is rewritten in canonical `| a | b |` form. That is a real (small) change of
// behaviour versus the rest of the editor, which is byte-lossless — but a grid
// has nowhere to keep a stray column of padding spaces, and re-emitting the
// student's own alignment padding after they add a column would produce a
// crooked table rather than a preserved one. Tables you don't touch are never
// re-serialized, so nothing is rewritten behind the student's back.
//
// Pure module (no react-native) so it Deno-tests like the rest of src/lib.

export type ColumnAlign = "left" | "center" | "right" | "none";

export interface MarkdownTable {
  header: string[];
  align: ColumnAlign[];
  rows: string[][];
}

/** A delimiter row: `---`, `:---`, `---:`, `:---:`, at least one dash per cell. */
const DELIMITER_CELL = /^:?-+:?$/;

/** Split one table line into cells. Handles the optional leading and trailing
 *  pipes, and an escaped `\|` inside a cell (which is the only way to write a
 *  literal pipe in a table). Hand-rolled rather than a split on a lookbehind
 *  pattern — Hermes, the phone's JS engine, has no lookbehind, and a regex that
 *  passes in the test runner and throws on device is the worst outcome here. */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      cell += "|";
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += ch;
  }
  cells.push(cell);
  // A fenced table (`| a | b |`) yields an empty cell at each end — drop those,
  // but only when the line really was fenced, so `a | b` still reads as 2 cells.
  if (cells.length > 1 && cells[0].trim() === "" && line.trimStart().startsWith("|")) cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === "" && line.trimEnd().endsWith("|")) cells.pop();
  return cells.map((text) => text.trim());
}

function alignOf(cell: string): ColumnAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

/**
 * Read a block of markdown as a table, or null if it isn't one.
 *
 * Null is the important half of the contract: the note editor calls this on
 * every block it is about to open, and anything that isn't a well-formed table
 * must fall through to the ordinary raw-source field rather than being
 * force-fitted into a grid and mangled.
 */
export function parseTable(body: string): MarkdownTable | null {
  const rows = body.split("\n").filter((line) => line.trim() !== "");
  // Header + delimiter is the minimum; a body row is optional.
  if (rows.length < 2) return null;
  if (!rows[0].includes("|")) return null;

  const header = splitCells(rows[0]);
  const delimiter = splitCells(rows[1]);
  if (delimiter.length !== header.length) return null;
  if (!delimiter.every((cell) => DELIMITER_CELL.test(cell))) return null;

  const align = delimiter.map(alignOf);
  // Short rows are padded and long ones are kept: markdown itself drops the
  // overflow, but silently deleting a student's text on a tap into the grid
  // would be much worse than showing them a column they can then fix.
  const width = header.length;
  const body_ = rows.slice(2).map((line) => {
    const cells = splitCells(line);
    while (cells.length < width) cells.push("");
    return cells;
  });
  return { align, header, rows: body_ };
}

function delimiterFor(align: ColumnAlign): string {
  switch (align) {
    case "center":
      return ":---:";
    case "right":
      return "---:";
    case "left":
      return ":---";
    default:
      return "---";
  }
}

/** Write the grid back out as canonical markdown. */
export function serializeTable(table: MarkdownTable): string {
  const width = Math.max(table.header.length, ...table.rows.map((row) => row.length), 1);
  const pad = <T,>(cells: readonly T[], filler: T): T[] => {
    const out = cells.slice(0, width);
    while (out.length < width) out.push(filler);
    return out;
  };
  // `|` inside a cell has to go back out escaped or it would split the column.
  const line = (cells: string[]) => `| ${pad(cells, "").map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  const rules = `| ${pad<ColumnAlign>(table.align, "none").map(delimiterFor).join(" | ")} |`;
  return [line(table.header), rules, ...table.rows.map(line)].join("\n");
}

/** True when `body` is a table the grid editor can safely take over. */
export function isTableBlock(body: string): boolean {
  return parseTable(body) !== null;
}

/** A copy with one cell replaced. Row -1 addresses the header. Immutable. */
export function setCell(table: MarkdownTable, row: number, column: number, value: string): MarkdownTable {
  if (row < 0) {
    return { ...table, header: table.header.map((cell, i) => (i === column ? value : cell)) };
  }
  return {
    ...table,
    rows: table.rows.map((cells, i) => (i === row ? cells.map((cell, j) => (j === column ? value : cell)) : cells)),
  };
}

/** A copy with one more empty row at the bottom. */
export function addRow(table: MarkdownTable): MarkdownTable {
  return { ...table, rows: [...table.rows, table.header.map(() => "")] };
}

/** A copy with one more empty column on the right. */
export function addColumn(table: MarkdownTable): MarkdownTable {
  return {
    align: [...table.align, "none"],
    header: [...table.header, ""],
    rows: table.rows.map((cells) => [...cells, ""]),
  };
}

/** A copy without row `index` — or the table unchanged if that would leave a
 *  table with no body at all, which markdown still renders but which reads on
 *  screen as a header floating on its own. */
export function removeRow(table: MarkdownTable, index: number): MarkdownTable {
  if (index < 0 || index >= table.rows.length) return table;
  return { ...table, rows: table.rows.filter((_, i) => i !== index) };
}

/** A copy without column `index`. A one-column table is left alone — removing
 *  its only column would leave nothing that could still be called a table. */
export function removeColumn(table: MarkdownTable, index: number): MarkdownTable {
  if (table.header.length <= 1 || index < 0 || index >= table.header.length) return table;
  return {
    align: table.align.filter((_, i) => i !== index),
    header: table.header.filter((_, i) => i !== index),
    rows: table.rows.map((cells) => cells.filter((_, i) => i !== index)),
  };
}
