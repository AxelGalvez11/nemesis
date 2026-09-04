import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PROJECT_COLORS } from "@/lib/learn/project-look";
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

test("🔴🔴 a project's colour exists in ONE piece: a picker, a palette, and surfaces that read it", () => {
  // 🔴 THE OWNER REVERSED HIS OWN REVERSAL, HOURS APART, AND BOTH CALLS WERE RIGHT. The colour went
  // out with the accent sweep (2026-09-03, *"remove any color accents throughout the app"*) after a
  // green flask appeared in his sidebar with no way to change it. It came back the same day as a
  // SETTING: *"allow projects to have color too. and allow user to choose that color in the project
  // settings."* `lib/learn/project-look.ts` carries why an identity colour and the character's
  // accent are different objects.
  //
  // The property this test guards has not changed at all — only its sign. A picker with nothing
  // reading it is a dead control; paint with no picker is a setting nobody can reach. It was
  // asserted as "neither half exists" and is now asserted as "both halves do".
  const dialog = readFileSync(new URL("./project-customize-dialog.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8");
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  assert.match(code(dialog), /PROJECT_COLORS/u, "the swatch palette is gone and the colour cannot be chosen");
  assert.match(code(dialog), /setColor/u, "the dialog holds no colour to save");
  assert.match(code(dialog), /color,/u, "the chosen colour is not written back");
  assert.match(code(sidebar), /projectTint\(folder\)/u, "the sidebar glyph stopped reading the colour");
  // And the halves that never left are still reachable.
  assert.match(code(dialog), /PROJECT_ICONS/u, "the icon grid went with the colours");
  assert.match(code(dialog), /setInstructions/u, "the instructions box went with the colours");
});

test("🔴 every swatch's hex is the light value of the token it draws through", () => {
  // 🔴 THE PALETTE IS A KEY, NOT A SECOND COPY. `folders.color` has a `#RRGGBB` shape constraint so
  // the database wants a literal, but one literal cannot be legible in both themes. Each swatch
  // therefore STORES the light hex and DRAWS through the matching `--ui-kind-*` property, which
  // desktop-ui.css defines twice, both already checked at the 3:1 bar when #1097 restored them.
  //
  // Calibration: change one hex in project-look.ts without changing desktop-ui.css and this reddens.
  // Without it the two drift and a swatch paints a colour the sidebar does not.
  const css = readFileSync(new URL("../../../app/styles/desktop-ui.css", import.meta.url), "utf8");
  for (const entry of PROJECT_COLORS) {
    assert.match(entry.hex, /^#[0-9a-f]{6}$/u, `${entry.name} is not a shape the database will accept`);
    const declared = new RegExp(`${entry.token}:\\s*(#[0-9a-fA-F]{6})`, "g");
    const values = [...css.matchAll(declared)].map((match) => match[1]?.toLowerCase());
    assert.ok(values.length >= 2, `${entry.token} is not defined for both themes`);
    assert.equal(values[0], entry.hex.toLowerCase(), `${entry.name}'s stored hex is not ${entry.token}'s light value`);
  }
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
