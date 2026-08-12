/**
 * A workbook as a `DocumentModel`: one unit per sheet, one grid per sheet.
 *
 * 🔴 THE WORKBOOK IS NOT FLATTENED, AND THAT IS THE WHOLE POINT (owner,
 * 2026-08-12). A spreadsheet turned into prose or into CSV loses the two things
 * that make it a spreadsheet: where a value sits, and which sheet it sits on.
 * "500 mg" is worth nothing without "the Dose column, for Amoxicillin, on the
 * Formulary sheet" — and a citation cannot be rebuilt from a sentence.
 *
 * SHAPE, and why each part is where it is:
 *
 *   sheet      -> DocUnit { kind: "sheet", label: <the tab's own name>, hidden? }
 *   sheet name -> a heading block, exactly as `pptx-model` does with a slide's
 *                 title, because `documentToText` concatenates BLOCKS and never
 *                 sees unit labels — without it, a four-sheet workbook reads as
 *                 four grids with nothing to say where one ends.
 *   used range -> one table block whose `cells` are the truth and whose `rows`
 *                 are the projection `projectCells` computes.
 *
 * 🔴 A SHEET IS A UNIT EVEN WHEN IT IS EMPTY. Dropping empty sheets would
 * renumber every sheet after them, so every locator into the workbook would move
 * — and coverage would report a smaller document than the file contains.
 */

import {
  buildDocument,
  projectCells,
  type DocBlock,
  type DocCell,
  type DocTable,
  type DocumentModel,
} from "@nemesis/shared";

import { parseRef, type Sheet, type Workbook } from "./xlsx-structure";

/**
 * The header row count this sheet's own defined table declares, if any.
 *
 * 🔴 0 IS THE HONEST DEFAULT AND STAYS THE DEFAULT. A spreadsheet usually says
 * nothing about which rows are headers; the top row LOOKS like one to a person
 * and is data in plenty of real files. Only an explicit `ListObject` is evidence,
 * and only when its range actually starts where the grid does — a table defined
 * over part of a sheet says nothing about the rest of it.
 */
function declaredHeaderRows(sheet: Sheet): { headerRows: number; name?: string } {
  for (const table of sheet.tables) {
    const [from] = table.ref.split(":");
    const at = from ? parseRef(from) : null;
    if (!at) continue;
    if (at.row !== sheet.origin.row || at.column !== sheet.origin.column) continue;
    return { headerRows: Math.max(0, table.headerRowCount), name: table.name };
  }
  return { headerRows: 0 };
}

/** The sheet's cells with its merges attached as spans. */
function cellsWithMerges(sheet: Sheet): DocCell[] {
  const byPosition = new Map<string, DocCell>();
  for (const cell of sheet.cells) {
    byPosition.set(`${cell.row}:${cell.column}`, {
      column: cell.column,
      row: cell.row,
      text: cell.text,
      ...(cell.formula ? { formula: cell.formula } : {}),
      ...(cell.raw ? { raw: cell.raw } : {}),
      ...(cell.format ? { format: cell.format } : {}),
    });
  }
  for (const merge of sheet.merges) {
    if (merge.rowSpan <= 1 && merge.colSpan <= 1) continue;
    const key = `${merge.row}:${merge.column}`;
    const anchor = byPosition.get(key);
    if (anchor) {
      if (merge.rowSpan > 1) anchor.rowSpan = merge.rowSpan;
      if (merge.colSpan > 1) anchor.colSpan = merge.colSpan;
      continue;
    }
    // A merged region whose top-left holds nothing still OCCUPIES that space, and
    // the grid is the wrong width without it. An empty anchor states the shape
    // without inventing content.
    byPosition.set(key, {
      column: merge.column,
      row: merge.row,
      text: "",
      ...(merge.rowSpan > 1 ? { rowSpan: merge.rowSpan } : {}),
      ...(merge.colSpan > 1 ? { colSpan: merge.colSpan } : {}),
    });
  }
  // 🔴 NOTHING IS DROPPED FOR BEING "COVERED" BY A MERGE. A cell inside a merged
  // region normally holds nothing and never reaches here, because the reader
  // skips cells with neither value nor formula. One that DOES hold something is
  // a contradiction the file contains, and deleting it would be this parser
  // resolving that contradiction silently in favour of the tidier reading.
  return [...byPosition.values()].sort((a, b) => a.row - b.row || a.column - b.column);
}

function sheetTable(sheet: Sheet): DocTable | null {
  const cells = cellsWithMerges(sheet);
  if (cells.length === 0) return null;
  const rows = projectCells(cells);
  const { headerRows, name } = declaredHeaderRows(sheet);

  // Column names only when the file SAYS the first row is a header. Duplicates
  // are kept exactly as written — a real export had two columns called "Quiz 1",
  // and de-duplicating them would silently rename one of a student's marks.
  const header = headerRows > 0 ? rows[0] : undefined;

  return {
    headerRows,
    rows,
    cells,
    ...(header ? { columns: [...header], headerSource: "present" as const } : {}),
    ...(name ? { name } : {}),
    // Absent when the grid starts at A1, which keeps the common case as quiet in
    // storage as it is in meaning.
    ...(sheet.origin.row !== 0 || sheet.origin.column !== 0
      ? { origin: { column: sheet.origin.column, row: sheet.origin.row } }
      : {}),
    ...(sheet.hiddenRows.length > 0 ? { hiddenRows: sheet.hiddenRows } : {}),
    ...(sheet.hiddenColumns.length > 0 ? { hiddenColumns: sheet.hiddenColumns } : {}),
  };
}

/**
 * Where a cell of this table sits, in the source's own reference form.
 *
 * 🔴 THE FUNCTION THAT MAKES A SPREADSHEET CITATION TRUE. Grid coordinates are
 * relative to the used range; `origin` is what turns them back into what the
 * author would type. A sheet whose data begins at C5 has its first cell at grid
 * (0,0), and a citation that calls that "A1" is wrong by four rows and two
 * columns — while every stored-versus-read-back comparison still passes, because
 * both sides are wrong identically. Assert against this string, never indices.
 */
export function cellRef(table: Pick<DocTable, "origin">, row: number, column: number): string {
  const originRow = table.origin?.row ?? 0;
  const originColumn = table.origin?.column ?? 0;
  let n = column + originColumn + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return `${name}${row + originRow + 1}`;
}

/** The workbook as the canonical model. */
export function workbookToModel(workbook: Workbook, title: string | null): DocumentModel {
  const blocks: Omit<DocBlock, "id">[] = [];

  workbook.sheets.forEach((sheet, index) => {
    // The tab's own name, as a heading. The author wrote it; nothing here is
    // generated from position — an unnamed sheet contributes no heading rather
    // than "Sheet 3", which would be a locator dressed as the document's words.
    const named = sheet.name.trim();
    if (named) {
      blocks.push({ headingPath: [], kind: "heading", level: 1, text: named, unit: index });
    }
    const table = sheetTable(sheet);
    if (!table) return;
    blocks.push({
      // 🔴 EMPTY, BY THE CONVENTION EVERY TABLE BLOCK FOLLOWS. The grid is the
      // content; `blockToText` renders it and `unitContent` reads it. A copy of
      // the grid flattened into this field would be a second representation that
      // could disagree with the first.
      text: "",
      headingPath: named ? [named] : [],
      kind: "table",
      table,
      unit: index,
    });
  });

  return buildDocument({
    blocks,
    format: "xlsx",
    title,
    units: workbook.sheets.map((sheet, index) => ({
      index,
      kind: "sheet" as const,
      ...(sheet.name.trim() ? { label: sheet.name.trim() } : {}),
      ...(sheet.hidden ? { hidden: true } : {}),
    })),
  });
}
