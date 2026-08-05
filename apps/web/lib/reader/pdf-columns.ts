// Putting a page's text into READING order when the page is set in columns.
//
// 🔴 Why this exists. A PDF's text arrives in content-stream order, and the
// only thing the reader knew about it was the baseline: items sharing a
// baseline became one line. On a two-column page that silently welds the left
// column to the right one, so a real journal article came out as
// "were atPatients'characteristics and GDMT were summarized for least 18 years
// of age" — every line a splice of two different sentences. Measured on a real
// Journal of Cardiac Failure article where all 13 pages are two-column.
//
// Everything here is geometry: where ink is and is not. No word lists, no
// language rules, no page-size assumptions (CLAUDE.md — a two-column layout is
// as common in law reviews and engineering journals as in medicine).

import type { PdfTextItem } from "./pdf-blocks";

/** Bins across the text width. Fine enough to find a 2% gutter, coarse enough
 *  that a hair of overlap does not close one. */
const BINS = 240;
/** An empty channel narrower than this fraction of the text width is just
 *  word spacing, not a gutter. */
const MIN_GUTTER_WIDTH = 0.022;
/** Gutters are only believed away from the margins — the blank strip beside a
 *  short last line is not a column break. */
const GUTTER_ZONE: readonly [number, number] = [0.15, 0.85];
/** A bin still counts as empty if this few of the page's lines reach into it,
 *  which is what lets a full-width title cross a gutter without hiding it. */
const QUIET_FRACTION = 0.1;
/** Each column must hold at least this share of the page's items, or the "gap"
 *  was an artefact — an indented block, a short table — and not a column. */
const MIN_COLUMN_SHARE = 0.15;
/** Below this many items there is not enough evidence to call a page columnar. */
const MIN_ITEMS = 12;
/** How much of its own band a typical line must span for the group to read as
 *  running text rather than a column of table cells. */
const MIN_COLUMN_FILL = 0.55;
/** A column of running text is many lines deep. Two or three rows beside two or
 *  three rows is a table, whatever its proportions. */
const MIN_COLUMN_LINES = 5;
/** How alike two columns' widths must be. A page set in columns uses one
 *  measure for both; a table sizes each column to what it holds. */
const MIN_COLUMN_BALANCE = 0.65;

interface Span {
  item: PdfTextItem;
  left: number;
  right: number;
  y: number;
}

function spanOf(item: PdfTextItem): Span {
  const left = item.transform[4] ?? 0;
  return { item, left, right: left + (item.width ?? 0), y: item.transform[5] ?? 0 };
}

/** The widest empty vertical channel in the middle of the page, or null when the
 *  page has none. Measured over DISTINCT BASELINES rather than raw items so that
 *  a handful of full-width lines cannot fill a channel that most of the page
 *  leaves open. */
function findGutter(spans: readonly Span[], pageLeft: number, width: number): { start: number; end: number } | null {
  const baselines = new Set(spans.map((span) => Math.round(span.y)));
  const quiet = Math.floor(baselines.size * QUIET_FRACTION);
  const cover: Set<number>[] = Array.from({ length: BINS }, () => new Set<number>());

  for (const span of spans) {
    const from = Math.max(0, Math.floor(((span.left - pageLeft) / width) * BINS));
    const to = Math.min(BINS - 1, Math.ceil(((span.right - pageLeft) / width) * BINS));
    const baseline = Math.round(span.y);
    for (let bin = from; bin <= to; bin += 1) cover[bin]?.add(baseline);
  }

  let best: { start: number; end: number } | null = null;
  let run = -1;
  for (let bin = 0; bin <= BINS; bin += 1) {
    const empty = bin < BINS && (cover[bin]?.size ?? 0) <= quiet;
    if (empty) {
      if (run < 0) run = bin;
      continue;
    }
    if (run >= 0) {
      const startFraction = run / BINS;
      const endFraction = bin / BINS;
      const centre = (startFraction + endFraction) / 2;
      const wide = endFraction - startFraction >= MIN_GUTTER_WIDTH;
      const centred = centre >= GUTTER_ZONE[0] && centre <= GUTTER_ZONE[1];
      // A run that reaches the very edge is a margin, not a gutter.
      const inside = run > 0 && bin < BINS;
      if (wide && centred && inside && (best === null || endFraction - startFraction > (best.end - best.start) / width)) {
        best = { start: pageLeft + startFraction * width, end: pageLeft + endFraction * width };
      }
      run = -1;
    }
  }
  return best;
}

/** The lines of one group, rebuilt by baseline. */
function rowsOf(spans: readonly Span[]): { left: number; right: number }[] {
  const byBaseline = new Map<number, { left: number; right: number }>();
  for (const span of spans) {
    const key = Math.round(span.y);
    const row = byBaseline.get(key);
    if (row) {
      row.left = Math.min(row.left, span.left);
      row.right = Math.max(row.right, span.right);
    } else byBaseline.set(key, { left: span.left, right: span.right });
  }
  return [...byBaseline.values()];
}

/** Do these two groups read like the two columns of a page of text, rather than
 *  the two halves of a table?
 *
 *  Two measurements, both of width, neither of them of words:
 *
 *   1. **Columns of text are near enough the same width.** A page is divided
 *      into columns of one measure; a table is divided by what its cells hold,
 *      so a narrow "Date" column sits beside a wide "Topic" one.
 *   2. **A line of running text spans most of its column.** Wrapped prose comes
 *      back to the left margin line after line; table cells stop where their
 *      content stops.
 *
 *  Both are needed. A table whose cells happen to be evenly sized passes the
 *  second on its own, and a figure caption beside a column passes the first. */
function readsAsTextColumns(first: readonly Span[], second: readonly Span[]): boolean {
  const rows = [rowsOf(first), rowsOf(second)];
  if (rows.some((group) => group.length < MIN_COLUMN_LINES)) return false;

  const bands = rows.map((group) => Math.max(...group.map((row) => row.right)) - Math.min(...group.map((row) => row.left)));
  if (bands.some((band) => band <= 0)) return false;
  const [firstBand = 0, secondBand = 0] = bands;
  if (Math.min(firstBand, secondBand) / Math.max(firstBand, secondBand) < MIN_COLUMN_BALANCE) return false;

  return rows.every((group, index) => {
    const band = bands[index] ?? 0;
    const widths = group.map((row) => (row.right - row.left) / band).sort((a, b) => a - b);
    return (widths[Math.floor(widths.length / 2)] ?? 0) >= MIN_COLUMN_FILL;
  });
}

/** A page's items, grouped and ordered the way a person reads them: each column
 *  top to bottom, and anything spanning the full width kept in its place between
 *  them. A single-column page comes back as one group, unchanged.
 *
 *  Groups, not a flat list, because the caller has to know where one column ends
 *  — the jump from the foot of a column back to the top of the next is not a
 *  paragraph gap and must not be measured as one. */
export function readingOrderGroups(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const printable = items.filter((item) => item.str.trim().length > 0);
  if (printable.length < MIN_ITEMS) return [printable];

  const spans = printable.map(spanOf);
  const pageLeft = Math.min(...spans.map((span) => span.left));
  const pageRight = Math.max(...spans.map((span) => span.right));
  const width = pageRight - pageLeft;
  if (width <= 0) return [printable];

  const gutter = findGutter(spans, pageLeft, width);
  if (!gutter) return [printable];

  const centre = (gutter.start + gutter.end) / 2;
  const left: Span[] = [];
  const right: Span[] = [];
  const spanning: Span[] = [];
  for (const span of spans) {
    if (span.left < gutter.start && span.right > gutter.end) spanning.push(span);
    else if ((span.left + span.right) / 2 < centre) left.push(span);
    else right.push(span);
  }

  const share = printable.length * MIN_COLUMN_SHARE;
  if (left.length < share || right.length < share) return [printable];

  // 🔴 A TABLE ALSO HAS A GUTTER, and reading a table down its columns
  // scrambles every row — the course-schedule page of a real syllabus came out
  // as "MHC structure 11-11:50 -function, CT / 8/18antigenDr. Hole". The
  // difference is not the gap, it is what fills it: flowing text runs to the
  // edge of its column line after line, while table cells are short and ragged
  // inside the same band. Measured as WIDTH, never as a character count — a
  // Chinese or Arabic column fills its measure exactly like a Latin one.
  if (!readsAsTextColumns(left, right)) return [printable];

  // Top of the page is the HIGHEST y in PDF space, so top-to-bottom is
  // descending. Full-width lines cut the page into bands; within a band the
  // columns are read in turn.
  const byTop = (a: Span, b: Span): number => b.y - a.y;
  const separators = [...spanning].sort(byTop);
  const bandOf = (span: Span): number => separators.filter((separator) => separator.y > span.y).length;

  const rtl = printable.filter((item) => item.dir === "rtl").length * 2 > printable.length;
  const columns = rtl ? [right, left] : [left, right];

  const groups: PdfTextItem[][] = [];
  // Consecutive full-width lines — a title runs to three of them — are held and
  // emitted together, so they stay ONE block instead of one block per line.
  let pending: Span[] = [];
  const flushPending = (): void => {
    if (pending.length === 0) return;
    groups.push([...pending].sort(byTop).map((span) => span.item));
    pending = [];
  };

  for (let band = 0; band <= separators.length; band += 1) {
    const inBand = columns
      .map((column) => column.filter((span) => bandOf(span) === band).sort(byTop))
      .filter((column) => column.length > 0);
    if (inBand.length > 0) {
      flushPending();
      for (const column of inBand) groups.push(column.map((span) => span.item));
    }
    const separator = separators[band];
    if (separator) pending.push(separator);
  }
  flushPending();
  return groups.filter((group) => group.length > 0);
}
