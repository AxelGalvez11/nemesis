/**
 * An HTML table, as cells.
 *
 * 🔴 THIS IS WHY THE VENDOR IS ASKED FOR HTML RATHER THAN MARKDOWN. A markdown pipe table cannot
 * express a merged cell or a spanning header — it is already the flat projection — so asking for
 * markdown would mean the grid was destroyed before it ever reached Nemesis, and no later pass could
 * recover it. `DocTable.cells` is the truth and `rows` is derived from it (`projectCells`); a
 * producer that can only supply `rows` is truthfully saying "no merge information", and this one
 * can do better.
 *
 * 🔴 AND HTML CARRIES ONE FACT THE GEOMETRIC PDF READER HAS TO GUESS: WHICH ROWS ARE HEADERS.
 * `headerRows: 0` is the honest default there, because a table inferred from rulings usually says
 * nothing about its own structure. `<thead>` and `<th>` say it explicitly. That is not cosmetic —
 * `extractKnowledgeObjects` reads two-column tables into knowledge objects, and a header row read as
 * data becomes a fact the learner is asked to recall.
 *
 * No HTML is executed, rendered, or trusted as markup: this reads tags as text and emits plain
 * strings. Anything it cannot make sense of is REFUSED rather than approximated, because a table
 * that is silently wrong is worse than a table that is absent — see `csv-structure.ts`'s delimiter
 * rule for the same principle.
 */

import { projectCells, type DocCell, type DocTable } from "@nemesis/shared";

/** A grid taller or wider than this is not a table anyone printed; it is a parse that ran away. */
const MAX_ROWS = 2_000;
const MAX_COLUMNS = 256;

/** Decode the handful of entities a table's text actually contains. PURE. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Ampersand last, so `&amp;lt;` decodes to the literal `&lt;` rather than to `<`.
    .replace(/&amp;/g, "&");
}

/** The visible text of one cell: tags stripped, whitespace collapsed, breaks kept as spaces. PURE. */
export function cellTextOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** A span attribute, or 1. Refuses anything that is not a small positive integer. PURE. */
function spanOf(attributes: string, name: "rowspan" | "colspan"): number {
  const found = new RegExp(`${name}\\s*=\\s*["']?(\\d{1,3})`, "i").exec(attributes);
  if (!found) return 1;
  const value = Number.parseInt(found[1] ?? "", 10);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

interface RawCell {
  attributes: string;
  header: boolean;
  html: string;
}

interface RawRow {
  cells: RawCell[];
  /** True when the row sat inside `<thead>`, which is the document SAYING it is a header. */
  inHead: boolean;
}

/** Split a table's HTML into rows of raw cells. PURE. */
function readRows(html: string): RawRow[] {
  const rows: RawRow[] = [];
  // Where each <thead> section starts and ends, so a row can be attributed to it by position.
  const headRanges: Array<[number, number]> = [];
  const headPattern = /<thead[^>]*>([\s\S]*?)<\/thead>/gi;
  for (let head = headPattern.exec(html); head; head = headPattern.exec(html)) {
    headRanges.push([head.index, head.index + head[0].length]);
  }

  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  for (let row = rowPattern.exec(html); row; row = rowPattern.exec(html)) {
    if (rows.length >= MAX_ROWS) break;
    const body = row[1] ?? "";
    const cells: RawCell[] = [];
    const cellPattern = /<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/gi;
    for (let cell = cellPattern.exec(body); cell; cell = cellPattern.exec(body)) {
      if (cells.length >= MAX_COLUMNS) break;
      cells.push({
        attributes: cell[2] ?? "",
        header: (cell[1] ?? "").toLowerCase() === "th",
        html: cell[3] ?? "",
      });
    }
    if (cells.length === 0) continue;
    const at = row.index;
    rows.push({ cells, inHead: headRanges.some(([from, to]) => at >= from && at < to) });
  }
  return rows;
}

/**
 * Place raw rows onto a grid, honouring spans.
 *
 * 🔴 THE OCCUPANCY MAP IS THE WHOLE POINT. A cell with `rowspan=2` pushes every later cell in the
 * NEXT row one column right, so a naive "column = index in this row" places the rest of that row
 * under the wrong headings — silently, and only for tables that merge, which are exactly the ones
 * worth citing. PURE.
 */
function placeCells(rows: readonly RawRow[]): DocCell[] {
  const cells: DocCell[] = [];
  const taken = new Set<string>();
  const key = (row: number, column: number) => `${row}:${column}`;

  rows.forEach((row, rowIndex) => {
    let column = 0;
    for (const raw of row.cells) {
      while (taken.has(key(rowIndex, column))) column += 1;
      if (column >= MAX_COLUMNS) break;
      const rowSpan = spanOf(raw.attributes, "rowspan");
      const colSpan = spanOf(raw.attributes, "colspan");
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        for (let c = column; c < column + colSpan; c += 1) taken.add(key(r, c));
      }
      cells.push({
        column,
        row: rowIndex,
        text: cellTextOf(raw.html),
        // Omitted when 1 — an ordinary cell costs two numbers, not four.
        ...(rowSpan > 1 ? { rowSpan } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
      });
      column += colSpan;
    }
  });

  return cells;
}

/**
 * How many leading rows the document itself calls headers.
 *
 * 🔴 ONLY WHAT THE MARKUP STATES, NEVER AN INFERENCE. `<thead>` is explicit. A first row made
 * entirely of `<th>` is explicit. A first row that merely *looks* like labels is not, and guessing
 * there would relabel every value beneath it. PURE.
 */
export function headerRowsOf(rows: readonly RawRow[]): number {
  let count = 0;
  for (const row of rows) {
    const stated = row.inHead || (row.cells.length > 0 && row.cells.every((cell) => cell.header));
    if (!stated) break;
    count += 1;
  }
  return count;
}

/**
 * One `<table>` element as a `DocTable`, or null when it holds no cells.
 *
 * `rows` is not built here — it is projected from `cells`, so the two cannot disagree.
 */
export function tableFromHtml(html: string): DocTable | null {
  const raw = readRows(html);
  if (raw.length === 0) return null;
  const cells = placeCells(raw);
  if (cells.length === 0) return null;
  const rows = projectCells(cells);
  if (rows.length === 0 || (rows[0]?.length ?? 0) === 0) return null;

  const headerRows = headerRowsOf(raw);
  // Named only when the document printed the names. An unnamed column is a missing fact, and an
  // invented name would be attached to every value beneath it.
  const named = headerRows > 0 ? (rows[0] ?? []).map((value) => value.trim()) : [];
  const columns = named.some((value) => value.length > 0) ? named : undefined;

  return {
    cells,
    headerRows,
    rows,
    ...(columns ? { columns, headerSource: "present" as const } : {}),
  };
}

/**
 * A markdown pipe table as a `DocTable`, or null.
 *
 * 🔴 THE THIRD SHAPE THIS VENDOR EMITS, AND THE ONE THAT ONLY SHOWS UP ON OFFICE FILES.
 * `table_format: "html"` governs PDFs. A .docx and a .pptx come back with no labelled blocks at
 * all and their tables written inline as `| a | b |` — measured, not documented. Without this a
 * Word table becomes a run of paragraphs full of pipe characters, which is how a grid dies
 * quietly on exactly the formats a student writes their own notes in.
 *
 * Pipe syntax cannot express a merged cell, so `cells` is deliberately ABSENT here rather than
 * fabricated one-per-position: absent means "this producer has no merge information", which is
 * true, and is a different claim from "there are no merges". PURE.
 */
export function tableFromPipes(lines: readonly string[]): DocTable | null {
  const split = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      // An escaped pipe is content, not a boundary.
      .split(/(?<!\\)\|/)
      .map((cell) => cellTextOf(cell.replace(/\\\|/g, "|")));

  const rows = lines.filter((line) => line.includes("|")).map(split);
  if (rows.length < 2) return null;

  // The delimiter row (`---`, `:--:`) is markdown SAYING the row above it is a header. It is the
  // only header evidence this syntax carries, so its absence means zero header rows, not one.
  const isDelimiter = (row: readonly string[]) =>
    row.length > 0 && row.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
  const delimiterAt = rows.findIndex(isDelimiter);
  const headerRows = delimiterAt === 1 ? 1 : 0;
  const body = rows.filter((row) => !isDelimiter(row));
  if (body.length === 0) return null;

  const width = Math.max(...body.map((row) => row.length));
  if (width < 2 || width > MAX_COLUMNS) return null;
  const padded = body.slice(0, MAX_ROWS).map((row) => [...row, ...Array(width - row.length).fill("")]);

  const named = headerRows > 0 ? (padded[0] ?? []).map((value) => value.trim()) : [];
  const columns = named.some((value) => value.length > 0) ? named : undefined;
  return {
    headerRows,
    rows: padded,
    ...(columns ? { columns, headerSource: "present" as const } : {}),
  };
}

/** Where a run of consecutive pipe-table lines starts and ends inside a block of text. PURE. */
export function findPipeTables(source: string): Array<{ end: number; start: number; table: DocTable }> {
  const lines = source.split("\n");
  const found: Array<{ end: number; start: number; table: DocTable }> = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const table = tableFromPipes(run.map((index) => lines[index] ?? ""));
      if (table) found.push({ end: run[run.length - 1]!, start: run[0]!, table });
    }
    run = [];
  };
  lines.forEach((line, index) => {
    // A table line both starts and ends with a pipe once trimmed — a sentence merely containing
    // one is prose, and treating it as a row would eat the paragraph around it.
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) run.push(index);
    else flush();
  });
  flush();
  return found;
}

/** Every `<table>` in a fragment of markdown-with-HTML, in document order, with the span each
 *  occupied so the caller can splice the surrounding prose back together. PURE. */
export function findHtmlTables(source: string): Array<{ end: number; start: number; table: DocTable }> {
  const found: Array<{ end: number; start: number; table: DocTable }> = [];
  const pattern = /<table[^>]*>[\s\S]*?<\/table>/gi;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const table = tableFromHtml(match[0]);
    if (table) found.push({ end: match.index + match[0].length, start: match.index, table });
  }
  return found;
}
