// Word documents, read as documents.
//
// The existing server-side extractor strips every tag with a regular expression
// and returns a flat string; `docs/document-intelligence.md` lists that as a
// FATAL loss — "Headings, lists, tables, images, all flattened. Tracked
// deletions and field codes leak in." This walks the real structure instead, so
// the reader can lay a Word file out like a documentation page: headings that
// are headings, lists that are lists, tables that keep their columns, and
// pictures where the author put them.
//
// The output is a BLOCK MODEL, not an HTML string. A string would have to be
// injected with `dangerouslySetInnerHTML`, which turns any document a student
// uploads into a scripting surface; blocks are rendered as ordinary React and
// cannot inject anything.
//
// 🔴 What is deliberately DROPPED, and why it is not a loss:
//   - `w:del` — text the author deleted with track-changes on. Rendering it
//     would show the student words the document does not say.
//   - `w:instrText` — field instruction codes (PAGEREF, HYPERLINK targets…).
//     They are machinery, not prose, and they are exactly what leaks into the
//     regex extractor's output today.

import { textSpansIn } from "./ooxml-edit";
import { allNamed, childrenNamed, firstNamed, isElement, parseXml, textOf, type Span, type XmlElement } from "./xml-tree";

export interface DocxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface DocxTableCell {
  runs: DocxRun[];
  colSpan: number;
  header: boolean;
}

/**
 * Where a paragraph's words physically sit in `word/document.xml`, so an edit can be a splice
 * rather than a rewrite. See `ooxml-edit.ts`. Empty means the line has nothing replaceable in it,
 * which is what makes it uneditable.
 */
export type DocxBlock =
  | { kind: "heading"; level: number; runs: DocxRun[]; spans: readonly Span[] }
  | { kind: "paragraph"; runs: DocxRun[]; quote: boolean; spans: readonly Span[] }
  | { kind: "list-item"; level: number; ordered: boolean; runs: DocxRun[]; spans: readonly Span[] }
  | { kind: "table"; rows: DocxTableCell[][] }
  | { kind: "image"; relId: string; alt: string }
  | { kind: "section-break" };

/** A heading style's level, from the style id Word writes. Matches "Heading1",
 *  "heading-2", "berschrift3" (German Word), "Ttulo2" (Spanish) and the rest:
 *  the LEVEL is the trailing digit, and the fact that it is an outline heading
 *  at all comes from `w:outlineLvl` where present. Deliberately not a list of
 *  English style names — Word localises them. */
function headingLevel(paragraph: XmlElement): number | null {
  const properties = childrenNamed(paragraph, "w:pPr")[0];
  if (!properties) return null;

  const outline = childrenNamed(properties, "w:outlineLvl")[0]?.attrs["w:val"];
  if (outline !== undefined) {
    const level = Number.parseInt(outline, 10);
    if (Number.isInteger(level) && level >= 0 && level <= 8) return level + 1;
  }

  const style = childrenNamed(properties, "w:pStyle")[0]?.attrs["w:val"] ?? "";
  const digits = /(\d)\s*$/.exec(style);
  if (!digits) return null;
  // A style ending in a digit is only a heading when the rest of the name is a
  // heading name in SOME language — which we detect structurally: Word's
  // built-in heading styles are the only ones that also carry an outline level
  // in the style definition. Without styles.xml the safest signal left is the
  // conventional "heading"/"titre"/"titulo"/"berschrift" stem, so accept a
  // known stem OR nothing and let the caller's font-size fallback handle
  // the rest.
  if (!/^(heading|titre|titulo|título|berschrift|überschrift|kop|rubrik|otsikko|naslov|zaglavlje|заголовок|標題|見出し|제목)/i.test(style)) {
    return null;
  }
  const level = Number.parseInt(digits[1] ?? "", 10);
  return level >= 1 && level <= 6 ? level : null;
}

function isQuote(paragraph: XmlElement): boolean {
  const properties = childrenNamed(paragraph, "w:pPr")[0];
  const style = properties ? childrenNamed(properties, "w:pStyle")[0]?.attrs["w:val"] ?? "" : "";
  return /quote|zitat|cita|citation/i.test(style);
}

interface ListInfo {
  level: number;
  ordered: boolean;
}

/** List membership and depth come from `w:numPr`. Whether it is numbered or
 *  bulleted lives in numbering.xml, which the caller supplies as a map from
 *  numbering id to format; without it the safe assumption is a bullet, because
 *  showing "1." where the document shows "•" invents an ordering. */
function listInfo(paragraph: XmlElement, orderedNumIds: ReadonlySet<string>): ListInfo | null {
  const properties = childrenNamed(paragraph, "w:pPr")[0];
  const numbering = properties ? childrenNamed(properties, "w:numPr")[0] : null;
  if (!numbering) return null;
  const level = Number.parseInt(childrenNamed(numbering, "w:ilvl")[0]?.attrs["w:val"] ?? "0", 10);
  const numId = childrenNamed(numbering, "w:numId")[0]?.attrs["w:val"] ?? "";
  return { level: Number.isInteger(level) && level >= 0 ? Math.min(level, 5) : 0, ordered: orderedNumIds.has(numId) };
}

/** Runs of text in one paragraph, keeping bold/italic/underline and dropping
 *  deleted text and field codes. Adjacent runs with identical formatting are
 *  merged — Word splits a sentence into a run per spell-check boundary. */
function runsOf(container: XmlElement): DocxRun[] {
  const runs: DocxRun[] = [];

  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      // Deleted text and field instructions never reach the reader.
      if (child.name === "w:del" || child.name === "w:instrText" || child.name === "w:delText") continue;
      if (child.name === "w:tbl") continue; // nested tables are emitted separately
      if (child.name === "w:r") {
        const properties = childrenNamed(child, "w:rPr")[0];
        const off = (element: XmlElement | undefined): boolean => element?.attrs["w:val"] === "0" || element?.attrs["w:val"] === "false" || element?.attrs["w:val"] === "none";
        const bold = properties ? childrenNamed(properties, "w:b").some((element) => !off(element)) : false;
        const italic = properties ? childrenNamed(properties, "w:i").some((element) => !off(element)) : false;
        const underline = properties ? childrenNamed(properties, "w:u").some((element) => !off(element)) : false;

        let text = "";
        for (const part of child.children) {
          if (!isElement(part)) continue;
          if (part.name === "w:t") text += textOf(part);
          else if (part.name === "w:tab") text += "\t";
          else if (part.name === "w:br" || part.name === "w:cr") text += "\n";
        }
        if (!text) continue;
        const last = runs.at(-1);
        if (last && !!last.bold === bold && !!last.italic === italic && !!last.underline === underline) last.text += text;
        else runs.push({ text, ...(bold && { bold }), ...(italic && { italic }), ...(underline && { underline }) });
        continue;
      }
      walk(child);
    }
  };

  walk(container);
  return runs.filter((run) => run.text.length > 0);
}

/**
 * The `w:t` spans of one paragraph, skipping exactly what `runsOf` skips.
 *
 * 🔴 THE EXCLUSIONS ARE NOT COSMETIC HERE, THEY ARE CORRECTNESS. `w:del` is text the author deleted
 * with track-changes on and `w:instrText` is a field instruction; neither is on screen, so writing
 * a replacement line across them would put the learner's words into machinery they never saw. A
 * nested table is emitted as its own block and is not part of this line.
 */
function paragraphSpans(paragraph: XmlElement): Span[] {
  const spans: Span[] = [];
  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (child.name === "w:del" || child.name === "w:instrText" || child.name === "w:delText") continue;
      if (child.name === "w:tbl") continue;
      if (child.name === "w:t") {
        spans.push(...textSpansIn(child));
        continue;
      }
      walk(child);
    }
  };
  walk(paragraph);
  return spans;
}

function imageIn(paragraph: XmlElement): { relId: string; alt: string } | null {
  const blip = firstNamed(paragraph, "a:blip");
  const relId = blip?.attrs["r:embed"] ?? blip?.attrs["r:link"];
  if (!relId) return null;
  const description = firstNamed(paragraph, "wp:docPr");
  return { relId, alt: description?.attrs["descr"] || description?.attrs["name"] || "" };
}

function cellsOf(row: XmlElement, header: boolean): DocxTableCell[] {
  return childrenNamed(row, "w:tc").map((cell) => {
    const cellProperties = childrenNamed(cell, "w:tcPr")[0];
    const spanValue = cellProperties ? childrenNamed(cellProperties, "w:gridSpan")[0]?.attrs["w:val"] ?? "1" : "1";
    const span = Number.parseInt(spanValue, 10);
    const runs = childrenNamed(cell, "w:p").flatMap((paragraph, index) => {
      const paragraphRuns = runsOf(paragraph);
      // A cell holding several paragraphs keeps them apart, or "Yes" and "No"
      // in one cell would read as "YesNo".
      return index > 0 && paragraphRuns.length > 0 ? [{ text: "\n" }, ...paragraphRuns] : paragraphRuns;
    });
    return { runs, colSpan: Number.isInteger(span) && span > 0 ? span : 1, header };
  });
}

/** Which numbering ids are ordered rather than bulleted, read from
 *  word/numbering.xml. A missing file means every list renders as a bullet. */
export function orderedNumberingIds(numberingXml: string | null): Set<string> {
  const ordered = new Set<string>();
  if (!numberingXml) return ordered;
  const root = parseXml(numberingXml);
  if (!root) return ordered;

  const abstractFormats = new Map<string, boolean>();
  for (const abstract of allNamed(root, "w:abstractNum")) {
    const id = abstract.attrs["w:abstractNumId"];
    if (!id) continue;
    const firstLevel = childrenNamed(abstract, "w:lvl").find((level) => (level.attrs["w:ilvl"] ?? "0") === "0");
    const format = firstLevel ? childrenNamed(firstLevel, "w:numFmt")[0]?.attrs["w:val"] ?? "" : "";
    abstractFormats.set(id, format !== "" && format !== "bullet" && format !== "none");
  }
  for (const num of allNamed(root, "w:num")) {
    const numId = num.attrs["w:numId"];
    const abstractId = childrenNamed(num, "w:abstractNumId")[0]?.attrs["w:val"];
    if (numId && abstractId && abstractFormats.get(abstractId)) ordered.add(numId);
  }
  return ordered;
}

/** word/document.xml → blocks, in document order. */
export function docxBlocks(documentXml: string, numberingXml: string | null = null): DocxBlock[] {
  const root = parseXml(documentXml);
  if (!root) return [];
  const body = firstNamed(root, "w:body") ?? root;
  const orderedIds = orderedNumberingIds(numberingXml);
  const blocks: DocxBlock[] = [];

  for (const node of body.children) {
    if (!isElement(node)) continue;

    if (node.name === "w:tbl") {
      const rows = childrenNamed(node, "w:tr");
      const table = rows.map((row, index) => cellsOf(row, index === 0));
      if (table.some((row) => row.some((cell) => cell.runs.length > 0))) blocks.push({ kind: "table", rows: table });
      continue;
    }

    if (node.name !== "w:p") continue;

    const image = imageIn(node);
    const runs = runsOf(node);
    const text = runs.map((run) => run.text).join("").trim();

    if (image) {
      blocks.push({ kind: "image", relId: image.relId, alt: image.alt });
      if (!text) continue;
    }
    if (!text) {
      // An empty paragraph carrying a section break is a real boundary; an
      // empty paragraph carrying nothing is just spacing Word left behind.
      if (firstNamed(node, "w:sectPr")) blocks.push({ kind: "section-break" });
      continue;
    }

    const spans = paragraphSpans(node);
    const level = headingLevel(node);
    if (level !== null) {
      blocks.push({ kind: "heading", level: Math.min(level, 6), runs, spans });
      continue;
    }
    const list = listInfo(node, orderedIds);
    if (list) {
      blocks.push({ kind: "list-item", level: list.level, ordered: list.ordered, runs, spans });
      continue;
    }
    blocks.push({ kind: "paragraph", runs, quote: isQuote(node), spans });
  }

  return blocks;
}

/** Plain text of a block, for search and for the Reading-mode fallback. */
export function docxBlockText(block: DocxBlock): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "list-item":
      return block.runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim();
    case "table":
      return block.rows
        .map((row) => row.map((cell) => cell.runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim()).join("\t"))
        .join("\n");
    case "image":
      return block.alt;
    case "section-break":
      return "";
  }
}
