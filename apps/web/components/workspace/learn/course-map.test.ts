import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The course map's panel, held to the rules that survived `MinimapControl`.
//
// 🔴🔴 THIS FILE INHERITS FROM `canvas-minimap-surface.test.ts`, DELETED 2026-08-30 when the owner
// merged Progress into the map (*"remove the 'progress' map since the course map is pretty much
// the same thing"*). Its subject died; the rules below did not — they are about ANY panel that
// shows a learner their course, and the map is now that panel. Same method as the deleted file
// and its siblings: read the source with comments stripped, so a guard cannot be satisfied by a
// sentence explaining the rule instead of the code obeying it.

const RAW = readFileSync(new URL("./course-map.tsx", import.meta.url), "utf8");
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("🔴🔴 no percentage, score or count-of-N language anywhere on the map — #906's rule", () => {
  // Owner: no numbers at all — not a percent, not a count. A mastery mark is a mark.
  // 🔴 CLASS STRINGS ARE EXEMPT BEFORE THE SWEEP: the half-filled mark is drawn with a CSS
  // gradient whose stops are `from-50% to-50%` — geometry, not a number shown to anyone. Banning
  // `%` raw would outlaw the very mark #906 chose.
  const copy = CODE.replace(/className=\{[^}]*\}/g, "").replace(/className="[^"]*"/g, "");
  for (const banned of [/%/, /\bscore\b/i, /\d+\s*\/\s*\d+/, /percent/i, /\bcomplete\b/i]) {
    assert.ok(!banned.test(copy), `the map speaks in numbers again: ${banned}`);
  }
});

test("🔴 established is never rendered as a completion checkmark or 'done' — §18/M1", () => {
  // A correct retrieval makes knowledge better established, not permanently finished.
  assert.ok(!/\bdone\b/i.test(CODE), "a mastery state reads as finished");
  assert.ok(!/codicon-check|name="check"/.test(CODE), "a mastery state draws a checkmark");
  assert.match(CODE, /markWords/, "the marks lost their words — hover says nothing");
});

test("🔴 a row click carries a scope and nothing else — H6 holds through the merge", () => {
  // The map's rows call `onPick(...)` with the section itself ({label, identityKeys, ...}); no
  // operation, difficulty or mode may ride along, and the map must not reach the runtime itself.
  assert.match(CODE, /onPick: \(scope: \{ label: string; identityKeys: readonly string\[\] \}\) => void/);
  assert.ok(!/PolicyRuntime|setFocus\(/.test(CODE), "the map reaches past its own callbacks");
});

test("🔴 the panel hangs off the glyph ROW, not off its own button", () => {
  // Owner, 2026-08-30: source panel and map share one right edge. The wrapper must not be
  // `relative`, so `PANEL` resolves against the header's row — see canvas-controls.tsx.
  assert.match(RAW, /className="pointer-events-auto shrink-0"/, "the map's wrapper went relative again");
});
