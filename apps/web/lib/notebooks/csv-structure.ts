/**
 * Reading a delimited text file into a grid, deterministically.
 *
 * 🔴 CSV IS ONE GRID, NOT PROSE (owner, 2026-08-12). A spreadsheet exported to
 * CSV is still a spreadsheet: the value in row 4 column 2 means what it means
 * BECAUSE of where it sits. Turning it into lines of text loses the only thing
 * that made it data, and a citation cannot be rebuilt from a sentence.
 *
 * 🔴 AND IT HAS NO SECOND TRUTH. A `.xlsx` cell carries a stored number, a
 * display string and a format code, and the XLSX reader keeps all three because
 * the file does. A CSV has already collapsed them: our own LibreOffice fixture
 * exports the same sheet's percentage as `77.5%` and its currency as bare
 * `5000`, and NOTHING in the file says which of those you are looking at. So
 * there is no `raw` and no `format` here, and adding them "for parity with
 * XLSX" would mean inventing a second truth out of one string. The text IS the
 * cell.
 *
 * PURE. No network, no filesystem, no model calls — the owner's constraint is
 * that this lane is deterministic, and nothing here consults anything.
 */

/**
 * One cell, at its own position in the grid.
 *
 * 🔴 A MISSING CELL AND AN EMPTY ONE ARE DIFFERENT FACTS, and the grid is the
 * only place that distinction can live. `B2,Burette` has TWO fields — there is
 * no third cell. `Edsger,,70` has THREE — the middle one is present and empty.
 * Both render as a blank in any rectangular projection, so `cells` is the truth
 * and `rows` is the projection, exactly as `DocTable` already says.
 */
export interface CsvCell {
  row: number;
  column: number;
  /** Verbatim. Quotes removed, doubled quotes collapsed, NOTHING trimmed —
   *  ` 007 ` is what the author wrote and is not ours to tidy. */
  text: string;
}

export type DelimiterEvidence =
  /** The file is a comma-separated file and reads as one. The default, and the
   *  answer for the overwhelming majority of real files. */
  | "comma"
  /** Comma demonstrably FAILED and exactly one other candidate worked. Named so
   *  that a reader can see a decision was made, and which. */
  | "comma-failed-one-alternative"
  /** No candidate produced a consistent multi-column grid, so the format's own
   *  default was used. Covers BOTH a genuinely single-column file and a ragged
   *  comma file — `ragged.csv` has records of 3, 3, 2, 5 and 1 fields, which is
   *  a real comma CSV that no consistency test can confirm. Splitting on comma
   *  is still right there; what is absent is corroboration, not the delimiter. */
  | "comma-default"
  /** 🔴 REFUSED. Comma failed and MORE THAN ONE alternative would have produced
   *  a consistent grid, so there is no evidence — only a choice. The rows are
   *  kept whole rather than split on a guess. */
  | "ambiguous-not-split";

export interface CsvGrid {
  cells: CsvCell[];
  /** The widest record, not the number of cells in any one of them. */
  columns: number;
  /** The number of records, INCLUDING blank ones in the middle. */
  rows: number;
  /** The delimiter actually used, preserved because the owner asked for it and
   *  because a reader should be able to see what decision was made. */
  delimiter: string;
  delimiterEvidence: DelimiterEvidence;
  /** `utf-8-bom` means a byte-order mark was found AND REMOVED. Left in place it
   *  becomes an invisible first character of the first cell, so `Student` never
   *  again equals `Student`. */
  encoding: "utf-8" | "utf-8-bom";
  /** Things seen and not turned into structure. Never silently omitted. */
  unsupported: { kind: string; count: number }[];
}

/** Candidates, in priority order. Comma first is not a tiebreak — see `chooseDelimiter`. */
const CANDIDATES = [",", ";", "\t", "|"] as const;

/**
 * Split one delimited document into records of fields.
 *
 * RFC 4180 with the leniency real files require: a record ends at CRLF, LF or a
 * lone CR unless we are inside quotes; `""` inside quotes is one quote; a quote
 * appearing mid-field is literal rather than an error, because refusing a file
 * over one stray quote helps nobody.
 *
 * 🔴 A TRAILING NEWLINE TERMINATES THE LAST RECORD — it does not begin a new
 * empty one. Getting this wrong adds a phantom final row to every well-formed
 * file in existence, and shifts nothing, so it is invisible until someone cites
 * the last line.
 */
function splitRecords(text: string, delimiter: string | null): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let dirty = false; // has this record seen anything at all, including a delimiter?

  const endField = () => {
    record.push(field);
    field = "";
    dirty = true;
  };
  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = "";
    dirty = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (quoted) {
      if (ch !== '"') {
        field += ch;
        continue;
      }
      // A doubled quote is one literal quote; a single one closes the field.
      if (text[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      quoted = false;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
      dirty = true;
      continue;
    }
    // 🔴 `null` MEANS NEVER SPLIT, and it is a real case — see the ambiguity
    // branch in `readCsv`. An earlier draft passed a space as a stand-in "no
    // delimiter", which silently split every ambiguous file on its spaces.
    if (delimiter !== null && ch === delimiter) {
      endField();
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      // CRLF is one break, not two.
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
      continue;
    }
    field += ch;
  }

  // Anything still buffered is a final record with no terminator. A file that
  // ENDS with a newline has already flushed, and `dirty` keeps that from
  // becoming a phantom empty row.
  if (field !== "" || dirty || quoted) endRecord();
  return records;
}

/** Does this candidate produce a grid the file itself agrees with? */
function isConsistent(records: string[][]): boolean {
  // Blank records carry no evidence about width — a blank line between data rows
  // is a row, but it says nothing about how many columns the file has.
  const widths = records.filter((r) => !(r.length === 1 && r[0] === "")).map((r) => r.length);
  if (widths.length === 0) return false;
  return widths.every((w) => w === widths[0]) && widths[0]! > 1;
}

/**
 * Which character separates the fields.
 *
 * 🔴 THIS IS A RULE WITH A REFUSAL, NOT A SNIFFER (owner: no delimiter guessing
 * without calibration). Two fixtures calibrate it, and they are the whole reason
 * it is shaped this way:
 *
 *   `ambiguous-comma-wins`  — comma AND semicolon both give a consistent
 *     2-column grid. Comma wins BY STATED PRIORITY. A "most consistent
 *     candidate" rule would coin-flip here, and every ordinary comma file whose
 *     rows happen to contain one semicolon would be at risk.
 *
 *   `ambiguous-no-comma`    — comma is inconsistent and TWO alternatives are
 *     each consistent and contradict each other. There is no evidence, only a
 *     choice, so we decline to split. The rows survive verbatim; what is refused
 *     is the claim to know where the columns are.
 *
 * So detection only ever fires when comma has DEMONSTRABLY FAILED, and only when
 * the answer is unique.
 */
export function chooseDelimiter(text: string): { delimiter: string; evidence: DelimiterEvidence } {
  if (isConsistent(splitRecords(text, ","))) return { delimiter: ",", evidence: "comma" };

  const working = CANDIDATES.filter((c) => c !== ",").filter((c) => isConsistent(splitRecords(text, c)));
  if (working.length === 1) {
    return { delimiter: working[0]!, evidence: "comma-failed-one-alternative" };
  }
  if (working.length > 1) {
    // Comma, because SOMETHING has to be passed to the splitter — but the file
    // is not actually split into columns by it, and the evidence says so.
    return { delimiter: ",", evidence: "ambiguous-not-split" };
  }
  return { delimiter: ",", evidence: "comma-default" };
}

/** UTF-8 text from bytes, with a byte-order mark removed and recorded. */
function decode(bytes: Uint8Array): { text: string; encoding: CsvGrid["encoding"] } {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder("utf-8").decode(hasBom ? bytes.subarray(3) : bytes);
  return { encoding: hasBom ? "utf-8-bom" : "utf-8", text };
}

export function readCsv(bytes: Uint8Array): CsvGrid {
  const { encoding, text } = decode(bytes);
  const unsupported: { kind: string; count: number }[] = [];
  const bump = (kind: string) => {
    const found = unsupported.find((u) => u.kind === kind);
    if (found) found.count += 1;
    else unsupported.push({ count: 1, kind });
  };

  if (text === "") {
    return { cells: [], columns: 0, delimiter: ",", delimiterEvidence: "comma-default", encoding, rows: 0, unsupported };
  }

  const { delimiter, evidence } = chooseDelimiter(text);
  if (evidence === "ambiguous-not-split") bump("ambiguous-delimiter");

  // 🔴 ON AMBIGUITY, DO NOT SPLIT. Splitting on a character we cannot justify
  // would invent column boundaries that no consumer could tell from real ones.
  // Each record stays whole — one column holding exactly what the line said —
  // which keeps the rows as durable evidence while refusing the claim we cannot
  // make. An earlier draft passed a sentinel CHARACTER here as a stand-in for
  // "no delimiter"; `null` says it outright and cannot collide with content.
  const records = splitRecords(text, evidence === "ambiguous-not-split" ? null : delimiter);

  const cells: CsvCell[] = [];
  let columns = 0;
  for (const [row, record] of records.entries()) {
    // A blank record is a ROW — deleting it would renumber every row beneath it
    // and move every citation with them — but it contributes no cell and no width.
    if (record.length === 1 && record[0] === "") continue;
    columns = Math.max(columns, record.length);
    for (const [column, value] of record.entries()) cells.push({ column, row, text: value });
  }

  return { cells, columns, delimiter, delimiterEvidence: evidence, encoding, rows: records.length, unsupported };
}
