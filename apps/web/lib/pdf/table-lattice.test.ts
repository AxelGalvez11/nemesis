import assert from "node:assert/strict";
import { test } from "node:test";

import { reconstructRegion, type PlacedText, type Ruling } from "./table-grid";
import { columnBands, latticeRegions, trimEmptyColumns } from "./table-lattice";
import { validateTable } from "./table-validate";

/** A page border, as PDFs actually draw it: a rectangle, emitted several times over. */
function border(times = 6): Ruling[] {
  const out: Ruling[] = [];
  for (let i = 0; i < times; i += 1) {
    out.push({ at: 72, from: 72, horizontal: true, to: 540 });
    out.push({ at: 720, from: 72, horizontal: true, to: 540 });
    out.push({ at: 72, from: 72, horizontal: false, to: 720 });
    out.push({ at: 540, from: 72, horizontal: false, to: 720 });
  }
  return out;
}

/** A ruled table: `cols` column positions and `rows` row lines over a y range. */
function grid(xs: number[], ys: number[]): Ruling[] {
  const out: Ruling[] = [];
  for (const y of ys) out.push({ at: y, from: xs[0]!, horizontal: true, to: xs[xs.length - 1]! });
  for (const x of xs) out.push({ at: x, from: ys[0]!, horizontal: false, to: ys[ys.length - 1]! });
  return out;
}

function text(items: [string, number, number, number?][]): PlacedText[] {
  return items.map(([t, x, y, w]) => ({ height: 10, text: t, width: w ?? t.length * 5, x, y }));
}

const PAGE = { height: 792, width: 612 };

function judge(region: { x0: number; y0: number; x1: number; y1: number }, rulings: Ruling[], items: PlacedText[]) {
  const built = reconstructRegion(region, rulings, items);
  if (!built) return null;
  const rows = trimEmptyColumns(built.table.rows);
  return {
    built,
    rows,
    verdict: validateTable({
      grid: built.grid,
      inRegion: built.inRegion,
      page: PAGE,
      placed: built.placed,
      region,
      rulings,
      table: { headerRows: 0, rows },
    }),
  };
}

// ── region detection ─────────────────────────────────────────────────────────

test("a page border alone is not a table, however many times it is drawn", () => {
  // 🔴 THE DEFECT: "the bounding box of every ruling" is the whole page on EVERY page, because the
  // border is a rectangle. Handing that to the grid builder made a table that ends mid-page fail
  // its coverage test and come back as one column — which is how a real syllabus's fourth exam
  // disappeared off the page where the schedule stops and prose resumes.
  assert.deepEqual(latticeRegions(border()), [], "a bare border yields no region at all");
});

test("drawing the same line six times does not inflate the structural evidence", () => {
  // 🔴 THE SWEEP MUST COUNT DISTINCT COLUMN POSITIONS, NOT RULINGS. A border emitted six times is
  // 24 rulings; counting those puts the sweep at depth 10 before any table exists, so every page
  // in the corpus would report a full-page table.
  const once = columnBands(border(1));
  const many = columnBands(border(6));
  assert.deepEqual(once, many, "six copies of one border must read exactly as one");
  assert.equal(many.length, 0);
});

test("a table occupying part of a page is found at its own extent, not the page's", () => {
  const rulings = [...border(), ...grid([100, 200, 300, 400], [100, 130, 160, 190])];
  const regions = latticeRegions(rulings);
  assert.equal(regions.length, 1);
  assert.ok(regions[0]!.y0 >= 99 && regions[0]!.y1 <= 191, JSON.stringify(regions[0]));
});

// ── the safety invariant ─────────────────────────────────────────────────────

test("a partial-page table leaves the prose below it untouched", () => {
  // The row this models is the one that held Exam 4: a table at the top, paragraphs beneath.
  const rulings = [...border(), ...grid([100, 200, 300], [100, 130, 160])];
  const items = text([
    ["Date", 110, 105], ["Topic", 210, 105],
    ["8-17", 110, 135], ["Exam 1", 210, 135],
    ["Student Academic Accountability follows on this page.", 90, 400, 300],
  ]);
  const region = latticeRegions(rulings)[0]!;
  const result = judge(region, rulings, items)!;
  assert.equal(result.verdict.ok, true, result.verdict.reason);
  const prose = items.find((i) => i.text.startsWith("Student"))!;
  assert.ok(!result.built.placed.has(prose), "prose below the table must not be claimed by it");
});

test("a rejected candidate suppresses nothing — a false table costs a table, never text", () => {
  // A paragraph lying across a drawn rule: the crossing proves the grid contradicts the content.
  const rulings = [...border(), ...grid([100, 300, 500], [100, 140, 180])];
  const items = text([
    ["one long sentence spanning the whole width", 110, 145, 380],   // lies across the rule at 300
    ["a", 110, 110], ["b", 310, 110],                                // so row one still fills both columns
  ]);
  const region = latticeRegions(rulings)[0]!;
  const result = judge(region, rulings, items)!;
  assert.equal(result.verdict.ok, false);
  assert.equal(result.verdict.reason, "text-crosses-column-rule");
});

test("a merged cell crosses an UNDRAWN boundary and is allowed", () => {
  // 🔴 OMITTING THIS DISTINCTION REJECTED TEN REAL TABLES IN ONE FILE, including every page of its
  // schedule. A merged cell spans columns precisely by not drawing the rule between them.
  const rulings: Ruling[] = [
    ...border(),
    ...[100, 130, 160, 190].map((y) => ({ at: y, from: 100, horizontal: true, to: 400 })),
    { at: 100, from: 100, horizontal: false, to: 190 },
    { at: 400, from: 100, horizontal: false, to: 190 },
    // 🔴 THE COLUMN RULE IS DRAWN FOR ROWS ONE AND THREE AND OMITTED FOR ROW TWO — which is
    // exactly how a merged cell is expressed, and why the boundary still belongs to the grid.
    { at: 250, from: 100, horizontal: false, to: 130 },
    { at: 250, from: 160, horizontal: false, to: 190 },
  ];
  const items = text([
    ["Date", 110, 105], ["Topic", 260, 105],
    ["August 17, 2026 — Exam 2", 110, 135, 280],   // one cell spanning both columns
    ["8-24", 110, 165], ["Lecture", 260, 165],
  ]);
  const region = latticeRegions(rulings)[0]!;
  const result = judge(region, rulings, items)!;
  assert.equal(result.verdict.ok, true, `merged cell rejected as ${result.verdict.reason}`);
});

test("a region outside the page is refused — that is a broken transform, not a table", () => {
  const rulings = grid([100, 2000, 4000], [100, 200, 300]);
  const items = text([["a", 110, 150], ["b", 2100, 150], ["c", 110, 250], ["d", 2100, 250]]);
  const region = latticeRegions(rulings)[0]!;
  const result = judge(region, rulings, items);
  assert.equal(result?.verdict.ok, false);
  assert.equal(result?.verdict.reason, "outside-page");
});

test("suppression covers exactly what the grid seated, so nothing can vanish", () => {
  const rulings = [...border(), ...grid([100, 200, 300], [100, 130, 160])];
  const items = text([
    ["Date", 110, 105], ["Topic", 210, 105],
    ["8-17", 110, 135], ["Exam 1", 210, 135],
  ]);
  const region = latticeRegions(rulings)[0]!;
  const result = judge(region, rulings, items)!;
  assert.equal(result.built.placed.size, result.built.inRegion.length);
  assert.equal(result.verdict.coverage, 1);
});

test("empty border columns are trimmed, or the header is silently lost", () => {
  // `headerRowsOf` needs every cell of row 0 filled; an empty column at each end defeats it.
  const rows = trimEmptyColumns([["", "Date", "Topic", ""], ["", "8-17", "Exam 1", ""]]);
  assert.deepEqual(rows, [["Date", "Topic"], ["8-17", "Exam 1"]]);
});

// ── frame-welded tables: the deeper sub-bands ────────────────────────────────

/**
 * The measured geometry of a real pharmacology lecture printed two slides to a
 * page: each slide is a drawn frame (two vertical positions alive down most of
 * the page), and a shaded dosing table lives inside the lower slide. At three
 * coexisting positions the sweep welds both slides into one region; the table's
 * own five column positions only coexist across its rows.
 */
function framedSlidePage(): Ruling[] {
  const out: Ruling[] = [];
  // Two slide frames sharing x edges, stacked: rectangles become four rules each.
  for (const [top, bottom] of [[94, 364], [428, 765]] as const) {
    out.push({ at: top, from: 126, horizontal: true, to: 486 });
    out.push({ at: bottom, from: 126, horizontal: true, to: 486 });
    out.push({ at: 126, from: top, horizontal: false, to: bottom });
    out.push({ at: 486, from: top, horizontal: false, to: bottom });
  }
  // A decorative vertical (a slide-template flourish) that keeps a third
  // position alive across both slides — the ingredient that welds the band.
  out.push({ at: 440, from: 100, horizontal: false, to: 760 });
  // The table inside the lower slide: shaded cells emit their edges as rules.
  out.push(...grid([138, 225, 306, 387, 468], [516, 545, 574, 603, 629]));
  return out;
}

test("a table welded to its slide frame is still offered as its own region", () => {
  const regions = latticeRegions(framedSlidePage());
  assert.ok(regions.length >= 2, `expected the welded parent plus a tighter sub-band, got ${regions.length}`);
  // The parent — the slide frame welded to the table inside it — comes first,
  // so every region that validates today still wins before any sub-band is
  // tried. It spans the frame, not just the table.
  assert.ok(regions[0]!.y1 - regions[0]!.y0 > 250, "the shallow welded band leads the list");
  // Somewhere after it: the table's own band, tight around its rows.
  const tight = regions.find((r) => Math.abs(r.y0 - 516) < 8 && Math.abs(r.y1 - 629) < 8);
  assert.ok(tight, "no candidate isolates the table's own rows");
});

test("the tight sub-band reconstructs the table the welded band could not", () => {
  const rulings = framedSlidePage();
  const items = text([
    ["Drug", 145, 520], ["Start", 230, 520], ["Max", 311, 520], ["Strength", 392, 520],
    ["CanaA", 145, 550], ["100 mg", 230, 550], ["300 mg", 311, 550], ["100, 300", 392, 550],
    ["DapaB", 145, 580], ["5 mg", 230, 580], ["10 mg", 311, 580], ["5, 10", 392, 580],
    ["ThirdC", 145, 608], ["20 mg", 230, 608], ["40 mg", 311, 608], ["20, 40", 392, 608],
  ]);
  const regions = latticeRegions(rulings);
  const welded = judge(regions[0]!, rulings, items);
  assert.equal(welded?.verdict.ok ?? false, false, "the welded band must not validate");
  const tight = regions.find((r) => Math.abs(r.y0 - 516) < 8 && Math.abs(r.y1 - 629) < 8)!;
  const result = judge(tight, rulings, items)!;
  assert.equal(result.verdict.ok, true, `tight band rejected as ${result.verdict.reason}`);
  assert.deepEqual(result.rows[0], ["Drug", "Start", "Max", "Strength"]);
  assert.deepEqual(result.rows[1], ["CanaA", "100 mg", "300 mg", "100, 300"]);
});

test("a frameless table is proposed once, not once per depth", () => {
  // Five column positions coexist over the whole band, so the same interval
  // recurs at thresholds 3, 4 and 5 — and must be offered exactly once.
  const rulings = [...border(), ...grid([100, 180, 260, 340, 420], [100, 130, 160, 190])];
  const regions = latticeRegions(rulings);
  assert.equal(regions.length, 1, `expected one deduplicated region, got ${regions.length}`);
});
