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

import { decodeXmlEntities } from "./office-text";

export type DocxBlockKind = "heading" | "paragraph" | "listItem" | "table";

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
  /** table only: leading rows Word MARKED as headers. 0 when it marked none. */
  headerRows?: number;
  /** The enclosing headings, outermost first. Empty at the top level. */
  headingPath: string[];
}

export interface DocxDocument {
  blocks: DocxBlock[];
  /** Counts, for coverage. Every block is in exactly one bucket. */
  counts: { headings: number; paragraphs: number; listItems: number; tables: number; tableCells: number; equations: number };
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
 * The text of one `<w:p>` — runs joined, tabs and breaks preserved.
 *
 * 🔴 `<m:t>` IS READ TOO, AND THAT IS NOT A DETAIL.
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
 * `<w:instrText>` is deliberately NOT read: it holds field instructions (TOC
 * entries, bookmark ids), which the old tag strip swept into the text and
 * produced tokens like "477519233174Formulae". Dropping those is a gain.
 *
 * PURE.
 */
export function paragraphText(paragraphXml: string): string {
  const parts: string[] = [];
  // Walk in document order so a tab between two runs lands between their words,
  // and so math falls where it was written rather than being appended.
  const re = /<(w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
  for (const m of paragraphXml.matchAll(re)) {
    const literal = m[2];
    if (literal !== undefined) parts.push(decodeXmlEntities(literal));
    else if (m[0].startsWith("<w:tab")) parts.push("\t");
    else parts.push(" ");
  }
  return parts.join("").replace(/[^\S\r\n]+/g, " ").trim();
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
export function readDocxStructure(documentXml: string, numberingXml: string | null = null): DocxDocument {
  const numbering = readNumbering(numberingXml);
  const blocks: DocxBlock[] = [];
  const headingPath: string[] = [];
  // Running counts per (numId, level), so "3." is the third item of THAT list
  // rather than the third numbered paragraph in the file.
  const counters = new Map<string, number>();
  const counts = { equations: 0, headings: 0, listItems: 0, paragraphs: 0, tableCells: 0, tables: 0 };

  // Top-level children only: a `<w:p>` inside a `<w:tbl>` belongs to its cell,
  // and emitting it twice is exactly how a table becomes orphan lines as well.
  for (const node of topLevelNodes(documentXml)) {
    const index = blocks.length;
    if (node.tag === "tbl") {
      const { headerRows, rows } = readTable(node.xml);
      const cells = rows.reduce((t, r) => t + r.length, 0);
      if (!cells) continue;
      counts.tables += 1;
      counts.tableCells += cells;
      blocks.push({
        headerRows,
        headingPath: [...headingPath],
        index,
        kind: "table",
        rows,
        // A readable rendering that keeps row and column identity, so a model
        // reading the text still sees a grid rather than a list of words.
        text: renderTable(rows),
      });
      continue;
    }

    const text = paragraphText(node.xml);
    counts.equations += equationCount(node.xml);
    const level = headingLevel(node.xml);
    if (level !== null) {
      // A heading with no text is a spacer, not a section.
      if (!text) continue;
      headingPath.length = Math.max(level - 1, 0);
      headingPath[level - 1] = text;
      counts.headings += 1;
      blocks.push({ headingPath: headingPath.slice(0, level - 1), index, kind: "heading", level, text });
      continue;
    }

    if (!text) continue;
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
      blocks.push({
        depth,
        headingPath: [...headingPath],
        index,
        kind: "listItem",
        marker: markerFor(format?.format ?? "bullet", next),
        text,
      });
      continue;
    }

    counts.paragraphs += 1;
    blocks.push({ headingPath: [...headingPath], index, kind: "paragraph", text });
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
 * Nested tables contribute their text to their cell. PURE.
 */
function readTable(tableXml: string): { headerRows: number; rows: string[][] } {
  const rows: string[][] = [];
  let headerRows = 0;
  // Only this table's OWN rows and cells. A nested table's `<w:tr>` sits inside a
  // `<w:tc>` of ours, and a non-greedy match would end the outer cell at the
  // inner `</w:tc>` — truncating it and swallowing the cell beside it, so a
  // two-column row reports one column.
  const inner = tableXml.replace(/^<w:tbl\b[^>]*>/, "").replace(/<\/w:tbl>$/, "");
  for (const tr of childrenOf(inner, ["tr"])) {
    const cells: string[] = [];
    const rowInner = tr.xml.replace(/^<w:tr\b[^>]*>/, "").replace(/<\/w:tr>$/, "");
    for (const tc of childrenOf(rowInner, ["tc"])) {
      // Every paragraph in the cell, including any inside a nested table: its
      // text belongs to this cell, even though its grid is not ours to flatten.
      const paragraphs = [...tc.xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((p) => paragraphText(p[0]));
      cells.push(paragraphs.filter(Boolean).join(" ").trim());
    }
    if (!cells.length) continue;
    // Only a LEADING run counts. Word allows the property anywhere, but a header
    // that does not start the table cannot be a header for the rows above it,
    // and treating a mid-table repeat as one would mislabel everything before.
    const rowProps = tr.xml.match(/<w:trPr>([\s\S]*?)<\/w:trPr>/)?.[1] ?? "";
    if (/<w:tblHeader\b/.test(rowProps) && headerRows === rows.length) headerRows += 1;
    rows.push(cells);
  }
  return { headerRows, rows };
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
    else out.push(block.text);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
