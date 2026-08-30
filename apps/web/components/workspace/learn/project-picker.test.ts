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
  // 🔴 REPOINTED 2026-08-30. This used to ban `<img>` outright, because the previous pass drew our
  // own codicons rather than invent Google's marks. The owner then asked for the real ones — *"Yes
  // add them"* — so the answer was to go and GET the artwork, not to approximate it. What the guard
  // protects now is the part that was never about taste: the files are OURS to serve and are
  // UNMODIFIED.
  assert.match(PICKER, /const APP_LOGO: Record<string, string> = \{/, "the app logos are gone");
  const code = PICKER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // 🔴 SELF-HOSTED, NEVER HOT-LINKED. A gstatic URL would put Google on the request path for every
  // page view and break silently the day they re-cut the set.
  assert.ok(!/https?:\/\//.test(code), "the row loads a logo from someone else's server");
  for (const app of ["drive", "gmail", "calendar", "docs"]) {
    assert.match(code, new RegExp(`/brand/google/${app}\\.svg`), `the ${app} logo is not wired`);
    const file = new URL(`../../../public/brand/google/${app}.svg`, import.meta.url);
    const svg = readFileSync(file, "utf8");
    assert.match(svg, /^<svg/, `${app}.svg is not an svg`);
    assert.ok(svg.length > 400, `${app}.svg looks truncated`);
  }
  // 🔴🔴 `<img>`, NEVER INLINED, AND IT IS NOT A STYLE PREFERENCE. All four SVGs define internal ids
  // and TWO OF THEM USE `a` (`<mask id="a">`, `fill="url(#a)"`). Inlined together those ids collide
  // and the browser resolves every `url(#a)` to whichever came first: Gmail would paint itself with
  // Drive's gradient. Verified below rather than asserted from memory.
  const clash = ["drive", "gmail", "calendar", "docs"].flatMap((app) =>
    [...readFileSync(new URL(`../../../public/brand/google/${app}.svg`, import.meta.url), "utf8").matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  assert.notEqual(new Set(clash).size, clash.length, "the logos no longer share an id — re-check whether inlining is now safe before relaxing this");
  assert.match(code, /<img/, "the logos stopped being drawn as images, which cross-wires their gradients");
  // 🔴🔴 REPOINTED 2026-08-30: THE PLUG IS RETIRED FROM THIS FEATURE ENTIRELY. The old assertion
  // kept it as the empty state's one mark; the owner, shown seven treatments drawn on the real
  // tray, chose the logos themselves as the icon — the empty state now wears the AVAILABLE apps'
  // logos beside "Connect apps", the connected state wears the connected ones beside "Apps", and
  // only an unconfigured server (no apps to show) is bare words.
  assert.ok(!/name="plug"/.test(code), "the plug glyph is back somewhere in this feature");
  // 🔴 THE CONDITIONAL ITSELF, NOT THE EXPRESSION: the same ternary also appears inside the map, so
  // matching it anywhere let a broken strip condition pass — caught by calibration, the break did
  // not redden. The strip must RENDER on the available apps, not merely mention them.
  assert.match(code, /\{\(on\.length > 0 \? on : apps\)\.length > 0 && \(/, "the logo strip no longer renders for the empty state");
  // 🔴 REPOINTED 2026-08-30 (same day, owner): the row leads to the PLUGINS PAGE now, not
  // Settings, so it wears that page's own mark — the puzzle piece (#921) — and its word. The
  // settings gear promised Settings, which was exactly the wrong turn being removed.
  assert.match(code, /name="extensions"/, "the Manage plugins row lost the destination's mark");
  assert.ok(!/name="settings-gear"/.test(code), "the settings gear is back, promising the wrong destination");
  // The provenance is part of the asset, not a nicety: it records the source URL and the rule that
  // these files are never edited.
  const prov = readFileSync(new URL("../../../public/brand/google/PROVENANCE.md", import.meta.url), "utf8");
  assert.match(prov, /gstatic\.com/, "the provenance no longer says where the marks came from");
  assert.match(prov, /[Uu]nmodified/, "the provenance lost the rule that these are never edited");
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

test("🔴 the row is the composer's width, and it sits on the reference's grey tray", () => {
  // It sits in the centred column BELOW the composer, which is far wider. Left unbounded it began
  // 151px left of the composer's edge instead of 20px inside it — measured on the preview build.
  assert.match(PICKER, /max-w-\[var\(--composer-max-width\)\]/, "the row is no longer bounded by the composer's own width");
  // 🔴 REPOINTED 2026-08-30 FROM `px-[24px]`: the transparent strip became the reference's grey
  // tray (owner: *"still missing that grayish bottom thing below the chat composer"*). Its recipe
  // is the reference's own class list — `mx-5 -mt-5 pt-5 rounded-b-2xl bg-black/3 dark:bg-white/8` —
  // and the controls still land at 24 and 175 absolute: 20px tray inset + 4px row padding.
  assert.match(PICKER, /mx-\[20px\] -mt-\[20px\] rounded-b-\[16px\] bg-\(--composer-tray\) pt-\[20px\]/, "the tray lost the reference's own recipe");
  assert.match(PICKER, /h-\[44px\] items-center gap-\[8px\] px-\[4px\]/, "the row inside the tray moved off the measured geometry");
  // 🔴 THE TUCK NEEDS THE PILL ABOVE IT. The tray overlaps the pill's bottom 20px so no sliver of
  // page shows beside the pill's 28px corner curve; without `relative z-[1]` on the pill, the
  // tray — a later sibling — washes the pill's bottom edge with 8% white in dark.
  assert.match(HOME, /relative z-\[1\][^"]*rounded-\[var\(--composer-radius\)\]/, "the pill no longer paints over the tucked tray");
  // And the token exists in BOTH themes — a light-only tray is invisible-in-dark, the classic bug.
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--composer-tray: rgba\(0, 0, 0, 0\.03\);/, "the light tray ink is gone");
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--composer-tray: rgba\(255, 255, 255, 0\.08\);/, "the tray has no dark ink");
});

test("🔴🔴 both menus open upward and are built to the reference's own panel", () => {
  // 🔴 THE THIRD ANSWER ON DIRECTION, AND THIS ONE IS THE OWNER'S — the history is in the
  // component. The old assertion here (`absolute top-[40px]`, downward) was my own taste written
  // down as a rule; the reference, re-measured with the menu actually open, anchors its panel's
  // BOTTOM 4px above the button, left-aligned, 224 wide (projects) and 240 (apps), radius 20,
  // `10px 0` padding — and its shadow is the composer's exact three layers, reused not restated.
  assert.match(PICKER, /absolute bottom-\[40px\] left-0/, "the menus stopped opening upward");
  assert.ok(!/absolute top-\[40px\]/.test(PICKER), "the downward form is back");
  assert.match(PICKER, /rounded-\[20px\] bg-\(--ui-bg-elevated\) py-\[10px\] shadow-\[var\(--composer-edge\)\]/, "the panel left the measured recipe");
  // 🔴 NO ring OVER the shadow: the token's first layer IS the hairline (#872's doubled-edge).
  assert.ok(!/PANEL[\s\S]{0,200}ring-1/.test(PICKER.slice(PICKER.indexOf("const PANEL"))), "a ring is drawn over the panel's own hairline");
  assert.match(PICKER, /w-\[224px\]/, "the project panel lost its measured width");
  assert.match(PICKER, /w-\[240px\]/, "the apps panel lost its measured width");
  assert.match(PICKER, /Search projects…/, "the project search is gone");
});

test("🔴 the apps menu connects for real, and a connected row is status rather than a control", () => {
  // Owner 2026-08-30: *"clicking on the projects or the plug ins doesn't really work like it does
  // in ChatGPT"*. The control now opens a menu; a not-yet-connected app row starts the broker's
  // own consent flow in a new tab — the identical `beginConnect` the Settings panel runs — and
  // `noopener` so the consent page holds no handle back into the app.
  assert.match(PICKER, /beginConnect\(key\)/, "the menu no longer starts the real connect flow");
  assert.match(PICKER, /window\.open\(url, "_blank", "noopener,noreferrer"\)/, "the consent page keeps a handle into the app");
  // A CONNECTION IS ACCOUNT-WIDE: there is nothing per-conversation to toggle, so a connected row
  // is a div with a check, not a button that does nothing (§38 bans dead controls).
  assert.match(PICKER, /cursor-default hover:bg-transparent/, "a connected row became a control again");
  assert.match(PICKER, /Manage plugins/, "the door to the plugins page is gone from the menu");
  // 🔴 AND IT OPENS THE PLUGINS PAGE. It routed to a card buried in Settings when Settings was the
  // only surface; /plugins is a destination with a rail row of its own now (owner 2026-08-30:
  // *"it should take users to the plugin page, not to the settings"*).
  assert.match(HOME, /onOpenApps=\{\(\) => router\.push\("\/plugins"\)\}/, "the menu dumps learners into Settings again");
  assert.ok(!/onOpenApps=\{\(\) => router\.push\("\/settings/.test(HOME), "a second wiring still points at Settings");
  // An unconfigured server skips the menu: `apps` is empty exactly then, and a panel whose only
  // row points at Settings is the long way of just going there.
  assert.match(PICKER, /if \(apps\.length === 0\) \{ onOpen\(\); return; \}/, "an unconfigured server no longer falls back to Settings");
});
