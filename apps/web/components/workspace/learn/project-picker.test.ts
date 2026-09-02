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
const LOGOS = read("../../../lib/workspace/app-logos.ts");
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
  // 🔴 THE MAP MOVED TO `lib/workspace/app-logos.ts` AND THIS GUARD FOLLOWED IT. The Plugins page
  // was about to keep a second copy, and two answers to "which file is Outlook's" drift silently:
  // a row renders a letter instead of a mark and nobody can tell which map was stale. What is
  // asserted is unchanged — the files are OURS to serve, and they are real and unmodified.
  assert.match(LOGOS, /export const APP_LOGO: Readonly<Record<string, string>> = \{/, "the app logos are gone");
  assert.match(PICKER, /import \{ APP_LOGO \} from "@\/lib\/workspace\/app-logos"/, "the row stopped reading the shared logo map");
  const code = PICKER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // 🔴 SELF-HOSTED, NEVER HOT-LINKED. A gstatic URL would put Google on the request path for every
  // page view and break silently the day they re-cut the set.
  assert.ok(!/https?:\/\//.test(code), "the row loads a logo from someone else's server");
  const logoCode = LOGOS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/https?:\/\//.test(logoCode), "the logo map points at someone else's server");
  for (const app of ["drive", "gmail", "calendar", "docs"]) {
    assert.match(logoCode, new RegExp(`/brand/google/${app}\\.svg`), `the ${app} logo is not wired`);
    const file = new URL(`../../../public/brand/google/${app}.svg`, import.meta.url);
    const svg = readFileSync(file, "utf8");
    assert.match(svg, /^<svg/, `${app}.svg is not an svg`);
    assert.ok(svg.length > 400, `${app}.svg looks truncated`);
  }
  // 🔴 AND THE SEVEN VENDORED 2026-08-31, BY THE SAME RULES. Every one is a real file on disk under
  // our own public/, so a path typo cannot ship as a silently broken square.
  for (const app of ["canvas", "google_classroom", "googlesheets", "notion", "one_drive", "outlook", "zoom"]) {
    assert.match(logoCode, new RegExp(`/brand/apps/${app}\\.svg`), `the ${app} logo is not wired`);
    const svg = readFileSync(new URL(`../../../public/brand/apps/${app}.svg`, import.meta.url), "utf8");
    assert.match(svg, /^(<svg|<\?xml)/, `${app}.svg is not an svg`);
    assert.ok(svg.length > 300, `${app}.svg looks truncated`);
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg), `${app}.svg references an external URL`);
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

test("🔴 the picker wears each project's own icon and colour, at the reference's measured sizes", () => {
  // Re-measured in the owner's own Chrome, 2026-08-30 evening: rows 36px (py-8 on a 20px line),
  // icons 20px tinted per project, panel bottom 12px above the chip (bottom-48 against the 36px
  // chip in the 44px row). The first pass shipped 32px rows and plain folders for every project.
  assert.match(PICKER, /name=\{folder\.icon \?\? "folder"\}/, "the rows ignore the project's own icon");
  assert.match(PICKER, /folder\.color \? \{ color: folder\.color \}/, "the rows ignore the project's own colour");
  assert.match(PICKER, /name=\{chosen \? \(chosen\.icon \?\? "folder-opened"\) : "folder"\}/, "the chip ignores the chosen project's icon");
  assert.match(PICKER, /bottom-\[48px\]/, "the panel gap drifted from the measured 12px");
  assert.match(PICKER, /py-\[8px\]/, "the rows drifted from the measured 36px");
});

test("🔴🔴 the + menu opens clear of the character instead of hiding it", () => {
  // 🔴 THE GUARD THIS REPLACES ASSERTED THE BUG. It pinned `opacity: addOpen ? 0 : 1` on the
  // greeter, written for the owner's 2026-08-30 report that the menu "should not go behind the
  // mascot". Fading the character satisfied the words and produced the next report — owner,
  // 2026-09-01: *"the plus menu causes the mascot to disappear (the plus icon menu show be infront
  // of mascot)."* A guard that describes the workaround is what makes the workaround permanent.
  //
  // 🔴 AND THE MENU CANNOT SIMPLY BE RAISED OVER THE CHARACTER, which is why the fade looked
  // unavoidable: the composer card is `relative z-[1]`, so it opens a stacking context and any
  // popover inside it is pinned to level 1 against the greeter's `z-30`, whatever z-index the
  // popover carries. The fix is placement, not order — the menu hangs BELOW the composer, which is
  // also where the reference puts it on this same screen (measured 2026-09-01: card 768x128, menu
  // top edge 8px under the card's bottom, left edges flush).
  const home = readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8");
  const source = home.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(!/opacity: addOpen/.test(source), "the character is hidden for the + menu again");
  assert.ok(!/pointerEvents: addOpen/.test(source), "the character is switched off for the + menu again");
  // 🔴 THE CLASS IS A TERNARY. The direction is chosen at open time by `useMenuSide`.
  assert.match(source, /addSide\.side === "below" \? "top-full mt-\[8px\]" : "bottom-full mb-\[8px\]"/, "the front door's + menu lost its measured placement");

  // 🔴🔴🔴 IT PREFERS **ABOVE** NOW, AND THIS GUARD HAS ARGUED ITSELF ROUND THE FULL CIRCLE.
  //   v1  pinned `opacity: addOpen` on the greeter — the character faded so the menu could show.
  //       That satisfied "the menu should not go behind the mascot" and produced the next report.
  //   v2  owner, 2026-09-01: *"the plus menu causes the mascot to disappear (the plus icon menu
  //       show be infront of mascot)."* The menu was sent DOWNWARD, and this guard concluded "the
  //       fix is placement, not order", because a popover inside the composer card is pinned to
  //       level 1 against the greeter's `z-30` however high its own z-index goes.
  //   v3  that reasoning was right about the popover and wrong about what to raise. The trap is
  //       the CARD's stacking context, so the card is what rises — `z-40` while the menu is open —
  //       and order works after all. The owner picked this from four drawn options: *"it should
  //       like just be in front of the mascot… it should open up."*
  //
  // 🔴 WHAT NEVER CHANGES, AND IS THE REAL SUBJECT OF THIS TEST: the character is not hidden,
  // faded or switched off for a menu. Both assertions above still hold, and they are what v1 got
  // wrong. A menu in front of a character is not the same thing as no character.
  assert.match(source, /useMenuSide\(addOpen, "above"\)/, "the front door's + menu stopped opening upward over the character");
  assert.match(source, /addOpen \? "z-40" : "z-\[1\]"/, "the composer card stopped rising, so its menu is trapped under the character again");
  assert.ok(!/bottom-\[52px\]/.test(source), "the + menu is back on a fixed offset from the button");
});

test("🔴🔴 neither + menu is anchored to its button, because the composer is what it must clear", () => {
  // Both offsets were measured against a ONE-ROW composer and both boxes grow: the front door's is
  // 128px tall since #902, and the session's grows with every line typed. A popover placed a fixed
  // distance from a button sitting on the FLOOR of a growing box moves into the box as it grows.
  // Anchoring to the card instead makes `top-full` / `bottom-full` mean "clear of the whole pill"
  // at any height, so this cannot come back the next time either composer changes size.
  // 🔴 COMMENTS STRIPPED. Both files EXPLAIN the offsets they no longer use, and a bare source
  // match reads the explanation as the offence — this repo's guards have tripped on their own
  // prose twice already.
  const strip = (text: string) => text.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const home = strip(readFileSync(new URL("./canvas-home.tsx", import.meta.url), "utf8"));
  const composer = strip(readFileSync(new URL("./canvas-composer.tsx", import.meta.url), "utf8"));
  assert.match(home, /<div className="shrink-0 justify-self-start self-end \[grid-area:add\]" ref=\{addMenu\}>/, "the front door's + wrapper is positioned again, so the menu anchors to the button");
  assert.match(composer, /<div className="shrink-0" ref=\{addMenu\}>/, "the session's + wrapper is positioned again, so the menu anchors to the button");
  assert.match(composer, /addSide\.side === "below" \? "top-full mt-\[8px\]" : "bottom-full mb-\[8px\]"/, "the session's + menu lost its measured placement");
  assert.match(composer, /useMenuSide\(addOpen, "above"\)/, "the session's + menu no longer prefers the side with the room");
  assert.ok(!/bottom-\[46px\]/.test(composer), "the session's + menu is back on a fixed offset from the button");
});

test("🔴🔴 a stray ?folder= never decides the surface", () => {
  // The same rule `cap` carries: a filing instruction is a fact ABOUT a submission. With nothing
  // asked there is nothing to file, so it must open the front door like any unknown parameter.
  const surface = ENTRY.slice(ENTRY.indexOf("export function learnSurface"));
  assert.ok(!/folder/.test(surface), "?folder= can now open a canvas on its own");
});

test("🔴 the canvas files itself once, through the same door dragging uses", () => {
  // 2026-08-30: the call captures the id and RETRIES — the write is an update racing the first
  // save, and a single fire-and-forget matched zero rows on a fresh canvas (measured live). The
  // door is unchanged: still setCanvasFolder, the same write dragging uses.
  assert.match(CANVAS, /setCanvasFolder\(uid, id, openingFolder\)/, "the opening project is never applied");
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
  // 🔴 THE PILL'S LEVEL IS CONDITIONAL SINCE 2026-09-01 (`z-[1]` at rest, `z-40` while the + menu
  // is open, so the menu can paint over the character). Both are above the tray, which is a later
  // sibling at level 0 inside this context — so the tuck this guards is unaffected, and asserting
  // the literal `relative z-[1]` next to the radius would pin a class string rather than the rule.
  assert.match(HOME, /rounded-\[var\(--composer-radius\)\]/, "the pill lost the composer radius the tray is cut to");
  assert.match(HOME, /addOpen \? "z-40" : "z-\[1\]"/, "the pill has no stacking level, so the tray washes its bottom edge");
  // And the token exists in BOTH themes — a light-only tray is invisible-in-dark, the classic bug.
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--composer-tray: rgba\(0, 0, 0, 0\.03\);/, "the light tray ink is gone");
  assert.match(css, /:root\[data-theme='dark'\][\s\S]*?--composer-tray: rgba\(255, 255, 255, 0\.08\);/, "the tray has no dark ink");
});

test("🔴🔴 both menus open upward and are built to the reference's own panel", () => {
  // 🔴 THE THIRD ANSWER ON DIRECTION, AND THIS ONE IS THE OWNER'S — the history is in the
  // component. The old assertion here (`absolute top-[40px]`, downward) was my own taste written
  // down as a rule; the reference anchors its panel's BOTTOM above the button, left-aligned,
  // 224 wide (projects) and 240 (apps), radius 20, `10px 0` padding — and its shadow is the
  // composer's exact three layers, reused not restated.
  // 🔴 THE GAP RE-MEASURED AGAIN 2026-08-30 EVENING, in the owner's own Chrome with
  // getBoundingClientRect: panel bottom sits 12px above the chip, not the 4px pinned earlier —
  // bottom-48 against the 36px chip in the 44px row.
  assert.match(PICKER, /absolute bottom-\[48px\] left-0/, "the menus stopped opening upward at the measured gap");
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
