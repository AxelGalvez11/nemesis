/**
 * Reading a workbook: sheets, cells, formulas, merges, hidden things.
 *
 * 🔴 THIS DOES NOT FLATTEN. A spreadsheet rendered to prose or to CSV loses the
 * two things that make it a spreadsheet — where a value sits, and where it came
 * from. "500 mg" is worth nothing without "the Dose column, for Amoxicillin, on
 * the Formulary sheet", and a citation cannot be built from a sentence.
 *
 * ── WHAT REAL FILES ACTUALLY DO, MEASURED BEFORE THIS WAS WRITTEN ──────────
 *
 * Eleven fixtures (`scripts/make-xlsx-fixtures.py`), surveyed with
 * `scripts/xlsx-survey.mts` against the raw XML:
 *
 *   * STRINGS COME TWO WAYS. openpyxl writes `<is>` inline strings and no
 *     shared-string table at all (7 of 14 cells in one fixture); LibreOffice
 *     writes a shared-string table and no inline strings. A reader that handles
 *     only the textbook `sharedStrings` case reads half these files as blank.
 *   * A FORMULA MAY HAVE NO CACHED VALUE. 4 of 15 cells in a workbook written by
 *     a program carry `<f>` and nothing else, because the program has no formula
 *     engine. Reading values alone loses them entirely.
 *   * A CACHED VALUE MAY CONTRADICT ITS FORMULA. In `formulas-stale.xlsx`, `B2`
 *     is 9,999 while `D2 = B2*C2` still caches 2.5 — the value from when B2 was
 *     10. Both facts are kept; see `DocCell.formula`.
 *   * THE USED RANGE NEED NOT START AT A1. `offset-origin.xlsx` declares
 *     `C5:D7`. Grid (0,0) is C5, and calling it A1 misplaces every citation.
 *   * AN EMPTY SHEET STILL DECLARES `A1:A1`, so the dimension cannot be used to
 *     decide whether a sheet holds anything. Count cells instead.
 *   * DATES ARE SERIAL NUMBERS. 2026-03-15 is `<v>46096</v>`; only the number
 *     format says otherwise. Showing "46096" is not an unstyled date, it is a
 *     different value — so dates are the one format rendered here.
 *
 * PURE apart from the unzip. No network, no database, no model — `xlsx-model.ts`
 * turns this into a `DocumentModel`, so the shape of the file and the shape of
 * our model can be reasoned about one at a time.
 */

import { strFromU8 } from "fflate";

import { unzipBounded } from "./office";

/** One cell, as the file has it. */
export interface SheetCell {
  /** 0-based row within the used range. */
  row: number;
  /** 0-based column within the used range. */
  column: number;
  /** The displayed value: a cached result, or the stored value, or a date. */
  text: string;
  /** The formula without its `=`, when the cell has one. */
  formula?: string;
  /** The stored value when `text` is a rendering of it (dates only, today). */
  raw?: string;
}

export interface SheetTable {
  /** The workbook's own name for a defined table (`ListObject`). */
  name: string;
  /** Its range in A1 form, exactly as the file states it. */
  ref: string;
  /** How many leading rows the file says are headers. */
  headerRowCount: number;
}

export interface Sheet {
  name: string;
  /** The author hid this sheet. Recorded, never acted on here. */
  hidden: boolean;
  cells: SheetCell[];
  /** Grid size, from the cells actually present rather than the declared range. */
  rows: number;
  columns: number;
  /** Where grid (0,0) sits in the sheet's own coordinates. */
  origin: { row: number; column: number };
  /** Merged regions, in grid coordinates. */
  merges: { row: number; column: number; rowSpan: number; colSpan: number }[];
  /** Grid rows/columns the file marks hidden. */
  hiddenRows: number[];
  hiddenColumns: number[];
  tables: SheetTable[];
}

export interface Workbook {
  /**
   * The workbook's own title from `docProps/core.xml`, or null.
   *
   * 🔴 NEVER THE FILENAME. A file's name belongs to whoever saved it, not to the
   * document, and a title invented from it would be indistinguishable from one
   * the author typed. Most workbooks have none, and null is the truthful answer.
   */
  title: string | null;
  sheets: Sheet[];
  /**
   * Things this reader saw and did not turn into content.
   *
   * 🔴 UNSUPPORTED IS NOT ABSENT (owner, 2026-08-12). A workbook can be
   * structurally readable while some of what it holds is not, and a parse that
   * quietly omits the difference tells a caller the file was simpler than it is.
   */
  unsupported: { kind: string; count: number }[];
}

// ── A1 references ──────────────────────────────────────────────────────────

/** `"C5"` → `{ row: 4, column: 2 }`, both 0-based. Null if it is not a reference. */
export function parseRef(ref: string): { row: number; column: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let column = 0;
  for (const ch of m[1]!) column = column * 26 + (ch.charCodeAt(0) - 64);
  const row = Number(m[2]);
  if (!Number.isFinite(row) || row < 1) return null;
  return { column: column - 1, row: row - 1 };
}

/** `{ row: 4, column: 2 }` → `"C5"`. The inverse, and the thing citations show. */
export function formatRef(row: number, column: number): string {
  let n = column + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return `${name}${row + 1}`;
}

// ── XML, read the way the rest of this codebase reads it ───────────────────

function tagsOf(xml: string, name: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = [];
  const re = new RegExp(`<${name}(\\s[^>]*?)?(/>|>([\\s\\S]*?)</${name}>)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push({ attrs: m[1] ?? "", inner: m[3] ?? "" });
  return out;
}

function attrOf(attrs: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  return m ? m[1]! : null;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};

function unescapeXml(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** The concatenated `<t>` runs inside a shared or inline string. */
function textRuns(xml: string): string {
  return tagsOf(xml, "t").map((t) => unescapeXml(t.inner)).join("");
}

// ── dates ──────────────────────────────────────────────────────────────────

/**
 * Number-format ids that mean "this number is a date or a time".
 *
 * 14–22 and 45–47 are the built-ins the specification fixes; anything else is a
 * custom format whose CODE has to be inspected, which `dateFormatIds` does.
 */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Which style indexes mean a date, from `xl/styles.xml`.
 *
 * A cell's `s` attribute indexes `cellXfs`; that entry's `numFmtId` is either a
 * built-in or points at a custom `numFmt` whose `formatCode` we inspect for the
 * date letters. Quoted literals are stripped first so a format like
 * `0" days"` cannot be read as a day pattern.
 */
function dateFormatIds(stylesXml: string): Set<number> {
  const custom = new Set<number>();
  for (const fmt of tagsOf(stylesXml, "numFmt")) {
    const id = Number(attrOf(fmt.attrs, "numFmtId"));
    const code = unescapeXml(attrOf(fmt.attrs, "formatCode") ?? "");
    const bare = code.replace(/"[^"]*"/g, "").replace(/\\./g, "");
    if (Number.isFinite(id) && /[ymdhs]/i.test(bare)) custom.add(id);
  }
  const out = new Set<number>();
  const cellXfs = tagsOf(stylesXml, "cellXfs")[0];
  if (!cellXfs) return out;
  tagsOf(cellXfs.inner, "xf").forEach((xf, index) => {
    const id = Number(attrOf(xf.attrs, "numFmtId") ?? "0");
    if (BUILTIN_DATE_FORMATS.has(id) || custom.has(id)) out.add(index);
  });
  return out;
}

/**
 * A spreadsheet serial number as an ISO date.
 *
 * 🔴 THE 1900 LEAP-YEAR BUG IS PART OF THE FORMAT, NOT A MISTAKE TO CORRECT.
 * Serial 60 is "29 February 1900", a day that never existed, because Lotus 1-2-3
 * had the bug and every spreadsheet since has reproduced it for compatibility.
 * Day 61 onwards is therefore offset by one from a naive epoch calculation, and
 * ignoring that puts every date before 1 March 1900 — and only those — one day
 * out. Serials at or below 60 are refused rather than guessed at.
 */
export function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 60) return null;
  const days = Math.floor(serial);
  // Day 61 is 1900-03-01. Anchor there and count forward in UTC.
  const ms = Date.UTC(1900, 2, 1) + (days - 61) * 86_400_000;
  const at = new Date(ms);
  if (Number.isNaN(at.getTime())) return null;
  const iso = at.toISOString().slice(0, 10);
  const fraction = serial - days;
  if (fraction <= 0) return iso;
  // A time of day is part of the same value; keep it to the minute.
  const minutes = Math.round(fraction * 24 * 60);
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${iso} ${hh}:${mm}`;
}

// ── the workbook ───────────────────────────────────────────────────────────

/** Sheet order and names live in the workbook part; the files they map to live
 *  in its relationships. Both are needed, and neither is derivable. */
function sheetOrder(zip: Record<string, Uint8Array>): { name: string; hidden: boolean; part: string }[] {
  const workbook = zip["xl/workbook.xml"];
  if (!workbook) return [];
  const rels = zip["xl/_rels/workbook.xml.rels"];
  const byId = new Map<string, string>();
  if (rels) {
    for (const rel of tagsOf(strFromU8(rels), "Relationship")) {
      const id = attrOf(rel.attrs, "Id");
      const target = attrOf(rel.attrs, "Target");
      if (id && target) byId.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
    }
  }
  const out: { name: string; hidden: boolean; part: string }[] = [];
  let fallback = 0;
  for (const sheet of tagsOf(strFromU8(workbook), "sheet")) {
    const name = unescapeXml(attrOf(sheet.attrs, "name") ?? "");
    const state = attrOf(sheet.attrs, "state") ?? "visible";
    const rid = attrOf(sheet.attrs, "r:id") ?? attrOf(sheet.attrs, "id");
    fallback += 1;
    const target = (rid && byId.get(rid)) || `worksheets/sheet${fallback}.xml`;
    out.push({ hidden: state !== "visible", name, part: `xl/${target}` });
  }
  return out;
}

function sharedStrings(zip: Record<string, Uint8Array>): string[] {
  const part = zip["xl/sharedStrings.xml"];
  if (!part) return [];
  return tagsOf(strFromU8(part), "si").map((si) => textRuns(si.inner));
}

/**
 * Table definitions this sheet points at, resolved through its OWN relationships.
 *
 * 🔴 NO ARCHIVE-WIDE FALLBACK, AND THAT IS THE WHOLE CARE HERE. An earlier
 * version fell back to "every table part in the archive" when a sheet's rels
 * could not be read. In a workbook where two sheets each define a table starting
 * at A1 — which is the ordinary case, not a contrived one — that hands both
 * tables to both sheets, and `declaredHeaderRows` takes the first whose origin
 * matches. One sheet then gets the other's name and header count, and the wrong
 * column names are attached to every value beneath them.
 *
 * A missing header count is a stated absence that `headerRows: 0` handles
 * correctly. A WRONG one is unrecoverable. So an unresolvable `tablePart` is
 * counted as unsupported and nothing is guessed.
 */
function tablesFor(
  zip: Record<string, Uint8Array>,
  part: string,
  xml: string,
  unsupported: Map<string, number>,
): SheetTable[] {
  const parts = tagsOf(xml, "tablePart").length;
  if (parts === 0) return [];
  const out: SheetTable[] = [];
  const relPart = part.replace(/worksheets\/(sheet\d+)\.xml$/, "worksheets/_rels/$1.xml.rels");
  const rels = zip[relPart];
  const targets = new Set<string>();
  if (rels) {
    for (const rel of tagsOf(strFromU8(rels), "Relationship")) {
      const target = attrOf(rel.attrs, "Target") ?? "";
      if (target.includes("tables/")) targets.add(`xl/${target.replace(/^\.\.\//, "").replace(/^\/?xl\//, "")}`);
    }
  }
  if (targets.size === 0) {
    // The sheet says it has tables and we cannot tell which. Saying so is the
    // only honest option; picking some is how the wrong headers get attached.
    bump(unsupported, "unresolved-table-definition");
    return [];
  }
  for (const name of targets) {
    const entry = zip[name];
    if (!entry) continue;
    const table = tagsOf(strFromU8(entry), "table")[0];
    if (!table) continue;
    const ref = attrOf(table.attrs, "ref");
    const display = attrOf(table.attrs, "displayName") ?? attrOf(table.attrs, "name");
    if (!ref || !display) continue;
    out.push({
      headerRowCount: Number(attrOf(table.attrs, "headerRowCount") ?? "1") || 0,
      name: unescapeXml(display),
      ref,
    });
  }
  return out;
}

/** Read one worksheet part into a `Sheet`. */
function readSheet(
  zip: Record<string, Uint8Array>,
  meta: { name: string; hidden: boolean; part: string },
  strings: string[],
  dateStyles: Set<number>,
  unsupported: Map<string, number>,
): Sheet {
  const entry = zip[meta.part];
  const empty: Sheet = {
    cells: [], columns: 0, hidden: meta.hidden, hiddenColumns: [], hiddenRows: [],
    merges: [], name: meta.name, origin: { column: 0, row: 0 }, rows: 0, tables: [],
  };
  if (!entry) return empty;
  const xml = strFromU8(entry);

  // ── the cells, in absolute sheet coordinates first ──
  interface Absolute { row: number; column: number; text: string; formula?: string; raw?: string }
  const absolute: Absolute[] = [];
  for (const cell of tagsOf(xml, "c")) {
    const at = parseRef(attrOf(cell.attrs, "r") ?? "");
    if (!at) continue;
    const type = attrOf(cell.attrs, "t") ?? "n";
    const styleIndex = Number(attrOf(cell.attrs, "s") ?? "-1");

    const formulaTag = tagsOf(cell.inner, "f")[0];
    // A shared formula's body lives on the first cell of its group; a follower
    // carries only `t="shared" si="…"`. Recording an empty formula would claim
    // the cell has one and then show nothing, so an empty body is omitted.
    const formula = formulaTag && formulaTag.inner.trim() ? unescapeXml(formulaTag.inner) : undefined;
    if (formulaTag && !formula) bump(unsupported, "shared-formula-reference");

    let text = "";
    let raw: string | undefined;
    if (type === "inlineStr") {
      text = textRuns(cell.inner);
    } else {
      const valueTag = tagsOf(cell.inner, "v")[0];
      const value = valueTag ? unescapeXml(valueTag.inner) : "";
      if (type === "s") {
        const index = Number(value);
        text = Number.isInteger(index) && index >= 0 && index < strings.length ? strings[index]! : "";
      } else if (type === "b") {
        text = value === "1" ? "TRUE" : value === "0" ? "FALSE" : value;
      } else if (type === "e") {
        // An error IS the cell's value — `#REF!` is what the sheet shows and what
        // a reader needs to see. It is not a parse failure.
        text = value;
      } else if (type === "str" || type === "d") {
        text = value;
      } else {
        // A number, possibly a date wearing one.
        const iso = dateStyles.has(styleIndex) ? serialToIso(Number(value)) : null;
        if (iso) {
          text = iso;
          raw = value;
        } else {
          text = value;
        }
      }
    }
    if (!text && !formula) continue;   // a styled but empty cell carries nothing
    absolute.push({ column: at.column, row: at.row, text, ...(formula ? { formula } : {}), ...(raw ? { raw } : {}) });
  }

  if (absolute.length === 0) return { ...empty, tables: tablesFor(zip, meta.part, xml, unsupported) };

  // ── the origin, from the cells that exist ──
  // 🔴 NOT FROM `<dimension>`. An empty sheet still declares `A1:A1`, and some
  // writers declare a range wider than anything they wrote. The cells are the
  // only statement about the sheet that cannot be stale.
  const originRow = Math.min(...absolute.map((c) => c.row));
  const originColumn = Math.min(...absolute.map((c) => c.column));
  const maxRow = Math.max(...absolute.map((c) => c.row));
  const maxColumn = Math.max(...absolute.map((c) => c.column));

  const cells: SheetCell[] = absolute.map((c) => ({
    column: c.column - originColumn,
    row: c.row - originRow,
    text: c.text,
    ...(c.formula ? { formula: c.formula } : {}),
    ...(c.raw ? { raw: c.raw } : {}),
  }));

  // ── merges, hidden rows and columns, in the same grid coordinates ──
  const merges: Sheet["merges"] = [];
  for (const merge of tagsOf(xml, "mergeCell")) {
    const ref = attrOf(merge.attrs, "ref") ?? "";
    const [from, to] = ref.split(":");
    const a = from ? parseRef(from) : null;
    const b = to ? parseRef(to) : null;
    if (!a || !b) continue;
    merges.push({
      colSpan: b.column - a.column + 1,
      column: a.column - originColumn,
      row: a.row - originRow,
      rowSpan: b.row - a.row + 1,
    });
  }

  const hiddenRows: number[] = [];
  for (const row of tagsOf(xml, "row")) {
    if (attrOf(row.attrs, "hidden") !== "1") continue;
    const index = Number(attrOf(row.attrs, "r") ?? "");
    if (Number.isFinite(index)) hiddenRows.push(index - 1 - originRow);
  }
  const hiddenColumns: number[] = [];
  for (const col of tagsOf(xml, "col")) {
    if (attrOf(col.attrs, "hidden") !== "1") continue;
    const min = Number(attrOf(col.attrs, "min") ?? "");
    const max = Number(attrOf(col.attrs, "max") ?? min);
    if (!Number.isFinite(min)) continue;
    for (let c = min; c <= max; c += 1) hiddenColumns.push(c - 1 - originColumn);
  }

  return {
    cells,
    columns: maxColumn - originColumn + 1,
    hidden: meta.hidden,
    hiddenColumns: hiddenColumns.filter((c) => c >= 0).sort((a, b) => a - b),
    hiddenRows: hiddenRows.filter((r) => r >= 0).sort((a, b) => a - b),
    merges,
    name: meta.name,
    origin: { column: originColumn, row: originRow },
    rows: maxRow - originRow + 1,
    tables: tablesFor(zip, meta.part, xml, unsupported),
  };
}

function bump(counts: Map<string, number>, kind: string): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

/**
 * Read a .xlsx into sheets.
 *
 * Throws only when the archive itself cannot be opened — `unzipBounded` turns
 * fflate's failures into sentences a caller can show. A workbook with no sheets
 * comes back empty rather than as an error, because "this file holds nothing" is
 * a verdict about the file and callers already know how to say it.
 */
export function readWorkbook(bytes: Uint8Array): Workbook {
  const zip = unzipBounded(bytes);
  const strings = sharedStrings(zip);
  const stylesPart = zip["xl/styles.xml"];
  const dateStyles = stylesPart ? dateFormatIds(strFromU8(stylesPart)) : new Set<number>();
  const unsupported = new Map<string, number>();

  // Things present in the archive that this reader does not turn into content.
  // Counted so a caller can say what it did not read, per "unsupported is not
  // absent". None of these is a failure; each is a stated limit.
  if (Object.keys(zip).some((k) => k.startsWith("xl/charts/"))) bump(unsupported, "chart");
  if (Object.keys(zip).some((k) => k.startsWith("xl/pivotTables/"))) bump(unsupported, "pivot-table");
  if (Object.keys(zip).some((k) => /vbaProject\.bin$/.test(k))) bump(unsupported, "macro");
  if (Object.keys(zip).some((k) => k.startsWith("xl/media/"))) bump(unsupported, "embedded-image");

  const core = zip["docProps/core.xml"];
  const declared = core ? tagsOf(strFromU8(core), "dc:title")[0] : undefined;
  const title = declared ? unescapeXml(declared.inner).trim() : "";

  const sheets = sheetOrder(zip).map((meta) => readSheet(zip, meta, strings, dateStyles, unsupported));
  return {
    sheets,
    title: title || null,
    unsupported: [...unsupported].map(([kind, count]) => ({ count, kind })),
  };
}
