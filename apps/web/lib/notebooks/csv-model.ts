/**
 * A delimited file as a `DocumentModel`: one unit, one grid.
 *
 * 🔴 THE SAME REPRESENTATION AS XLSX, DELIBERATELY (owner, 2026-08-12). A CSV is
 * one sheet's worth of grid, so it reuses `DocTable`/`DocCell` rather than
 * getting a parallel model of its own. Two representations of "a grid" would
 * mean two of everything downstream — two locators, two renderers, two things to
 * keep in step — and the second one always drifts.
 *
 * 🔴 `headerRows` IS ALWAYS 0, AND THAT IS A DECISION, NOT AN OVERSIGHT. The
 * owner's rule: do not infer a header because row 1 "looks like" one. XLSX can
 * sometimes do better because a workbook may carry an explicit ListObject
 * declaring its header rows — a fact the file states. A CSV states nothing. Every
 * signal a person would use ("the first row is words and the rest are numbers")
 * is a guess that is wrong for real files: a temperature log, a list of names,
 * an export that begins mid-table. 0 means "the file did not say", which is true,
 * and it leaves `columns` absent rather than naming columns after data.
 *
 * 🔴 NO UNIT LABEL. A CSV has no internal name, and `xlsx-model` already states
 * the rule this follows: never the filename — that belongs to whoever saved it,
 * not to the document. A consumer does not need one: a CSV has exactly ONE grid,
 * so its sole table unit is unambiguous and a cell reference needs no sheet name
 * to resolve.
 */

import { buildDocument, projectCells, type DocCell, type DocumentModel } from "@nemesis/shared";

import { type CsvGrid } from "./csv-structure";

/** The grid as canonical cells. A straight copy — there is nothing to merge, no
 *  spans to attach, and no second value to reconcile. */
function cellsOf(grid: CsvGrid): DocCell[] {
  return grid.cells.map((cell) => ({ column: cell.column, row: cell.row, text: cell.text }));
}

export function csvToModel(grid: CsvGrid): DocumentModel {
  const cells = cellsOf(grid);

  return buildDocument({
    blocks:
      cells.length === 0
        ? []
        : [
            {
              // 🔴 EMPTY, BY THE CONVENTION EVERY TABLE BLOCK FOLLOWS. The grid is
              // the content; `blockToText` renders it and `unitContent` reads it.
              text: "",
              headingPath: [],
              kind: "table",
              table: {
                headerRows: 0,
                rows: projectCells(cells),
                cells,
                // Preserved because the owner asked for it, and because a reader
                // should be able to see WHICH decision was made rather than
                // assuming a comma. Absent for a comma file: the common case
                // stays as quiet in storage as it is in meaning.
                ...(grid.delimiter !== "," ? { delimiter: grid.delimiter } : {}),
              },
              unit: 0,
            },
          ],
    format: "csv",
    // 🔴 NEVER A TITLE. There is nowhere in the format for one, and inventing a
    // title from the filename would be indistinguishable from one an author
    // typed.
    title: null,
    // A unit exists even when the file is empty, so a locator into the document
    // does not shift depending on whether anything was read.
    units: [{ index: 0, kind: "sheet" }],
  });
}
