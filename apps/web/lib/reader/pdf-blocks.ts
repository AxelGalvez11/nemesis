// Turning a PDF page's loose text fragments into something with a shape:
// lines, paragraphs, headings and list items. This is what Reading mode reads.
//
// 🔴 FIELD-AGNOSTIC BY CONSTRUCTION (CLAUDE.md standing rule). Every decision
// here is made from GEOMETRY the PDF itself carries — font size relative to
// this document's own body size, vertical gaps relative to this document's own
// line height, horizontal position, and the reading direction pdf.js reports.
// There is no word list, no language assumption, and no character-count
// threshold anywhere. A German contract, an Arabic judgment, a Japanese
// engineering manual and a Latin-alphabet lecture are all measured the same way.
//
// Specifically avoided, because `docs/document-intelligence.md` §5 catalogued
// them as real biases:
//   - counting characters to judge whether a page "has text" (CJK says far more
//     per character, so any fixed count is wrong in one direction or the other)
//   - ordering by ascending x unconditionally (reverses Arabic and Hebrew)
//   - treating repetition as decoration
//
// The output is DERIVED. `parsed_documents` will eventually carry a better
// structure computed server-side; until it does, this gives Reading mode a real,
// measured basis instead of a model's guess. Source mode never uses any of it.

/** The subset of pdf.js's TextItem this module needs. Declared locally so the
 *  logic is testable without loading pdf.js. */
export interface PdfTextItem {
  str: string;
  dir?: string;
  /** [a, b, c, d, e, f] — e,f are x,y in PDF user space (origin bottom-left). */
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

export type ReaderBlockKind = "heading" | "paragraph" | "list-item";

export interface ReaderBlock {
  kind: ReaderBlockKind;
  text: string;
  /** 1-based page this block was measured on. */
  unit: number;
  /** 1 = biggest heading in the document. Only set on headings. */
  level?: number;
  /** Reading direction of the block, taken from its items. */
  dir: "ltr" | "rtl";
}

interface Line {
  text: string;
  fontSize: number;
  /** Distance from the top of the page, in PDF units. */
  top: number;
  left: number;
  right: number;
  height: number;
  dir: "ltr" | "rtl";
  bold: boolean;
}

/** Vertical scale of the text matrix — the item's rendered font size. */
function fontSizeOf(item: PdfTextItem): number {
  const [, b, c, d] = item.transform;
  const scale = Math.hypot(c ?? 0, d ?? 0);
  return scale > 0 ? scale : Math.hypot(item.transform[0] ?? 0, b ?? 0) || item.height || 0;
}

/** pdf.js names bold faces "…-Bold", "…,Bold", "…BoldMT" and so on. Matching on
 *  the FONT NAME is a property of the file, not of any language — an Arabic or
 *  Japanese face marked bold matches the same way a Latin one does. */
function isBoldFace(fontName: string | undefined): boolean {
  return typeof fontName === "string" && /bold|black|heavy|semib|demib/i.test(fontName);
}

function directionOf(items: readonly PdfTextItem[]): "ltr" | "rtl" {
  const rtl = items.reduce((count, item) => count + (item.dir === "rtl" ? 1 : 0), 0);
  return rtl * 2 > items.length ? "rtl" : "ltr";
}

/** Group a page's items into visual lines and put each line's items back in
 *  reading order. Items arrive in content-stream order, which is neither. */
export function linesFromItems(items: readonly PdfTextItem[]): Line[] {
  const printable = items.filter((item) => item.str.trim().length > 0);
  if (printable.length === 0) return [];

  const rows: PdfTextItem[][] = [];
  const sorted = [...printable].sort((a, b) => (b.transform[5] ?? 0) - (a.transform[5] ?? 0));
  for (const item of sorted) {
    const y = item.transform[5] ?? 0;
    const size = fontSizeOf(item) || item.height || 1;
    const row = rows.at(-1);
    const rowY = row?.[0]?.transform[5] ?? null;
    // Same line when the baselines are within half a line of each other. Using
    // the item's OWN size keeps this correct for a page mixing 8pt and 24pt.
    if (row && rowY !== null && Math.abs(rowY - y) <= size * 0.5) row.push(item);
    else rows.push([item]);
  }

  return rows.map((row) => {
    const dir = directionOf(row);
    const ordered = [...row].sort((a, b) =>
      dir === "rtl" ? (b.transform[4] ?? 0) - (a.transform[4] ?? 0) : (a.transform[4] ?? 0) - (b.transform[4] ?? 0),
    );
    const sizes = ordered.map(fontSizeOf).filter((size) => size > 0);
    const xs = ordered.map((item) => item.transform[4] ?? 0);
    const rights = ordered.map((item, index) => (xs[index] ?? 0) + (item.width ?? 0));
    const text = ordered
      .map((item) => item.str)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    return {
      text,
      fontSize: sizes.length ? Math.max(...sizes) : 0,
      top: -(ordered[0]?.transform[5] ?? 0),
      left: Math.min(...xs),
      right: Math.max(...rights),
      height: Math.max(...ordered.map((item) => item.height || fontSizeOf(item) || 0)),
      dir,
      bold: ordered.some((item) => isBoldFace(item.fontName)),
    };
  });
}

/** The size most of this document's text is set in. Rounded to a quarter point
 *  so 11.999 and 12.001 are the same size, then taken by total text length
 *  rather than line count — one huge title page must not outvote the body. */
export function bodyFontSize(lines: readonly Line[]): number {
  const weights = new Map<number, number>();
  for (const line of lines) {
    if (line.fontSize <= 0) continue;
    const key = Math.round(line.fontSize * 4) / 4;
    weights.set(key, (weights.get(key) ?? 0) + line.text.length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, weight] of weights) {
    if (weight > bestWeight || (weight === bestWeight && size < best)) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

/** A leading bullet or numbering marker. Deliberately restricted to characters
 *  that are punctuation or digits in EVERY script — never words like "Step". */
const LIST_MARKER = /^\s*(?:[•·▪▫◦‣⁃*‧∙]|[-–—]\s|\(?\d{1,3}[.)]|\(?[a-z][.)]|\(?[ivxlcdm]{1,5}[.)])\s+/i;

function stripListMarker(text: string): string | null {
  const match = LIST_MARKER.exec(text);
  if (!match) return null;
  const rest = text.slice(match[0].length).trim();
  return rest.length > 0 ? rest : null;
}

export interface BlockOptions {
  /** How much bigger than body text a line must be to read as a heading.
   *  1.15 is deliberately gentle: many documents set headings only slightly
   *  larger and rely on weight, which `bold` covers separately. */
  headingRatio?: number;
}

/** One page's lines → blocks. Pages are processed together (not merged) so a
 *  block always knows which page it was measured on — that is what makes a
 *  citation from Reading mode land on the right page in Source mode. */
export function blocksFromPages(
  pages: readonly { unit: number; items: readonly PdfTextItem[] }[],
  options: BlockOptions = {},
): ReaderBlock[] {
  const headingRatio = options.headingRatio ?? 1.15;
  const perPage = pages.map((page) => ({ unit: page.unit, lines: linesFromItems(page.items) }));
  const allLines = perPage.flatMap((page) => page.lines);
  const body = bodyFontSize(allLines);

  // Heading sizes, biggest first, become levels 1..n. Computed across the WHOLE
  // document so "Chapter" and "Section" get consistent levels on every page.
  const headingSizes = [
    ...new Set(
      allLines
        .filter((line) => body > 0 && line.fontSize >= body * headingRatio)
        .map((line) => Math.round(line.fontSize * 4) / 4),
    ),
  ].sort((a, b) => b - a);

  const blocks: ReaderBlock[] = [];
  for (const { unit, lines } of perPage) {
    // "Normal line spacing" is the LOWER quartile of the gaps, not the median.
    // Paragraph gaps are by definition the minority, but on a short page there
    // are so few of them that a median lands on one — and then nothing ever
    // reads as a break, because the yardstick IS the thing being measured.
    const gaps = lines
      .map((line, index) => (index === 0 ? 0 : line.top - (lines[index - 1]?.top ?? line.top)))
      .filter((gap) => gap > 0)
      .sort((a, b) => a - b);
    const typicalGap = gaps[Math.floor((gaps.length - 1) * 0.25)] ?? 0;
    const boldLines = lines.filter((line) => line.bold).length;

    interface OpenBlock {
      kind: ReaderBlockKind;
      parts: string[];
      dir: "ltr" | "rtl";
      /** Where the block's text starts, direction-aware, for indentation tests. */
      start: number;
    }
    let open: OpenBlock | null = null;

    const flush = (): void => {
      if (open === null) return;
      const text = open.parts.join(" ").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ kind: open.kind, text, unit, dir: open.dir });
      open = null;
    };

    lines.forEach((line, index) => {
      if (!line.text) return;
      const size = Math.round(line.fontSize * 4) / 4;
      const headingIndex = headingSizes.indexOf(size);
      const biggerThanBody = body > 0 && line.fontSize >= body * headingRatio;
      // Bold and no smaller than body counts as a heading only while bold is
      // the exception on this page — otherwise a bold-set document would come
      // out as nothing but headings. Weight and position, never wording.
      const standsOutByWeight = line.bold && body > 0 && line.fontSize >= body * 0.98 && boldLines * 2 < lines.length;
      const isHeading = (headingIndex >= 0 && biggerThanBody) || standsOutByWeight;

      const listBody = stripListMarker(line.text);
      const previous = index > 0 ? lines[index - 1] : null;
      const gap = previous ? line.top - previous.top : 0;
      const paragraphBreak = typicalGap > 0 && gap > typicalGap * 1.55;
      // In right-to-left text the line "starts" at its right edge, so negate
      // and the same comparison works for both directions.
      const start = line.dir === "rtl" ? -line.right : line.left;

      if (isHeading) {
        flush();
        blocks.push({
          kind: "heading",
          text: line.text,
          unit,
          dir: line.dir,
          level: headingIndex >= 0 ? Math.min(headingIndex + 1, 4) : Math.min(headingSizes.length + 1, 4),
        });
        return;
      }

      if (listBody !== null) {
        flush();
        open = { kind: "list-item", parts: [listBody], dir: line.dir, start };
        return;
      }

      if (open !== null) {
        // A wrapped list item stays with its bullet: same block as long as it
        // is not pulled back to the left of where the item's text began (a
        // hanging indent) and no paragraph-sized gap intervened.
        const continuesList = open.kind === "list-item" && !paragraphBreak && start >= open.start - line.height * 0.5;
        if (paragraphBreak || (open.kind === "list-item" && !continuesList)) flush();
      }

      if (open === null) open = { kind: "paragraph", parts: [line.text], dir: line.dir, start };
      else (open as OpenBlock).parts.push(line.text);
    });
    flush();
  }

  return blocks;
}
