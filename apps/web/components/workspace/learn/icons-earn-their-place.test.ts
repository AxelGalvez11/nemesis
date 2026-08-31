import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴 OWNER RULING, 2026-08-30: "Why are there so many icons? ... they should only show up when
// they are actually needed." This file pins the canvas header's side of that ruling; the
// sidebar's side is pinned in lib/workspace/sidebar-nav.test.ts. The row's shape is the owner's
// own 2026-08-19 design: sources and outputs, progress, and one `⋯` for options — each of the
// first three appearing only when it has something to show.

const HEADER = readFileSync(new URL("./canvas-header.tsx", import.meta.url), "utf8");
const CONTROLS = readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8");

test("🔴 Sources renders only when the panel has something to say", () => {
  assert.match(
    HEADER,
    /\{\(canvas\.sources\.length > 0 \|\| \(canvas\.outputs \?\? \[\]\)\.length > 0 \|\| modelKnowledge\) && \(/,
    "the Sources glyph is unconditional again — a fresh canvas is back to a full toolbar",
  );
});

test("🔴 the maps still appear only where there is something to map", () => {
  // The owner's 2026-08-24 rule, restated here so this file describes the WHOLE row.
  const gates = HEADER.match(/minimap\.planTitle !== null/g) ?? [];
  assert.ok(gates.length >= 2, "Progress and the course map lost their course gate");
});

test("🔴 the view door is a gated glyph again; read-aloud stays in the menu (owner 2026-08-30)", () => {
  // Two rulings in one day, both his: the morning sweep folded the switch into the `⋯`; by
  // evening — *"there should be a way to chat mode to canvas mode"* — he could not find it. The
  // door came back out as `CanvasViewControl`, wearing the same rule as every glyph on this row:
  // absent until there is a conversation to leave, then present for the whole session.
  assert.match(HEADER, /\{view && onToggleView && <CanvasViewControl /, "the view door lost its conversation gate");
  assert.ok(!/<OptionsControl/.test(HEADER), "the standalone read-aloud glyph is back");
  assert.match(HEADER, /<OptionsMenu voice=\{voice\} \/>/, "the menu lost its voice input");
});

test("🔴 the `⋯` is the row's ONE unconditional control, and it reports non-default state", () => {
  const menu = CONTROLS.slice(CONTROLS.indexOf("export function OptionsMenu"));
  assert.ok(menu.length > 0, "the options menu is gone");
  assert.match(
    menu,
    /\(voiceOn \|\| style !== DEFAULT_LEARNING_STYLE\) && "text-\(--ui-action\)/,
    "a non-default state no longer lights the glyph, so it is invisible without a click",
  );
});
