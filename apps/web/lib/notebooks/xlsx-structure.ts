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
 *   * A STORED NUMBER IS NOT WHAT THE AUTHOR SAW. 2026-03-15 is `<v>46096</v>`,
 *     7.5% is `0.075`, and $1,234.50 is `1234.5`; only the number format says
 *     otherwise. Four classes are rendered — date, percentage, currency, grouped
 *     decimal — and everything else keeps its stored value and is refused BY
 *     NAME with its code preserved. See `classifyFormat`.
 *   * A CURRENCY SYMBOL MAY BE QUOTED *OR* ESCAPED. openpyxl writes `"$"`,
 *     LibreOffice writes `\$`. Deleting escapes before looking for a symbol
 *     turned `$5,000.00` into `5,000.00` — caught by a fixture, not by reading.
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
  /** The stored value, whenever `text` is a rendering of it rather than a copy. */
  raw?: string;
  /**
   * The source's own number-format code, when it has one.
   *
   * Kept for every formatted cell, not only the ones we could not render: it is
   * the evidence for why `text` differs from `raw`, it lets a consumer re-render
   * differently, and for an `unsupported` format it is the only record that we
   * declined to render rather than that the cell was plain.
   */
  format?: string;
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
 * ── NUMBER FORMATS: WHAT THE AUTHOR SAW ────────────────────────────────────
 *
 * 🔴 `0.075` AND `7.5%` ARE THE SAME NUMBER AND NOT THE SAME SOURCE (owner,
 * 2026-08-12). Nemesis may quote a cell, teach from it, or ask a learner what it
 * says — and every one of those is wrong if we present a fraction where the
 * spreadsheet showed a percentage. This is the same class of defect as calling
 * grid (0,0) "A1": both storage sides can agree on `0.075` perfectly and both be
 * wrong about the document.
 *
 * An earlier version of this file rendered only dates and called the rest
 * "decoration". It was not decoration; `SheetCell.text` is documented as the
 * DISPLAYED value, and for every other numeric cell it held the stored one.
 *
 * 🔴 AND THIS IS NOT AN EXCEL FORMATTING ENGINE, DELIBERATELY. Four classes are
 * rendered — date, percentage, currency, grouped/fixed decimal — because those
 * are what real coursework holds and each one changes what the value MEANS to a
 * reader. Anything else keeps its stored value and is recorded as
 * `unsupported-number-format` with its code preserved, so a consumer can see
 * that we did not render rather than believing we did.
 */

/** The built-in format codes worth naming. Ids above 163 are always custom. */
const BUILTIN_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
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
  37: "#,##0_);(#,##0)",
  38: "#,##0_);[Red](#,##0)",
  39: "#,##0.00_);(#,##0.00)",
  40: "#,##0.00_);[Red](#,##0.00)",
  44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)',
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

export type NumberFormat =
  /** No format, or one that only affects appearance we do not model. */
  | { kind: "general"; code: string }
  | { kind: "date"; code: string }
  | { kind: "percent"; code: string; decimals: number }
  | { kind: "currency"; code: string; symbol: string; decimals: number; grouping: boolean }
  | { kind: "number"; code: string; decimals: number; grouping: boolean }
  /** Recognised as SOMETHING, and deliberately not rendered. Code preserved. */
  | { kind: "unsupported"; code: string };

/**
 * A format code has two halves, and conflating them loses currency symbols.
 *
 * 🔴 AN ESCAPE IS A LITERAL, NOT NOISE. LibreOffice writes `$` as `\$` where
 * openpyxl writes `"$"`. An earlier version DELETED backslash escapes before
 * looking for a symbol, so `\$#,##0.00` classified as a plain grouped number and
 * `$5,000.00` rendered as `5,000.00` — the currency identity silently dropped
 * from a column about money. Found by a fixture, not by reading the code.
 *
 * `placeholders` is what controls the number's SHAPE (digits, separators, `%`,
 * date letters); `literals` is the text the format prints verbatim, which is
 * where the symbol lives. Locale-tagged currency — `[$€-407]` — is pulled out
 * before the bracket groups are stripped, for the same reason.
 */
function formatParts(code: string): { placeholders: string; literals: string } {
  const section = code.split(";")[0] ?? code;
  const literals: string[] = [];
  // `[$€-407]` and `[$£]`: the symbol is between `[$` and the locale's `-`.
  for (const m of section.matchAll(/\[\$([^\]\-]*)-?[^\]]*\]/g)) literals.push(m[1] ?? "");
  for (const m of section.matchAll(/"([^"]*)"/g)) literals.push(m[1] ?? "");
  for (const m of section.matchAll(/\\(.)/g)) literals.push(m[1] ?? "");
  const placeholders = section
    .replace(/\[[^\]]*\]/g, "")   // colours and locale tags
    .replace(/"[^"]*"/g, "")      // quoted literals
    .replace(/\\./g, "")          // escaped literals
    .replace(/_./g, "")           // padding
    .replace(/\*./g, "")          // fill
    .trim();
  return { literals: literals.join(""), placeholders };
}

const CURRENCY_SIGNS = /[$£€¥₹₽¢₩]/;

/**
 * What a format code means, as far as this reader models it.
 *
 * Order matters: a date is checked first because its letters would otherwise be
 * read as digits-and-text; percent next because `%` is unambiguous; currency
 * next; then a plain grouped/fixed decimal. Anything left is refused by name.
 */
export function classifyFormat(rawCode: string): NumberFormat {
  const code = rawCode.trim();
  if (!code || code === "General") return { code: code || "General", kind: "general" };
  // Text format: the cell's value is shown verbatim.
  if (code === "@") return { code, kind: "general" };

  const { literals, placeholders } = formatParts(code);
  // Date letters come only from the PLACEHOLDERS, so `0" days"` and `0\d` are
  // numbers with a literal beside them rather than day patterns.
  if (/[ymdhs]/i.test(placeholders)) return { code, kind: "date" };

  const decimalsOf = (text: string): number => {
    const m = /\.(0+)/.exec(text);
    return m ? m[1]!.length : 0;
  };

  if (placeholders.includes("%")) return { code, decimals: decimalsOf(placeholders), kind: "percent" };

  // The symbol is a LITERAL, whether the file quoted it, escaped it, or tagged
  // it with a locale. Falling back to the placeholders catches a bare `$`.
  const symbol = CURRENCY_SIGNS.exec(literals)?.[0] ?? CURRENCY_SIGNS.exec(placeholders)?.[0];
  const grouping = placeholders.includes(",");

  // 🔴 LITERAL TEXT WE WOULD NOT PRINT MAKES THE WHOLE FORMAT UNSUPPORTED.
  // `0" widgets"` shows `12 widgets`; rendering `12` drops a word the author
  // wrote, which is the same defect as dropping a currency symbol, only smaller.
  // Rather than grow a literal-placement engine, the format is refused by name
  // and its code travels with the cell.
  const leftover = literals.replace(new RegExp(CURRENCY_SIGNS.source, "g"), "").trim();

  if (symbol) {
    if (leftover) return { code, kind: "unsupported" };
    return { code, decimals: decimalsOf(placeholders), grouping, kind: "currency", symbol };
  }

  // A plain number pattern: digits, placeholders, separators and nothing else.
  if (/^[#0,.\s]+$/.test(placeholders) && /[#0]/.test(placeholders)) {
    if (leftover) return { code, kind: "unsupported" };
    return { code, decimals: decimalsOf(placeholders), grouping, kind: "number" };
  }
  // 🔴 REFUSED BY NAME RATHER THAN APPROXIMATED. Scientific notation, fractions,
  // conditional and locale-tagged formats all land here. Guessing would put a
  // number on screen the author never wrote.
  return { code, kind: "unsupported" };
}

/** Style index → its format code, resolved through custom and built-in tables. */
function styleFormats(stylesXml: string): string[] {
  const custom = new Map<number, string>();
  for (const fmt of tagsOf(stylesXml, "numFmt")) {
    const id = Number(attrOf(fmt.attrs, "numFmtId"));
    const code = unescapeXml(attrOf(fmt.attrs, "formatCode") ?? "");
    if (Number.isFinite(id)) custom.set(id, code);
  }
  const cellXfs = tagsOf(stylesXml, "cellXfs")[0];
  if (!cellXfs) return [];
  return tagsOf(cellXfs.inner, "xf").map((xf) => {
    const id = Number(attrOf(xf.attrs, "numFmtId") ?? "0");
    return custom.get(id) ?? BUILTIN_FORMATS[id] ?? "";
  });
}

/** A number with a fixed number of decimals and optional thousands grouping. */
function fixed(value: number, decimals: number, grouping: boolean): string {
  const text = Math.abs(value).toFixed(decimals);
  const [whole = "", fraction] = text.split(".");
  const grouped = grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  const sign = value < 0 ? "-" : "";
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/**
 * What the spreadsheet shows for this stored value, or null to keep it as-is.
 *
 * Null is a real answer and the safe one: it means this reader did not model the
 * format, so the stored value stands and the code travels with the cell.
 */
export function renderNumber(stored: string, format: NumberFormat): string | null {
  const value = Number(stored);
  if (!Number.isFinite(value)) return null;
  switch (format.kind) {
    case "date":
      return serialToIso(value);
    case "percent":
      // 🔴 THE MULTIPLICATION IS THE POINT. 0.075 is SHOWN as 7.5%, and a reader
      // told "0.075" has been told something the document does not say.
      return `${fixed(value * 100, format.decimals, false)}%`;
    case "currency":
      // The symbol is part of the value's identity — "1,234.50" and "$1,234.50"
      // are not the same fact in a document about money.
      return `${value < 0 ? "-" : ""}${format.symbol}${fixed(Math.abs(value), format.decimals, format.grouping)}`;
    case "number":
      // Only when it actually changes the text; `0` on an integer is a no-op.
      return format.decimals > 0 || format.grouping ? fixed(value, format.decimals, format.grouping) : null;
    default:
      return null;
  }
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
  formats: string[],
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
  interface Absolute { row: number; column: number; text: string; formula?: string; raw?: string; format?: string }
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
    let formatCode: string | undefined;
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
        // 🔴 A NUMBER IS NOT ITS DISPLAY. `0.075` shown as `7.5%` is one value
        // and two facts, and `text` is contracted to be the one the author saw.
        const format = classifyFormat(formats[styleIndex] ?? "");
        if (format.kind !== "general") formatCode = format.code;
        const shown = renderNumber(value, format);
        if (shown !== null && shown !== value) {
          text = shown;
          raw = value;
        } else {
          text = value;
          // Recorded so "we could not render this" is distinguishable from
          // "this cell was plain" — the code above travels with the cell.
          if (format.kind === "unsupported") bump(unsupported, "unsupported-number-format");
        }
      }
    }
    if (!text && !formula) continue;   // a styled but empty cell carries nothing
    absolute.push({
      column: at.column,
      row: at.row,
      text,
      ...(formula ? { formula } : {}),
      ...(raw ? { raw } : {}),
      ...(formatCode ? { format: formatCode } : {}),
    });
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
    ...(c.format ? { format: c.format } : {}),
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
  const formats = stylesPart ? styleFormats(strFromU8(stylesPart)) : [];
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

  const sheets = sheetOrder(zip).map((meta) => readSheet(zip, meta, strings, formats, unsupported));
  return {
    sheets,
    title: title || null,
    unsupported: [...unsupported].map(([kind, count]) => ({ count, kind })),
  };
}
