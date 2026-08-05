// Pure spreadsheet helpers for the .xlsx parser. A workbook is a zip of XML; the zip is opened in
// ./xlsx-parse.ts (fflate I/O), but everything that turns a cell into a value — addresses, number
// formats, date serials, shared formulas, where the tables are — is pure string and arithmetic work
// and lives here so it can be tested without a single binary fixture. Same split as
// ./office.ts ↔ ./office-text.ts. No imports.
//
// 🔴 NOTHING IN HERE KNOWS WHAT A SPREADSHEET IS FOR. A budget, a lab log, a parts list, a case
// docket and a class roster are the same grid to this file. Every rule below is about SHAPE (is
// this row all text? is this column blank? does this format contain a day token?) — never about
// subject matter, and never about English: the number-format table includes the locale-specific
// East Asian date formats for exactly that reason.

/** A1 addressing tops out here. Anything past it is not a reference, whatever it looks like. */
export const MAX_COLUMN = 16_384; // XFD
export const MAX_ROW = 1_048_576;

/** Column letters → 1-based index. "A" → 1, "AA" → 27, "XFD" → 16384. 0 means "not a column". PURE. */
export function columnToIndex(letters: string): number {
  if (!letters) return 0;
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    const v = letters.toUpperCase().charCodeAt(i) - 64;
    if (v < 1 || v > 26) return 0;
    n = n * 26 + v;
  }
  return n;
}

/** 1-based index → column letters. Inverse of columnToIndex. PURE. */
export function indexToColumn(index: number): string {
  let n = Math.max(1, Math.floor(index));
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export interface CellAddress {
  /** 1-based, as the sheet numbers it. */
  row: number;
  /** 1-based. Column A is 1. */
  col: number;
}

/** "B12" or "$B$12" → {row:12, col:2}. Null for anything out of A1 range. PURE. */
export function parseCellRef(ref: string): CellAddress | null {
  const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref.trim());
  if (!m) return null;
  const col = columnToIndex(m[1] ?? "");
  const row = Number(m[2] ?? "0");
  if (!col || col > MAX_COLUMN || !row || row > MAX_ROW) return null;
  return { col, row };
}

/** {row:12, col:2} → "B12". PURE. */
export function formatCellRef(row: number, col: number): string {
  return `${indexToColumn(col)}${row}`;
}

/** A rectangle of the sheet, in 1-based inclusive sheet coordinates. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** "B12:F19" (or a bare "B12") → a range. Null if either end is not an address. PURE. */
export function parseRangeRef(ref: string): CellRange | null {
  const parts = ref.trim().split(":");
  const a = parseCellRef(parts[0] ?? "");
  if (!a) return null;
  if (parts.length === 1) return { bottom: a.row, left: a.col, right: a.col, top: a.row };
  const b = parseCellRef(parts[1] ?? "");
  if (!b || parts.length > 2) return null;
  return {
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.col, b.col),
    right: Math.max(a.col, b.col),
    top: Math.min(a.row, b.row),
  };
}

/** A range as a citation reads it: "B12:F19", or just "B12" when it is one cell. PURE. */
export function formatRangeRef(range: CellRange): string {
  const start = formatCellRef(range.top, range.left);
  if (range.top === range.bottom && range.left === range.right) return start;
  return `${start}:${formatCellRef(range.bottom, range.right)}`;
}

/** Do two rectangles share any cell? Used to stop a fallback region re-claiming a declared table. PURE. */
export function rangesOverlap(a: CellRange, b: CellRange): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

/** What a cell holds, decided by the file, never by looking at the characters. */
export type CellValueKind = "text" | "number" | "date" | "boolean" | "error";

// ---------------------------------------------------------------------------
// Number formats: the difference between a date and 45000
// ---------------------------------------------------------------------------

/**
 * The implied number formats — the ones a workbook refers to by id alone.
 *
 * A cell says `s="3"`; style 3 says `numFmtId="14"`; and 14 is not written down anywhere in the
 * file. Miss this table and every date in every workbook that used a built-in format arrives as
 * five stray digits.
 *
 * 27–36 and 50–58 are the locale-specific date/time built-ins (Japanese, Chinese, Korean, Thai
 * calendars). Their exact codes vary by locale and we do not try to reproduce their rendering —
 * only whether they are a date, a time, or both, which is all this file asks. Writing them out as
 * ordinary codes means they go through the SAME detector as everything else rather than a second
 * code path that would quietly rot.
 */
export const BUILTIN_NUMBER_FORMATS: Readonly<Record<number, string>> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "mm-dd-yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  27: "yyyy/m/d",
  28: "yyyy/m/d",
  29: "yyyy/m/d",
  30: "m/d/yy",
  31: "yyyy/m/d",
  32: "h:mm",
  33: "h:mm:ss",
  34: "yyyy/m/d",
  35: "yyyy/m/d",
  36: "yyyy/m/d",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
  50: "yyyy/m/d",
  51: "yyyy/m/d",
  52: "yyyy/m/d",
  53: "yyyy/m/d",
  54: "yyyy/m/d",
  55: "yyyy/m/d",
  56: "h:mm:ss",
  57: "yyyy/m/d",
  58: "yyyy/m/d",
};

/**
 * A format code with everything that is NOT a format token removed.
 *
 * The order of the passes is the whole trick, because every one of these can contain a letter that
 * would otherwise read as a date token:
 *
 *   \-      an escaped literal character  (`\d` is the letter d, not "day")
 *   _x      a blank the width of x        (`_)` reserves the width of a bracket)
 *   *x      a fill character
 *   "…"     a literal run                 (`0" days"` is a NUMBER, and the d must not count)
 *   […]     a colour, a condition, a currency/locale tag — EXCEPT elapsed-time [h] [mm] [ss],
 *           which are genuine time tokens and must survive.
 *
 * PURE.
 */
export function stripFormatLiterals(code: string): string {
  return code
    .replace(/\\./g, "")
    .replace(/[_*]./g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\[([^\]]*)\]/g, (_all, inner: string) => (/^[hms]+$/i.test(inner) ? inner : ""));
}

/** Does this format make its number a calendar date? PURE. */
export function formatHasDate(code: string): boolean {
  const bare = stripFormatLiterals(code);
  if (/[yd]/i.test(bare)) return true;
  // A lone `m` is a month unless something in the code makes it a minute. `mm:ss` and `h:mm` are
  // times; `mmm-yy` is caught above by the y. So: month only when no clock token is present.
  return /m/i.test(bare) && !/[hs]/i.test(bare);
}

/** Does this format make its number a time of day (or an elapsed duration)? PURE. */
export function formatHasTime(code: string): boolean {
  return /[hs]/i.test(stripFormatLiterals(code));
}

/** Is the stored number scaled by 100 for display? `0.25` under `0.0%` is twenty-five percent, and
 *  printing "0.25" for it is a different claim about the world. PURE. */
export function formatIsPercent(code: string): boolean {
  return stripFormatLiterals(code).includes("%");
}

/**
 * Excel's serial number → the date it denotes, as ISO text.
 *
 * Two systems exist and the flag is in the workbook, never inferred:
 *
 *   1900 (Windows default) — day 1 is 1900-01-01, but the file format also believes 1900 was a
 *     leap year (Lotus 1-2-3 did, and compatibility outlived the reason). So serial 60 is a day
 *     that never happened, serials above it are consistent with a 1899-12-30 origin, and serials
 *     below it are one day out from that origin. Hence the `< 60` correction — which must NOT
 *     follow us into the 1904 system, where there is no phantom day at all.
 *
 *   1904 (old Mac default) — day 0 is 1904-01-01, no fudge, and every serial is 1462 lower than
 *     its 1900 counterpart. A workbook saved this way and read the other way is off by four years
 *     and a day, silently.
 *
 * Returns null for a serial that is not a date (negative, or beyond the sheet's own calendar), so
 * the caller prints the number it actually has rather than a fabricated date.
 * PURE.
 */
export function excelSerialToIso(
  serial: number,
  options: { date1904?: boolean; date: boolean; time: boolean },
): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  // Seconds first: `0.5` days is exact, but `0.7333…` days is not, and flooring the fraction
  // afterwards turns 17:36 into 17:35:59.
  const totalSeconds = Math.round(serial * 86_400);
  let days = Math.floor(totalSeconds / 86_400);
  const secondOfDay = totalSeconds - days * 86_400;

  if (!options.date) {
    // An elapsed-time format ([h]:mm:ss) legitimately runs past 24 hours, so hours accumulate
    // rather than wrapping. A plain h:mm on a whole-day serial simply reads 00:00:00.
    const hours = days * 24 + Math.floor(secondOfDay / 3600);
    return `${pad(hours)}:${pad(Math.floor(secondOfDay / 60) % 60)}:${pad(secondOfDay % 60)}`;
  }

  let epochUtc: number;
  if (options.date1904) {
    epochUtc = Date.UTC(1904, 0, 1);
  } else {
    // The day Excel invented. It has no real ISO spelling; printing what the sheet shows is more
    // honest than shifting it silently onto the 28th.
    if (days === 60) return options.time ? `1900-02-29T${clock(secondOfDay)}` : "1900-02-29";
    if (days < 60) days += 1;
    epochUtc = Date.UTC(1899, 11, 30);
  }

  const at = new Date(epochUtc + days * 86_400_000);
  if (Number.isNaN(at.getTime())) return null;
  const day = `${at.getUTCFullYear().toString().padStart(4, "0")}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
  return options.time ? `${day}T${clock(secondOfDay)}` : day;
}

function pad(n: number): string {
  return Math.abs(n).toString().padStart(2, "0");
}

function clock(secondOfDay: number): string {
  return `${pad(Math.floor(secondOfDay / 3600))}:${pad(Math.floor(secondOfDay / 60) % 60)}:${pad(secondOfDay % 60)}`;
}

/**
 * A stored number as text, without pretending to be Excel's rendering engine.
 *
 * IEEE doubles print their own noise (`0.1 + 0.2` is famously not `0.3`), and a sheet that shows
 * 1234.56 should not retrieve as 1234.5600000000001. Excel itself keeps 15 significant digits, so
 * that is the rounding used here — not a display choice, a de-noising one.
 * PURE.
 */
export function formatStoredNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return String(Number(value.toPrecision(15)));
}

// ---------------------------------------------------------------------------
// Shared formulas
// ---------------------------------------------------------------------------

/**
 * The formula a cell that shares one actually holds.
 *
 * Excel stores a filled-down column ONCE: the top cell carries `<f t="shared" si="0">B2-C2</f>`
 * and every cell under it carries `<f t="shared" si="0"/>` — no text at all. Dropping those loses
 * most of the arithmetic in a real workbook, and copying the master's text onto them is worse: it
 * would claim row 19 computes `B2-C2`, which is false. The file states the relationship, so the
 * translation is decoding, not guessing — the same status as looking a shared string up by index.
 *
 * It FAILS CLOSED. A structured or external reference (anything with `[`) is left alone, and a
 * shift that would leave the sheet returns null, because a wrong formula is worse than no formula.
 * The caller counts what it could not translate and says so in coverage.
 *
 * PURE.
 */
export function translateSharedFormula(master: string, rowDelta: number, colDelta: number): string | null {
  if (rowDelta === 0 && colDelta === 0) return master;
  // `[` is a structured table reference (`Table1[@Revenue]`) or a link to another workbook
  // (`[1]Sheet1!A1`). Neither shifts the way a plain A1 reference does.
  if (master.includes("[")) return null;

  let failed = false;
  // One pass, three alternatives, in this order: a "quoted literal", a 'quoted sheet name', then a
  // reference candidate. Putting the quoted forms first is what stops the scanner from rewriting
  // the inside of a string.
  const out = master.replace(
    /"(?:[^"]|"")*"|'(?:[^']|'')*'|(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/g,
    (all, colAnchor: string | undefined, letters: string | undefined, rowAnchor: string | undefined, digits: string | undefined, offset: number) => {
      if (letters === undefined || digits === undefined) return all; // a quoted run: untouched
      const before = master[offset - 1] ?? "";
      const after = master[offset + all.length] ?? "";
      // `LOG10(` is a function, not cell LOG row 10; `_xlfn.X1` and `MyName2` are identifiers.
      if (after === "(" || /[A-Za-z0-9_.]/.test(after)) return all;
      if (/[A-Za-z0-9_.]/.test(before)) return all;
      const col = columnToIndex(letters);
      const row = Number(digits);
      if (!col || col > MAX_COLUMN || !row || row > MAX_ROW) return all;
      const newCol = colAnchor === "$" ? col : col + colDelta;
      const newRow = rowAnchor === "$" ? row : row + rowDelta;
      if (newCol < 1 || newCol > MAX_COLUMN || newRow < 1 || newRow > MAX_ROW) {
        failed = true;
        return all;
      }
      return `${colAnchor ?? ""}${indexToColumn(newCol)}${rowAnchor ?? ""}${newRow}`;
    },
  );
  return failed ? null : out;
}

// ---------------------------------------------------------------------------
// Where the tables are
// ---------------------------------------------------------------------------

/** How many times a region may be split before we accept it as one block. A workbook laid out in
 *  a grid of small tables nests a few levels; nothing real needs eight. */
const MAX_SPLIT_DEPTH = 8;

/**
 * Contiguous rectangles of used cells, found by SHAPE alone.
 *
 * A used range is not a rectangle — real sheets are sparse, and a "used range" of A1:Z400 can hold
 * two tables, a title and a stray note. The split is the oldest structural signal there is: a
 * completely empty row separates blocks vertically, a completely empty column separates them
 * horizontally, and the two rules alternate until nothing moves. No keyword ever enters it, so it
 * behaves the same on a Farsi parts list and an English budget.
 *
 * Returns bounding boxes in top-to-bottom, left-to-right reading order.
 * PURE.
 */
export function findContiguousRegions(cells: readonly CellAddress[]): CellRange[] {
  const out: CellRange[] = [];
  partition([...cells], 0, out);
  return out.sort((a, b) => a.top - b.top || a.left - b.left);
}

function partition(cells: CellAddress[], depth: number, out: CellRange[]): void {
  if (cells.length === 0) return;
  if (depth < MAX_SPLIT_DEPTH) {
    const byRow = splitOnGaps(cells, (c) => c.row);
    if (byRow.length > 1) {
      for (const group of byRow) partition(group, depth + 1, out);
      return;
    }
    const byCol = splitOnGaps(cells, (c) => c.col);
    if (byCol.length > 1) {
      for (const group of byCol) partition(group, depth + 1, out);
      return;
    }
  }
  out.push(boundsOf(cells));
}

/** Group cells wherever their row (or column) numbers skip at least one line. */
function splitOnGaps(cells: CellAddress[], key: (c: CellAddress) => number): CellAddress[][] {
  const lines = [...new Set(cells.map(key))].sort((a, b) => a - b);
  const groupOf = new Map<number, number>();
  let group = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? 0;
    const previous = i > 0 ? (lines[i - 1] ?? line) : line;
    if (i > 0 && line - previous > 1) group += 1;
    groupOf.set(line, group);
  }
  const groups: CellAddress[][] = Array.from({ length: group + 1 }, () => []);
  for (const cell of cells) groups[groupOf.get(key(cell)) ?? 0]?.push(cell);
  return groups.filter((g) => g.length > 0);
}

function boundsOf(cells: readonly CellAddress[]): CellRange {
  let top = Number.MAX_SAFE_INTEGER;
  let left = Number.MAX_SAFE_INTEGER;
  let bottom = 0;
  let right = 0;
  for (const cell of cells) {
    if (cell.row < top) top = cell.row;
    if (cell.row > bottom) bottom = cell.row;
    if (cell.col < left) left = cell.col;
    if (cell.col > right) right = cell.col;
  }
  return { bottom, left, right, top };
}

/**
 * Does this region open with a header row?
 *
 * The signal is TYPE CONTRAST, which every discipline and every language shares: a row of words
 * sitting above rows that contain numbers, dates or flags is naming those columns. A row of
 * numbers above numbers is data, whatever it says. Where a block is all words, a fully populated
 * first line above at least two more lines is still taken as a header — that is what a roster or a
 * checklist looks like — and anything less is left headerless rather than guessed at.
 *
 * Returns 0 or 1: multi-row headers are only trusted when the workbook DECLARES them
 * (`headerRowCount` on a real table), never inferred here.
 * PURE.
 */
export function plausibleHeaderRows(
  region: CellRange,
  cells: readonly { row: number; col: number; kind: CellValueKind }[],
): number {
  let labels = 0;
  let bodyHasValue = false;
  const bodyRows = new Set<number>();
  // The CELLS are walked, never the rectangle. A sparse region's bounding box can be millions of
  // positions wide with a dozen cells in it, and scanning the box would hang on a real file.
  for (const cell of cells) {
    if (cell.row < region.top || cell.row > region.bottom) continue;
    if (cell.col < region.left || cell.col > region.right) continue;
    if (cell.row === region.top) {
      if (cell.kind !== "text") return 0; // a number in the top row: this is data, not a header
      labels += 1;
      continue;
    }
    bodyRows.add(cell.row);
    if (cell.kind !== "text") bodyHasValue = true;
  }
  if (labels === 0) return 0;
  if (bodyHasValue) return 1;
  return labels === region.right - region.left + 1 && bodyRows.size >= 2 ? 1 : 0;
}
