// "Choose project" on the front door — filing a chat that does not exist yet.
//
// Owner 2026-08-29: *"could you allow the user to add the landing page chat into a project like in
// the ChatGPT landing page for the work mode?"*

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const PICKER = read("./project-picker.tsx");
const HOME = read("./canvas-home.tsx");
const CANVAS = read("./learning-canvas.tsx");
const ENTRY = read("../../../lib/learn/learn-entry.ts");
const ROUTE = read("../../../app/(workspace)/learn/page.tsx");

test("🔴🔴 the row says nothing until there is something to send", () => {
  // Measured on chatgpt.com 2026-08-29: an empty composer has no row at all; it appears the moment
  // you type. A control offering to file a chat that does not exist yet, beside an empty box, is a
  // question about nothing — and this surface's whole rule is that it asks ONE question.
  assert.match(HOME, /shown=\{!departing && !recording && \(text\.trim\(\)\.length > 0 \|\| staged\.length > 0\)\}/,
    "the picker no longer waits for something to send");
  // 🔴 UNMOUNTED, NOT HIDDEN. An open menu that outlives its row floats over nothing.
  assert.match(PICKER, /if \(!shown\) return null;/, "the picker hides instead of leaving");
});

test("🔴 the choice rides the URL, because there is no canvas yet to write it on", () => {
  assert.match(HOME, /const filing = project \? `&folder=\$\{encodeURIComponent\(project\)\}` : "";/);
  // Both doors: typed words and dropped material are the same new canvas.
  const start = HOME.slice(HOME.indexOf("const start = ("), HOME.indexOf("\n  };", HOME.indexOf("const start = (")));
  assert.ok((start.split("${filing}").length - 1) >= 2, "only one of the two start doors carries the filing");
  assert.match(ENTRY, /readonly folder: string \| null;/, "?folder= is not part of the entry");
  assert.match(ENTRY, /folder: params\.get\("folder"\)/, "?folder= is declared but never read");
  assert.match(ROUTE, /openingFolder=\{entry\.folder\}/, "the route drops the chosen project");
});

test("🔴🔴 a stray ?folder= never decides the surface", () => {
  // The same rule `cap` carries: a filing instruction is a fact ABOUT a submission. With nothing
  // asked there is nothing to file, so it must open the front door like any unknown parameter.
  const surface = ENTRY.slice(ENTRY.indexOf("export function learnSurface"));
  assert.ok(!/folder/.test(surface), "?folder= can now open a canvas on its own");
});

test("🔴 the canvas files itself once, through the same door dragging uses", () => {
  assert.match(CANVAS, /setCanvasFolder\(uid, canvas\.id, openingFolder\)/, "the opening project is never applied");
  // 🔴 LATCHED ON THE ID, NOT A BOOLEAN. The canvas can be minted after this effect first runs, so
  // a `true` latch would refuse to file the real one.
  assert.match(CANVAS, /const filedInto = useRef<string \| null>\(null\);/, "the latch stopped naming which canvas it filed");
  assert.match(CANVAS, /filedInto\.current === canvas\.id/, "the latch no longer compares ids");
  // 🔴 NOT AWAITED. A canvas that opens is worth more than its filing.
  assert.match(CANVAS, /void setCanvasFolder\(/, "the opening now blocks on a filing write");
});

test("🔴 a new project can be made without leaving the surface", () => {
  // Owner's choice, 2026-08-29: the picker ends with a New project row rather than sending someone
  // to the sidebar first.
  assert.match(PICKER, /New project/, "the inline create is gone");
  assert.match(HOME, /const made = await createFolder\(userId, name\);/, "nothing creates the project");
  assert.match(HOME, /setFolders\(\(rows\) => \[\.\.\.rows, made\]\)/, "a new project does not join the list it was made from");
});

test("🔴 the row is the composer's width, not the page's", () => {
  // It sits in the centred column BELOW the composer, which is far wider. Left unbounded it began
  // 151px left of the composer's edge instead of 20px inside it — measured on the preview build.
  assert.match(PICKER, /max-w-\[var\(--composer-max-width\)\]/, "the row is no longer bounded by the composer's own width");
  assert.match(PICKER, /px-\[24px\]/, "the row lost the reference's inset");
  // 🔴 THE LIST MUST NOT COVER THE WORDS IT IS FILING. Opening upward hides the composer, which is
  // where the learner just typed the thing they are choosing a project for. Seen on the preview.
  assert.match(PICKER, /absolute top-\[40px\]/, "the project list opens over the composer again");
});
