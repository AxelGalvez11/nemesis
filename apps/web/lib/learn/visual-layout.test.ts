// The three defects that shipped past every test, turned into assertions.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `an inhibitor sits beside the step it acts on, not above it`.
// A cascade with a branch drew as one straight column, so the inhibitor read as the third step of a
// five-step chain. Every number in it was right. Nothing failed. It was only wrong to look at, and a
// screenshot nobody re-examines is not a regression test.
//
// 🔴 SO EVERY CHECK HERE IS ABOUT SPACE, NOT VALUE: does this box overlap that box, does this label
// overlap that label, is this mark inside the angle it marks, is anything outside the frame.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { at, present } from "@/lib/test-support";
import test from "node:test";

import type { ConstructionVisual, FlowVisual, TimelineVisual } from "./canvas-visual";
import {
  layoutConstruction,
  layoutFlow,
  layoutTimeline,
  textWidth,
  truncateToWidth,
  VISUAL_FIGURE_CLASS,
  VISUAL_HEIGHT,
  VISUAL_WIDTH,
} from "./visual-layout";

// The cascade from the gallery: a linear chain with one inhibitor acting on its third step.
const CASCADE: FlowVisual = {
  edges: [
    { from: "ligand", label: "binds", to: "receptor" },
    { from: "receptor", polarity: "increases", to: "kinase" },
    { from: "drug", polarity: "decreases", to: "kinase" },
    { from: "kinase", polarity: "increases", to: "tf" },
  ],
  kind: "relationship",
  learningGoal: "Follow what activates and what blocks",
  nodes: [
    { id: "ligand", label: "Ligand" },
    { id: "receptor", label: "Receptor" },
    { id: "drug", label: "Inhibitor" },
    { id: "kinase", label: "Kinase" },
    { id: "tf", label: "Transcription factor" },
  ],
};

function box(layout: ReturnType<typeof layoutFlow>, id: string) {
  const found = layout.boxes.find((entry) => entry.id === id);
  assert.ok(found, `no box for ${id}`);
  return found;
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to;
}

// ─────────────────────────────────────────────────────────────────── relationship

test("🔴 an inhibitor sits beside the step it acts on, not above it in the chain", () => {
  const layout = layoutFlow(CASCADE);
  // The defect: every node in one column, so a branch was drawn as a link in the chain.
  assert.equal(box(layout, "drug").rank, box(layout, "receptor").rank, "the inhibitor is not level with the step it competes with");
  assert.notEqual(box(layout, "drug").cx, box(layout, "receptor").cx, "two nodes on one row landed on the same x");
  // And it is one row above what it acts on, so its edge is a short diagonal rather than a long one.
  assert.equal(box(layout, "kinase").rank, box(layout, "drug").rank + 1);
});

test("no two boxes on the same row overlap, and none leaves the frame", () => {
  const layout = layoutFlow(CASCADE);
  for (const a of layout.boxes) {
    assert.ok(a.cx - a.width / 2 >= 0, `${a.id} runs off the left edge`);
    assert.ok(a.cx + a.width / 2 <= VISUAL_WIDTH, `${a.id} runs off the right edge`);
    assert.ok(a.cy + a.height / 2 <= layout.height, `${a.id} runs below the frame`);
    for (const b of layout.boxes) {
      if (a.id === b.id || a.rank !== b.rank) continue;
      assert.ok(
        !overlaps({ from: a.cx - a.width / 2, to: a.cx + a.width / 2 }, { from: b.cx - b.width / 2, to: b.cx + b.width / 2 }),
        `${a.id} and ${b.id} overlap`,
      );
    }
  }
});

test("a plain chain still draws as one centred column", () => {
  // The branch layout must not have cost the ordinary case, which is most diagrams.
  const layout = layoutFlow({
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    kind: "relationship",
    learningGoal: "In order",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
  });
  assert.deepEqual(layout.boxes.map((entry) => entry.rank), [0, 1, 2]);
  assert.equal(new Set(layout.boxes.map((entry) => entry.cx)).size, 1, "a straight chain drifted sideways");
});

test("🔴 an edge that skips a row is bowed around the boxes it would otherwise cross", () => {
  // Ranking from the end makes this rare, not impossible: a node feeding both the next step and the
  // last one still spans two rows, and a straight line there goes through a labelled box.
  const layout = layoutFlow({
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "a", to: "c" }],
    kind: "relationship",
    learningGoal: "One shortcut",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
  });
  const skipping = layout.edges.find((edge) => edge.path.includes("C"));
  assert.ok(skipping, "the two-row edge was drawn straight");
  // The control points are what hold the curve clear of the middle row.
  const controlX = Number(at(at(present(skipping, "the two-row edge").path.split("C "), 1).split(" ")));
  const middle = box(layout, "b");
  assert.ok(
    controlX < middle.cx - middle.width / 2 || controlX > middle.cx + middle.width / 2,
    `the curve was steered to ${controlX}, inside the box it has to miss`,
  );
});

test("a cycle produces a drawing rather than hanging", () => {
  // There is no longest path in a loop, so the ranking has to stop by itself.
  const layout = layoutFlow({
    edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
    kind: "relationship",
    learningGoal: "Round and round",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  });
  assert.equal(layout.boxes.length, 2);
  assert.equal(layout.edges.length, 2);
});

test("a node acting on itself is drawn as a loop rather than a line of no length", () => {
  const layout = layoutFlow({
    edges: [{ from: "a", to: "a" }, { from: "a", to: "b" }],
    kind: "relationship",
    learningGoal: "Self-reinforcing",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  });
  const self = at(layout.edges);
  assert.match(self.path, /^M .* C /, "a self-edge was not drawn as a curve");
});

test("a long node label is cut to its box rather than running past it", () => {
  const layout = layoutFlow({
    edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }],
    kind: "relationship",
    learningGoal: "Two into one",
    nodes: [
      { id: "a", label: "A name far too long to fit inside half a frame" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
  });
  const wide = box(layout, "a");
  assert.match(wide.label, /…$/);
  assert.ok(textWidth(wide.label, 14) <= wide.width);
});

// ─────────────────────────────────────────────────────────────────── timeline

const REPUBLIC: TimelineVisual = {
  events: [
    { at: -49, atLabel: "49 BCE", label: "Rubicon" },
    { at: -44, atLabel: "44 BCE", label: "Caesar killed" },
    { at: -31, atLabel: "31 BCE", label: "Actium", uncertain: true },
    { at: -27, atLabel: "27 BCE", label: "Principate", until: -14 },
  ],
  kind: "timeline",
  learningGoal: "Place the events in order",
  unit: "years",
};

test("🔴 two labels four years apart do not print on top of each other", () => {
  const layout = layoutTimeline(REPUBLIC);
  for (const a of layout.marks) {
    for (const b of layout.marks) {
      if (a.index >= b.index) continue;
      if (a.axisY !== b.axisY || a.tier !== b.tier) continue;
      assert.ok(!overlaps(a.extent, b.extent), `"${a.label}" and "${b.label}" overlap on the same tier`);
    }
  }
  // And the way they were separated is vertical, so nothing was shrunk or dropped.
  assert.ok(Math.max(...layout.marks.map((mark) => mark.tier)) > 0, "no label needed lifting, so this fixture stopped testing anything");
});

test("every label stays inside the frame and above its axis", () => {
  const layout = layoutTimeline(REPUBLIC);
  for (const mark of layout.marks) {
    assert.ok(mark.extent.from >= 0, `"${mark.label}" runs off the left edge`);
    assert.ok(mark.extent.to <= VISUAL_WIDTH, `"${mark.label}" runs off the right edge`);
    assert.ok(mark.labelY > 0, `"${mark.label}" is above the top of the frame`);
    assert.ok(mark.labelY < mark.dateY, "the date is not below its label");
    assert.ok(mark.dateY < mark.axisY, `"${mark.label}" is not above its axis`);
  }
  assert.ok(layout.height > Math.max(...layout.marks.map((mark) => mark.axisY)));
});

test("a lane gets exactly the height its labels needed", () => {
  const crowded = layoutTimeline(REPUBLIC);
  const spaced = layoutTimeline({
    ...REPUBLIC,
    events: [
      { at: 0, atLabel: "start", label: "One" },
      { at: 1000, atLabel: "end", label: "Two" },
    ],
  });
  assert.ok(spaced.height < crowded.height, "a timeline with room to spare is as tall as one without");
  assert.equal(Math.max(...spaced.marks.map((mark) => mark.tier)), 0);
});

test("two lanes stack, and each keeps its own axis", () => {
  const layout = layoutTimeline({
    events: [
      { at: 0, label: "Alpha", lane: "north" },
      { at: 10, label: "Beta", lane: "south" },
    ],
    kind: "timeline",
    learningGoal: "Two threads",
  });
  assert.equal(layout.lanes.length, 2);
  assert.ok(at(layout.lanes, 1).axisY > at(layout.lanes).axisY);
});

test("a covered event shows a question mark and no date", () => {
  const layout = layoutTimeline({ ...REPUBLIC, hidden: 1 });
  const covered = at(layout.marks, 1);
  assert.equal(covered.label, "?");
  assert.equal(covered.date, "");
  assert.equal(covered.covered, true);
});

test("an event at the far right is anchored back into the frame", () => {
  const layout = layoutTimeline({
    events: [
      { at: 0, label: "Start" },
      { at: 100, label: "A rather long closing label", atLabel: "the end" },
    ],
    kind: "timeline",
    learningGoal: "Ends",
  });
  const last = at(layout.marks, 1);
  assert.equal(last.anchor, "end");
  assert.ok(last.extent.to <= VISUAL_WIDTH);
});

// ─────────────────────────────────────────────────────────────────── construction

const TRIANGLE: ConstructionVisual = {
  angles: [{ at: "A", degrees: 90, from: "B", to: "C" }],
  kind: "construction",
  learningGoal: "Identify the right angle",
  points: [
    { id: "A", label: "A", x: 0, y: 0 },
    { id: "B", label: "B", x: 4, y: 0 },
    { id: "C", label: "C", x: 0, y: 3 },
  ],
  segments: [
    { from: "A", label: "4", to: "B" },
    { from: "B", label: "5", to: "C" },
    { from: "C", label: "3", to: "A" },
  ],
};

function apart(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("🔴 the angle mark and the vertex label do not land on the same spot", () => {
  const layout = layoutConstruction(TRIANGLE);
  const vertex = layout.points.find((point) => point.id === "A")!;
  const angle = at(layout.angles);
  const centre = {
    x: layout.points.reduce((total, point) => total + point.cx, 0) / layout.points.length,
    y: layout.points.reduce((total, point) => total + point.cy, 0) / layout.points.length,
  };
  // 🔴 THE TWO GO OPPOSITE WAYS, WHICH IS WHY THEY CANNOT COLLIDE. The vertex name goes outward from
  // the middle of the figure; the angle mark goes inward along its own bisector, into the space the
  // name has just left.
  assert.ok(
    apart({ x: vertex.labelX, y: vertex.labelY }, centre) > apart({ x: vertex.cx, y: vertex.cy }, centre),
    "the vertex label is not outside its point",
  );
  assert.ok(
    apart({ x: angle.labelX, y: angle.labelY }, centre) < apart({ x: vertex.cx, y: vertex.cy }, centre),
    "the angle label is not inside the figure",
  );
  assert.ok(
    apart({ x: angle.labelX, y: angle.labelY }, { x: vertex.labelX, y: vertex.labelY }) > 24,
    "the angle label and the vertex label are on top of each other",
  );
});

test("🔴 a right angle is marked with a square, and any other angle with an arc", () => {
  // The square is the convention everywhere a right angle is drawn, and it is the one angle a reader
  // recognises without reading the number.
  assert.match(at(layoutConstruction(TRIANGLE).angles).markPath, /^M .* L .* L /);
  const oblique = layoutConstruction({
    ...TRIANGLE,
    angles: [{ at: "A", degrees: 37, from: "B", to: "C" }],
    points: [
      { id: "A", label: "A", x: 0, y: 0 },
      { id: "B", label: "B", x: 4, y: 0 },
      { id: "C", label: "C", x: 4, y: 3 },
    ],
  });
  assert.match(at(oblique.angles).markPath, / A /);
});

test("a side label sits off its line, on the outside of the figure", () => {
  const layout = layoutConstruction(TRIANGLE);
  const centre = {
    x: layout.points.reduce((total, point) => total + point.cx, 0) / layout.points.length,
    y: layout.points.reduce((total, point) => total + point.cy, 0) / layout.points.length,
  };
  for (const segment of layout.segments) {
    const mid = { x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2 };
    assert.ok(apart({ x: segment.labelX, y: segment.labelY }, mid) > 8, "a side label is sitting on its own line");
    assert.ok(
      apart({ x: segment.labelX, y: segment.labelY }, centre) > apart(mid, centre),
      "a side label was placed inside the figure",
    );
  }
});

test("no two point labels collide, and none leaves the frame", () => {
  const layout = layoutConstruction(TRIANGLE);
  for (const a of layout.points) {
    assert.ok(a.labelX > 0 && a.labelX < VISUAL_WIDTH, `${a.id} runs off the side`);
    assert.ok(a.labelY > 0 && a.labelY < layout.height, `${a.id} runs off the top or bottom`);
    for (const b of layout.points) {
      if (a.id >= b.id) continue;
      assert.ok(apart({ x: a.labelX, y: a.labelY }, { x: b.labelX, y: b.labelY }) > 14, `${a.id} and ${b.id} collide`);
    }
  }
});

test("the figure is fitted to the frame and centred in it", () => {
  const layout = layoutConstruction(TRIANGLE);
  const xs = layout.points.map((point) => point.cx);
  const ys = layout.points.map((point) => point.cy);
  // Equal margins each side means the figure is centred rather than pinned to a corner.
  assert.ok(Math.abs(Math.min(...xs) - (VISUAL_WIDTH - Math.max(...xs))) < 1);
  assert.ok(Math.abs(Math.min(...ys) - (layout.height - Math.max(...ys))) < 1);
  // A 3–4–5 triangle is wider than it is tall, and must still be after fitting.
  assert.ok(Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys));
});

test("a circle keeps its radius through the same fitting as the points", () => {
  const layout = layoutConstruction({
    circles: [{ centre: "O", through: "P" }],
    kind: "construction",
    learningGoal: "A circle through a point",
    points: [
      { id: "O", label: "O", x: 0, y: 0 },
      { id: "P", label: "P", x: 1, y: 0 },
    ],
  });
  const circle = at(layout.circles);
  const p = layout.points.find((point) => point.id === "P")!;
  assert.ok(Math.abs(circle.r - apart({ x: circle.cx, y: circle.cy }, { x: p.cx, y: p.cy })) < 1e-6);
});

// ─────────────────────────────────────────────────────────────────── text estimates

test("🔴 the width estimate is generous rather than tight", () => {
  // Under-estimating puts two labels back on top of each other, which is the defect this whole file
  // is about. Over-estimating spreads them slightly further apart than they need to be.
  assert.ok(textWidth("MMMM", 12) > 4 * 12 * 0.5);
  assert.equal(textWidth("", 12), 0);
});

test("truncation keeps the ellipsis inside the width it was given", () => {
  const cut = truncateToWidth("a label that will not fit", 12, 60);
  assert.match(cut, /…$/);
  assert.ok(textWidth(cut, 12) <= 60);
  assert.equal(truncateToWidth("short", 12, 400), "short");
  assert.equal(truncateToWidth("anything", 12, 1), "…");
});

test("🔴 two edges into one node arrive at two different points", () => {
  // Once the inhibitor moved beside the receptor, both arrows arrived at the same pixel — so the
  // blunt bar that means "blocks" was drawn under the arrowhead that means "drives", and the one
  // distinction the diagram exists to make disappeared.
  const layout = layoutFlow(CASCADE);
  const arriving = layout.edges
    .filter((edge) => edge.path.includes(" L "))
    .map((edge) => Number(at(at(edge.path.split(" L "), 1).split(" "))));
  assert.equal(new Set(arriving).size, arriving.length, "two edges landed on the same point");
});

test("edges into a node keep the order of where they came from, so they do not cross", () => {
  const layout = layoutFlow(CASCADE);
  const into = (id: string) =>
    CASCADE.edges
      .map((edge, index) => ({ edge, line: layout.edges[index] }))
      .filter((entry) => entry.edge.to === id)
      .map((entry) => ({
        source: box(layout, entry.edge.from).cx,
        target: Number(at(at(present(entry.line).path.split(" L "), 1).split(" "))),
      }))
      .sort((a, b) => a.source - b.source);
  const arrivals = into("kinase");
  assert.equal(arrivals.length, 2);
  assert.ok(at(arrivals).target < at(arrivals, 1).target, "the left-hand source arrived on the right");
});

test("🔴 no leader line is drawn through another event's label", () => {
  // The defect the right-to-left ordering exists to prevent: a label placed cleanly on the bottom
  // tier, and then a lifted neighbour's leader ruled straight across it.
  const layout = layoutTimeline(REPUBLIC);
  for (const lifted of layout.marks.filter((mark) => mark.tier > 0)) {
    for (const other of layout.marks) {
      if (other.index === lifted.index || other.axisY !== lifted.axisY || other.tier >= lifted.tier) continue;
      assert.ok(
        lifted.x <= other.extent.from || lifted.x >= other.extent.to,
        `the leader for "${lifted.label}" passes through "${other.label}"`,
      );
    }
  }
});

// ── ONE HEIGHT, AND NO TINT ──────────────────────────────────────────────────────────────────
//
// Owner, 2026-08-20: *"why does it have a blue gray background instead of a transparent
// background? are the plot size standardized?"*
//
// The width was standardized and had been since `VISUAL_WIDTH` was written. The height was not,
// and the four figures that choose their own canvas had each picked a different one — 240, 280,
// 320, 340 — so the column visibly changed size as you scrolled past them. The blue was not a
// choice either: `--ui-bg-secondary` is `color-mix(srgb, var(--ui-accent) 11%, …)`, so figures
// were wearing eleven percent of the theme accent because the card system's fill came along with
// the card.

const LAYOUT_SOURCE = readFileSync(new URL("./visual-layout.ts", import.meta.url), "utf8");
const SEMANTIC_SOURCE = readFileSync(new URL("../../components/workspace/learn/semantic-visual.tsx", import.meta.url), "utf8");
const SUBJECT_SOURCE = readFileSync(new URL("../../components/workspace/learn/subject-visual.tsx", import.meta.url), "utf8");
const STRUCTURE_SOURCE = readFileSync(new URL("../../components/workspace/learn/chemical-structure.tsx", import.meta.url), "utf8");

/** Comments stripped: the notes here quote every number they check for. */
function withoutComments(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

test("🔴 a figure that chooses its own canvas uses the shared height — none picks its own", () => {
  // Calibration: put `340` back in VectorDiagram, or `320` back in CONSTRUCTION_HEIGHT, and this
  // reddens on that file alone.
  assert.equal(layoutConstruction(TRIANGLE).height, VISUAL_HEIGHT);
  assert.match(withoutComments(SUBJECT_SOURCE), /const height = VISUAL_HEIGHT;/);
  for (const [name, source] of [["subject-visual", SUBJECT_SOURCE], ["semantic-visual", SEMANTIC_SOURCE]] as const) {
    const orphans = withoutComments(source).match(/\b(?:height|HEIGHT)\s*=\s*(24|28|32|34)0\b/g);
    assert.equal(orphans, null, `${name} has gone back to a height of its own: ${orphans?.join(", ")}`);
  }
});

test("🔴🔴 the Tailwind literal and the constant cannot drift apart", () => {
  // Tailwind scans source TEXT, so `min-h-[280px]` can never read `VISUAL_HEIGHT`. That makes the
  // two a silent-drift pair — change the constant and every figure keeps the old floor while the
  // code reads as though it moved. This is the only thing standing between them.
  assert.match(VISUAL_FIGURE_CLASS, new RegExp(`min-h-\\[${VISUAL_HEIGHT}px\\]`));
  // 🔴 A STRUCTURE IS BOUND TIGHTER THAN THE SHARED FIGURE HEIGHT, ON PURPOSE. It sizes itself to
  // the MOLECULE rather than to the column (`w-auto`), so its bound is a ceiling on a drawing that
  // is usually well under it — not a canvas it fills. Reported 2026-08-20: three atoms were being
  // stretched across the full 640px column and letterboxed into a mostly-empty panel.
  assert.match(STRUCTURE_SOURCE, /max-h-\[220px\] w-auto max-w-full/);
  assert.ok(!/max-h-\[240px\]|h-auto max-h-\[280px\] w-full/.test(STRUCTURE_SOURCE), "the structure fills the column again");
});

test("🔴 every drawn figure wears the one class, rather than restating it", () => {
  // A figure that spells `h-auto w-full` out by hand looks identical today and silently misses the
  // floor. There were three such spellings in each file before this.
  assert.ok(!/className="h-auto w-full" role="img"/.test(SEMANTIC_SOURCE + SUBJECT_SOURCE));
  assert.equal((SEMANTIC_SOURCE.match(/className=\{VISUAL_FIGURE_CLASS\}/g) ?? []).length, 2);
  assert.equal((SUBJECT_SOURCE.match(/className=\{VISUAL_FIGURE_CLASS\}/g) ?? []).length, 3);
});

test("🔴🔴 a figure that sizes itself is NEVER capped — the viewBox stays truthful", () => {
  // The floor is CSS on purpose. Capping a viewBox does not crop an SVG, it scales the WHOLE
  // drawing down uniformly, so a ceiling on a long timeline would shrink it to half width with
  // unreadable labels. Growth past the shared height must survive.
  const deep = layoutFlow({
    edges: [
      { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" },
      { from: "d", to: "e" }, { from: "e", to: "f" }, { from: "f", to: "g" },
    ],
    kind: "relationship",
    learningGoal: "A chain long enough to need the room",
    nodes: "abcdefg".split("").map((id) => ({ id, label: id.toUpperCase() })),
  });
  assert.ok(deep.height > VISUAL_HEIGHT, `a seven-step chain collapsed to ${deep.height}`);
  // ...and a short one keeps its own small viewBox, because the floor lives in CSS.
  assert.ok(layoutTimeline(REPUBLIC).height < deep.height);
});

test("🔴🔴 the force diagram's reaches stay inside the box at the shared height", () => {
  // THE ACTUAL BUG THIS CHANGE COULD HAVE SHIPPED. VectorDiagram drew its axes 160 from the centre,
  // which exactly spanned the 340 box it used to own. At 280 the centre is 140, so a literal 160
  // would have run 20px past both edges and clipped the axes off the drawing.
  // 🔴 THE FIRST VERSION OF THIS TEST WAS HOLLOW AND THE CALIBRATION RUN CAUGHT IT. It asserted
  // `cy + (cy - 10) <= VISUAL_HEIGHT`, which is arithmetic that is true for every possible height
  // — it never read the component, so restoring the literal 160 left it green. A reach only stays
  // inside the box if the COMPONENT derives it, so that is what this reads.
  const source = withoutComments(SUBJECT_SOURCE);
  const reach = source.match(/const axisReach = cy - (\d+);/);
  assert.ok(reach, "VectorDiagram no longer derives its axis reach from the box");
  assert.equal(source.match(/\* 160\b/), null, "a reach tuned to the old 340 box is back");

  const cy = VISUAL_HEIGHT / 2;
  const axisReach = cy - Number(reach[1]);
  assert.ok(axisReach > 0 && cy + axisReach <= VISUAL_HEIGHT, `the axes leave the viewBox at ${VISUAL_HEIGHT}`);

  // And the arms still fit inside the axes, which is what makes the diagram readable.
  const arm = source.match(/const armFor = \(magnitude: number\) => cy \* \(([\d.]+) \+ ([\d.]+) \*/);
  assert.ok(arm, "VectorDiagram no longer derives its arm length from the box");
  assert.ok(cy * (Number(arm[1]) + Number(arm[2])) < axisReach, "an arrow is longer than the axis it is drawn against");

  // Calibration for the box itself: the old literal, checked against the new height.
  assert.ok(cy + 160 > VISUAL_HEIGHT, "160 would have run past the edge — that is what was fixed");
});

test("🔴 a figure has no fill — it is content in the column, not a card on the page", () => {
  // Calibration: put `bg-(--ui-bg-secondary)` back on the <figure> and this reddens.
  // 🔴 REPOINTED: the className became a conditional when a structure's frame learned to fit its
  // content, so a regex expecting one literal string stopped matching anything and passed on an
  // empty haystack. Read every class string the <figure> can wear instead — the property is that
  // NONE of them carries a fill.
  const source = withoutComments(SEMANTIC_SOURCE);
  const figure = source.slice(source.indexOf("<figure"), source.indexOf("{visual.kind === \"equation\""));
  const classes = figure.match(/"[^"]*rounded-xl[^"]*"/g) ?? [];
  assert.ok(classes.length >= 1, "the figure element moved");
  for (const one of classes) {
    assert.ok(!/\bbg-/.test(one), `the figure is filled again: ${one}`);
    // The hairline stays: a wide table with no boundary bleeds into the prose above it.
    assert.match(one, /border-\(--ui-stroke-tertiary\)/);
  }
});

test("🔴 a molecule's FRAME fits the molecule; every other figure still fills the column", () => {
  // Owner, twice: *"can you make the size of it be smaller to fit with the canvas sizing?"* The
  // drawing was already bounded and the FRAME was not, so ethanol sat in the middle of a mostly
  // empty 640px panel — and the emptiness was the complaint.
  //
  // 🔴 STRUCTURE ONLY. A plot, a table and a timeline are drawn ACROSS the column on purpose: a
  // shrink-wrapped plot is a smaller plot. Calibration: give every kind `w-fit` and the second
  // assertion reddens.
  const source = withoutComments(SEMANTIC_SOURCE);
  assert.match(source, /visual\.kind === "structure"\s*\?\s*"my-4 mx-auto w-fit max-w-full/);
  const fitCount = (source.match(/w-fit/g) ?? []).length;
  assert.equal(fitCount, 1, `${fitCount} figure kinds shrink-wrap; only a structure should`);
});
