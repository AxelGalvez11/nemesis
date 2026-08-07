/**
 * Turning positioned glyphs back into a document.
 *
 * A PDF does not contain paragraphs. It contains instructions to draw runs of
 * text at coordinates, in whatever order the producing application found
 * convenient. `unpdf` concatenates those runs, which is why production currently
 * hands the model a two-column page as interleaved half-sentences and a table as
 * a stream of loose numbers.
 *
 * Everything here is PURE and works on plain rectangles, so the grouping rules
 * can be tested without pdf.js, a file, or a rendering context. The pdf.js side
 * lives in `structure.ts` and does nothing but produce these rectangles.
 *
 * 🔴 COORDINATES ARE VIEWPORT COORDINATES: origin TOP-LEFT, y increasing
 * downward, in points at scale 1. PDF's own user space is bottom-left; the
 * conversion happens exactly once, at the pdf.js boundary, because a codebase
 * with two conventions eventually compares a y from one against a y from the
 * other and the bug looks like bad grouping rather than bad arithmetic.
 */

/** A positioned run of text, in viewport points. */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A run of items sharing a baseline. */
export interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A group of lines that read as one paragraph. */
export interface TextGroup extends Box {
  lines: TextLine[];
  /** The dominant glyph height, used to tell a heading from body text. */
  fontHeight: number;
}

const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;

/** The smallest box containing all of them. Empty input gives a zero box. */
export function unionBox(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { height: 0, width: 0, x: 0, y: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, right(b));
    y1 = Math.max(y1, bottom(b));
  }
  return { height: y1 - y0, width: x1 - x0, x: x0, y: y0 };
}

/**
 * Group items into lines.
 *
 * 🔴 THE TOLERANCE IS RELATIVE TO THE GLYPHS, NOT A CONSTANT. A footnote at 7 pt
 * and a title at 28 pt are on the same page; a fixed 3-point tolerance either
 * splits the title's own accents onto separate lines or fuses two lines of
 * footnote into one. Half the item's own height tracks both.
 *
 * Sorting is by y first and x second, so an item drawn out of order — which is
 * ordinary, producers emit text in font order all the time — still lands on its
 * own line rather than starting a new one.
 */
export function groupLines(items: readonly TextItem[]): TextLine[] {
  const sorted = [...items]
    .filter((i) => i.text.length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextLine[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    const tolerance = Math.max(item.height * 0.5, 1);
    const sameBaseline = last && Math.abs(last.y - item.y) <= tolerance;
    // 🔴 A SHARED BASELINE IS NOT ENOUGH — THE GAP HAS TO BE CROSSABLE.
    //
    // The first version of this merged on baseline alone, and a two-column page
    // came out as "L0 R0 / L1 R1": the left column's first line and the right
    // column's first line sit on the same baseline, so every row of the page
    // fused into one line and the column rule below had nothing left to split.
    // A page header with a chapter name at the left margin and a page number at
    // the right is the same shape and the same mistake.
    //
    // The threshold is in ems so it means the same thing at any type size.
    // Over-splitting is cheap — two segments at one y end up adjacent in reading
    // order and rejoin inside a paragraph — while under-splitting is the column
    // defect itself.
    const adjacent = last && item.x - right(last) <= Math.max(item.height * LINE_GAP_EMS, 2);
    if (sameBaseline && adjacent) {
      last.items.push(item);
      last.width = Math.max(right(last), right(item)) - last.x;
      continue;
    }
    lines.push({ height: item.height, items: [item], text: "", width: item.width, x: item.x, y: item.y });
  }
  return lines.map(finishLine);
}

/** How far apart two runs on one baseline may sit and still be one line. */
const LINE_GAP_EMS = 2.5;

/**
 * A line's text, spaced by the gaps that are actually there.
 *
 * PDF producers emit a space character sometimes and simply move the cursor
 * other times, so joining runs with a space inserts words that are not there
 * ("t he") and joining with nothing fuses words that are ("theresult"). The gap
 * between one run's right edge and the next run's left edge is the only reliable
 * signal, measured against the glyph height so it scales with the font.
 */
function finishLine(line: TextLine): TextLine {
  const items = [...line.items].sort((a, b) => a.x - b.x);
  let text = "";
  let previous: TextItem | null = null;
  for (const item of items) {
    if (previous) {
      const gap = item.x - right(previous);
      const needsSpace = gap > Math.max(previous.height * 0.2, 0.6);
      if (needsSpace && !/\s$/.test(text) && !/^\s/.test(item.text)) text += " ";
    }
    text += item.text;
    previous = item;
  }
  const box = unionBox(items);
  return { ...box, items, text: text.replace(/\s+/g, " ").trim() };
}

/**
 * Where a page's columns are, or null when it has one.
 *
 * 🔴 A COLUMN IS A GAP NO LINE CROSSES. That is the whole test, and it is
 * deliberately structural rather than a guess at a layout: scan candidate split
 * positions across the text area and keep one only if every single line sits
 * entirely on one side of it. A page with any full-width element — a title, a
 * wide table, a figure caption running across — correctly reports one column,
 * which is the right answer, because reading it in column order would scramble
 * exactly that element.
 *
 * This is why the check is not "are there two clusters of x positions": a
 * two-column page with a full-width heading has two clusters and must still be
 * read straight down, or the heading is torn in half.
 */
export function columnSplit(lines: readonly TextLine[], pageWidth: number): number | null {
  const body = lines.filter((l) => l.text.length > 1);
  // Too few lines to be a layout rather than a coincidence.
  if (body.length < MIN_COLUMN_LINES * 2) return null;

  let best: { balance: number; split: number } | null = null;
  // Scan the middle of the page. A gap near an edge is a margin, not a gutter.
  for (let fraction = 0.3; fraction <= 0.7; fraction += 0.005) {
    const split = pageWidth * fraction;
    let leftEdge = -Infinity;
    let rightEdge = Infinity;
    const left: TextLine[] = [];
    const rightLines: TextLine[] = [];
    let crosses = false;
    for (const line of body) {
      if (line.x < split && right(line) > split) { crosses = true; break; }
      if (right(line) <= split) { left.push(line); leftEdge = Math.max(leftEdge, right(line)); }
      else { rightLines.push(line); rightEdge = Math.min(rightEdge, line.x); }
    }
    if (crosses) continue;
    if (left.length < MIN_COLUMN_LINES || rightLines.length < MIN_COLUMN_LINES) continue;
    const leftShare = left.length / body.length;
    if (leftShare < 0.25 || leftShare > 0.75) continue;

    // 🔴 A REAL GUTTER IS EMPTY AND WIDE. Without this, any page whose content
    // happens to avoid one x position reports two columns.
    if (rightEdge - leftEdge < MIN_GUTTER_POINTS) continue;

    // 🔴 AND THE GUTTER MUST BE NARROW BESIDE THE COLUMNS IT SEPARATES.
    //
    // This is the test that separates a two-column article from a term-and-
    // definition list, a schedule, or any tab-aligned pair — all of which have a
    // clean empty gutter and balanced sides, and all of which would be SCRAMBLED
    // by column order, since reading them that way returns every term first and
    // every definition afterwards, permanently unpaired.
    //
    // A typeset gutter is about one em against columns of forty; a tab stop
    // leaves a trough wider than the entries beside it. The ratio says which is
    // which without knowing anything about the subject or the language.
    //
    // Measuring the column widths from the content is why the earlier attempt
    // failed: "do the lines fill the column" is circular when the column is
    // defined by those same lines, and a list of uniformly short entries passes
    // it perfectly.
    const gutter = rightEdge - leftEdge;
    const leftWidth = leftEdge - Math.min(...left.map((l) => l.x));
    const rightWidth = Math.max(...rightLines.map(right)) - rightEdge;
    const narrower = Math.min(leftWidth, rightWidth);
    if (narrower <= 0 || gutter > narrower * MAX_GUTTER_SHARE) continue;

    const balance = Math.abs(leftShare - 0.5);
    // The reported split sits in the middle of the measured gutter rather than at
    // the scanned position, so the boundary does not depend on the step size.
    if (!best || balance < best.balance) best = { balance, split: (leftEdge + rightEdge) / 2 };
  }
  return best?.split ?? null;
}

/** Lines a column must hold before it is a column rather than a coincidence. */
const MIN_COLUMN_LINES = 4;
/** Points of genuinely empty space a gutter must span. About one em of body type. */
const MIN_GUTTER_POINTS = 12;
/** How wide a gutter may be against the narrower column it separates. */
const MAX_GUTTER_SHARE = 0.3;

/**
 * Lines in reading order: down the left column, then down the right.
 *
 * When there is no column split this is a plain top-to-bottom, left-to-right
 * sort — which is what a single-column page needs and what the current
 * extractor already approximates. The gain is entirely on the two-column pages,
 * where concatenation order produces alternating half-sentences.
 */
export function readingOrder(lines: readonly TextLine[], pageWidth: number): TextLine[] {
  const split = columnSplit(lines, pageWidth);
  const byPosition = (a: TextLine, b: TextLine) => a.y - b.y || a.x - b.x;
  if (split === null) return [...lines].sort(byPosition);
  const left = lines.filter((l) => right(l) <= split).sort(byPosition);
  const rightCol = lines.filter((l) => right(l) > split).sort(byPosition);
  return [...left, ...rightCol];
}

/**
 * Group lines into paragraphs.
 *
 * A new paragraph starts where the vertical gap grows beyond the line spacing
 * the paragraph has been using, or where the font height changes materially —
 * the second rule is what keeps a heading from being absorbed into the
 * paragraph beneath it.
 *
 * 🔴 THE SPACING BASELINE IS LEARNED PER GROUP, NOT PER PAGE. Course material
 * mixes single-spaced tables with double-spaced body text on one page, and a
 * page-wide average splits every row of the table into its own paragraph.
 */
export function groupParagraphs(lines: readonly TextLine[]): TextGroup[] {
  const groups: TextGroup[] = [];
  let current: TextLine[] = [];
  let spacing: number | null = null;

  const flush = () => {
    if (current.length === 0) return;
    groups.push({ ...unionBox(current), fontHeight: medianHeight(current), lines: current });
    current = [];
    spacing = null;
  };

  for (const line of lines) {
    const previous = current[current.length - 1];
    if (!previous) { current.push(line); continue; }
    const gap = line.y - bottom(previous);
    const heightChange = Math.abs(line.height - previous.height) > Math.max(previous.height * 0.25, 1);
    // A column break: the next line starts back at the top of the page.
    const wentUp = line.y < previous.y - previous.height;
    const expected = spacing ?? Math.max(previous.height * 0.6, 1.5);
    if (wentUp || heightChange || gap > expected * 1.8) {
      flush();
      current.push(line);
      continue;
    }
    if (gap > 0) spacing = spacing === null ? Math.max(gap, 0.5) : (spacing + gap) / 2;
    current.push(line);
  }
  flush();
  return groups;
}

function medianHeight(lines: readonly TextLine[]): number {
  const heights = lines.map((l) => l.height).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] ?? 0;
}

/**
 * Which groups are headings, and at what level.
 *
 * 🔴 STRUCTURAL SIGNALS ONLY — SIZE, LENGTH, POSITION. Never a keyword list.
 * A heuristic that looks for "Objectives" or "Assessment" works on the corpus it
 * was written against and fails silently on a law syllabus, an engineering lab
 * manual, or anything in another language. Relative type size is what every
 * discipline's documents have in common.
 *
 * The body size is the median over the page's own text, so a document set in
 * 9 pt and one set in 12 pt are judged against themselves.
 */
export function headingLevels(groups: readonly TextGroup[]): (number | null)[] {
  const sizes = groups
    .flatMap((g) => g.lines.map((l) => ({ chars: l.text.length, height: l.height })))
    .filter((s) => s.chars > 0);
  if (sizes.length === 0) return groups.map(() => null);
  // Weighted by characters: one 40 pt title must not move the body size.
  const total = sizes.reduce((sum, s) => sum + s.chars, 0);
  const sorted = [...sizes].sort((a, b) => a.height - b.height);
  let seen = 0;
  let bodyHeight = sorted[0]?.height ?? 0;
  for (const s of sorted) {
    seen += s.chars;
    if (seen >= total / 2) { bodyHeight = s.height; break; }
  }

  // Distinct heading sizes, largest first, become levels 1..n.
  const headingSizes = [...new Set(
    groups
      .filter((g) => isHeadingShape(g, bodyHeight))
      .map((g) => Math.round(g.fontHeight * 2) / 2),
  )].sort((a, b) => b - a);

  return groups.map((g) => {
    if (!isHeadingShape(g, bodyHeight)) return null;
    const index = headingSizes.indexOf(Math.round(g.fontHeight * 2) / 2);
    return index < 0 ? null : Math.min(index + 1, 6);
  });
}

/**
 * Heading shape: bigger than the body, and short.
 *
 * The length test carries as much weight as the size test. A pull quote or an
 * abstract set one point larger is not a heading, and treating it as one puts a
 * paragraph into every heading path beneath it.
 */
function isHeadingShape(group: TextGroup, bodyHeight: number): boolean {
  if (bodyHeight <= 0) return false;
  const text = group.lines.map((l) => l.text).join(" ").trim();
  if (text.length === 0 || text.length > 200) return false;
  if (group.lines.length > 3) return false;
  return group.fontHeight >= bodyHeight * 1.15;
}

/** Viewport points to unit-relative 0..1, clamped. Producers call this once. */
export function toRelative(box: Box, pageWidth: number, pageHeight: number): Box {
  if (pageWidth <= 0 || pageHeight <= 0) return { height: 0, width: 0, x: 0, y: 0 };
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const x = clamp(box.x / pageWidth);
  const y = clamp(box.y / pageHeight);
  return {
    height: clamp(bottom(box) / pageHeight) - y,
    width: clamp(right(box) / pageWidth) - x,
    x,
    y,
  };
}
