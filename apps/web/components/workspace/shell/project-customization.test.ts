import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PROJECT_ICONS } from "./project-customize-dialog";

// 🔴 OWNER, 2026-08-30: "chatgpt allows users to customise projects with special instructions and
// icon and color." Presets, not free input — everything a learner can pick must exist and render.

test("🔴 every project icon exists in the icon font", () => {
  // A Codicon whose name is not in the font still measures, still takes clicks, and draws nothing.
  const css = readFileSync(new URL("../../../../../node_modules/@vscode/codicons/dist/codicon.css", import.meta.url), "utf8");
  for (const name of PROJECT_ICONS) {
    assert.ok(css.includes(`.codicon-${name}:before`), `codicon-${name} is not in the font`);
  }
  assert.ok(PROJECT_ICONS.includes("folder"), "the default glyph left the grid, so it cannot be re-chosen");
});

test("🔴 a project has no colour, and no half of the feature was left behind", () => {
  // 🔴 THE OWNER REVERSED THE COLOUR HALF (2026-09-03: "remove any color accents throughout the
  // app, there should only be accents on the mascot and the send button and chat bubble color").
  // A green `#46a758` flask in his sidebar is what prompted it. The instructions and icon halves
  // of the 2026-08-30 request stand and are still tested above.
  //
  // This test replaces one that pinned the seven hexes against the database's shape constraint,
  // and it guards the harder thing: that the feature left in ONE piece. A picker with nothing
  // reading it is a dead control; paint with no picker is a setting nobody can reach.
  const dialog = readFileSync(new URL("./project-customize-dialog.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8");
  // Comments are stripped: every line below asserts an ABSENCE, and the notes left in both files
  // explaining the removal quote the very things being searched for.
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  assert.doesNotMatch(code(dialog), /PROJECT_COLORS/u, "the swatch palette is back with nothing reading it");
  assert.doesNotMatch(code(dialog), /setColor/u, "the dialog still holds a colour to save");
  assert.doesNotMatch(code(sidebar), /folder\.color/u, "the sidebar glyph is tinted again");
  // And the halves that stayed are still reachable.
  assert.match(code(dialog), /PROJECT_ICONS/u, "the icon grid went with the colours");
  assert.match(code(dialog), /setInstructions/u, "the instructions box went with the colours");
});

test("the instructions budget matches the database cap on both write paths", () => {
  const dialog = readFileSync(new URL("./project-customize-dialog.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");
  assert.match(dialog, /maxLength=\{4000\}/, "the textarea lost its cap");
  assert.match(store, /slice\(0, 4000\)/, "the store lost its cap");
});

test("🔴 a turn is never lost to the folders table", () => {
  const store = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");
  const fn = store.slice(store.indexOf("export async function loadProjectInstructions"));
  assert.match(fn, /catch \{\s*\n\s*return null;/, "a folders failure would throw into the turn");
});

// ── filing actually lands (the race measured live, 2026-08-30) ──────────────────────────────────

test("🔴🔴 the filing write says whether it found a row, and the front door retries on a miss", () => {
  // A front-door canvas starts its first turn before its first save, so a bare UPDATE matched
  // zero rows, said nothing, and the canvas stayed loose — the project's instructions never rode.
  const store = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");
  const setter = store.slice(store.indexOf("export async function setCanvasFolder"));
  assert.match(setter, /\.select\("id"\)/, "the filing write can no longer tell a miss from a landing");
  assert.match(setter, /Promise<boolean>/, "the filing write stopped reporting whether it landed");
  const canvas = readFileSync(new URL("../learn/learning-canvas.tsx", import.meta.url), "utf8");
  assert.match(canvas, /if \(filed \|\| cancelled \|\| attempt >= 6\) return;/, "the front-door filing lost its retry");
  assert.match(canvas, /500 \* 2 \*\* attempt/, "the retry lost its backoff");
});

test("🔴 the first turn reads the URL's folder as the fallback, so instructions ride from word one", () => {
  const store = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");
  assert.match(store, /\?\? folderFromLocation\(\)/, "the row read lost its URL fallback");
  const helper = store.slice(store.indexOf("function folderFromLocation"));
  assert.match(helper, /typeof window === "undefined"/, "the fallback would throw off the browser");
  assert.match(helper, /searchParams\.get\("folder"\)/, "the fallback stopped reading ?folder=");
});
