/**
 * EXPERIMENT — can the geometry we ALREADY persist recover a table, with no
 * layout model at all?
 *
 * 🔴 THIS IS NOT PRODUCTION ARCHITECTURE AND MUST NOT BE IMPORTED BY ANYTHING.
 * It exists so the numbers in `docs/table-lattice-decision.md` can be re-derived
 * on any machine from the file alone. The production change it argues for lives
 * in the parser (`lib/pdf/structure.ts`), not here.
 *
 * The question it answers is narrow and two-sided. Recall alone is worthless
 * here: inferring a grid over ordinary prose relabels every value in it, which
 * is why `structure.ts` refused to infer tables in the first place. So every
 * page is judged BOTH ways — a schedule page must yield a grid, and a prose page
 * must yield nothing.
 *
 * Run from apps/web:
 *   npx tsx scripts/table-lattice-experiment.mts <file.pdf> [--rows]
 */

import { readFileSync } from "node:fs";

import { clusterLines, readRulings, tableFromRegion, type PlacedText, type Ruling } from "../lib/pdf/table-grid.ts";

const path = process.argv[2];
if (!path) { console.error("usage: table-lattice-experiment.mts <file.pdf> [--rows]"); process.exit(2); }
const verbose = process.argv.includes("--rows");

/** Merge overlapping intervals. PURE. */
function merge(spans: [number, number][]): [number, number][] {
  const sorted = spans.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return [];
  const out: [number, number][] = [sorted[0]!];
  for (const [s, e] of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    if (s <= last[1] + 2) { if (e > last[1]) last[1] = e; continue; }
    out.push([s, e]);
  }
  return out;
}

/**
 * The Y bands where at least `min` DISTINCT column positions coexist.
 *
 * 🔴 TWO PROPERTIES OF REAL PDFs DEFEAT THE OBVIOUS VERSIONS OF THIS.
 *   1. A page border is a drawn rectangle, so "the bounding box of every ruling"
 *      is the whole page ON EVERY PAGE. Handing that to `tableFromRegion` makes
 *      a table that ends mid-page fail the 60%-of-region coverage test and come
 *      back as one column — measured: that is how Exam 4 was lost.
 *   2. That border is emitted FIVE TO SEVEN TIMES over, so a sweep that counts
 *      raw rulings is already at depth 10 before a table exists.
 * Clustering to distinct positions first fixes both. `min = 3` is not a tuned
 * threshold: three column positions bound two columns, and two columns is what
 * `gridWithin` already requires before it will call something a grid.
 *
 * PURE.
 */
export function columnBands(rulings: readonly Ruling[], min = 3): { y0: number; y1: number }[] {
  const verticals = rulings.filter((r) => !r.horizontal);
  const events: { at: number; delta: number }[] = [];
  for (const x of clusterLines(verticals.map((r) => r.at))) {
    const spans = verticals
      .filter((r) => Math.abs(r.at - x) <= 2.5)
      .map((r) => [Math.min(r.from, r.to), Math.max(r.from, r.to)] as [number, number]);
    for (const [a, b] of merge(spans)) { events.push({ at: a, delta: 1 }); events.push({ at: b, delta: -1 }); }
  }
  events.sort((a, b) => a.at - b.at || b.delta - a.delta);
  const bands: { y0: number; y1: number }[] = [];
  let depth = 0;
  let open: number | null = null;
  for (const e of events) {
    const was = depth;
    depth += e.delta;
    if (was < min && depth >= min) open = e.at;
    else if (was >= min && depth < min && open !== null) { bands.push({ y0: open, y1: e.at }); open = null; }
  }
  return bands.filter((b) => b.y1 - b.y0 > 20);
}

/** The X extent of the horizontal rules living inside a band. PURE. */
export function bandBox(rulings: readonly Ruling[], band: { y0: number; y1: number }) {
  const inside = rulings.filter((r) => r.horizontal && r.at >= band.y0 - 3 && r.at <= band.y1 + 3);
  if (inside.length < 2) return null;
  return { x0: Math.min(...inside.map((r) => r.from)), x1: Math.max(...inside.map((r) => r.to)), y0: band.y0, y1: band.y1 };
}

/**
 * Drop columns empty in EVERY row.
 *
 * The page border contributes one such column at each end, and it is not
 * cosmetic: `headerRowsOf` requires every cell of the first row to carry text,
 * so an empty border column silently costs the table its header — and with it
 * the column names that tell a reader which cell held the date.
 *
 * PURE.
 */
export function trimEmptyColumns(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((r) => r.length), 0);
  const keep: number[] = [];
  for (let c = 0; c < width; c += 1) if (rows.some((r) => (r[c] ?? "").trim())) keep.push(c);
  return rows.map((r) => keep.map((c) => r[c] ?? ""));
}

/** A column the table itself labels as dates. Structural, not subject matter. */
function dateColumn(header: readonly string[]): number {
  return header.findIndex((h) => /^\s*(date|day|due|when|deadline)\b/i.test(h));
}

/**
 * `M-D` read from a cell KNOWN to sit in a date column.
 *
 * 🔴 THE WHITESPACE STRIP IS SAFE ONLY BECAUSE OF THE COLUMN. A 20pt-wide cell
 * word-wraps `9-28` into `9-2` / `8`, which joins as `"9-2 8"`. Repairing that
 * over free prose would be reckless; inside the cell the table's own header
 * calls "Date", it is the only reading available. This is exactly the ambiguity
 * the grid removes: `8-17` and `8:-9:50 CST/ 9-10:50 EST` are neighbouring
 * TOKENS in the flattened page and different CELLS in the recovered one.
 *
 * PURE.
 */
function readCellDate(cell: string, year: number): string | null {
  const m = /^(\d{1,2})[-/](\d{1,2})$/.exec(cell.replace(/\s+/g, ""));
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const bytes = new Uint8Array(readFileSync(path));
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;

const tables: { page: number; rows: string[][] }[] = [];
console.log(`\n${"═".repeat(86)}`);
console.log(`RULING-LATTICE TABLE RECOVERY — no layout model, ${doc.numPages} pages`);
console.log(`${"═".repeat(86)}`);

for (let n = 1; n <= doc.numPages; n += 1) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: PlacedText[] = [];
  for (const item of content.items) {
    if (!("str" in item) || item.str.length === 0) continue;
    const t = pdfjs.Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(t[2], t[3]) || item.height || 0;
    items.push({
      height,
      text: item.str,
      width: item.width || Math.abs(t[0]) * item.str.length * 0.5,
      x: t[4],
      y: t[5] - height,
    });
  }
  const rulings = await readRulings(pdfjs as never, page as never, viewport);
  const found: string[] = [];
  for (const band of columnBands(rulings)) {
    const box = bandBox(rulings, band);
    if (!box) continue;
    const table = tableFromRegion(box, rulings, items);
    if (!table) continue;
    const rows = trimEmptyColumns(table.rows);
    if ((rows[0]?.length ?? 0) < 2) continue;
    tables.push({ page: n, rows });
    found.push(`${rows.length}r × ${rows[0]!.length}c`);
  }
  console.log(`  page ${String(n).padStart(3)}  ${found.length ? found.join("  ") : "—"}`);
  page.cleanup();
}
await doc.cleanup();

// ── the two-sided result ─────────────────────────────────────────────────────
const schedule = tables.filter((t) => dateColumn(t.rows[0] ?? []) >= 0);
console.log(`\n${"─".repeat(86)}`);
console.log(`tables recovered      : ${tables.length}  on pages ${[...new Set(tables.map((t) => t.page))].join(", ")}`);
console.log(`  with a date column  : ${schedule.length}   (the rest are grading scales, penalty tables, …)`);

const year = Number(process.env.SCHEDULE_YEAR ?? new Date().getUTCFullYear());
let rowsSeen = 0;
const sessions: { date: string | null; page: number; what: string }[] = [];
for (const t of schedule) {
  const header = t.rows[0]!;
  const dc = dateColumn(header);
  const topic = header.findIndex((h) => /^\s*(topic|session|activity|title|subject)\b/i.test(h));
  for (const row of t.rows.slice(1)) {
    if (!row.some((c) => c.trim())) continue;
    rowsSeen += 1;
    sessions.push({ date: readCellDate(row[dc] ?? "", year), page: t.page, what: (topic >= 0 ? row[topic] : row.join(" ")) ?? "" });
  }
}
const dated = sessions.filter((s) => s.date).length;
console.log(`session rows          : ${rowsSeen}`);
console.log(`  date cell resolved  : ${dated}/${rowsSeen}${dated === rowsSeen ? "" : "   🔴 unresolved rows below"}`);
for (const s of sessions.filter((x) => !x.date).slice(0, 8)) console.log(`     🔴 p${s.page} "${s.what.slice(0, 60)}"`);

for (const [label, re] of [["assessments (Exam N)", /\bExam\s*\d/i], ["assessments (iRAT N)", /\biRAT\s*\d/i]] as const) {
  const hits = sessions.filter((s) => re.test(s.what));
  console.log(`\n${label}: ${hits.length}`);
  for (const h of hits) console.log(`   ${h.date ?? "NO DATE"}  p${String(h.page).padStart(2)}  ${h.what.replace(/\s+/g, " ").slice(0, 62)}`);
}

if (verbose) {
  for (const t of tables) {
    console.log(`\n── page ${t.page} ${"─".repeat(66)}`);
    for (const row of t.rows) console.log("   | " + row.map((c) => c.replace(/\s+/g, " ").slice(0, 15).padEnd(15)).join(" | "));
  }
}
process.exit(0);
