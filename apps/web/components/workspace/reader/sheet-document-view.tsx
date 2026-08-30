"use client";

// Spreadsheets, read as spreadsheets.
//
// 🔴 THE LAST FORMAT THE PANEL COULD NOT SHOW. Owner, 2026-08-27: *"users should be able to view
// slides, docs, pdf, xlxs, etc."* Everything else landed a day later; a workbook fell through to a
// kind with no view at all and got the "no reader for this format" card.
//
// 🔴 NO NEW PARSER. `lib/notebooks/xlsx-structure.ts` has read workbooks for months — cells, cached
// values, number formats, merges, hidden rows, defined tables — for the extraction pipeline. All it
// needed was to stop importing `office.ts`, which drags `node:crypto` into anything that touches it.
// A second reader written for the screen would be a second opinion about what a cell says, free to
// disagree with the one the answers are grounded on.
//
// 🔴 A SHEET IS A UNIT, the same way a page and a slide are. That is what makes "sheet 2 of 4",
// citation anchors and the tab's remembered position work here without a line of new machinery.

import { useEffect, useMemo, useState } from "react";

import { formatRef, readWorkbook, type Sheet, type SheetCell, type Workbook } from "@/lib/notebooks/xlsx-structure";
import { findInUnit, highlightRuns } from "@/lib/reader/reader-search";
import { cn } from "@/lib/utils";

export interface SheetsReadyPayload {
  sheets: { index: number; name: string }[];
  unitTexts: { unit: number; text: string }[];
}

/**
 * How much of a sheet is drawn before the learner asks for the rest.
 *
 * 🔴 A CAP THAT SAYS SO, NEVER A SILENT TRUNCATION. A modelling workbook is tens of thousands of
 * rows and every cell is a DOM node; drawing all of them locks the tab for seconds. What is NOT
 * acceptable is a viewer that shows 200 rows of 12,000 and looks complete — so the count is printed
 * and the rest is one press away.
 */
const FIRST_ROWS = 200;
const MORE_ROWS = 800;

export function SheetDocumentView({
  bytes,
  query,
  onReady,
  onError,
  onUnitChange,
  registerElement,
}: {
  bytes: ArrayBuffer;
  query: string | null;
  onReady: (payload: SheetsReadyPayload) => void;
  onError: (message: string) => void;
  onUnitChange: (unit: number) => void;
  registerElement: (unit: number, element: HTMLElement | null) => void;
}) {
  const [workbook, setWorkbook] = useState<Workbook | null>(null);

  useEffect(() => {
    try {
      const read = readWorkbook(new Uint8Array(bytes));
      setWorkbook(read);
      onReady({
        sheets: read.sheets.map((sheet, index) => ({ index: index + 1, name: sheet.name })),
        // One unit per sheet, so search and citations land on a sheet the way they land on a page.
        unitTexts: read.sheets.map((sheet, index) => ({ unit: index + 1, text: sheetText(sheet) })),
      });
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : "That spreadsheet could not be opened.");
    }
    // The bytes are the input; the callbacks are stable enough that re-reading a 30 MB workbook
    // because a parent re-rendered is the wrong trade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes]);

  if (!workbook) {
    return <p className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Opening the workbook…</p>;
  }

  if (workbook.sheets.length === 0) {
    return (
      <p className="grid h-full place-items-center px-8 text-center text-xs text-(--ui-text-tertiary)">
        This workbook has no sheets in it.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto overscroll-contain p-6" data-testid="reader-sheet-scroll">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
        {workbook.sheets.map((sheet, index) => (
          <SheetGrid
            index={index + 1}
            key={`${sheet.name}:${index}`}
            onVisible={onUnitChange}
            query={query}
            registerElement={registerElement}
            sheet={sheet}
          />
        ))}
        {workbook.unsupported.length > 0 && (
          // 🔴 UNSUPPORTED IS NOT ABSENT. A workbook can be perfectly readable while some of what it
          // holds is not, and a viewer that says nothing turns "we did not draw your chart" into
          // "your chart is gone".
          <p className="text-[0.6875rem] text-(--ui-text-tertiary)" data-testid="reader-sheet-unsupported">
            Not shown here: {workbook.unsupported.map((item) => `${item.count} ${item.kind.replace(/-/g, " ")}${item.count === 1 ? "" : "s"}`).join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}

function SheetGrid({
  index,
  onVisible,
  query,
  registerElement,
  sheet,
}: {
  index: number;
  onVisible: (unit: number) => void;
  query: string | null;
  registerElement: (unit: number, element: HTMLElement | null) => void;
  sheet: Sheet;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [limit, setLimit] = useState(FIRST_ROWS);

  useEffect(() => {
    registerElement(index, element);
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.intersectionRatio > 0.45) onVisible(index);
      },
      { threshold: [0, 0.45, 0.9] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      registerElement(index, null);
    };
  }, [element, index, onVisible, registerElement]);

  const { covered, grid } = useMemo(() => layOut(sheet), [sheet]);
  const hiddenRows = useMemo(() => new Set(sheet.hiddenRows), [sheet.hiddenRows]);
  const hiddenColumns = useMemo(() => new Set(sheet.hiddenColumns), [sheet.hiddenColumns]);

  const columns = useMemo(
    () => Array.from({ length: sheet.columns }, (_, column) => column).filter((column) => !hiddenColumns.has(column)),
    [hiddenColumns, sheet.columns],
  );
  const rows = useMemo(
    () => Array.from({ length: sheet.rows }, (_, row) => row).filter((row) => !hiddenRows.has(row)),
    [hiddenRows, sheet.rows],
  );
  const shown = rows.slice(0, limit);

  return (
    // Comment anchors here are fractions of this section, which GROWS when "show more" draws more
    // rows — a pin below the fold drifts with it. Stated rather than solved: the stable alternative
    // (anchoring to a cell) can come when someone actually comments on row 4,000.
    <section className="relative flex min-w-0 flex-col gap-2" data-testid={`reader-sheet-${index}`} ref={setElement}>
      <header className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">{sheet.name}</h3>
        <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
          {rows.length === 1 ? "1 row" : `${rows.length} rows`} · {columns.length === 1 ? "1 column" : `${columns.length} columns`}
          {sheet.hidden && " · hidden in Excel"}
          {(hiddenRows.size > 0 || hiddenColumns.size > 0) &&
            ` · ${hiddenRows.size + hiddenColumns.size} hidden by the author, not shown`}
        </span>
      </header>

      <div className="overflow-x-auto rounded-lg border border-(--ui-stroke-tertiary)">
        <table className="w-full border-collapse text-[0.75rem]" data-testid={`reader-sheet-${index}-table`}>
          <thead>
            <tr>
              {/* The row-number gutter, and then Excel's own column letters. Without them a
                  spreadsheet reads as an anonymous table and a reference like C14 means nothing. */}
              <th className="sticky left-0 z-10 w-10 bg-(--ui-bg-tertiary) px-2 py-1 text-right text-[0.6875rem] font-normal text-(--ui-text-quaternary)" />
              {columns.map((column) => (
                <th
                  className="min-w-[80px] whitespace-nowrap bg-(--ui-bg-tertiary) px-2 py-1 text-left text-[0.6875rem] font-normal text-(--ui-text-quaternary)"
                  key={column}
                >
                  {columnLetter(sheet.origin.column + column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr className="border-t border-(--ui-stroke-tertiary)" key={row}>
                <th className="sticky left-0 z-10 bg-(--ui-bg-tertiary) px-2 py-1 text-right text-[0.6875rem] font-normal text-(--ui-text-quaternary)">
                  {sheet.origin.row + row + 1}
                </th>
                {columns.map((column) => {
                  if (covered.has(`${row}:${column}`)) return null;
                  const cell = grid.get(`${row}:${column}`);
                  const merge = sheet.merges.find((area) => area.row === row && area.column === column);
                  return (
                    <td
                      className={cn(
                        "border-l border-(--ui-stroke-tertiary) px-2 py-1 align-top",
                        cell?.formula && "text-(--ui-text-primary)",
                      )}
                      colSpan={merge?.colSpan}
                      key={column}
                      rowSpan={merge?.rowSpan}
                      // The formula is the thing a spreadsheet hides and a student needs: what the
                      // number IS, not just what it came out as.
                      title={cell?.formula ? `${formatRef(sheet.origin.row + row, sheet.origin.column + column)}  =${cell.formula}` : undefined}
                    >
                      <Painted query={query} text={cell?.text ?? ""} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown.length && (
        <button
          className="self-start text-[0.6875rem] text-(--ui-text-secondary) underline underline-offset-2 hover:text-foreground"
          onClick={() => setLimit((current) => current + MORE_ROWS)}
          type="button"
        >
          Showing {shown.length} of {rows.length} rows — show more
        </button>
      )}
    </section>
  );
}

/** Cells by "row:column", plus the positions a merge already covers. */
function layOut(sheet: Sheet): { covered: Set<string>; grid: Map<string, SheetCell> } {
  const grid = new Map<string, SheetCell>();
  for (const cell of sheet.cells) grid.set(`${cell.row}:${cell.column}`, cell);
  const covered = new Set<string>();
  for (const area of sheet.merges) {
    for (let row = area.row; row < area.row + area.rowSpan; row += 1) {
      for (let column = area.column; column < area.column + area.colSpan; column += 1) {
        if (row === area.row && column === area.column) continue;
        covered.add(`${row}:${column}`);
      }
    }
  }
  return { covered, grid };
}

/** 0 → A, 25 → Z, 26 → AA. Excel's own column names, which is what a reference is written in. */
export function columnLetter(column: number): string {
  let name = "";
  for (let value = column; value >= 0; value = Math.floor(value / 26) - 1) {
    name = String.fromCharCode(65 + (value % 26)) + name;
  }
  return name;
}

/** A sheet as searchable text: one line per row, cells separated by tabs. */
export function sheetText(sheet: Sheet): string {
  const rows = new Map<number, string[]>();
  for (const cell of sheet.cells) {
    const line = rows.get(cell.row) ?? [];
    line.push(cell.text);
    rows.set(cell.row, line);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, cells]) => cells.join("\t"))
    .join("\n");
}

function Painted({ text, query }: { text: string; query: string | null }) {
  if (!query || !text) return <>{text}</>;
  const ranges = findInUnit(text, query, 1);
  if (ranges.length === 0) return <>{text}</>;
  return (
    <>
      {highlightRuns(text, ranges).map((run, index) =>
        run.highlighted ? (
          <mark className="bg-(--ui-action)/25 text-inherit" key={index}>
            {run.text}
          </mark>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
