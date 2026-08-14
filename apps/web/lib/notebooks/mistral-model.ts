/**
 * Mistral's read of a document, as the Nemesis canonical document.
 *
 * 🔴 THE ONE PLACE A VENDOR'S VOCABULARY BECOMES NEMESIS'S, AND IT IS DELIBERATELY A FUNCTION AND
 * NOT A CAST. Everything above this line is Mistral's shape; everything below it is `DocumentModel`,
 * which the reader, the chunker, the citation resolver and knowledge construction already read. A
 * second canonical document type would be the fifth time this repository built a rich model and
 * flattened it at a boundary, so there is not one: Mistral maps onto what exists.
 *
 * 🔴 MARKDOWN IS THE STRUCTURE SOURCE, NOT THE `blocks` ARRAY. Mistral's per-page markdown is its
 * documented, stable output; `include_blocks` adds labelled regions whose exact schema is not
 * something this code should bet a whole document on. So structure is derived from markdown — which
 * is deterministic, testable without a network, and degrades to "one paragraph" rather than to
 * nothing — and the block/image arrays are used only to ENRICH what markdown already established,
 * never to define it. When a locality fact is missing, the field is absent. Nothing here invents a
 * rectangle, a heading level, or a page number.
 *
 * 🔴 WORD FILES COLLAPSE TO ONE `body` UNIT, AND THAT IS NOT A LOSS. Mistral renders a .docx and
 * reports the pages of ITS rendering. Word paginates at layout time, so those page numbers are a
 * property of a renderer rather than of the document: a citation to "page 7" of a Word file would
 * point somewhere else the next time anything re-rendered it. The existing DOCX lane makes exactly
 * this choice for exactly this reason, and a vendor swap must not quietly reverse it.
 */

import { buildDocument, type DocBlock, type DocFormat, type DocRect, type DocUnit, type DocumentModel } from "@nemesis/shared";

import { findHtmlTables } from "./mistral-tables";
import type { MistralImage, MistralOcrResponse, MistralPage } from "./mistral-ocr";

type PendingBlock = Omit<DocBlock, "id">;

/** Which unit kind a format's pages are. PURE. */
export function unitKindFor(format: DocFormat): DocUnit["kind"] {
  if (format === "pptx") return "slide";
  if (format === "image") return "image";
  if (format === "docx") return "body";
  return "page";
}

/** Whether this format keeps the vendor's page boundaries at all. PURE — see the header. */
export function keepsPageBoundaries(format: DocFormat): boolean {
  return format === "pdf" || format === "pptx";
}

/**
 * A rectangle in unit-relative 0..1 coordinates, or absent.
 *
 * 🔴 THE VENDOR REPORTS PIXELS AND THE MODEL STORES FRACTIONS; A MISSED CONVERSION HERE IS A
 * LOCATOR THAT RESOLVES TO A SLIVER IN THE TOP-LEFT CORNER AND NO TEST NOTICES. Returns undefined
 * whenever the page's own size is unknown or the numbers are not a positive box, because a
 * rectangle is optional and "never invented". PURE.
 */
export function rectFrom(
  image: Pick<MistralImage, "top_left_x" | "top_left_y" | "bottom_right_x" | "bottom_right_y">,
  size: { height?: number | null; width?: number | null } | null | undefined,
): DocRect | undefined {
  const width = size?.width;
  const height = size?.height;
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  const { top_left_x: x0, top_left_y: y0, bottom_right_x: x1, bottom_right_y: y1 } = image;
  if (typeof x0 !== "number" || typeof y0 !== "number") return undefined;
  if (typeof x1 !== "number" || typeof y1 !== "number") return undefined;
  const w = (x1 - x0) / width;
  const h = (y1 - y0) / height;
  if (!(w > 0) || !(h > 0)) return undefined;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { height: clamp(h), width: clamp(w), x: clamp(x0 / width), y: clamp(y0 / height) };
}

/** A list marker and its nesting depth, or null when the line is not a list item. PURE. */
export function listItemOf(line: string): { depth: number; marker: string; text: string } | null {
  const match = /^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  const indent = (match[1] ?? "").replace(/\t/g, "  ").length;
  return {
    // Two spaces per level is the markdown convention; anything shallower is depth 0.
    depth: Math.floor(indent / 2),
    marker: match[2] ?? `${match[3]}.`,
    text: (match[4] ?? "").trim(),
  };
}

/** A heading's level and text, or null. PURE. */
export function headingOf(line: string): { level: number; text: string } | null {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  if (!match) return null;
  const text = (match[2] ?? "").replace(/\s*#+\s*$/, "").trim();
  return text ? { level: (match[1] ?? "").length, text } : null;
}

/** Is this paragraph nothing but a display equation? PURE. */
export function isDisplayEquation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return true;
  return trimmed.startsWith("\\[") && trimmed.endsWith("\\]");
}

/** The alt text and target of a lone markdown image, or null. PURE. */
export function imageRefOf(text: string): { alt: string; ref: string } | null {
  const match = /^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)$/.exec(text.trim());
  return match ? { alt: (match[1] ?? "").trim(), ref: (match[2] ?? "").trim() } : null;
}

/** Strip the emphasis and link syntax that would otherwise reach a learner as literal characters.
 *  Deliberately conservative: it removes wrappers, never content. PURE. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])(\*|_)(?!\s)(.+?)(?<!\s)\1(?![\w*])/g, "$2")
    .trim();
}

/** The heading stack, as the path a block sits under. PURE given its input. */
function pathOf(stack: ReadonlyArray<{ level: number; text: string }>): string[] {
  return stack.map((entry) => entry.text);
}

/**
 * One page's markdown as blocks.
 *
 * The heading stack is threaded through pages rather than reset per page, because a section that
 * starts on page 3 still governs page 4 — resetting would orphan every block after the first page
 * break, and `headingPath` is what retrieval and citations group by.
 */
export function blocksFromMarkdown(input: {
  markdown: string;
  stack: Array<{ level: number; text: string }>;
  unit: number;
}): PendingBlock[] {
  const blocks: PendingBlock[] = [];
  const { stack, unit } = input;
  const push = (block: Omit<PendingBlock, "headingPath" | "unit">) => {
    blocks.push({ ...block, headingPath: pathOf(stack), unit } as PendingBlock);
  };

  // Tables are lifted out first so their internal newlines never reach the line walker.
  const tables = findHtmlTables(input.markdown);
  const segments: Array<{ table?: (typeof tables)[number]["table"]; text?: string }> = [];
  let cursor = 0;
  for (const found of tables) {
    if (found.start > cursor) segments.push({ text: input.markdown.slice(cursor, found.start) });
    segments.push({ table: found.table });
    cursor = found.end;
  }
  if (cursor < input.markdown.length) segments.push({ text: input.markdown.slice(cursor) });

  for (const segment of segments) {
    if (segment.table) {
      push({ kind: "table", table: segment.table, text: "" });
      continue;
    }
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length === 0) return;
      const joined = paragraph.join(" ").trim();
      paragraph = [];
      if (!joined) return;
      if (isDisplayEquation(joined)) {
        push({ kind: "equation", text: joined });
        return;
      }
      const image = imageRefOf(joined);
      if (image) {
        // 🔴 A DESCRIPTION IS ABSENT, NOT EMPTY. Mistral locates a figure; it does not say what the
        // figure shows unless the document captioned it. `figure.description` being absent means
        // "not examined", which is what lets a later vision pass enrich this document rather than
        // believing someone already looked.
        push({
          figure: image.ref ? { ref: image.ref } : {},
          kind: "figure",
          text: image.alt,
        });
        return;
      }
      push({ kind: "paragraph", text: plainText(joined) });
    };

    for (const rawLine of (segment.text ?? "").split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        flush();
        continue;
      }
      const heading = headingOf(line);
      if (heading) {
        flush();
        while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= heading.level) stack.pop();
        const text = plainText(heading.text);
        push({ kind: "heading", level: heading.level, text });
        // Pushed AFTER the block is emitted, so a heading's own path is its ancestors and not itself.
        stack.push({ level: heading.level, text });
        continue;
      }
      const item = listItemOf(line);
      if (item) {
        flush();
        push({ depth: item.depth, kind: "listItem", marker: item.marker, text: plainText(item.text) });
        continue;
      }
      if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
        flush();
        continue;
      }
      paragraph.push(line.trim());
    }
    flush();
  }

  return blocks;
}

/** The figures Mistral located on a page that the markdown did not already name, so a page whose
 *  pictures are unreferenced still records that they exist and where. PURE. */
function locatedFigures(page: MistralPage, unit: number, path: string[], named: Set<string>): PendingBlock[] {
  const out: PendingBlock[] = [];
  for (const image of page.images ?? []) {
    const ref = (image.id ?? "").trim();
    if (ref && named.has(ref)) continue;
    const rect = rectFrom(image, page.dimensions);
    out.push({
      figure: ref ? { ref } : {},
      headingPath: path,
      kind: "figure",
      text: "",
      unit,
      ...(rect ? { rect } : {}),
    });
  }
  return out;
}

/**
 * Mistral's answer as a `DocumentModel`.
 *
 * Returns null when nothing survived the mapping — the caller treats that exactly as it treats a
 * local extractor producing nothing, and falls through.
 */
export function modelFromMistral(
  response: MistralOcrResponse,
  format: DocFormat,
  title: string | null,
): DocumentModel | null {
  const paged = keepsPageBoundaries(format);
  const kind = unitKindFor(format);
  const stack: Array<{ level: number; text: string }> = [];
  const blocks: PendingBlock[] = [];
  const units: DocUnit[] = [];

  // Ordered by the vendor's own index, never by array position — a reordered response would
  // otherwise interleave two pages' prose into one reading order with nothing to show for it.
  const pages = [...response.pages].sort((a, b) => a.index - b.index);

  for (const [position, page] of pages.entries()) {
    const unit = paged ? position : 0;
    if (paged || units.length === 0) {
      const size =
        page.dimensions?.width && page.dimensions.height
          ? { height: page.dimensions.height, width: page.dimensions.width }
          : undefined;
      units.push({
        index: unit,
        kind,
        // A page's own printed number is not knowable from OCR; the label is the position, which is
        // what every existing paged producer records.
        ...(paged ? { label: String(position + 1) } : {}),
        // For a collapsed document the sizes differ per rendered page, so none is recorded rather
        // than one page's size standing in for the whole.
        ...(paged && size ? { size } : {}),
      });
    }

    const header = (page.header ?? "").trim();
    if (header) {
      blocks.push({ headingPath: pathOf(stack), kind: "pageHeader", text: plainText(header), unit });
    }

    const pageBlocks = blocksFromMarkdown({ markdown: page.markdown, stack, unit });
    blocks.push(...pageBlocks);

    const named = new Set(
      pageBlocks.flatMap((block) => (block.figure?.ref ? [block.figure.ref] : [])),
    );
    blocks.push(...locatedFigures(page, unit, pathOf(stack), named));

    const footer = (page.footer ?? "").trim();
    if (footer) {
      blocks.push({ headingPath: pathOf(stack), kind: "pageFooter", text: plainText(footer), unit });
    }
  }

  if (units.length === 0 || blocks.length === 0) return null;
  return buildDocument({ blocks, format, title, units });
}

/** The first heading, as a title, when the document did not otherwise state one. PURE. */
export function titleFromMistral(response: MistralOcrResponse): string | null {
  for (const page of response.pages) {
    for (const line of page.markdown.split(/\r?\n/)) {
      const heading = headingOf(line.trim());
      if (heading) return plainText(heading.text).slice(0, 200) || null;
    }
  }
  return null;
}
