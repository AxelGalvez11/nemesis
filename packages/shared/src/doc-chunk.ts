/**
 * The chunker — the DISPOSABLE retrieval representation of a parse.
 *
 * A `ParsedDocument` is the canonical thing; chunks are a lossy projection of it
 * built for one job: embed, retrieve, and CITE. Nothing may come to treat a chunk
 * as the text of a document — re-chunking under a new `CHUNKER_VERSION` has to be
 * a routine, throwaway operation.
 *
 * 🔴 A CHUNK NEVER CROSSES A UNIT BOUNDARY. Its `locator` is a citation. Text
 * that spans page 6 and page 7 cannot be cited as either without lying about
 * where half of it came from, so the loop is written per-unit and the violation
 * is not representable — there is no code path that appends across units.
 *
 * 🔴 EVERY LOCATOR HERE IS COPIED, NEVER REBUILT. Locators are spread from the
 * parse (`{ ...unit.locator, headingPath }`), so a `printedLabel`, a `range` or a
 * sheet `label` the parser measured survives without this file being edited.
 * The one field this file adds is `headingPath`, and it is assembled only from
 * heading blocks the parser actually emitted.
 *
 * It is field-agnostic for the same reason `doc-model.ts` is: the shapes it reads
 * are structural — units, headings, list runs, tables, sentence punctuation —
 * and none of them ask what the document is FOR. A lease, a lab manual and a
 * lecture deck chunk identically.
 *
 * PURE: no I/O, no parser dependencies, no platform APIs, no clock, no randomness.
 * The same `ParsedDocument` must always produce byte-identical chunks, because the
 * database's UNIQUE (parsed_document_id, chunker_version, embedding_version,
 * chunk_index) turns any wobble into churn — rows deleted and re-embedded for a
 * document nobody touched.
 */

import type { DocBlock, DocCell, DocTable, DocUnit, Locator, ParsedDocument } from "./doc-model.ts";

/**
 * The chunker build. A new value means a NEW chunk set for every parse, so it
 * moves only when the OUTPUT would differ: a change to the defaults below, to the
 * token estimate, to sentence splitting, or to how tables are rendered.
 */
export const CHUNKER_VERSION = "chunk-1";

/** One retrievable passage, and the measured place it came from. */
export interface DocChunk {
  /** 0-based and DOCUMENT-GLOBAL, not per-unit. The unique index it feeds has no
   *  unit column, so per-unit numbering would collide on the second page. */
  chunkIndex: number;
  text: string;
  locator: Locator;
  /** The parse blocks this text was built from, in reading order. Empty only for
   *  a table no block referenced — see `chunkDocument`. */
  blockIds: string[];
  tokensEstimate: number;
}

/**
 * Knobs, for tests and for callers with an unusual embedder.
 *
 * 🔴 CHANGING A DEFAULT IS A VERSION BUMP. The defaults are baked into every
 * stored chunk set; editing one without moving `CHUNKER_VERSION` silently
 * re-chunks documents whose rows still claim the old version. A test asserts the
 * production defaults so that edit goes red instead of quiet.
 */
export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

/** A passage big enough to answer a question and small enough that a dozen of
 *  them still fit in a prompt beside the conversation. */
export const DEFAULT_TARGET_TOKENS = 400;

/**
 * How much of the previous chunk each chunk repeats — 60 tokens, ~15%.
 *
 * WHY OVERLAP AT ALL: a boundary lands mid-argument sooner or later. Without
 * overlap, the sentence that names the thing and the sentence that explains it
 * can end up in different chunks and neither one answers the question. Repeating
 * the tail means the seam is inside at least one chunk that has both halves.
 *
 * WHY ONLY 15%: every repeated token is stored, embedded and paid for twice, and
 * two chunks that share most of their text compete for the same result slots —
 * the retriever returns the same passage twice and the answer gets narrower, not
 * broader. 15% is enough to carry a sentence or two across the seam, which is the
 * failure it exists for, without the index becoming mostly duplicates.
 *
 * The overlap is clamped to half the target regardless: an overlap that could
 * fill the budget on its own leaves no room for new content, and a chunker that
 * makes no progress does not terminate.
 */
export const DEFAULT_OVERLAP_TOKENS = 60;

// ── Token estimation ─────────────────────────────────────────────────────────
//
// 🔴 THE BUDGET IS IN TOKENS, AND A CHARACTER BUDGET IS NOT A TOKEN BUDGET.
// apps/web/lib/workload-cost.ts uses CHARS_PER_TOKEN = 4 and says plainly that it
// is an ENGLISH average. Chinese, Japanese and Korean run far denser — roughly 1
// to 1.7 characters per token — so a 1,600-character budget is ~400 tokens of
// English and ~1,300 tokens of Chinese. The same code would hand a Chinese
// document three to four times the intended content, overflow the window it was
// sized for, and fail in a way that looks like "the model got confused".
//
// So the estimate splits the text by SCRIPT, by codepoint, and prices the two
// runs differently. No tokenizer dependency: this file is shared with Deno edge
// functions and the phone, and a tokenizer is a large native-ish dependency to
// carry for an estimate that is approximate either way.

/**
 * The English average, ~4 characters per token across the DeepSeek and GLM
 * tokenizers. Provenance: apps/web/lib/workload-cost.ts uses the same 4 for the
 * cost model and says plainly that it is an English average.
 *
 * A citation, not a MIRROR — there is deliberately no drift guard tying the two
 * together. `packages/shared` has no dependency on `apps/web` (the edge
 * functions that import this file could not resolve one), and the two numbers
 * answer different questions: that one prices a bill, this one sizes a chunk.
 * They may diverge without either being wrong.
 */
export const CHARS_PER_TOKEN_LATIN = 4;

/**
 * One token per CJK codepoint — the DENSE end of the measured 1–1.7 range.
 *
 * The asymmetry is deliberate. Overestimating tokens makes a chunk a little
 * smaller than it needed to be, which costs nothing anyone notices.
 * Underestimating overflows the context the chunk was sized for, which drops
 * content silently. Only one of those is recoverable.
 */
export const CHARS_PER_TOKEN_CJK = 1;

/**
 * Codepoint ranges priced at the dense rate.
 *
 * Ranges, not a language guess: this is a property of how tokenizers encode
 * these scripts, and it holds whatever the document is about. Han covers Chinese
 * and Japanese kanji; kana and Hangul are here because Japanese and Korean run
 * dense for the same reason, and pricing Chinese alone would be exactly the
 * one-language special case this layer is not allowed to have.
 *
 * Honest gap: Thai, Devanagari, Arabic and Cyrillic also run denser than the
 * English average — less dramatically — and are priced as Latin here. That
 * understates their tokens somewhat. Fixing it properly needs measurement
 * against the tokenizers we actually bill on, not more guessed constants.
 */
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x2e80, 0x2eff], // CJK radicals supplement
  [0x3000, 0x303f], // CJK symbols and punctuation
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x3100, 0x312f], // Bopomofo
  [0x3130, 0x318f], // Hangul compatibility Jamo
  [0x31f0, 0x31ff], // Katakana phonetic extensions
  [0x3400, 0x4dbf], // CJK unified ideographs extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa960, 0xa97f], // Hangul Jamo extended-A
  [0xac00, 0xd7af], // Hangul syllables
  [0xd7b0, 0xd7ff], // Hangul Jamo extended-B
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xffef], // Halfwidth and fullwidth forms
  [0x20000, 0x2a6df], // Extension B
  [0x2a700, 0x2ebef], // Extensions C–F
  [0x2f800, 0x2fa1f], // Compatibility supplement
];

function isDenseScript(codePoint: number): boolean {
  for (const range of CJK_RANGES) {
    if (codePoint >= range[0] && codePoint <= range[1]) return true;
  }
  return false;
}

/**
 * Unrounded token estimate. Kept fractional for the internal arithmetic so that
 * summing thirty sentences does not accumulate thirty roundings — a 400-token
 * budget would drift by tens of tokens purely from `Math.ceil`.
 *
 * 🔴 ITERATES CODEPOINTS, NOT `.length`. Extension-B ideographs are surrogate
 * pairs; counting UTF-16 units would score them twice as Latin-ish characters
 * and UNDERSTATE their tokens — the precise failure this estimate exists to
 * prevent.
 */
function rawTokens(text: string): number {
  let dense = 0;
  let rest = 0;
  for (const ch of text) {
    if (isDenseScript(ch.codePointAt(0) ?? 0)) dense++;
    else rest++;
  }
  return dense / CHARS_PER_TOKEN_CJK + rest / CHARS_PER_TOKEN_LATIN;
}

/** Script-aware token estimate for a string. Approximate by construction — see
 *  the note on CHARS_PER_TOKEN_LATIN — but never off by a factor of three. */
export function estimateTokens(text: string): number {
  return Math.ceil(rawTokens(text));
}

// ── Sentence splitting ───────────────────────────────────────────────────────

/**
 * Sentence enders, by punctuation SHAPE rather than by language.
 *
 * The full-width and Devanagari marks are here because a document in those
 * scripts otherwise has no boundaries at all and every paragraph becomes one
 * unsplittable piece. Nothing here detects a language or looks at vocabulary.
 */
const SENTENCE_ENDERS = new Set([".", "!", "?", "…"]);

/** Enders that stand alone: these scripts do not put a space after them, so
 *  requiring trailing whitespace (as the Latin rule does) would never fire. */
const STANDALONE_ENDERS = new Set(["。", "！", "？", "．", "｡", "‥", "।", "॥", "۔", "؟"]);

/** Punctuation that belongs to the sentence it follows — a closing quote or
 *  bracket after the full stop is part of the same sentence, not the next one. */
const SENTENCE_CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "}", "）", "」", "』", "》", "〉"]);

/**
 * Split into sentences WITHOUT losing a character: concatenating the result
 * reproduces the input exactly. That matters because chunk text is quoted back
 * to a person under a citation, and a chunker that quietly normalises whitespace
 * makes the quote differ from the document.
 */
function splitSentences(text: string): string[] {
  const chars = Array.from(text); // codepoints, so a surrogate pair is one step
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i] ?? "";
    const standalone = STANDALONE_ENDERS.has(ch);
    if (!standalone && !SENTENCE_ENDERS.has(ch)) {
      i++;
      continue;
    }
    // A Latin stop only ends a sentence when whitespace or the text itself
    // follows it, which keeps "3.5" and "no.7" in one piece. It does NOT save
    // "e.g. " — a space follows, so that splits early. Harmless: the overlap
    // carries the seam, and the alternative is an abbreviation list, which is
    // per-language and would not survive contact with a German or French
    // document.
    const next = chars[i + 1];
    if (!standalone && next !== undefined && !/\s/.test(next)) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < chars.length) {
      const tail = chars[end] ?? "";
      if (!SENTENCE_ENDERS.has(tail) && !STANDALONE_ENDERS.has(tail) && !SENTENCE_CLOSERS.has(tail)) break;
      end++;
    }
    out.push(chars.slice(start, end).join(""));
    start = end;
    i = end;
  }
  if (start < chars.length) out.push(chars.slice(start).join(""));
  return out;
}

/**
 * Cut a run of text that has no usable boundary — a wall of prose with no
 * punctuation, a base64 blob, a minified line — into target-sized pieces.
 *
 * Measured by the same script-aware estimate, so the Chinese case gets the same
 * number of tokens per piece rather than the same number of characters. Always
 * consumes at least one codepoint, which is what makes the caller terminate.
 */
function hardSplit(text: string, targetTokens: number): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let buf: string[] = [];
  let tokens = 0;
  for (const ch of chars) {
    const cost = rawTokens(ch);
    if (buf.length > 0 && tokens + cost > targetTokens) {
      out.push(buf.join(""));
      buf = [];
      tokens = 0;
    }
    buf.push(ch);
    tokens += cost;
  }
  if (buf.length > 0) out.push(buf.join(""));
  return out.length > 0 ? out : [text];
}

// ── Internal shapes ──────────────────────────────────────────────────────────

/** The atom the packer moves around: a sentence, or a fragment of an unbreakable
 *  one. `sepBefore` is the text that rejoins it to whatever precedes it, so a
 *  chunk is assembled by concatenation rather than by re-guessing layout. */
interface Piece {
  text: string;
  blockIds: string[];
  tokens: number;
  sepBefore: string;
}

type Segment =
  | { type: "text"; locator: Locator; pieces: Piece[] }
  | { type: "table"; locator: Locator; table: DocTable; blockIds: string[] };

// ── Locator assembly ─────────────────────────────────────────────────────────

/** Spread, never field-by-field — see the file header. */
function withHeadingPath(base: Locator, path: readonly string[]): Locator {
  return path.length > 0 ? { ...base, headingPath: [...path] } : { ...base };
}

// ── Unit → segments ──────────────────────────────────────────────────────────

function ord(block: DocBlock): number {
  return Number.isFinite(block.ordinal) ? block.ordinal : 0;
}

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/** Separator between two adjacent blocks. A list reads as a list; everything
 *  else gets a blank line, which is what a paragraph break looks like in the
 *  text a retriever and a person both read. */
function separatorBetween(previous: DocBlock, next: DocBlock): string {
  return previous.kind === "listItem" && next.kind === "listItem" ? "\n" : "\n\n";
}

function piecesForBlock(block: DocBlock, sepBefore: string, targetTokens: number): Piece[] {
  const out: Piece[] = [];
  let first = true;
  for (const sentence of splitSentences(block.text)) {
    if (sentence.length === 0) continue;
    const parts = rawTokens(sentence) > targetTokens ? hardSplit(sentence, targetTokens) : [sentence];
    for (const part of parts) {
      // A piece of pure whitespace — a block's trailing newline — would be a
      // piece the packer has to consume and `push` then discards, so drop it
      // here. Nothing is lost: a chunk is trimmed at its edges anyway.
      if (isBlank(part)) continue;
      out.push({ blockIds: [block.id], sepBefore: first ? sepBefore : "", text: part, tokens: rawTokens(part) });
      first = false;
    }
  }
  return out;
}

/**
 * One unit's blocks in reading order, turned into the segments a chunk is built
 * from. Everything about heading trails and table joins happens here; the packer
 * below never looks at a `DocBlock` again.
 */
function segmentsForUnit(
  unit: DocUnit,
  tablesById: ReadonlyMap<string, DocTable>,
  referenced: Set<string>,
  targetTokens: number,
): Segment[] {
  const base = unit.locator.headingPath ?? [];
  // Headings found INSIDE this unit, stacked by depth. The unit's own trail sits
  // underneath and is never truncated by them — it was measured by the parser.
  const stack: string[] = [];
  const segments: Segment[] = [];

  let pieces: Piece[] = [];
  let path: string[] = [...base];
  let hasBody = false; // any non-heading content in the open segment
  let lastHeadingLevel = 0;
  let previous: DocBlock | undefined;

  const flush = () => {
    if (pieces.length > 0) segments.push({ locator: withHeadingPath(unit.locator, path), pieces, type: "text" });
    pieces = [];
    hasBody = false;
    previous = undefined;
  };

  // Stable sort on the declared reading order. Stable matters: a parser that
  // leaves every ordinal at 0 keeps its array order instead of being scrambled
  // into some other deterministic-but-wrong order.
  const blocks = [...unit.blocks].sort((a, b) => ord(a) - ord(b));

  for (const block of blocks) {
    if (block.kind === "table") {
      const table = block.tableId === undefined ? undefined : tablesById.get(block.tableId);
      if (table) {
        // 🔴 EMITTED AT ITS FIRST REFERENCE, ONCE. A table that runs across pages
        // 6 to 8 is ONE `DocTable` — the model gives it a single locator — but a
        // parser may reasonably emit a `table` block on each page it appears on.
        // Chunking it per block would put the same forty rows in the index three
        // times under three different locators, where nothing downstream could
        // even tell they were duplicates.
        if (referenced.has(table.id)) continue;
        // A table is its own segment: it is packed by rows with its header
        // repeated, which is a different operation from packing sentences.
        referenced.add(table.id);
        flush();
        const tablePath = table.locator.headingPath?.length ? table.locator.headingPath : path;
        // 🔴 The chunk is located by the UNIT the block sits in. That containment
        // is structural — the block is in this unit's array — while the table's
        // own locator is a field a parser can get wrong, and a chunk emitted
        // while walking page 9 must never claim to be on page 1. The one thing
        // only the table knows is the RANGE it occupies, so that is overlaid.
        const seat: Locator = table.locator.range
          ? { ...unit.locator, range: table.locator.range }
          : { ...unit.locator };
        segments.push({ blockIds: [block.id], locator: withHeadingPath(seat, tablePath), table, type: "table" });
        continue;
      }
      // A `table` block whose id matches nothing in `doc.tables` — a parser bug,
      // or a table detected but not extracted. Its own `text` is often a plain
      // rendering, so fall through and treat it as text rather than drop it.
    }

    if (isBlank(block.text)) continue;

    if (block.kind === "heading") {
      const level = Math.min(Math.max(Math.trunc(block.depth ?? 1), 1), 9);
      const deeper = level > lastHeadingLevel;
      // A heading ends the passage above it, because a chunk's headingPath has to
      // describe ALL of its text. The exception is a bare heading chain —
      // "Chapter 3" immediately followed by "3.1 Scope" — where the first has no
      // body of its own and stays in the trail as an ancestor anyway. Splitting
      // there would mint a three-token chunk that answers nothing.
      if (hasBody || !deeper) flush();
      stack.length = Math.min(level - 1, stack.length);
      stack.push(block.text.trim());
      path = [...base, ...stack];
      lastHeadingLevel = level;
      const sep = previous ? separatorBetween(previous, block) : "";
      pieces = pieces.concat(piecesForBlock(block, sep, targetTokens));
      previous = block;
      continue;
    }

    const sep = previous ? separatorBetween(previous, block) : "";
    const next = piecesForBlock(block, sep, targetTokens);
    if (next.length === 0) continue;
    pieces = pieces.concat(next);
    hasBody = true;
    previous = block;
  }

  flush();
  return segments;
}

// ── Table rendering ──────────────────────────────────────────────────────────

function renderCell(cell: DocCell): string {
  const text = cell.text.replace(/\s+/g, " ").trim();
  // The formula is kept because "why did this number change" is answered by the
  // formula, not the value. A retriever can only find it if it is in the text.
  return cell.formula ? `${text} (${cell.formula})` : text;
}

/**
 * Widest table this will lay out in columns. A `col` far out in the grid — a stray cell at column
 * 9,000 of a spreadsheet — must not mint 9,000 separators per row. Past this the layout is clipped
 * and the cells beyond it are dropped from the RENDERED text only; `DocTable.rows` still holds
 * every cell, because the grid is the parse and this is just its projection for an embedder.
 */
const MAX_TABLE_COLUMNS = 512;

/**
 * How a table's columns are placed.
 *
 * 🔴 ROWS ARE SPARSE, AND JOINING WHAT IS PRESENT SHIFTS VALUES LEFT. All three parsers emit only
 * the cells that exist — an empty cell is absent, and a cell covered by a merge is deliberately
 * dropped (see xlsx-parse.ts). `row.map(render).join(" | ")` then silently slides every later value
 * one column left, so a row missing its second column lines "£4.1m" up under "Region". Nothing
 * downstream can detect that: the row is well-formed, plausible, and wrong, which is the worst
 * shape a mistake can take.
 *
 * 🔴 BUT MEASURED COLUMNS ARE NOT ALWAYS THERE, AND ASSUMING THEY ARE IS A BIGGER BUG THAN THE ONE
 * ABOVE. A parser that leaves every `col` at 0 — or a fixture that does — would have every cell in
 * a row land in the same slot and the whole table collapse to "Drug Dose Route". Misaligned columns
 * are recoverable by a reader; a table rendered as one run-on line is not. So the layout is chosen
 * per TABLE from evidence: if every row's columns strictly increase, they were measured and are
 * used; otherwise the table falls back to sequential positions, which is exactly what this renderer
 * did before measured columns existed.
 *
 * Per table rather than per row on purpose — mixing the two modes inside one table would misalign
 * the header against its body, which is the failure being prevented.
 */
type TableLayout =
  | { mode: "measured"; minCol: number; width: number }
  | { mode: "positional"; width: number };

/**
 * Are these columns worth trusting?
 *
 * Strictly increasing within every row is the test. It admits the sparse case that matters — cells
 * at columns 0, 2, 3 with column 1 empty — and rejects the degenerate ones: all-zero, duplicated,
 * out of order, negative, or not a number. A table with no cells at all is not "measured"; there is
 * nothing to have measured.
 */
function columnsAreMeasured(rows: readonly (readonly DocCell[])[]): boolean {
  let sawCell = false;
  for (const row of rows) {
    let previous = -1;
    for (const cell of row) {
      if (!Number.isFinite(cell.col)) return false;
      const col = Math.trunc(cell.col);
      if (col < 0 || col <= previous) return false;
      previous = col;
      sawCell = true;
    }
  }
  return sawCell;
}

function tableLayout(rows: readonly (readonly DocCell[])[]): TableLayout {
  if (!columnsAreMeasured(rows)) {
    let widest = 0;
    for (const row of rows) if (row.length > widest) widest = row.length;
    return { mode: "positional", width: Math.min(widest, MAX_TABLE_COLUMNS) };
  }

  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = -1;
  for (const row of rows) {
    for (const cell of row) {
      const col = Math.trunc(cell.col);
      const span = Number.isFinite(cell.colSpan) && (cell.colSpan ?? 0) > 0 ? Math.trunc(cell.colSpan as number) : 1;
      if (col < minCol) minCol = col;
      if (col + span - 1 > maxCol) maxCol = col + span - 1;
    }
  }
  if (!Number.isFinite(minCol) || maxCol < minCol) return { mode: "positional", width: 0 };
  return { minCol, mode: "measured", width: Math.min(maxCol - minCol + 1, MAX_TABLE_COLUMNS) };
}

/**
 * One row, with every column in its place.
 *
 * A merged cell keeps its value in its first slot and leaves the rest of its span empty, which is
 * what the sheet looks like and what keeps the columns after it aligned. A VERTICAL merge needs
 * nothing special here: the parser drops the covered cells on the rows below, so those rows simply
 * have a gap where the span continues — and a gap is now rendered rather than closed up.
 */
function renderRow(row: readonly DocCell[], layout: TableLayout): string {
  if (layout.width === 0) return "";
  const slots: string[] = new Array<string>(layout.width).fill("");
  let any = false;
  row.forEach((cell, position) => {
    const at = layout.mode === "measured" ? Math.trunc(cell.col) - layout.minCol : position;
    if (at < 0 || at >= layout.width) return;
    const text = renderCell(cell);
    if (text.length === 0) return;
    // Two cells claiming one slot cannot happen in measured mode (columns strictly increase) and is
    // impossible in positional mode. Joining rather than overwriting is defence for a future caller.
    slots[at] = slots[at] ? `${slots[at]} ${text}` : text;
    any = true;
  });
  // An entirely empty row renders as a line of bare separators, which is noise with a shape. The
  // caller filters blank lines, so returning "" is what removes it.
  if (!any) return "";
  // 🔴 TRAILING EMPTIES GO; LEADING AND INTERIOR ONES STAY. The distinction is what each kind of
  // gap does: a gap with a value to its right POSITIONS that value, and closing it is the
  // misfiling bug this whole layout exists to prevent. A gap with nothing to its right positions
  // nothing and is pure trailing punctuation.
  //
  // Consistency is the other half of the reason. A chunk's text is trimmed, so trailing separators
  // survived on interior lines and vanished on the last one — the same row rendering two ways
  // depending on where the chunker happened to cut. Dropping them always makes width a property of
  // the row instead of a property of the split.
  let end = slots.length;
  while (end > 0 && slots[end - 1] === "") end -= 1;
  return slots.slice(0, end).join(" | ");
}

/**
 * How many leading rows the parser MARKED as header.
 *
 * A prefix rule, so a bolded cell in the middle of the body cannot promote its
 * row. And only rows the parser marked: deciding that row 0 "looks like" a
 * header is inference, and this layer does not infer. A table with no marked
 * header simply gets none repeated — the test says so out loud.
 */
function headerRowCount(rows: readonly DocCell[][]): number {
  let count = 0;
  for (const row of rows) {
    if (!row.some((cell) => cell.header === true)) break;
    count++;
  }
  // All header and no body: there is nothing to repeat them over.
  return count >= rows.length ? 0 : count;
}

/**
 * A table, whole where it fits and split by rows where it does not — with the
 * header repeated in every part.
 *
 * 🔴 A TABLE FRAGMENT WITHOUT ITS HEADER IS UNANSWERABLE. "812 | 4.1 | yes" in
 * isolation is not information; retrieved on its own it invites a confident
 * answer about columns nobody can name.
 *
 * No sentence overlap is added between parts: the repeated header IS the
 * overlap, and layering a tail of body rows on top would duplicate rows in the
 * index for no retrieval gain.
 */
function renderTableParts(table: DocTable, targetTokens: number): string[] {
  const rows = table.rows.filter((row) => row.length > 0);
  if (rows.length === 0) return [];

  const headerCount = headerRowCount(rows);
  // Measured ONCE over the whole table, header and body together: a header row laid out against a
  // different width from its body is exactly the misalignment this is here to prevent.
  const layout = tableLayout(rows);
  const headerLines = rows.slice(0, headerCount).map((row) => renderRow(row, layout)).filter((line) => !isBlank(line));
  // An entirely empty row carries nothing and would render as a bare separator.
  const body = rows.slice(headerCount).map((row) => renderRow(row, layout)).filter((line) => !isBlank(line));

  const prefixLines: string[] = [];
  // The table's own caption, where the document gave it one — measured text, and
  // the thing that names what the numbers are.
  if (table.title && !isBlank(table.title)) prefixLines.push(table.title.trim());
  prefixLines.push(...headerLines);
  const prefix = prefixLines.join("\n");

  if (body.length === 0) return prefix.length > 0 ? [prefix] : [];

  const whole = [prefix, ...body].filter((line) => line.length > 0).join("\n");
  if (rawTokens(whole) <= targetTokens) return [whole];

  const parts: string[] = [];
  let current: string[] = [];
  let tokens = rawTokens(prefix);
  for (const line of body) {
    const cost = rawTokens(line) + 1; // +1 for the newline that joins it
    // Always at least one body row per part, even when that single row is bigger
    // than the whole budget: dropping it loses data and skipping it never ends.
    if (current.length > 0 && tokens + cost > targetTokens) {
      parts.push([prefix, ...current].filter((l) => l.length > 0).join("\n"));
      current = [];
      tokens = rawTokens(prefix);
    }
    current.push(line);
    tokens += cost;
  }
  if (current.length > 0) parts.push([prefix, ...current].filter((l) => l.length > 0).join("\n"));
  return parts;
}

// ── Packing ──────────────────────────────────────────────────────────────────

function dedupeIds(pieces: readonly Piece[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of pieces) {
    for (const id of piece.blockIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function assemble(pieces: readonly Piece[]): string {
  let text = "";
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!piece) continue;
    text += i === 0 ? piece.text : piece.sepBefore + piece.text;
  }
  return text.trim();
}

/**
 * How far back to reach for the overlap tail.
 *
 * Walks backwards from the cursor while the tail still fits the overlap budget,
 * and never past the start of the previous chunk — otherwise a chunk could
 * repeat content from two chunks ago and the index fills with near-duplicates.
 * A single piece bigger than the overlap budget yields no overlap at all, which
 * is correct: repeating it would be repeating a whole chunk.
 */
function overlapStart(pieces: readonly Piece[], cursor: number, floor: number, budget: number): number {
  if (budget <= 0) return cursor;
  let start = cursor;
  let tokens = 0;
  for (let i = cursor - 1; i >= floor; i--) {
    const piece = pieces[i];
    if (!piece) break;
    if (tokens + piece.tokens > budget) break;
    tokens += piece.tokens;
    start = i;
  }
  return start;
}

// ── The chunker ──────────────────────────────────────────────────────────────

/**
 * Turn a parse into chunks.
 *
 * The loop is per-unit and per-segment, so "never cross a unit boundary" is a
 * property of the structure rather than a check that could be forgotten. Within
 * a segment, pieces are packed greedily up to the target and each chunk after the
 * first repeats the tail of the one before it.
 *
 * The target is a TARGET, not a cap. A single unbreakable piece, or one enormous
 * table row, is emitted whole and oversized. Dropping it loses content, and
 * refusing to emit it is a loop that never ends — an oversized chunk is the only
 * one of the three that is honest.
 *
 * So the real bound on a prose chunk is `target + overlap`, not `target`: the
 * overlap tail is counted against the budget BEFORE the first new piece is taken
 * unconditionally, and that piece can be a full target's worth on its own. With
 * the defaults that is 460 tokens, and a caller sizing a prompt should budget for
 * it. Table chunks have no such bound at all — one enormous row sets their size.
 */
export function chunkDocument(doc: ParsedDocument, opts: ChunkOptions = {}): DocChunk[] {
  const target = Math.max(1, Math.trunc(opts.targetTokens ?? DEFAULT_TARGET_TOKENS));
  // Clamped to half the target: an overlap that can fill the budget on its own
  // leaves no room for new content, and the packer would emit the same text
  // forever.
  const overlap = Math.max(0, Math.min(Math.trunc(opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS), Math.floor(target / 2)));

  const tablesById = new Map<string, DocTable>();
  for (const table of doc.tables) tablesById.set(table.id, table);
  const referenced = new Set<string>();

  const chunks: DocChunk[] = [];
  const push = (text: string, locator: Locator, blockIds: string[]) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    chunks.push({ blockIds, chunkIndex: chunks.length, locator, text: trimmed, tokensEstimate: estimateTokens(trimmed) });
  };

  const emitTable = (table: DocTable, locator: Locator, blockIds: string[]) => {
    for (const part of renderTableParts(table, target)) push(part, locator, blockIds);
  };

  for (const unit of doc.units) {
    for (const segment of segmentsForUnit(unit, tablesById, referenced, target)) {
      if (segment.type === "table") {
        emitTable(segment.table, segment.locator, segment.blockIds);
        continue;
      }
      const pieces = segment.pieces;
      let cursor = 0;
      let previousStart = 0;
      while (cursor < pieces.length) {
        const start = overlapStart(pieces, cursor, previousStart, overlap);
        let tokens = 0;
        for (let i = start; i < cursor; i++) tokens += pieces[i]?.tokens ?? 0;
        let end = cursor;
        // Take the first new piece unconditionally — that is what guarantees the
        // loop advances even when a single piece blows the budget.
        do {
          tokens += pieces[end]?.tokens ?? 0;
          end++;
        } while (end < pieces.length && tokens + (pieces[end]?.tokens ?? 0) <= target);
        const taken = pieces.slice(start, end);
        push(assemble(taken), segment.locator, dedupeIds(taken));
        previousStart = start;
        cursor = end;
      }
    }
  }

  // Tables no block referenced. Reaching tables only through blocks would drop
  // these silently, which is the worst outcome available. They go at the END of
  // the document rather than guessed into a unit: the table's own locator says
  // which page it is on — that is measured — but nothing measured says where in
  // that page's reading order it sat, and inventing an ordinal to place it would
  // be exactly the inference this layer refuses. `blockIds` is empty because
  // there is genuinely no block behind them.
  for (const table of doc.tables) {
    if (referenced.has(table.id)) continue;
    emitTable(table, { ...table.locator }, []);
  }

  return chunks;
}
