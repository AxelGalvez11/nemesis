import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Source assertions for the History Rail's surface rules — the ones that are properties of where
// something is mounted or what it may import, which no pure function can hold.

const HERE = import.meta.dirname;
const read = (name: string) => readFileSync(join(HERE, name), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CANVAS = read("learning-canvas.tsx");
const CANVAS_CODE = strip(CANVAS);
const RAIL = read("canvas-history-rail.tsx");
const RAIL_CODE = strip(RAIL);
const DRAWER = read("canvas-history-drawer.tsx");
const DRAWER_CODE = strip(DRAWER);
const VIEW_CODE = strip(read("canvas-history-view.tsx"));

// ── one rail for the whole Canvas ───────────────────────────────────────────────────────────

test("🔴🔴 the rail is mounted exactly once, and not inside anything that repeats", () => {
  // Calibration: move `<CanvasHistoryRail` inside the segment map and this reddens. The same class
  // of defect the owner caught on the audio player — "The player opens under each block? It's
  // supposed to be one player for the whole response." A rail per block would be a rail per block.
  const mounts = CANVAS_CODE.match(/<CanvasHistoryRail\b/g) ?? [];
  assert.equal(mounts.length, 1, `expected one rail mount, found ${mounts.length}`);

  // 🔴 THE SAME SHAPE `reply-actions.test.ts` USES: find the repeating region, assert the mount is
  // outside it. Anything cleverer with a regex is a guess about JSX nesting.
  const scroller = CANVAS_CODE.indexOf('className="relative h-full overflow-y-auto');
  assert.ok(scroller > 0, "the Canvas scroller moved; re-point this check");
  assert.ok(
    CANVAS_CODE.indexOf("<CanvasHistoryRail") < scroller,
    "the rail is mounted inside the scrolling content — it is a fixture of the Canvas, not a mark on the page",
  );

  const map = CANVAS_CODE.indexOf("replySegments(replyText, replyVisualList).map(");
  assert.ok(map > 0, "the segment map moved; re-point this check");
  assert.ok(CANVAS_CODE.indexOf("<CanvasHistoryRail") < map, "the rail is rendered per segment");
});

// ── the rail is not the Minimap ─────────────────────────────────────────────────────────────

test("🔴🔴 the History Rail and the Minimap stay separate, architecturally", () => {
  // Owner: "Do NOT merge this with the existing learning Minimap. They answer different questions."
  // The Minimap reads the learner model; this must not be able to.
  for (const [name, code] of [
    ["canvas-history-rail.tsx", RAIL_CODE],
    ["canvas-history-drawer.tsx", DRAWER_CODE],
    ["canvas-history-view.tsx", VIEW_CODE],
  ] as const) {
    assert.ok(!/canvas-minimap/.test(code), `${name} reaches into the Minimap`);
    assert.ok(!/learner-evidence|projectLearnerState/.test(code), `${name} reads the learner model`);
    assert.ok(!/territor/i.test(code), `${name} reads territories, which are the Minimap's subject`);
  }
});

// ── rewinding is read-only ──────────────────────────────────────────────────────────────────

test("🔴🔴 the historical view has no way to write anything", () => {
  // The learner-state guarantee, held structurally. `learner_evidence` is append-only in the
  // database, so a rewind could not roll back mastery even if it tried — this stops it trying.
  for (const forbidden of ["recordMoment", "session.", "policy.", "respond", "submit", "update("]) {
    assert.ok(!VIEW_CODE.includes(forbidden), `the history view reaches for \`${forbidden}\``);
  }
});

test("🔴 a new turn returns the learner to now", () => {
  // Leaving the Canvas rewound while an answer lands behind it puts the reply where they cannot
  // see it and leaves a stale moment reading as the live one.
  assert.ok(
    /if\s*\(turnInFlight\)\s*setRewound\(null\)/.test(CANVAS_CODE),
    "nothing returns the Canvas to now when a turn starts",
  );
});

test("🔴 rewinding never calls the session's writer", () => {
  const at = CANVAS_CODE.indexOf("setRewound");
  assert.ok(at > 0, "setRewound is not wired");
  // The rail's own select handler is `setRewound` and nothing else.
  assert.ok(/onSelect=\{setRewound\}/.test(CANVAS_CODE), "the rail's selection goes somewhere other than the view state");
});

// ── the drawer's stated behaviours ──────────────────────────────────────────────────────────

test("the drawer closes on Escape and on a click outside", () => {
  assert.ok(/"Escape"/.test(DRAWER_CODE), "no Escape handler");
  assert.ok(/mousedown/.test(DRAWER_CODE), "no outside-click handler");
  assert.ok(/contains\(event\.target/.test(DRAWER_CODE), "the outside-click test does not check containment");
});

test("🔴 the drawer overlays and never reflows the Canvas", () => {
  // Owner: "NOT resize/reflow the main Canvas." A drawer in the flow would re-wrap every line of
  // the answer behind it.
  assert.ok(/absolute inset-y-0 right-0/.test(DRAWER_CODE), "the drawer is not positioned over the sheet");
});

test("🔴 there is no full-screen dark backdrop", () => {
  // Owner: "No full-screen dark modal backdrop. A subtle shadow/border is enough."
  assert.ok(!/bg-black\/|bg-\(--ui-bg-editor\)\/\d/.test(DRAWER_CODE), "a scrim crept into the drawer");
  assert.ok(/shadow-xl|border-l/.test(DRAWER_CODE), "the drawer has neither a shadow nor a border to separate it");
});

test("the drawer stays inside the width the brief asked for", () => {
  // 🔴 20rem AND NOT 22, BECAUSE THIS REPO SETS `html { font-size: 112.5% }`. Measured in Chromium:
  // 22rem painted at **396px**, outside the 300–360 the brief asked for; 20rem is 360px exactly.
  // A rem value that reads as one number and paints as another is the same trap §46.3 documents
  // for type — it just costs layout here instead of typography.
  assert.ok(/w-\[min\(20rem,85vw\)\]/.test(DRAWER_CODE), "the drawer width is not clamped");
});

// ── collapsed state stays quiet ─────────────────────────────────────────────────────────────

test("🔴 nothing but marks is painted while the rail is collapsed", () => {
  // Owner: "Do not show message bubbles, timestamps, labels, avatars or text while collapsed."
  // The labels exist in the DOM for screen readers and are clipped to zero width until peek.
  assert.ok(/max-w-0 opacity-0/.test(RAIL_CODE), "labels are not collapsed away");
  assert.ok(/peeking \? "max-w-\[11rem\] opacity-100"/.test(RAIL_CODE), "labels do not open on peek");
});

test("🔴 a collapsed marker still has an accessible name", () => {
  // A column of 16px rules with no text is a column of unlabelled buttons to a screen reader.
  assert.ok(/aria-label=\{label\}/.test(RAIL_CODE), "markers are unlabelled");
});

test("the active marker is both longer and brighter", () => {
  // Length survives low opacity; brightness survives a peek where every marker is the same length.
  assert.ok(/h-0\.5 w-4 bg-\(--ui-text-primary\)/.test(RAIL_CODE), "the active marker is not emphasised");
});

test("🔴 the rail listens to no scroll event", () => {
  // There is no scrolling transcript on this Canvas — `composeSurface` gives one turn the surface
  // at a time — so there is nothing to sync to, and the performance requirement is met by there
  // being no listener rather than by a cheap one.
  assert.ok(!/scroll/i.test(RAIL_CODE), "the rail listens to scroll");
  assert.ok(!/IntersectionObserver/.test(RAIL_CODE), "the rail observes intersections it cannot use");
});

test("🔴 on a narrow screen the rail becomes a button instead of taking the edge", () => {
  assert.ok(/hidden items-center md:flex/.test(RAIL_CODE), "the edge rail is not hidden on mobile");
  assert.ok(/md:hidden/.test(RAIL_CODE), "there is no mobile affordance");
});

// ── it survives a reload ────────────────────────────────────────────────────────────────────

test("🔴🔴 moments are both written and read back — the whole point of a durable history", () => {
  // Calibration: `canvasToRow` and `canvasFromRow` each enumerate the document BY HAND, and the
  // model's own comment warns that a field missing from either is silently not persisted. Delete
  // either line and history survives until the next refresh, which is exactly the defect this
  // feature exists to fix.
  const store = strip(readFileSync(join(HERE, "../../../lib/learn/canvas-store.ts"), "utf8"));
  assert.ok(/moments: canvas\.moments/.test(store), "moments are never written to the row");
  assert.ok(/moments: list\(document\.moments\)/.test(store), "moments are never read back out of the row");

  const model = strip(readFileSync(join(HERE, "../../../lib/learn/canvas-model.ts"), "utf8"));
  assert.ok(/moments: CanvasMoment\[\]/.test(model), "the canvas has no moments field");
  assert.ok(/moments: \[\]/.test(model), "a new canvas does not start with an empty moment list");
});

test("🔴 the conversational turn is recorded, because it exists nowhere else", () => {
  // `conversation` is a ref capped at six turns and deliberately not persisted — its own comment
  // says so. Without this call, "what I asked" is gone on every refresh.
  assert.ok(/recordMoment\(\{/.test(CANVAS_CODE), "no moment is recorded from a turn");
  assert.ok(
    /kind: decision\?\.say \? "assistant" : "user"/.test(CANVAS_CODE),
    "a turn that acted rather than spoke is recorded as an answer",
  );
});
