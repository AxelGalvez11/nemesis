// Excel (.xlsx) → the normalized document. Opens the workbook zip (fflate, through the same
// bounded unzip the .pptx reader uses) and turns it into a ParsedDocument: one DocUnit per SHEET,
// one DocTable per detected table REGION, every cell carrying its own address, its formula and the
// value the sheet displays.
//
// 🔴 A WORKBOOK IS NOT A WALL OF TEXT. Flattening a sheet into prose is how a spreadsheet becomes
// unciteable: "revenue fell" retrieves nothing you can point at. Everything here exists so a
// citation can read `Forecast!B12:F19` — a real sheet, a real range, measured from the file.
//
// A .xlsx is a folder of documents, reached the same way a .pptx is — through relationships, never
// by filename index:
//
//   xl/workbook.xml               the sheet list, in TAB order, each with an r:id and a state
//   xl/_rels/workbook.xml.rels    r:id → xl/worksheets/sheetN.xml  (N is NOT the tab position)
//   xl/worksheets/sheetN.xml      the cells, the merges, the autofilter, the table parts
//   xl/worksheets/_rels/…         each sheet's OWN rels → xl/tables/tableM.xml
//   xl/sharedStrings.xml          most text in the workbook, stored once
//   xl/styles.xml                 which numbers are dates (get this wrong and every date is 45000)
//   xl/tables/tableM.xml          a table the author DECLARED: its range, its header, its name
//
// Charts, drawings and images are deliberately not read: a chart in a workbook is a rendering of
// cells that are already here.
import { strFromU8 } from "fflate";
import { createHash } from "node:crypto";

import type {
  DocBlock,
  DocCell,
  DocCoverage,
  DocTable,
  DocUnit,
  DocumentParser,
  Locator,
  ParsedDocument,
} from "@nemesis/shared";

import { unzipBounded } from "./office";
import { decodeXmlEntities } from "./office-text";
import {
  BUILTIN_NUMBER_FORMATS,
  excelSerialToIso,
  findContiguousRegions,
  formatCellRef,
  formatRangeRef,
  formatStoredNumber,
  formatHasDate,
  formatHasTime,
  formatIsPercent,
  parseCellRef,
  parseRangeRef,
  plausibleHeaderRows,
  rangesOverlap,
  translateSharedFormula,
  type CellAddress,
  type CellRange,
  type CellValueKind,
} from "./xlsx-cells";

/** The parser build. A new value means a NEW parse row rather than an edited one, so an older
 *  parse stays reproducible. Bump it whenever the OUTPUT of this file changes shape or content. */
export const XLSX_PARSER_VERSION = "xlsx@1";

/** Most cells to read out of one workbook. A sheet is allowed a million rows, and a real budget
 *  uses a few thousand cells; past this the file is a database export and the honest thing is to
 *  read what fits and SAY the parse was cut short. */
export const MAX_CELLS = 400_000;

/** Most tables to keep. Guards a pathological sheet that splits into thousands of tiny islands. */
export const MAX_TABLES = 500;

/**
 * Total covered-cell steps the merge sweep may take across one sheet.
 *
 * A merge is one short attribute and may name a rectangle of 17 billion cells, so this is a
 * DEFENCE, not a tuning knob: without it a file nobody would look at twice hangs the parser. The
 * value is generous against real workbooks — a sheet at the MAX_CELLS ceiling with every cell in
 * its own merge still fits — and the per-merge cost is already min(area, populated cells), so this
 * ceiling is only ever reached by a file constructed to reach it.
 */
export const MAX_MERGE_WORK = 2_000_000;

/** Most value rows rendered into a table block's text. The full grid always survives on
 *  DocTable.rows; this cap is only about how much of it goes to an embedder. */
export const MAX_TABLE_TEXT_ROWS = 400;

/** Most formula lines appended to a table block's text, for the same reason. */
export const MAX_FORMULA_LINES = 40;

interface SheetRef {
  /** 1-based tab position — the order a person sees along the bottom of the window. */
  index: number;
  name: string;
  /** "visible" | "hidden" | "veryHidden", as the workbook declares it. */
  state: string;
  /** Zip entry path, resolved through the relationship, never guessed from the index. */
  path: string;
}

interface SheetCell extends CellAddress {
  ref: string;
  kind: CellValueKind;
  /** The value as the sheet displays it. Empty for a formula whose result was not cached. */
  text: string;
  formula?: string;
  rowSpan?: number;
  colSpan?: number;
}

interface DeclaredTable {
  range: CellRange;
  name?: string;
  headerRows: number;
}

/** Parse .xlsx bytes into the normalized document. Throws (with a readable message) when the bytes
 *  are not a workbook; the caller turns that into a friendly error. */
export function parseXlsx(bytes: Uint8Array, fileName: string): ParsedDocument {
  const files = unzipBounded(bytes);
  const read = (path: string): string | null => {
    const data = files[path];
    return data ? strFromU8(data) : null;
  };

  const workbookXml = read("xl/workbook.xml");
  if (!workbookXml) throw new Error("That doesn't look like an Excel (.xlsx) file.");

  const relTargets = parseRelationships(read("xl/_rels/workbook.xml.rels") ?? "", "xl");
  const sheets = readSheetList(workbookXml, relTargets);
  if (!sheets.length) throw new Error("That workbook has no sheets we can read.");

  const sharedStrings = parseSharedStrings(read("xl/sharedStrings.xml") ?? "");
  const styles = parseStyles(read("xl/styles.xml") ?? "");
  // The date system is a property of the WORKBOOK and is written down. Reading a 1904 workbook as
  // a 1900 one is silently wrong by four years and a day, so this is never assumed.
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(?:1|true)"/i.test(workbookXml);

  const units: DocUnit[] = [];
  const tables: DocTable[] = [];
  const unitsUnread: number[] = [];
  const notes: string[] = [];
  const hidden: string[] = [];
  let cellBudget = MAX_CELLS;
  let truncated = false;
  let formulaCount = 0;
  let sharedFormulasTranslated = 0;
  let sharedFormulasDropped = 0;
  let mergedRegions = 0;
  let mergesUnresolved = 0;

  for (const sheet of sheets) {
    if (sheet.state !== "visible") hidden.push(sheet.name);
    const sheetXml = read(sheet.path);
    const locator: Locator = { index: sheet.index, kind: "sheet", label: sheet.name };
    if (sheetXml === null) {
      units.push({ blocks: [], locator });
      unitsUnread.push(sheet.index);
      continue;
    }

    const parsed = readSheet(sheetXml, { cellBudget, date1904, sharedStrings, styles });
    cellBudget -= parsed.cellsRead;
    if (parsed.truncated) truncated = true;
    formulaCount += parsed.formulaCount;
    sharedFormulasTranslated += parsed.sharedTranslated;
    sharedFormulasDropped += parsed.sharedDropped;
    mergedRegions += parsed.mergedRegions;
    mergesUnresolved += parsed.mergesUnresolved;

    // Each sheet's OWN rels, then its declared tables. Reaching xl/tables/ by globbing the folder
    // would file table 3 under whichever sheet happened to be read third.
    const sheetRels = parseRelationships(read(relsPathFor(sheet.path)) ?? "", parentDir(sheet.path));
    const declared: DeclaredTable[] = [];
    for (const id of parsed.tablePartIds) {
      const target = sheetRels.get(id);
      const tableXml = target ? read(target) : null;
      const table = tableXml ? readDeclaredTable(tableXml) : null;
      if (table) declared.push(table);
    }

    const built = buildSheet({
      cells: parsed.cells,
      declared,
      autoFilter: parsed.autoFilter,
      locator,
      tableIdPrefix: `s${sheet.index}`,
    });
    if (built.truncated) truncated = true;
    units.push({ blocks: built.blocks, locator });
    for (const table of built.tables) {
      if (tables.length >= MAX_TABLES) {
        truncated = true;
        break;
      }
      tables.push(table);
    }
    if (built.blocks.length === 0) unitsUnread.push(sheet.index);
  }

  if (hidden.length) {
    notes.push(
      `${hidden.length} sheet${hidden.length === 1 ? " is" : "s are"} hidden in Excel and ${hidden.length === 1 ? "was" : "were"} still read: ${hidden.join(", ")}.`,
    );
  }
  if (sharedFormulasTranslated) {
    notes.push(
      `${sharedFormulasTranslated} cell${sharedFormulasTranslated === 1 ? "" : "s"} share a formula stored once in the file; their own version was worked out from the shared original.`,
    );
  }
  if (sharedFormulasDropped) {
    notes.push(
      `${sharedFormulasDropped} shared formula${sharedFormulasDropped === 1 ? "" : "s"} could not be worked out for their own cell and were left off rather than recorded wrongly.`,
    );
  }
  if (mergedRegions) {
    notes.push(`${mergedRegions} merged cell block${mergedRegions === 1 ? "" : "s"}: the value is kept once, at its top-left cell.`);
  }
  if (mergesUnresolved) {
    truncated = true;
    notes.push(
      `${mergesUnresolved} merged cell block${mergesUnresolved === 1 ? " covers" : "s cover"} more of the sheet than the parser will sweep in one pass; the cells ${mergesUnresolved === 1 ? "it covers" : "they cover"} may appear as blanks.`,
    );
  }
  if (truncated) notes.push("This workbook is larger than the parser reads in one pass; part of it was left out.");

  const coverage: DocCoverage = {
    notes: notes.length ? notes : undefined,
    tablesFound: tables.length,
    truncated: truncated || undefined,
    unitsFound: sheets.length,
    unitsRead: sheets.length - unitsUnread.length,
    unitsUnread: unitsUnread.length ? unitsUnread : undefined,
    // Charts, drawings and images are out of scope by design, so this is a measured zero rather
    // than an unknown: nothing was looked for and nothing is claimed.
    visualsFound: 0,
    visualsKept: 0,
    visualsUnreadable: 0,
  };

  const meta: Record<string, string | number | boolean> = {
    cellsRead: MAX_CELLS - cellBudget,
    date1904,
    formulaCount,
    sheetCount: sheets.length,
    sourceName: fileName,
  };
  if (hidden.length) meta.hiddenSheets = hidden.join(", ");
  const definedNames = readDefinedNames(workbookXml);
  if (definedNames) meta.definedNames = definedNames;

  return {
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    coverage,
    kind: "xlsx",
    meta,
    parserVersion: XLSX_PARSER_VERSION,
    tables,
    title: readCoreTitle(read("docProps/core.xml") ?? "") ?? undefined,
    units,
    visuals: [],
  };
}

/** The parser, in the shape everything downstream consumes. */
export const xlsxParser: DocumentParser = {
  kind: "xlsx",
  parse: async (bytes: Uint8Array, fileName: string) => parseXlsx(bytes, fileName),
  version: XLSX_PARSER_VERSION,
};

// ---------------------------------------------------------------------------
// The workbook's own bookkeeping
// ---------------------------------------------------------------------------

/** One attribute off an opening tag. Names containing a colon (`r:id`) are ordinary here. */
function attr(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\s${escaped}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? decodeXmlEntities(m[1] ?? "") : null;
}

/** Fold a relationship target onto the part that referred to it. Targets come both relative
 *  (`../tables/table1.xml`) and absolute (`/xl/tables/table1.xml`), and a zip entry name is
 *  neither until it is resolved. */
function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const out: string[] = [];
  for (const part of `${baseDir}/${target}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function parentDir(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

function relsPathFor(path: string): string {
  const dir = parentDir(path);
  const file = path.slice(dir.length + 1);
  return `${dir}/_rels/${file}.rels`;
}

/** Relationship id → resolved zip entry name. */
function parseRelationships(xml: string, baseDir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const tag = m[1] ?? "";
    const id = attr(tag, "Id");
    const target = attr(tag, "Target");
    // An external relationship points outside the package; there is nothing here to read.
    if (!id || !target || attr(tag, "TargetMode") === "External") continue;
    out.set(id, resolveTarget(baseDir, target));
  }
  return out;
}

/** The sheets, in tab order, each resolved to the part that actually holds it. */
function readSheetList(workbookXml: string, rels: ReadonlyMap<string, string>): SheetRef[] {
  const out: SheetRef[] = [];
  const block = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(workbookXml)?.[1] ?? "";
  for (const m of block.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const tag = m[1] ?? "";
    const id = attr(tag, "r:id");
    const path = id ? rels.get(id) : undefined;
    if (!path) continue;
    out.push({
      index: out.length + 1,
      name: attr(tag, "name") ?? `Sheet ${out.length + 1}`,
      path,
      state: attr(tag, "state") ?? "visible",
    });
  }
  return out;
}

/**
 * The workbook's text, stored once and referred to by index.
 *
 * Two things have to go before the runs are joined. A `<si>` may be RICH TEXT — several `<r><t>`
 * runs that are one string wearing three fonts — so the runs concatenate rather than each becoming
 * a value. And `<rPh>` is a phonetic guide (furigana over kanji): a reading aid stored beside the
 * word, not part of it, and pasting it in doubles every Japanese label.
 */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    out.push(textRuns(m[1] ?? ""));
  }
  return out;
}

/** Concatenate the `<t>` runs of a shared string or an inline string. */
function textRuns(body: string): string {
  const clean = body.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").replace(/<phoneticPr\b[^>]*\/?>/g, "");
  let out = "";
  for (const run of clean.matchAll(/<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    out += decodeXmlEntities(run[1] ?? "");
  }
  return out;
}

interface Styles {
  /** Style index (a cell's `s`) → number-format code. */
  formats: string[];
}

/**
 * The number format behind each style, which is the ONLY thing that separates a date from 45000.
 *
 * 🔴 The `<xf>` elements inside `<cellStyleXfs>` come first in the file and look identical to the
 * ones inside `<cellXfs>`. A cell's `s` indexes the SECOND list. Reading the first is how a plain
 * number acquires someone else's date format.
 */
function parseStyles(xml: string): Styles {
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const tag = m[1] ?? "";
    const id = Number(attr(tag, "numFmtId") ?? "");
    const code = attr(tag, "formatCode");
    if (Number.isFinite(id) && code !== null) custom.set(id, code);
  }
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const formats: string[] = [];
  for (const m of block.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const id = Number(attr(m[1] ?? "", "numFmtId") ?? "0") || 0;
    formats.push(custom.get(id) ?? BUILTIN_NUMBER_FORMATS[id] ?? "General");
  }
  return { formats };
}

/** The workbook's named ranges, as a note for the meta bag. Never used for control flow. */
function readDefinedNames(workbookXml: string): string | null {
  const names: string[] = [];
  for (const m of workbookXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    const name = attr(m[1] ?? "", "name");
    // _xlnm.* are Excel's own internal names (print areas, filters), not the author's.
    if (name && !name.startsWith("_xlnm")) names.push(`${name}=${decodeXmlEntities(m[2] ?? "").trim()}`);
    if (names.length >= 50) break;
  }
  return names.length ? names.join("; ") : null;
}

/** The document's own title, where the author gave it one. */
function readCoreTitle(coreXml: string): string | null {
  const title = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(coreXml)?.[1];
  const text = decodeXmlEntities(title ?? "").trim();
  return text.length ? text.slice(0, 300) : null;
}

// ---------------------------------------------------------------------------
// One sheet's cells
// ---------------------------------------------------------------------------

interface SheetReadResult {
  cells: SheetCell[];
  autoFilter: CellRange | null;
  tablePartIds: string[];
  cellsRead: number;
  formulaCount: number;
  sharedTranslated: number;
  sharedDropped: number;
  mergedRegions: number;
  /** Merges whose covered-cell sweep hit MAX_MERGE_WORK. Their span is still recorded on the
   *  anchor; what is missing is the removal of the cells they cover. Counted so a workbook that
   *  declares thousands of enormous merges reports a partial read instead of pretending. */
  mergesUnresolved: number;
  truncated: boolean;
}

function readSheet(
  xml: string,
  ctx: { cellBudget: number; date1904: boolean; sharedStrings: readonly string[]; styles: Styles },
): SheetReadResult {
  const sheetData = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? "";
  const cells: SheetCell[] = [];
  const byKey = new Map<string, SheetCell>();
  // A shared formula is written ONCE, on the cell that defines it; every other cell in the group
  // carries only the id. Keep the definition so the followers can be translated.
  const sharedMasters = new Map<string, { text: string; at: CellAddress }>();
  let cellsRead = 0;
  let formulaCount = 0;
  let sharedTranslated = 0;
  let sharedDropped = 0;
  let truncated = false;
  let rowCursor = 0;

  for (const rowMatch of sheetData.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const declaredRow = Number(attr(rowMatch[1] ?? "", "r") ?? "");
    rowCursor = Number.isFinite(declaredRow) && declaredRow > 0 ? declaredRow : rowCursor + 1;
    const body = rowMatch[2] ?? "";
    let colCursor = 0;

    for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (cellsRead >= ctx.cellBudget) {
        truncated = true;
        break;
      }
      const tag = cellMatch[1] ?? "";
      const inner = cellMatch[2] ?? "";
      // A cell may omit its address; then it is simply the next column along. Never assume the
      // address is present, and never assume the columns are contiguous when it is.
      const address = parseCellRef(attr(tag, "r") ?? "") ?? { col: colCursor + 1, row: rowCursor };
      colCursor = address.col;

      const value = readCellValue(tag, inner, ctx);
      const formula = readFormula(inner, address, sharedMasters);
      if (formula.kind === "translated") sharedTranslated += 1;
      if (formula.kind === "untranslatable") sharedDropped += 1;
      if (formula.text) formulaCount += 1;
      if (!value && !formula.text) continue; // an empty cell that only carries formatting

      cellsRead += 1;
      const cell: SheetCell = {
        col: address.col,
        formula: formula.text ?? undefined,
        kind: value?.kind ?? "text",
        ref: formatCellRef(address.row, address.col),
        row: address.row,
        text: value?.text ?? "",
      };
      cells.push(cell);
      byKey.set(`${cell.row}:${cell.col}`, cell);
    }
    if (truncated) break;
  }

  // Merged cells: the value lives at the top-left and the rest of the block is empty. The covered
  // cells are DROPPED rather than emitted blank — every DocCell carries its own row/col, so an
  // absent cell is unambiguous, and keeping them would make a merged banner look like a wide row
  // of empty columns to the region finder.
  //
  // 🔴 WALK THE POPULATED CELLS, NEVER THE RECTANGLE. `<mergeCell ref="A1:XFD1048576"/>` is legal
  // and takes one line to write; iterating every coordinate inside it is 17 BILLION steps, so the
  // obvious loop turns one attribute of an untrusted file into a hang. The rectangle walk is still
  // the cheaper branch for the ordinary A1:D1 banner, so both exist and the arithmetic picks: cost
  // per merge is min(area, populated cells), and the total is capped by MAX_MERGE_WORK besides.
  let mergedRegions = 0;
  let mergesUnresolved = 0;
  let mergeBudget = MAX_MERGE_WORK;
  for (const m of xml.matchAll(/<mergeCell\b([^>]*)\/?>/g)) {
    const range = parseRangeRef(attr(m[1] ?? "", "ref") ?? "");
    if (!range) continue;
    mergedRegions += 1;
    const anchor = byKey.get(`${range.top}:${range.left}`);
    if (anchor) {
      anchor.rowSpan = range.bottom - range.top + 1;
      anchor.colSpan = range.right - range.left + 1;
    }
    // The span above is recorded whatever happens next — it is read straight off the file's own
    // `ref` and costs nothing. Only the covered-cell sweep is budgeted.
    const area = (range.bottom - range.top + 1) * (range.right - range.left + 1);
    const work = Math.min(area, byKey.size);
    if (work > mergeBudget) {
      // Reported, never silent: an unresolved merge leaves covered cells in the grid, which shows
      // up as a table with unexpected blanks rather than as an error.
      mergesUnresolved += 1;
      continue;
    }
    mergeBudget -= work;
    if (area <= byKey.size) {
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (let col = range.left; col <= range.right; col += 1) {
          if (row === range.top && col === range.left) continue;
          byKey.delete(`${row}:${col}`);
        }
      }
      continue;
    }
    // The declared merge is bigger than the sheet is full: ask each populated cell whether it falls
    // inside. Same answer, bounded number of steps.
    for (const cell of cells) {
      if (cell.row < range.top || cell.row > range.bottom) continue;
      if (cell.col < range.left || cell.col > range.right) continue;
      if (cell.row === range.top && cell.col === range.left) continue;
      byKey.delete(`${cell.row}:${cell.col}`);
    }
  }
  const kept = cells.filter((cell) => byKey.get(`${cell.row}:${cell.col}`) === cell);

  const autoFilterRef = /<autoFilter\b([^>]*)\/?>/.exec(xml)?.[1] ?? "";
  const tablePartIds: string[] = [];
  for (const m of xml.matchAll(/<tablePart\b([^>]*)\/?>/g)) {
    const id = attr(m[1] ?? "", "r:id");
    if (id) tablePartIds.push(id);
  }

  return {
    autoFilter: parseRangeRef(attr(autoFilterRef, "ref") ?? ""),
    cells: kept,
    cellsRead,
    formulaCount,
    mergedRegions,
    mergesUnresolved,
    sharedDropped,
    sharedTranslated,
    tablePartIds,
    truncated,
  };
}

/**
 * What the cell holds, decided by the file's own declarations.
 *
 * `t` says which store the value comes from — the shared table, an inline run, a formula's string
 * result, a boolean, an error, a strict ISO date. A missing `t` means a number, and a number is
 * only a date when its STYLE says so. That last sentence is the whole reason styles.xml is read.
 */
function readCellValue(
  tag: string,
  inner: string,
  ctx: { date1904: boolean; sharedStrings: readonly string[]; styles: Styles },
): { kind: CellValueKind; text: string } | null {
  const type = attr(tag, "t") ?? "n";
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  const value = raw === undefined ? null : decodeXmlEntities(raw);

  if (type === "inlineStr") {
    const body = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "";
    const text = textRuns(body);
    return text.length ? { kind: "text", text } : null;
  }
  if (value === null) return null;
  if (type === "s") {
    const text = ctx.sharedStrings[Number(value)] ?? "";
    return text.length ? { kind: "text", text } : null;
  }
  if (type === "str") return value.length ? { kind: "text", text: value } : null;
  if (type === "e") return { kind: "error", text: value };
  if (type === "b") return { kind: "boolean", text: value === "1" || value === "true" ? "TRUE" : "FALSE" };
  // ECMA-376 strict stores dates as ISO text rather than a serial. Nothing to convert.
  if (type === "d") return value.length ? { kind: "date", text: value } : null;

  const number = Number(value);
  if (!value.length || !Number.isFinite(number)) return value.length ? { kind: "text", text: value } : null;

  const styleIndex = Number(attr(tag, "s") ?? "0") || 0;
  const format = ctx.styles.formats[styleIndex] ?? "General";
  const hasDate = formatHasDate(format);
  const hasTime = formatHasTime(format);
  if (hasDate || hasTime) {
    const iso = excelSerialToIso(number, { date: hasDate, date1904: ctx.date1904, time: hasTime });
    if (iso) return { kind: "date", text: iso };
  }
  // Percent is the one other format that changes what the number MEANS rather than how it looks:
  // 0.25 under `0.0%` is twenty-five, not a quarter of one. Everything else — currency symbols,
  // thousands separators, colours, accounting parentheses — is presentation, and reproducing
  // Excel's rendering engine is not this parser's job.
  if (formatIsPercent(format)) return { kind: "number", text: `${formatStoredNumber(number * 100)}%` };
  return { kind: "number", text: formatStoredNumber(number) };
}

/** The cell's formula, including the one it inherits from a shared group. */
function readFormula(
  inner: string,
  at: CellAddress,
  masters: Map<string, { text: string; at: CellAddress }>,
): { text: string | null; kind: "own" | "translated" | "untranslatable" | "none" } {
  const m = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
  if (!m) return { kind: "none", text: null };
  const tag = m[1] ?? "";
  const text = decodeXmlEntities(m[2] ?? "").trim();
  const shareId = attr(tag, "t") === "shared" ? attr(tag, "si") : null;

  if (shareId !== null && text.length) {
    masters.set(shareId, { at, text });
    return { kind: "own", text };
  }
  if (shareId !== null) {
    const master = masters.get(shareId);
    if (!master) return { kind: "untranslatable", text: null };
    const shifted = translateSharedFormula(master.text, at.row - master.at.row, at.col - master.at.col);
    return shifted === null ? { kind: "untranslatable", text: null } : { kind: "translated", text: shifted };
  }
  return text.length ? { kind: "own", text } : { kind: "none", text: null };
}

/** A table the author declared: its range, its name, and how many rows are its header. */
function readDeclaredTable(xml: string): DeclaredTable | null {
  // `[^>]*` also swallows the slash of a self-closing `<table … />`, which the attribute reader
  // ignores — so one pattern covers both spellings.
  const tag = /<table\b([^>]*)>/.exec(xml)?.[1] ?? "";
  const range = parseRangeRef(attr(tag, "ref") ?? "");
  if (!range) return null;
  const headerAttr = attr(tag, "headerRowCount");
  return {
    // Absent means one header row — the format's own default, not a guess of ours.
    headerRows: headerAttr === null ? 1 : Number(headerAttr) || 0,
    name: attr(tag, "displayName") ?? attr(tag, "name") ?? undefined,
    range,
  };
}

// ---------------------------------------------------------------------------
// Sheet → units, tables and blocks
// ---------------------------------------------------------------------------

interface BuiltSheet {
  blocks: DocBlock[];
  tables: DocTable[];
  /** True when the per-sheet table ceiling was reached, so the caller can say so. */
  truncated: boolean;
}

/**
 * Turn one sheet's cells into blocks and tables.
 *
 * Table detection runs in strict precedence, and each tier only sees what the tier above left
 * behind — otherwise a declared table also arrives as a fallback region and the same numbers are
 * indexed twice under two different citations:
 *
 *   1. DECLARED   xl/tables/*.xml — the author said "this is a table", with its header row count.
 *   2. AUTOFILTER a filtered range is a table someone sorted; the file records the range.
 *   3. CONTIGUOUS what is left, split on blank rows and blank columns (see ./xlsx-cells).
 */
function buildSheet(input: {
  cells: readonly SheetCell[];
  declared: readonly DeclaredTable[];
  autoFilter: CellRange | null;
  locator: Locator;
  tableIdPrefix: string;
}): BuiltSheet {
  const { autoFilter, cells, declared, locator, tableIdPrefix } = input;
  const byKey = new Map<string, SheetCell>();
  const byRow = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    byKey.set(`${cell.row}:${cell.col}`, cell);
    const row = byRow.get(cell.row) ?? [];
    row.push(cell);
    byRow.set(cell.row, row);
  }
  for (const row of byRow.values()) row.sort((a, b) => a.col - b.col);

  // A cell is claimed once. The SET is what every later question asks — asking each cell against
  // every range instead is quadratic, and a sheet that splits into hundreds of small blocks is
  // exactly the file that would then take minutes.
  const claimedCells = new Set<string>();
  const claimedRanges: CellRange[] = [];
  const claim = (range: CellRange): void => {
    claimedRanges.push(range);
    for (const cell of cellsIn(byRow, range)) claimedCells.add(`${cell.row}:${cell.col}`);
  };
  const regions: { range: CellRange; headerRows: number | null; title?: string }[] = [];

  for (const table of declared) {
    const trimmed = trimToContent(byRow, table.range);
    if (!trimmed) continue;
    claim(table.range);
    regions.push({ headerRows: table.headerRows, range: trimmed, title: table.name });
  }
  if (autoFilter && !claimedRanges.some((range) => rangesOverlap(range, autoFilter))) {
    const trimmed = trimToContent(byRow, autoFilter);
    if (trimmed) {
      claim(autoFilter);
      // A filter says where the table is, not how tall its header is; the shape decides that.
      regions.push({ headerRows: null, range: trimmed });
    }
  }
  const loose = cells.filter((cell) => !claimedCells.has(`${cell.row}:${cell.col}`));
  let truncated = false;
  for (const range of findContiguousRegions(loose)) {
    // One row or one column is a label, a note or a running total — not a table. Insisting on two
    // of each is the only size rule here, and it is structural.
    if (range.bottom - range.top < 1 || range.right - range.left < 1) continue;
    if (regions.length >= MAX_TABLES) {
      truncated = true;
      break;
    }
    if (claimedRanges.some((other) => rangesOverlap(other, range))) continue;
    claim(range);
    regions.push({ headerRows: null, range });
  }
  regions.sort((a, b) => a.range.top - b.range.top || a.range.left - b.range.left);

  const tables: DocTable[] = [];
  const placed: { row: number; col: number; block: DocBlock }[] = [];

  for (const region of regions) {
    let { range } = region;
    let title = region.title;
    // A merged banner across the top of a block is a caption, not the header row. The merge is
    // declared in the file, so this is reading the layout rather than guessing at it.
    const banner = byKey.get(`${range.top}:${range.left}`);
    const spansBlock = banner !== undefined && banner.col + (banner.colSpan ?? 1) - 1 >= range.right && (banner.colSpan ?? 1) > 1;
    if (banner && spansBlock && range.bottom - range.top >= 2 && rowIsOnly(byKey, range, range.top, banner)) {
      title = banner.text || title;
      range = { ...range, top: range.top + 1 };
    }
    // A formula whose result was not cached has no VALUE to classify, so it does not vote in the
    // header test — an empty cell is not a label.
    const valued = cellsIn(byRow, range).filter((cell) => cell.text.length > 0);
    const headerRows = region.headerRows ?? plausibleHeaderRows(range, valued);
    const table = toTable({
      byRow,
      headerRows,
      id: `${tableIdPrefix}t${tables.length + 1}`,
      locator,
      range,
      title,
    });
    tables.push(table);
    placed.push({
      block: {
        id: `${tableIdPrefix}b${placed.length + 1}`,
        kind: "table",
        method: "cell",
        ordinal: 0,
        tableId: table.id,
        text: renderTable(table, locator, range),
      },
      col: range.left,
      row: range.top,
    });
  }

  // Everything outside a table: a title, a note, a stray total. Grouped by row so a line of the
  // sheet reads as a line of text.
  const looseByRow = new Map<number, SheetCell[]>();
  for (const cell of cells) {
    if (claimedCells.has(`${cell.row}:${cell.col}`)) continue;
    const row = looseByRow.get(cell.row) ?? [];
    row.push(cell);
    looseByRow.set(cell.row, row);
  }
  for (const [row, rowCells] of [...looseByRow.entries()].sort((a, b) => a[0] - b[0])) {
    const text = rowCells
      .sort((a, b) => a.col - b.col)
      .map((cell) => cell.text)
      .filter((value) => value.length > 0)
      .join(" ");
    if (!text.trim()) continue;
    placed.push({
      block: {
        id: `${tableIdPrefix}b${placed.length + 1}`,
        kind: "paragraph",
        method: "cell",
        ordinal: 0,
        text,
      },
      col: rowCells[0]?.col ?? 1,
      row,
    });
  }

  placed.sort((a, b) => a.row - b.row || a.col - b.col);
  const blocks = placed.map((entry, ordinal) => ({ ...entry.block, ordinal }));
  return { blocks, tables, truncated };
}

/**
 * The cells inside a rectangle.
 *
 * 🔴 WALKS THE CELLS, NEVER THE RECTANGLE. A declared range may be `A1:XFD1048576`, and any loop
 * that visits every position inside it never returns. Rows are walked because the map is keyed by
 * them; a run of empty rows costs one failed lookup each.
 */
function cellsIn(byRow: ReadonlyMap<number, SheetCell[]>, range: CellRange): SheetCell[] {
  const out: SheetCell[] = [];
  // A range taller than the sheet has rows is worth iterating the map for instead.
  if (range.bottom - range.top > byRow.size) {
    for (const [row, cells] of byRow) {
      if (row < range.top || row > range.bottom) continue;
      for (const cell of cells) if (cell.col >= range.left && cell.col <= range.right) out.push(cell);
    }
    return out.sort((a, b) => a.row - b.row || a.col - b.col);
  }
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (const cell of byRow.get(row) ?? []) {
      if (cell.col >= range.left && cell.col <= range.right) out.push(cell);
    }
  }
  return out;
}

/** A declared range can be bigger than what is in it (a table whose rows were deleted). Shrink it
 *  to the cells that exist, so the citation names a range that holds something. */
function trimToContent(byRow: ReadonlyMap<number, SheetCell[]>, range: CellRange): CellRange | null {
  let top = Number.MAX_SAFE_INTEGER;
  let left = Number.MAX_SAFE_INTEGER;
  let bottom = 0;
  let right = 0;
  for (const cell of cellsIn(byRow, range)) {
    if (cell.row < top) top = cell.row;
    if (cell.row > bottom) bottom = cell.row;
    if (cell.col < left) left = cell.col;
    if (cell.col > right) right = cell.col;
  }
  return bottom === 0 ? null : { bottom, left, right, top };
}

/** Is this row of the region occupied by nothing but the given cell? */
function rowIsOnly(
  byKey: ReadonlyMap<string, SheetCell>,
  range: CellRange,
  row: number,
  only: SheetCell,
): boolean {
  for (let col = range.left; col <= range.right; col += 1) {
    const cell = byKey.get(`${row}:${col}`);
    if (cell && cell !== only) return false;
  }
  return true;
}

function toTable(input: {
  byRow: ReadonlyMap<number, SheetCell[]>;
  headerRows: number;
  id: string;
  locator: Locator;
  range: CellRange;
  title?: string;
}): DocTable {
  const { byRow, headerRows, id, locator, range, title } = input;
  const rows: DocCell[][] = [];
  const grouped = new Map<number, SheetCell[]>();
  for (const cell of cellsIn(byRow, range)) {
    const line = grouped.get(cell.row) ?? [];
    line.push(cell);
    grouped.set(cell.row, line);
  }
  for (const row of [...grouped.keys()].sort((a, b) => a - b)) {
    const line: DocCell[] = [];
    for (const cell of grouped.get(row) ?? []) {
      const col = cell.col;
      // The optional fields are left OFF rather than set to undefined: a DocCell is stored as
      // jsonb, and a column of `"formula": null` is noise in every row of every table.
      line.push({
        // 🔴 TABLE-RELATIVE, 0-based — the same coordinates a PDF or Word table will use, so a
        // renderer never has to ask which parser produced the table. The absolute address the
        // spreadsheet knows it by lives on `ref`, where a citation can reach it.
        col: col - range.left,
        ...(cell.colSpan && cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
        ...(cell.formula ? { formula: cell.formula } : {}),
        ...(row < range.top + headerRows ? { header: true } : {}),
        ref: cell.ref,
        row: row - range.top,
        ...(cell.rowSpan && cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
        text: cell.text,
      });
    }
    if (line.length) rows.push(line);
  }
  return {
    id,
    locator: { ...locator, range: formatRangeRef(range) },
    method: "cell",
    rows,
    title: title?.trim() ? title.trim() : undefined,
  };
}

/**
 * A table as the text a chunker will embed.
 *
 * Two decisions worth stating. The sheet name and range lead the block, so a chunk that gets
 * separated from its locator still says where it came from. And the formulas follow the values:
 * "why did revenue fall" is often answered by `=B12-C12`, and a formula that lives only on a
 * DocCell never reaches an embedding. Both lists are capped — the full grid always survives on
 * DocTable.rows, and this rendering is for retrieval, not for storage.
 */
function renderTable(table: DocTable, locator: Locator, range: CellRange): string {
  const width = range.right - range.left + 1;
  const lines: string[] = [];
  const head = `${locator.label ?? "Sheet"}!${formatRangeRef(range)}`;
  lines.push(table.title ? `${head} — ${table.title}` : head);

  const shown = table.rows.slice(0, MAX_TABLE_TEXT_ROWS);
  for (const row of shown) {
    const cells = new Array<string>(width).fill("");
    for (const cell of row) cells[cell.col] = cell.text;
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    lines.push(cells.join(" | "));
  }
  if (table.rows.length > shown.length) lines.push(`… ${table.rows.length - shown.length} more rows`);

  const formulas: string[] = [];
  let unlisted = 0;
  for (const row of table.rows) {
    for (const cell of row) {
      if (!cell.formula) continue;
      if (formulas.length < MAX_FORMULA_LINES) formulas.push(`${cell.ref}=${cell.formula}`);
      else unlisted += 1;
    }
  }
  if (formulas.length) {
    // Both caps SAY they were reached. A silently shortened list reads as a complete one, and the
    // arithmetic that did not fit is exactly what a question about a number would have wanted.
    const more = unlisted ? `; … ${unlisted} more formulas` : "";
    lines.push(`Formulas: ${formulas.join("; ")}${more}`);
  }
  return lines.join("\n");
}
