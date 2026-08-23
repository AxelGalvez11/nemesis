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
const PANEL = read("canvas-history-panel.tsx");
const PANEL_CODE = strip(PANEL);
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
    ["canvas-history-panel.tsx", PANEL_CODE],
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

test("the history card closes on Escape and on a click outside", () => {
  assert.ok(/"Escape"/.test(PANEL_CODE), "no Escape handler");
  assert.ok(/mousedown/.test(PANEL_CODE), "no outside-click handler");
  assert.ok(/contains\(event\.target/.test(PANEL_CODE), "the outside-click test does not check containment");
});

test("🔴🔴 it is a card beside the rail, not a full-height sidebar", () => {
  // Owner, 2026-08-23, with a screenshot: "it needs to be like this, not a full sidebar". The
  // first version was `absolute inset-y-0 right-0` with a "History" header and a close chevron —
  // a surface announcing itself as somewhere you have gone.
  // Calibration: put `inset-y-0` back on the panel and this reddens alone.
  assert.ok(!/inset-y-0/.test(PANEL_CODE), "the history panel spans the full height again");
  assert.ok(/max-h-\[min\(/.test(PANEL_CODE), "the card has no height cap, so it can grow into a sidebar");
  assert.ok(/rounded-2xl/.test(PANEL_CODE), "the card is not a card");
  assert.ok(/top-1\/2/.test(PANEL_CODE), "the card is not anchored beside the rail");
});

test("🔴 the card carries no header, no title and no close control", () => {
  // Everything the screenshot does not have. Rows are the only thing a learner came here for.
  assert.ok(!/Codicon/.test(PANEL_CODE), "an icon control came back");
  assert.ok(!/Close history/.test(PANEL_CODE), "the close chevron came back");
  assert.ok(!/>History</.test(PANEL_CODE), "the header title came back");
});

test("🔴 there is no full-screen dark backdrop", () => {
  // Owner: "No full-screen dark modal backdrop. A subtle shadow/border is enough."
  assert.ok(!/bg-black\/|bg-\(--ui-bg-editor\)\/\d/.test(PANEL_CODE), "a scrim crept in");
  assert.ok(/shadow-xl/.test(PANEL_CODE), "the card has no shadow to separate it from the Canvas");
});

test("🔴🔴 time runs downwards: oldest at the top, Now last", () => {
  // Owner's screenshot: the bright marker is at the BOTTOM and the rows above it run back through
  // the session. The first version reversed the list and put Now at the top, which is how a chat
  // sidebar is ordered — it makes the column a stack of documents rather than a path.
  // Calibration: add `.reverse()` back in either file and this reddens.
  assert.ok(!/entries\]\.reverse\(\)/.test(PANEL_CODE), "the card reverses the history");
  assert.ok(!/entries\]\.reverse\(\)/.test(RAIL_CODE), "the rail reverses the history");

  // "Now" is the last child in both.
  const cardNow = PANEL_CODE.indexOf('title: "Now"');
  const cardRows = PANEL_CODE.indexOf("entries.map(");
  assert.ok(cardNow > cardRows && cardRows > 0, "Now is not the last row of the card");

  const railNow = RAIL_CODE.indexOf('label="Now"');
  const railRows = RAIL_CODE.indexOf("shown.map(");
  assert.ok(railNow > railRows && railRows > 0, "Now is not the last mark on the rail");
});

test("🔴 with more moments than the rail can draw, an un-rewound rail holds the newest end", () => {
  // The learner is at the bottom of the column, so that is the end that must stay on screen.
  assert.ok(/rows\.slice\(-RAIL_MARKERS\)/.test(RAIL_CODE), "the window holds the oldest end instead");
});

test("the card stays inside the width the brief asked for", () => {
  // 🔴 20rem AND NOT 22, BECAUSE THIS REPO SETS `html { font-size: 112.5% }`. Measured in Chromium:
  // 22rem painted at **396px**, outside the 300–360 the brief asked for; 20rem is 360px exactly.
  // A rem value that reads as one number and paints as another is the same trap §46.3 documents
  // for type — it just costs layout here instead of typography.
  assert.ok(/w-\[min\(20rem,/.test(PANEL_CODE), "the card width is not clamped");
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
