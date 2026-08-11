/**
 * Word, read as structure instead of stripped to a line per paragraph.
 *
 * 🔴 WHAT THE TAG STRIP LOSES, MEASURED OVER 124 REAL COURSE DOCUMENTS:
 *
 *   8,355 table cells (198 tables, 57 files) — each became its own orphan line
 *   2,266 numbered paragraphs in 76 files (61%) — numbering gone entirely
 *     123 headings in 17 files — no hierarchy, so no locator finer than the file
 *     116 hyperlinks, 149 figures — dropped
 *
 * 83% of those files lost structure. Tables are the worst of it and not merely
 * the largest number: the cells SURVIVE as text, so a grid arrives looking like
 * ordinary content and gets answered confidently and wrongly. Absent would be
 * safer than scrambled.
 *
 * Numbering is the most complete loss. The numbers are not in the paragraph at
 * all — `<w:numPr>` carries a `numId` and an indent level that point into
 * `word/numbering.xml`, which the old extractor never opened. "What is step 4?"
 * was unanswerable, and no amount of re-reading the text could recover it.
 *
 * 🔴 WHAT THIS DELIBERATELY DOES NOT DO: invent a page.
 * Word paginates at layout time. The file does not contain page boundaries, so
 * nothing here may report one — a citation that says "page 7" of a .docx is a
 * fabricated locator, and every later check of it would pass while pointing at
 * nothing. The truthful units are the block index and the heading path.
 *
 * PURE. No zip, no I/O — callers hand it the XML parts they already unzipped.
 */

import { projectCells, type DocCell } from "@nemesis/shared";

import { decodeXmlEntities } from "./office-text";
import { ommlSpans } from "./docx-omml";

export type DocxBlockKind = "heading" | "paragraph" | "listItem" | "table" | "equation" | "figure";

export interface DocxBlock {
  kind: DocxBlockKind;
  /** 0-based position in the document. The only locator Word truly supports. */
  index: number;
  text: string;
  /** heading only: 1-9. */
  level?: number;
  /** listItem only: the resolved marker, e.g. "3." or "•". */
  marker?: string;
  /** listItem only: nesting depth from `w:ilvl`. */
  depth?: number;
  /** table only: rows of cells, kept as a grid rather than flattened. */
  rows?: string[][];
  /** table only: the cells, carrying the spans Word states in `gridSpan`/`vMerge`.
   *  `rows` is the projection of this — one representation, not two. */
  cells?: DocCell[];
  /** table only: leading rows Word MARKED as headers. 0 when it marked none. */
  headerRows?: number;
  /**
   * figure only: the zip part the picture lives in, e.g. `word/media/image3.png`.
   *
   * 🔴 CARRIED SO A CONSUMER CAN TELL TWENTY PLACEMENTS FROM TWENTY PICTURES.
   * Measured on this corpus: 207 placements resolve to 189 distinct parts, and
   * one real template places the SAME icon five times. Counting placements is
   * right for reading order; counting them as five figures to describe would pay
   * for the same picture five times, which is the trap the PDF lane already hit.
   */
  ref?: string;
  /** The enclosing headings, outermost first. Empty at the top level. */
  headingPath: string[];
}

export interface DocxDocument {
  blocks: DocxBlock[];
  /** Counts, for coverage. Every block is in exactly one bucket. */
  counts: {
    headings: number;
    paragraphs: number;
    listItems: number;
    tables: number;
    tableCells: number;
    /** Blocks holding at least one `<m:oMath>`, not the number of oMath elements. */
    equations: number;
    /** Picture PLACEMENTS, which is not the same as distinct pictures. */
    figures: number;
  };
}

/** One numbering definition level: what marker to draw and where to restart. */
interface NumFormat {
  /** `decimal`, `bullet`, `lowerLetter`, `upperRoman`, … */
  format: string;
  start: number;
}

/**
 * Resolve `word/numbering.xml` into (numId, level) -> format.
 *
 * Word indirects twice: a paragraph names a `numId`, `w:num` maps that to an
 * `abstractNumId`, and the abstract definition holds the level formats. Skipping
 * the indirection is why a naive reader gets bullets for numbered lists. PURE.
 */
export function readNumbering(numberingXml: string | null): Map<string, NumFormat> {
  const out = new Map<string, NumFormat>();
  if (!numberingXml) return out;

  // abstractNumId -> level -> format
  const abstract = new Map<string, Map<number, NumFormat>>();
  for (const m of numberingXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"([\s\S]*?)<\/w:abstractNum>/g)) {
    const id = m[1] ?? "";
    const body = m[2] ?? "";
    const levels = new Map<number, NumFormat>();
    for (const lvl of body.matchAll(/<w:lvl\b[^>]*w:ilvl="(\d+)"([\s\S]*?)<\/w:lvl>/g)) {
      const depth = Number(lvl[1] ?? "0");
      const inner = lvl[2] ?? "";
      levels.set(depth, {
        format: inner.match(/<w:numFmt\b[^>]*w:val="([^"]*)"/)?.[1] ?? "decimal",
        start: Number(inner.match(/<w:start\b[^>]*w:val="(-?\d+)"/)?.[1] ?? "1"),
      });
    }
    abstract.set(id, levels);
  }

  for (const m of numberingXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"([\s\S]*?)<\/w:num>/g)) {
    const numId = m[1] ?? "";
    const abstractId = (m[2] ?? "").match(/<w:abstractNumId\b[^>]*w:val="(\d+)"/)?.[1];
    const levels = abstractId ? abstract.get(abstractId) : undefined;
    if (!levels) continue;
    for (const [depth, format] of levels) out.set(`${numId}:${depth}`, format);
  }
  return out;
}

/** The visible marker for a list item at a given running count. PURE. */
export function markerFor(format: string, n: number): string {
  switch (format) {
    case "bullet":
      return "-";
    case "lowerLetter":
      return `${letters(n).toLowerCase()}.`;
    case "upperLetter":
      return `${letters(n)}.`;
    case "lowerRoman":
      return `${roman(n).toLowerCase()}.`;
    case "upperRoman":
      return `${roman(n)}.`;
    // `none` really does mean an unmarked level, not a fallback to a number.
    case "none":
      return "";
    default:
      return `${n}.`;
  }
}

function letters(n: number): string {
  let out = "";
  let v = Math.max(n, 1);
  while (v > 0) {
    const rem = (v - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    v = Math.floor((v - 1) / 26);
  }
  return out;
}

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let v = Math.max(n, 1);
  let out = "";
  for (const [value, sym] of table) while (v >= value) { out += sym; v -= value; }
  return out;
}

/**
 * The text of one `<w:p>` — runs joined, tabs and breaks preserved, equations
 * rendered as structure.
 *
 * 🔴 `<m:t>` IS READ TOO, AND THAT WAS NEVER ENOUGH ON ITS OWN.
 *
 * Word stores equations as OMML in a different namespace: the characters live in
 * `<m:t>` inside `<m:oMath>`, not in `<w:t>`. A reader that matches only `<w:t>`
 * drops every equation in the file while reporting the paragraphs around them as
 * read.
 *
 * Found on a real file, not a fixture. `Equations.docx` from the owner's
 * pharmacokinetics folder holds **53 `<m:t>` elements against 7 `<w:t>`** — the
 * document is almost entirely equations, and 72% of its content was disappearing
 * silently. What was lost: clearance, half-life, extraction ratio, the
 * bioavailability identities. For that document the equations ARE the lecture.
 *
 * 🔴 AND THEN READING THE CHARACTERS TURNED OUT TO BE WORSE THAN NOT READING
 * THEM. Pulling `<m:t>` out in document order glues a fraction's numerator to
 * its denominator: `C₀/(2k)` arrived as `Co2k`, which reads as a MULTIPLICATION.
 * The half-life formula came out inverted, with every character present and
 * nothing to signal the loss. `./docx-omml` renders the shape instead; this
 * function now splices those renderings in where they were written.
 *
 * `<w:instrText>` is deliberately NOT read: it holds field instructions (TOC
 * entries, bookmark ids), which the old tag strip swept into the text and
 * produced tokens like "477519233174Formulae". Dropping those is a gain.
 *
 * PURE.
 */
export function paragraphText(paragraphXml: string): string {
  // Equations first, so the walk below can skip their interiors wholesale. Their
  // `<m:t>` runs must NOT also be picked up as loose text — that would put the
  // glued form back alongside the structured one.
  const spans = ommlSpans(paragraphXml);
  const parts: string[] = [];
  // Walk in document order so a tab between two runs lands between their words,
  // and so math falls where it was written rather than being appended.
  const re = /<(w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
  let nextSpan = 0;
  for (let m = re.exec(paragraphXml); m; m = re.exec(paragraphXml)) {
    // Emit every equation that started before this match, in place.
    while (nextSpan < spans.length && spans[nextSpan]!.start <= m.index) {
      parts.push(spans[nextSpan]!.text);
      nextSpan += 1;
    }
    const span = spans.find((s) => m!.index >= s.start && m!.index < s.end);
    if (span) {
      // Inside math already rendered: skip past the whole equation.
      re.lastIndex = span.end;
      continue;
    }
    const literal = m[2];
    if (literal !== undefined) parts.push(decodeXmlEntities(literal));
    else if (m[0].startsWith("<w:tab")) parts.push("\t");
    else parts.push(" ");
  }
  // A paragraph that is nothing but an equation has no `<w:t>` to hang it on.
  for (; nextSpan < spans.length; nextSpan += 1) parts.push(spans[nextSpan]!.text);
  return parts.join("").replace(/[^\S\r\n]+/g, " ").trim();
}

/**
 * The relationship id → target map from `word/_rels/document.xml.rels`.
 *
 * Kept here so the reader stays PURE: `office.ts` unzips the part, this turns it
 * into the lookup a picture needs. Targets are normalised to their zip path, so
 * `media/image3.png` and `../media/image3.png` both become `word/media/…` and a
 * consumer comparing two references is comparing the same string.
 */
export function readDocumentRels(relsXml: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!relsXml) return out;
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    // An external target is a link to a file that is not in the archive. It is
    // still a reference, but there is nothing to describe, so it keeps its URL.
    if (/\bTargetMode="External"/.test(tag)) { out.set(id, decodeXmlEntities(target)); continue; }
    const clean = decodeXmlEntities(target).replace(/^\.\//, "");
    out.set(id, clean.startsWith("/") ? clean.slice(1) : `word/${clean.replace(/^\.\.\//, "")}`);
  }
  return out;
}

/**
 * Every picture PLACED in a fragment of body XML, in the order they appear.
 *
 * 🔴 A `<w:drawing>` IS NOT A PICTURE, AND KEYING ON ONE INFLATES THE COUNT BY
 * HALF. Over 158 real course files there are 300 `<w:drawing>` elements and 140
 * embedded pictures: the rest are charts, SmartArt, text boxes and shapes, which
 * hold no image at all. A placed picture is a DrawingML blip with an `r:embed`,
 * or the older VML `<v:imagedata>` with an `r:id` — 67 of the corpus's pictures
 * are the VML kind, in files a Word reader that skipped them would report as
 * having no figures whatsoever.
 *
 * Both forms are counted even though 65 of the VML references sit inside an
 * `<mc:Fallback>`: resolving the ids through the relationships showed the blip
 * set and the VML set share exactly ONE target in the whole corpus, so they are
 * different pictures rather than two encodings of the same one.
 */
export function pictureRefs(xml: string, rels: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  const re = /<a:blip\b[^>]*?r:embed="([^"]+)"|<v:imagedata\b[^>]*?r:id="([^"]+)"/g;
  for (const m of xml.matchAll(re)) {
    const id = m[1] ?? m[2];
    if (!id) continue;
    out.push(rels.get(id) ?? id);
  }
  return out;
}

/** How many equations a paragraph contains. Reported so coverage can say so. PURE. */
export function equationCount(paragraphXml: string): number {
  return (paragraphXml.match(/<m:oMath\b/g) ?? []).length;
}

/** The heading level a paragraph declares, or null. PURE. */
export function headingLevel(paragraphXml: string): number | null {
  const style = paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/)?.[1];
  if (!style) return null;
  // Word writes `Heading1`; some producers write `heading 1`.
  const m = style.match(/^heading\s*([1-9])$/i);
  return m ? Number(m[1]) : null;
}

/**
 * Read a Word document body into blocks.
 *
 * `numberingXml` may be null — a document with no lists does not ship the part,
 * and a list whose definition is missing degrades to a bullet rather than
 * throwing away the item.
 */
export function readDocxStructure(
  documentXml: string,
  numberingXml: string | null = null,
  /**
   * `word/_rels/document.xml.rels`, already read.
   *
   * 🔴 OPTIONAL, AND ITS ABSENCE IS NOT "NO PICTURES". Without it a picture is
   * still detected and still emitted — it just carries the raw relationship id
   * instead of the media path. Refusing to emit the figure would be the old
   * silence again, dressed up as caution.
   */
  relsXml: string | null = null,
): DocxDocument {
  const numbering = readNumbering(numberingXml);
  const rels = readDocumentRels(relsXml);
  const blocks: DocxBlock[] = [];
  /** Enclosing heading names, outermost first. Always dense — see the heading branch. */
  const headingPath: string[] = [];
  /** The headings currently open, with the level each was set at. */
  const openHeadings: { level: number; text: string }[] = [];
  // Running counts per (numId, level), so "3." is the third item of THAT list
  // rather than the third numbered paragraph in the file.
  const counters = new Map<string, number>();
  const counts = { equations: 0, figures: 0, headings: 0, listItems: 0, paragraphs: 0, tableCells: 0, tables: 0 };

  /** Every picture in a fragment, as its own block, in the order it was placed. */
  const pushFigures = (xml: string) => {
    for (const ref of pictureRefs(xml, rels)) {
      counts.figures += 1;
      blocks.push({
        headingPath: [...headingPath],
        index: blocks.length,
        kind: "figure",
        // A figure's text is its CAPTION, and Word does not attach one — a Word
        // caption is an ordinary paragraph beside the picture, indistinguishable
        // from body text without guessing. Empty is the truth; inventing a
        // caption from the neighbouring line would read as the author's words.
        text: "",
        ...(ref ? { ref } : {}),
      });
    }
  };

  // Top-level children only: a `<w:p>` inside a `<w:tbl>` belongs to its cell,
  // and emitting it twice is exactly how a table becomes orphan lines as well.
  for (const node of topLevelNodes(documentXml)) {
    const index = blocks.length;
    if (node.tag === "tbl") {
      const { cells: tableCells, headerRows, rows } = readTable(node.xml);
      const cellCount = rows.reduce((t, r) => t + r.length, 0);
      if (cellCount) {
        counts.tables += 1;
        counts.tableCells += cellCount;
        blocks.push({
          cells: tableCells,
          headerRows,
          headingPath: [...headingPath],
          index,
          kind: "table",
          rows,
          // A readable rendering that keeps row and column identity, so a model
          // reading the text still sees a grid rather than a list of words.
          text: renderTable(rows),
        });
      }
      // 🔴 PICTURES INSIDE CELLS ARE EMITTED AFTER THE GRID, NOT DROPPED.
      // 30 of this corpus's 207 placements sit inside a table, and the canonical
      // model's table is a grid of strings with nowhere to put one. Placing them
      // immediately after the table keeps them in the document and keeps their
      // order relative to everything else; it only loses which cell they were in,
      // which is a smaller loss than the picture.
      pushFigures(node.xml);
      continue;
    }

    const text = paragraphText(node.xml);
    const equations = equationCount(node.xml);
    const level = headingLevel(node.xml);
    if (level !== null) {
      // A heading with no text is a spacer, not a section — but it may still be
      // the anchor for a picture, so the figures are taken either way.
      if (!text) { pushFigures(node.xml); continue; }
      // 🔴 THE PATH IS THE HEADINGS THAT ARE ACTUALLY OPEN, NOT ONE SLOT PER
      // LEVEL — AND GETTING THAT WRONG DELETED WHOLE DOCUMENTS.
      //
      // This was `headingPath[level - 1] = text` on a plain array. A document
      // whose first heading is Heading 2, or that goes 1 → 3, leaves the skipped
      // slots as array HOLES, which serialise to `null`. `readDocumentModel`
      // then rejects the block — correctly, since a heading path entry must be a
      // string — and rejecting one block rejects the model, so the ENTIRE
      // document reads back as having no structure at all. Silently: a null
      // model is indistinguishable from a parse that predates the canonical
      // model, so it reports as old data rather than as a fault.
      //
      // Measured over 205 real Word files: 3 documents, 316 blocks between them,
      // every one of them parsed perfectly and then thrown away on the far side
      // of storage. Skipping a heading level is ordinary in real documents —
      // resumes and worksheets do it constantly.
      //
      // An unopened level has no heading, so it contributes no ancestor. The
      // path gets shorter and every entry in it is a heading that exists.
      while (openHeadings.length > 0 && openHeadings[openHeadings.length - 1]!.level >= level) openHeadings.pop();
      counts.headings += 1;
      blocks.push({ headingPath: openHeadings.map((h) => h.text), index, kind: "heading", level, text });
      openHeadings.push({ level, text });
      headingPath.length = 0;
      headingPath.push(...openHeadings.map((h) => h.text));
      pushFigures(node.xml);
      continue;
    }

    if (!text) { pushFigures(node.xml); continue; }
    const numPr = node.xml.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/)?.[1];
    if (numPr) {
      const numId = numPr.match(/<w:numId\b[^>]*w:val="(\d+)"/)?.[1] ?? "";
      const depth = Number(numPr.match(/<w:ilvl\b[^>]*w:val="(\d+)"/)?.[1] ?? "0");
      const key = `${numId}:${depth}`;
      const format = numbering.get(key);
      const next = (counters.get(key) ?? (format?.start ?? 1) - 1) + 1;
      counters.set(key, next);
      // Starting a level again resets everything nested under it, which is what
      // makes "1.1, 1.2, 2.1" come out right instead of "1.1, 1.2, 2.3".
      for (const other of [...counters.keys()]) {
        const [otherNum, otherDepth] = other.split(":");
        if (otherNum === numId && Number(otherDepth) > depth) counters.delete(other);
      }
      counts.listItems += 1;
      // 🔴 A NUMBERED STEP THAT CONTAINS A FORMULA STAYS A LIST ITEM.
      // The precedence is heading > listItem > equation > paragraph, and this is
      // the load-bearing rung: promoting it to `equation` would drop its marker,
      // and the marker is the whole reason "what is step 4?" is answerable at
      // all. 2,497 markers in this corpus depend on it.
      blocks.push({
        depth,
        headingPath: [...headingPath],
        index,
        kind: "listItem",
        marker: markerFor(format?.format ?? "bullet", next),
        text,
      });
      pushFigures(node.xml);
      continue;
    }

    // 🔴 KIND `equation`, SO SOMETHING DOWNSTREAM CAN TELL. Every block used to
    // be a `paragraph`, which meant a formula and a sentence about a formula
    // were indistinguishable — nothing could weight one differently, flag it for
    // review, or refuse to paraphrase it.
    if (equations > 0) {
      counts.equations += 1;
      blocks.push({ headingPath: [...headingPath], index, kind: "equation", text });
      pushFigures(node.xml);
      continue;
    }

    counts.paragraphs += 1;
    blocks.push({ headingPath: [...headingPath], index, kind: "paragraph", text });
    pushFigures(node.xml);
  }

  return { blocks, counts };
}

/**
 * The immediate `<w:TAG>` children of `xml`, in order, without descending.
 *
 * 🔴 A HAND-ROLLED SCAN, BECAUSE EVERY ONE OF THESE TAGS NESTS.
 *
 * A non-greedy `<w:tc>…</w:tc>` looks right and is wrong the moment a cell holds
 * a table: it stops at the INNER closing tag, truncating the outer cell and
 * eating the one beside it. Caught by a test — a two-column row containing a
 * nested table reported one column. The same trap applies to `w:tbl` in the body
 * and `w:tr` inside a table.
 *
 * `tags` may name several alternatives; the returned slice is the whole element.
 */
function childrenOf(xml: string, tags: readonly string[]): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = [];
  const re = new RegExp(`<w:(${tags.join("|")})\\b[^>]*?(/?)>`, "g");
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const tag = m[1] ?? "";
    if (m[2] === "/") continue; // self-closing, so it has no children
    const open = new RegExp(`<w:${tag}\\b[^>]*?>`, "g");
    const close = new RegExp(`</w:${tag}>`, "g");
    let depth = 1;
    let cursor = m.index + m[0].length;
    while (depth > 0 && cursor < xml.length) {
      open.lastIndex = cursor;
      close.lastIndex = cursor;
      const nextOpen = open.exec(xml);
      const nextClose = close.exec(xml);
      if (!nextClose) break;
      // A self-closing occurrence opens nothing, so it must not raise depth.
      if (nextOpen && nextOpen.index < nextClose.index && !nextOpen[0].endsWith("/>")) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else if (nextOpen && nextOpen.index < nextClose.index) {
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
      }
    }
    out.push({ tag, xml: xml.slice(m.index, cursor) });
    re.lastIndex = cursor;
  }
  return out;
}

/** Body children, in order, without descending into them. PURE. */
function topLevelNodes(documentXml: string): { tag: string; xml: string }[] {
  const body = documentXml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? documentXml;
  return childrenOf(body, ["p", "tbl"]);
}

/**
 * A table's cells, as rows, plus how many leading rows Word marked as headers.
 *
 * 🔴 THE HEADER COUNT IS READ, NEVER ASSUMED. Word states it: a header row
 * carries `<w:tblHeader/>` in its `<w:trPr>`, which is what makes it repeat
 * across a page break. Assuming "row 0 is the header" instead would label every
 * value in a table that opens with data — a rubric whose first line is a real
 * criterion becomes a column name, and every answer drawn from it inherits the
 * mistake. Tables with no marked header honestly report zero.
 *
 * 🔴 AND MOST TABLES REALLY DO SAY NOTHING. Measured over 158 real course files:
 * 232 tables, and `<w:tblHeader/>` appears on FOUR rows in three of them. The
 * tempting substitute is `<w:tblLook w:firstRow="1">`, which is present on 189
 * of those tables — but Word writes `w:val="04A0"` on every table it inserts, so
 * that flag carries no authorial intent at all and honouring it would be the
 * forbidden "row 0 is a header" guess wearing a different hat. No table style in
 * the corpus declares a `firstRow` header either. 13 header cells is not a gap
 * in this reader; it is what these documents actually state.
 *
 * Nested tables contribute their text to their cell. PURE.
 */
/**
 * A cell's own properties, which is where Word states its merges.
 *
 * 🔴 READ FROM `<w:tcPr>` ONLY, NEVER FROM THE WHOLE CELL. A cell may contain a
 * nested table whose cells have their own `tcPr`, so scanning the cell's full XML
 * would read a grandchild's span as this cell's. `tcPr` is required to be the
 * first child of `w:tc` when present, so the slice up to the first `<w:p` or
 * `<w:tbl` is exactly this cell's properties.
 */
function cellProps(tcXml: string): string {
  const body = tcXml.search(/<w:(?:p|tbl)[\s>]/);
  return body === -1 ? tcXml : tcXml.slice(0, body);
}

/**
 * One table, with the merges Word states explicitly.
 *
 * 🔴 `gridSpan` AND `vMerge` WERE BOTH IGNORED, AND EACH BROKE THE GRID ITS OWN
 * WAY. A horizontally merged cell is ONE `<w:tc>` covering several grid columns,
 * so a header spanning three of five columns produced a three-cell row beside
 * five-cell rows — a ragged table in which no column index means the same thing
 * twice. A vertically merged cell writes its text once and leaves every
 * continuation row an empty `<w:tc>`, so the value was present in the first row
 * and blank in the rest — the identical defect the PDF lane had, except Word
 * states the merge outright rather than implying it by an undrawn rule.
 *
 * Measured over 158 real Word documents: not one produced a cell model, so no
 * merged cell in any of them survived in any form.
 *
 * Cells are the source of truth and `rows` is their projection, exactly as in the
 * PDF lane, so both formats mean the same thing by a table.
 */
function readTable(tableXml: string): { cells: DocCell[]; headerRows: number; rows: string[][] } {
  const cells: DocCell[] = [];
  let headerRows = 0;
  let rowIndex = 0;
  // Only this table's OWN rows and cells. A nested table's `<w:tr>` sits inside a
  // `<w:tc>` of ours, and a non-greedy match would end the outer cell at the
  // inner `</w:tc>` — truncating it and swallowing the cell beside it, so a
  // two-column row reports one column.
  const inner = tableXml.replace(/^<w:tbl\b[^>]*>/, "").replace(/<\/w:tbl>$/, "");
  for (const tr of childrenOf(inner, ["tr"])) {
    const rowInner = tr.xml.replace(/^<w:tr\b[^>]*>/, "").replace(/<\/w:tr>$/, "");
    let column = 0;
    let any = false;
    for (const tc of childrenOf(rowInner, ["tc"])) {
      const props = cellProps(tc.xml);
      const span = Number(props.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/)?.[1] ?? 1);
      const colSpan = Number.isFinite(span) && span > 0 ? span : 1;
      const vMerge = props.match(/<w:vMerge\b[^>]*>/)?.[0];
      // No `w:val` means "continue" — the default, and the common case in the
      // wild. Only `restart` begins a new merged cell.
      const continues = vMerge !== undefined && !/w:val="restart"/.test(vMerge);

      if (continues) {
        // Grow the cell above that owns this column, rather than emitting a blank.
        const owner = cells.find(
          (c) => c.column === column && c.row + (c.rowSpan ?? 1) === rowIndex,
        );
        if (owner) owner.rowSpan = (owner.rowSpan ?? 1) + 1;
        column += colSpan;
        any = true;
        continue;
      }

      // Every paragraph in the cell, including any inside a nested table: its
      // text belongs to this cell, even though its grid is not ours to flatten.
      const paragraphs = [...tc.xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((p) => paragraphText(p[0]));
      cells.push({
        column,
        row: rowIndex,
        text: paragraphs.filter(Boolean).join(" ").trim(),
        ...(colSpan > 1 ? { colSpan } : {}),
      });
      column += colSpan;
      any = true;
    }
    if (!any) continue;
    // Only a LEADING run counts. Word allows the property anywhere, but a header
    // that does not start the table cannot be a header for the rows above it,
    // and treating a mid-table repeat as one would mislabel everything before.
    if (isHeaderRow(rowInner) && headerRows === rowIndex) headerRows += 1;
    rowIndex += 1;
  }
  return { cells, headerRows, rows: projectCells(cells) };
}

/**
 * Did Word mark THIS row as a repeating header?
 *
 * 🔴 TWO WAYS TO GET THIS WRONG, BOTH OF WHICH RENAME A ROW OF DATA.
 *
 * 1. `<w:tblHeader w:val="false"/>` is a row explicitly saying it is NOT a
 *    header — it appears when a style sets the property and one row switches it
 *    off. A bare `<w:tblHeader` test reads that as a header, which is the exact
 *    inversion of what the file says. (Zero rows in this corpus do it; the rule
 *    is a fixture, not a measurement, and it costs nothing to be right.)
 * 2. The row's properties must be the ROW'S OWN. Searching the whole `<w:tr>`
 *    for a `<w:trPr>` finds a nested table's row properties when the outer row
 *    declares none, and then an inner header promotes an outer data row. So the
 *    search stops at the first cell: `<w:trPr>` is required by the schema to
 *    come before any `<w:tc>`.
 *
 * `rowInner` is the row with its own `<w:tr>` tags already stripped. PURE.
 */
function isHeaderRow(rowInner: string): boolean {
  const firstCell = rowInner.search(/<w:tc[\s>]/);
  const props = (firstCell < 0 ? rowInner : rowInner.slice(0, firstCell)).match(/<w:trPr>([\s\S]*?)<\/w:trPr>/)?.[1];
  if (!props) return false;
  const tag = props.match(/<w:tblHeader\b[^>]*>/)?.[0];
  if (!tag) return false;
  return !/w:val="(?:false|0|off)"/.test(tag);
}

/**
 * A grid as a pipe table, header row separated.
 *
 * The point is not prettiness. A cell rendered on its own line loses which
 * column it was in, and a model then reads "8" as a fact about whichever row it
 * happened to follow. Keeping the pipes keeps the association. PURE.
 */
export function renderTable(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(Math.max(width - r.length, 0)).fill("")];
  const escape = (c: string) => c.replace(/\|/g, "\\|").replace(/\n+/g, " ");
  const [header, ...body] = rows;
  const lines = [`| ${pad(header ?? []).map(escape).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`];
  for (const row of body) lines.push(`| ${pad(row).map(escape).join(" | ")} |`);
  return lines.join("\n");
}

/** The document as text, structure preserved in markdown. PURE. */
export function renderDocx(doc: DocxDocument): string {
  const out: string[] = [];
  for (const block of doc.blocks) {
    if (block.kind === "heading") out.push(`${"#".repeat(Math.min(block.level ?? 1, 6))} ${block.text}`);
    else if (block.kind === "listItem") out.push(`${"  ".repeat(block.depth ?? 0)}${block.marker ? `${block.marker} ` : ""}${block.text}`);
    // 🔴 THE PICTURE IS ANNOUNCED, NOT SKIPPED. A diagram nobody looked at is
    // content the student uploaded and did not get back, and a reader that says
    // nothing about it presents an incomplete document as a complete one. The
    // canonical model prints the same sentence (`documentToText`), so the two
    // renderings agree.
    else if (block.kind === "figure") out.push("[Figure — not examined]");
    else out.push(block.text);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
