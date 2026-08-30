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

test("🔴🔴 the row is always under the composer, not only once you type", () => {
  // 🔴 REPOINTED 2026-08-30, AND THE OLD ASSERTION WAS MY ERROR WRITTEN DOWN AS A RULE. It read
  // "an empty composer has no row at all; it appears the moment you type", measured on 2026-08-29 —
  // but I checked before the reference's own draft had loaded, so what I saw was a page mid-restore.
  // Re-checked with the composer genuinely emptied: the row is there, placeholder still showing,
  // carrying Choose project, Plugins and Open desktop app. Owner the same day: *"ChatGPT has that
  // lower thing below the composer and ours doesn't"*. A control that hides until you type is a
  // control nobody finds.
  assert.match(HOME, /shown=\{!departing && !recording\}/, "the row went back to waiting for text");
  assert.ok(!/text\.trim\(\)\.length > 0 \|\| staged\.length > 0/.test(HOME.slice(HOME.indexOf("<ProjectPicker"), HOME.indexOf("<ProjectPicker") + 600)),
    "the row is gated on having something to send again");
  // 🔴 UNMOUNTED, NOT HIDDEN. An open menu that outlives its row floats over nothing.
  assert.match(PICKER, /if \(!shown\) return null;/, "the row hides instead of leaving");
});

test("🔴 the row carries the connected apps beside the project, as the reference does", () => {
  // Measured 2026-08-30: their bar is 728 x 44, flush under the composer and inset 20 from its left
  // edge, holding "Choose project" (143 x 36 at 4,4) then "Plugins" (132 x 36 at 155,4) — an 8px
  // gap — with a right-hand "Open desktop app" we deliberately do not have (owner's call: leave the
  // right end empty).
  assert.match(PICKER, /h-\[44px\]/, "the row left the reference's height");
  assert.match(PICKER, /gap-\[8px\]/, "the two controls lost the reference's 8px gap");
  assert.match(PICKER, /function ConnectedApps\(/, "the connected-apps control is gone");
  assert.match(HOME, /apps=\{connections\.apps\}/, "the row is not told what can be connected");
  assert.match(HOME, /connected=\{connections\.connected\}/, "the row is not told what IS connected");
  // 🔴 A FAILED READ IS "NOTHING CONNECTED", NOT AN ERROR. Without a key on the server the status
  // reports `configured: false`, which is normal on a fresh deployment.
  assert.match(HOME, /useState\(NOT_CONFIGURED\)/, "an unconfigured server is no longer a normal state");
  // 🔴 OUR OWN MARKS, NOT BRAND LOGOS. The connection data carries a key, a label and a sentence and
  // no artwork; four invented Google logos would be shipping someone else's assets to match a
  // screenshot.
  assert.match(PICKER, /const APP_MARK: Record<string, string> = \{/, "the app marks are gone");
  // 🔴 CHECKED ON THE CODE, NOT THE PROSE. The first version banned the word "brand" and failed on
  // the comment above explaining why brand logos are not used.
  const code = PICKER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/<img|https?:\/\//.test(code), "artwork or a remote asset crept into the row");
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
