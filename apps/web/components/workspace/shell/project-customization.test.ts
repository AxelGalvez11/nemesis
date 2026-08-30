import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PROJECT_COLORS, PROJECT_ICONS } from "./project-customize-dialog";

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

test("🔴 every colour is a six-digit hex or the default, matching the database constraint", () => {
  for (const preset of PROJECT_COLORS) {
    if (preset.value === null) continue;
    assert.match(preset.value, /^#[0-9a-fA-F]{6}$/, `${preset.name} would be refused by folders_color_shape`);
  }
  assert.ok(PROJECT_COLORS.some((preset) => preset.value === null), "there is no way back to the plain folder");
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
