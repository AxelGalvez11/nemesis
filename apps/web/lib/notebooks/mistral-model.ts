/**
 * Mistral's read of a document, as the Nemesis canonical document.
 *
 * 🔴 THE ONE PLACE A VENDOR'S VOCABULARY BECOMES NEMESIS'S, AND IT IS DELIBERATELY A FUNCTION AND
 * NOT A CAST. Everything above this line is Mistral's shape; everything below it is `DocumentModel`,
 * which the reader, the chunker, the citation resolver and knowledge construction already read. A
 * second canonical document type would be the fifth time this repository built a rich model and
 * flattened it at a boundary, so there is not one: Mistral maps onto what exists.
 *
 * 🔴🔴 THE LABELLED `blocks` ARRAY IS THE STRUCTURE SOURCE, AND READING THE PAGE MARKDOWN INSTEAD
 * SILENTLY DESTROYS EVERY TABLE. This was written the other way round first, from the published
 * response schema, and one probe against a real 24-page drug chart proved it wrong: Mistral does
 * NOT inline a table into its page markdown. It writes a REFERENCE — `[tbl-0.html](tbl-0.html)` —
 * and puts the HTML in `blocks[].content` and `pages[].tables[]`. A markdown-first reader turns all
 * 28 tables in that file into the literal paragraph "tbl-0.html", which is the fifth time this
 * repository would have built a rich document model and flattened it at a boundary.
 *
 * The unit tests did not catch it and could not have: they fed markdown that already contained
 * `<table>`, so they exercised the mapper in isolation while claiming to test the wiring. A guard
 * whose input arrives the way a test finds convenient, rather than the way the producer delivers
 * it, proves nothing about the producer.
 *
 * Markdown remains the fallback for a page the vendor labelled nothing on, and there the `tbl-N`
 * references are resolved against `pages[].tables` rather than being read as links.
 *
 * 🔴 A BLOCK'S BOX IS ITS BOX. Every labelled block carries `top_left_*`/`bottom_right_*` in page
 * pixels, so every paragraph, list and table gets a real `rect` — which is what lets a citation
 * highlight where it came from. Nothing here invents one: no page dimensions means no rectangle.
 *
 * 🔴 WORD FILES COLLAPSE TO ONE `body` UNIT, AND THAT IS NOT A LOSS. Mistral renders a .docx and
 * reports the pages of ITS rendering. Word paginates at layout time, so those page numbers are a
 * property of a renderer rather than of the document: a citation to "page 7" of a Word file would
 * point somewhere else the next time anything re-rendered it. The existing DOCX lane makes exactly
 * this choice for exactly this reason, and a vendor swap must not quietly reverse it.
 */

import { buildDocument, type DocBlock, type DocFormat, type DocRect, type DocUnit, type DocumentModel } from "@nemesis/shared";

import { findHtmlTables, tableFromHtml, tableFromPipes } from "./mistral-tables";
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
    // 🔴 MEASURED ON A REAL DECK, NOT DEFENSIVE. PowerPoint's soft line break survives conversion
    // as a literal vertical tab, and its punctuation arrives backslash-escaped ("Ph\\.d\\."), so a
    // learner would be shown control characters and stray backslashes in the title of slide one.
    .replace(/[\v\f]/g, " ")
    .replace(/\\([.,;:!?()\[\]{}<>+=|~^$#&%@*_-])/g, "$1")
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

    // A run of consecutive pipe lines is one table. Office files arrive this way — no labelled
    // blocks, no HTML — so without this a Word table becomes a run of pipe-filled paragraphs.
    let pipes: string[] = [];
    const flushPipes = () => {
      if (pipes.length === 0) return;
      const rows = pipes;
      pipes = [];
      const table = tableFromPipes(rows);
      if (table) push({ kind: "table", table, text: "" });
      // Not a grid after all (a single stray line, or one column) — keep the text rather than
      // dropping it, because losing the words is worse than losing the shape.
      else for (const row of rows) push({ kind: "paragraph", text: plainText(row) });
    };

    for (const rawLine of (segment.text ?? "").split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
        flush();
        pipes.push(line);
        continue;
      }
      flushPipes();
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
    flushPipes();
    flush();
  }

  return blocks;
}

/**
 * A labelled block's own kind, when its label tells us something markdown cannot.
 *
 * 🔴 THE LABEL DISAMBIGUATES WHAT SYNTAX ALONE CANNOT. Mistral's list blocks use `o` and `▪` for
 * nested levels — not markdown markers — so a syntax-only reader files them as prose. The vendor
 * has already said "this region is a list"; using that is what the label is for. PURE.
 */
export function blockKindOf(type: string | null | undefined): string {
  return (type ?? "").trim().toLowerCase();
}

/** A nested-bullet line, using the glyphs Mistral emits inside a `list` block. PURE. */
function looseListItem(line: string): { depth: number; marker: string; text: string } | null {
  const match = /^(\s*)([o•▪‣·–—])\s+(.*)$/.exec(line);
  if (!match) return null;
  const glyph = match[2] ?? "-";
  return {
    // The glyph IS the level in this notation: `-` outer, `o` next, `▪` next again.
    depth: glyph === "o" ? 1 : glyph === "-" ? 0 : 2,
    marker: glyph,
    text: (match[3] ?? "").trim(),
  };
}

/**
 * One labelled block as Nemesis blocks.
 *
 * Returns several where the vendor grouped several — a `list` block routinely holds four bullets —
 * and every one of them carries the same rectangle, because that is the region the vendor located.
 */
export function blocksFromLabelled(input: {
  content: string;
  rect: DocRect | undefined;
  stack: Array<{ level: number; text: string }>;
  tables: ReadonlyMap<string, NonNullable<ReturnType<typeof tableFromHtml>>>;
  type: string;
  unit: number;
}): PendingBlock[] {
  const { content, rect, stack, unit } = input;
  const kind = blockKindOf(input.type);
  const withRect = (block: Omit<PendingBlock, "headingPath" | "unit">): PendingBlock =>
    ({ ...block, headingPath: pathOf(stack), unit, ...(rect ? { rect } : {}) }) as PendingBlock;

  if (kind === "table") {
    // The HTML is in this block's own content. A reference is resolved too, for the shape where
    // the block carries the id rather than the markup.
    const inline = findHtmlTables(content)[0]?.table;
    const referenced = inline ?? input.tables.get(tableRefOf(content) ?? "");
    if (referenced) return [withRect({ kind: "table", table: referenced, text: "" })];
    // A table we could not read is still a located region, and saying so beats dropping it.
    return [withRect({ kind: "paragraph", text: plainText(content) })];
  }

  if (kind === "header" || kind === "footer") {
    const text = plainText(content);
    return text ? [withRect({ kind: kind === "header" ? "pageHeader" : "pageFooter", text })] : [];
  }

  if (kind === "caption") {
    const text = plainText(content);
    return text ? [withRect({ kind: "caption", text })] : [];
  }

  if (kind === "image" || kind === "figure") {
    const image = imageRefOf(content);
    return [withRect({ figure: image?.ref ? { ref: image.ref } : {}, kind: "figure", text: image?.alt ?? "" })];
  }

  if (kind === "list") {
    const out: PendingBlock[] = [];
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const item = listItemOf(line) ?? looseListItem(line);
      out.push(
        item
          ? withRect({ depth: item.depth, kind: "listItem", marker: item.marker, text: plainText(item.text) })
          // The vendor called this region a list; a line whose marker we do not recognise is still
          // one of its items, and demoting it to prose would break the run.
          : withRect({ depth: 0, kind: "listItem", marker: "-", text: plainText(line) }),
      );
    }
    return out;
  }

  // `title`, `text`, and everything unrecognised go through the markdown reader, which handles the
  // heading stack, equations, inline images and stray tables. An unknown label costs nothing.
  return blocksFromMarkdown({ markdown: content, stack, unit }).map((block) =>
    rect && !block.rect ? { ...block, rect } : block,
  );
}

/** The `tbl-N.html` id a markdown reference names, or null. PURE. */
export function tableRefOf(text: string): string | null {
  const match = /\[([^\]]*\.html)\]\(([^)\s]+)\)/.exec(text.trim());
  return match ? (match[2] ?? match[1] ?? null) : null;
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

    // The page's own table objects, by id, so a `[tbl-0.html](tbl-0.html)` reference resolves to a
    // grid instead of being read as a link to a file that does not exist.
    const tables = new Map<string, NonNullable<ReturnType<typeof tableFromHtml>>>();
    for (const table of page.tables ?? []) {
      const id = (table.id ?? "").trim();
      const html = table.content ?? table.html ?? table.markdown ?? "";
      if (!id || !html) continue;
      const built = tableFromHtml(html);
      if (built) tables.set(id, built);
    }

    const labelled = page.blocks ?? [];
    let pageBlocks: PendingBlock[];
    if (labelled.length > 0) {
      pageBlocks = labelled.flatMap((block) =>
        blocksFromLabelled({
          content: block.content ?? block.markdown ?? "",
          rect: rectFrom(block, page.dimensions),
          stack,
          tables,
          type: block.type ?? "",
          unit,
        }),
      );
    } else {
      // No labels on this page. Read the markdown, and resolve table references rather than
      // letting them become the paragraph "tbl-0.html".
      pageBlocks = blocksFromMarkdown({ markdown: page.markdown, stack, unit }).flatMap((block) => {
        const ref = block.kind === "paragraph" ? tableRefOf(block.text) : null;
        const table = ref ? tables.get(ref) : undefined;
        return table ? [{ ...block, kind: "table" as const, table, text: "" }] : [block];
      });
      // Only when the vendor labelled nothing: the page-level header/footer fields. When blocks
      // exist they already carry these AND their rectangles, and taking both would print each twice.
      const header = (page.header ?? "").trim();
      const footer = (page.footer ?? "").trim();
      if (header) {
        pageBlocks.unshift({ headingPath: pathOf(stack), kind: "pageHeader", text: plainText(header), unit });
      }
      if (footer) {
        pageBlocks.push({ headingPath: pathOf(stack), kind: "pageFooter", text: plainText(footer), unit });
      }
    }
    blocks.push(...pageBlocks);

    const named = new Set(
      pageBlocks.flatMap((block) => (block.figure?.ref ? [block.figure.ref] : [])),
    );
    blocks.push(...locatedFigures(page, unit, pathOf(stack), named));
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
