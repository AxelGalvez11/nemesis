import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The Apps page, guarded the way every other surface in this repo is guarded: by reading its
// own source. This app has no DOM test harness (see `canvas-runtime-branch.test.ts`), so a
// structural property is checked by reading the file rather than by rendering it. The idiom, the
// comment stripper and the two calibration tests below are copied from
// `components/workspace/learn/send-is-acknowledged.test.ts`.
//
// Two things are worth a guard here, and they are different in kind.
//
// 🔴 ONE: THE PRECISION GEOMETRY. A number that drifts does not break anything, throws nothing,
// and is invisible in review, which is exactly why the selected layout needs a source-level test.
//
// 🔴 TWO: "NOT SET UP YET". `/api/composio` answers HTTP 200 with `{apps, configured: false}` when
// the server has no key. That is a state the page renders, not a failure it interprets, and it is
// the state EVERY developer without a Composio key sees, so it is also the state most likely to be
// broken without anybody noticing. Three separate things have to stay true for it: the route keeps
// answering 200 with the list, the page keeps drawing that list, and the page draws no connect
// control over it.

const PAGE = readFileSync(new URL("./plugins-page.tsx", import.meta.url), "utf8");
const ICON = readFileSync(new URL("./plugin-icon.tsx", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../../../app/api/composio/route.ts", import.meta.url), "utf8");

/** Source with every comment removed: `//` lines, `/* … *​/` blocks, and the `{/* … *​/}` a block
 *  comment becomes inside JSX. Without this, every assertion below would be reading this file's
 *  own explanation of the rule rather than the rule. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const pageCode = code(PAGE);
const iconCode = code(ICON);

// ── Calibration: the two ways a source-reading guard passes while checking nothing ─────────────

test("the guard is reading real files", () => {
  // A guard pointed at a missing or empty file passes every assertion vacuously.
  assert.ok(PAGE.length > 4_000, `plugins-page.tsx read as ${PAGE.length} chars`);
  assert.ok(ICON.length > 800, `plugin-icon.tsx read as ${ICON.length} chars`);
  assert.ok(ROUTE.length > 4_000, `the composio route read as ${ROUTE.length} chars`);
});

test("the comment stripper removes real content, and rendered copy survives it", () => {
  // Both halves. A stripper that removes nothing makes the "no em dash" and "no Skills tab" checks
  // read this file's own comments; a stripper that removes everything makes them true of an empty
  // string. This page is heavily commented, so the surviving fraction is genuinely small.
  assert.ok(pageCode.length < PAGE.length, "stripCopy removed nothing");
  assert.ok(pageCode.length > PAGE.length * 0.2, "stripCopy removed almost everything");
  assert.match(pageCode, /Connected/, "a plain rendered string did not survive stripping");
});

// ── The measured numbers (reference: scratchpad/ref/chatgpt-reference.md) ──────────────────────

// ── The frame ────────────────────────────────────────────────────────────────────────────────
//
// 🔴🔴 2026-09-04: THE NUMBERS LEFT THIS FILE. The owner pointed at gemini.google.com/library and
// asked for "consistent spacing across projects, library, and apps pages", so the column, the
// title row, the round buttons and the soft row live in `shell/page-frame.tsx` and are guarded
// once, in `page-frame.test.ts`. What this file guards is that Apps USES that frame, that its
// sections are TRUE of what is under them, and that a row still does the one thing it is for.

test("🔴🔴 the page is drawn on the shared frame, not on a private copy of it", () => {
  assert.match(pageCode, /from "@\/components\/workspace\/shell\/page-frame"/, "the page stopped importing the frame");
  assert.match(pageCode, /<PageFrame>/, "the scroller and column are not the frame's");
  assert.match(pageCode, /<PageTitle controls=\{searchControl\}>Apps<\/PageTitle>/, "the title row is not the frame's");
  assert.match(pageCode, /<Section\b/, "the sections are not the frame's");
  assert.ok(!/<h1\b|max-w-\[768px\]|max-w-\[776px\]|ALIGNED/.test(pageCode), "a page-private title or column survived");
  assert.ok(!/Work with Nemesis in the apps you already use/.test(pageCode), "the removed Apps subtitle returned");
});

test("🔴🔴 the sections are the list's own groups, in the list's own order", () => {
  // Every app the route sends carries a `group`; `APP_GROUPS` names them. An earlier draft cut
  // the list at its sixth entry and called the halves "Popular" and "Study & productivity", which
  // put Gmail in one and Outlook in the other. A heading has to be true of what is under it.
  assert.match(pageCode, /import \{ APP_GROUPS \} from "@\/lib\/workspace\/composio-apps";/);
  assert.match(pageCode, /APP_GROUPS\.map\(\(group\) => \(\{ apps: shown\.filter\(\(app\) => app\.group === group\.id\), label: group\.label \}\)\)/);
  assert.ok(!/slice\(0, 6\)|"Popular"|"Study & productivity"/.test(pageCode), "the invented categories came back");
  // 🔴 AN EMPTY GROUP IS NOT DRAWN. A heading over nothing looks broken, not empty.
  assert.match(pageCode, /\.filter\(\s*\(section\) => section\.apps\.length > 0,?\s*\)/);
});

test("🔴 Connected is a section with no chevron, drawn only when something is connected", () => {
  // There is nothing to view all OF, so no round chevron; and an empty strip under "Connected"
  // is a shelf that looks broken rather than empty.
  assert.match(pageCode, /\{connected\.length > 0 && \(\s*<Section title="Connected">/);
  const connectedBlock = pageCode.slice(pageCode.indexOf('<Section title="Connected">'), pageCode.indexOf("</Section>"));
  assert.ok(!/ChevronRight|View all/.test(connectedBlock), "the Connected heading grew a chevron that goes nowhere");
});

test("🔴🔴 an app row is the frame's soft row, single column, with its whole sentence", () => {
  assert.match(pageCode, /cn\(SOFT_ROW, "items-center hover:bg-black\/\[0\.03\] dark:hover:bg-white\/\[0\.06\]"\)/, "the row is not the frame's soft row, or it lights up on hover while doing nothing");
  assert.match(pageCode, /style=\{\{ minHeight: FRAME_ROW_H_PX \}\}/, "the row is not the frame's 89px");
  assert.match(pageCode, /<div className="flex flex-col" style=\{\{ gap: FRAME_ROW_GAP_PX \}\}>/, "the rows are not on the frame's 8px gap, or went back to two columns");
  assert.match(iconCode, /h-\[40px\] w-\[40px\]/, "the app icon drifted from 40x40");
  assert.match(iconCode, /rounded-\[10px\]/, "the app icon's 10px corner is gone");
  // 🔴 THE DESCRIPTION IS READ, NOT TRUNCATED. On a 760px row it has room for two lines; the
  // one-line-with-an-ellipsis version cut ten of eleven sentences.
  assert.match(pageCode, /line-clamp-2 text-\[length:var\(--canvas-text-small\)\] leading-\[18px\] text-\(--ui-text-secondary\)">\{app\.detail\}/, "the description truncates again, or left the small step");
  assert.ok(!/truncate[^"]*">\{app\.detail\}|text-\[11px\]/.test(pageCode), "the 11px one-line description came back");
  assert.match(pageCode, /block truncate text-\[length:var\(--canvas-text-body\)\] leading-\[24px\] font-normal text-\(--ui-text-primary\)">\{app\.label\}/, "the row title is not the frame's body step");
});

test("🔴🔴 the row's one control is the frame's round button, and there is none until the server is configured", () => {
  assert.match(pageCode, /\{configured && \(/, "a connect control is drawn on a server that cannot connect anything");
  assert.match(pageCode, /<RoundButton label=\{`Connect \$\{app\.label\}`\} onClick=\{onConnect\}>/, "Connect is not the frame's round button");
  assert.match(pageCode, /aria-label=\{`Options for \$\{app\.label\}`\}/, "a connected app lost its menu");
  assert.match(pageCode, /Disconnect/, "a connected app cannot be disconnected");
});

test("🔴 no rem-named type class is used on this page", () => {
  // `html { font-size: 112.5% }` in this app, so `text-sm` paints 15.75px and `gap-2` paints 9px.
  // Every measured number above would be quietly off by 12.5% the moment one of these appears.
  for (const cls of ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl"]) {
    assert.ok(!new RegExp(`\\b${cls}\\b`).test(pageCode + iconCode), `${cls} is back: it paints 1.125x its name here`);
  }
});

// ── "Not set up yet" ──────────────────────────────────────────────────────────────────────────

test("🔴 the route still answers 200 with the app list when it has no key", () => {
  // The page's whole unconfigured state rests on this: the list arrives even though nothing can be
  // connected. If this ever became a 500 or an empty body, the page would have nothing to draw and
  // the sentence below would be sitting over a blank shelf.
  assert.match(
    ROUTE,
    /return Response\.json\(\{ apps: APPS, configured: false \}\)/,
    "the composio route stopped answering 200 with its app list when unconfigured",
  );
});

test("🔴 the page says 'not set up yet' in plain words, and says it for the unconfigured state", () => {
  assert.match(pageCode, /!status\.configured && \(/, "the unconfigured branch is gone");
  assert.match(
    pageCode,
    /Connected apps are not set up on this server yet\./,
    "the plain-English unconfigured sentence is gone",
  );
  // Not an error, and not a shrug. The learner is told there is nothing for them to do, because
  // there genuinely is not: the missing piece is a server key.
  assert.match(pageCode, /There is nothing for you to do\./, "the reassurance went missing");
  for (const scary of ["Error", "error", "failed", "Something went wrong"]) {
    const sentence = pageCode.slice(pageCode.indexOf("!status.configured"), pageCode.indexOf("!status.configured") + 600);
    assert.ok(!sentence.includes(scary), `the unconfigured state reads as a failure ("${scary}")`);
  }
});

test("🔴 the grid is drawn from the app list, NOT gated on being configured", () => {
  // A learner on a server without a key should still see which apps are coming. Gating the grid on
  // `configured` would show them an empty page and tell them nothing.
  assert.match(pageCode, /\{status\.apps\.length > 0 && \(/, "the grid is no longer gated on having a list");
  assert.ok(!/\{status\.configured && \(/.test(pageCode), "the grid got gated on `configured` again");
});

test("🔴🔴 no connect control is drawn until the server is configured", () => {
  // The counterpart to the test above, and the reason this page can show the list at all: the row
  // draws its `+` only when the connection can actually be started. A `+` that cannot connect
  // anything is this codebase's most-repeated defect (§38, "a control that does not do anything").
  assert.match(pageCode, /configured && \(\s*<span className="shrink-0">/, "the trailing control is no longer gated on `configured`");
  assert.match(pageCode, /configured: boolean;/, "the row stopped being told whether the server is set up");
});

// ── What this page must not become ────────────────────────────────────────────────────────────

test("🔴 the app list is the server's, never a second copy here", () => {
  // `/api/composio` owns which apps may be connected and the one-line description of each. A copy
  // in the UI is a list that agrees on the day it is written and silently disagrees afterwards.
  for (const label of ["Google Drive", "Gmail", "Google Calendar", "Google Docs"]) {
    assert.ok(!pageCode.includes(label), `"${label}" is hardcoded in the page; it belongs to the route`);
  }
  assert.match(pageCode, /status\.apps\.filter/, "the page stopped reading the server's list");
});

test("🔴 an app the glyph map has never heard of still gets a tile", () => {
  // The connectable list is the owner's to grow. A glyph map covering only today's four would draw
  // an empty square for the fifth, which reads as a broken image rather than as a new app.
  assert.match(iconCode, /charAt\(0\)\.toUpperCase\(\)/, "the unknown-app initial fallback is gone");
});

test("🔴 there is no Skills tab", () => {
  // The reference pairs Plugins with a Plugins/Skills segmented toggle. We have no skills, and a
  // tab whose contents do not exist is worse than no tab.
  assert.ok(!/Skills/.test(pageCode), "a Skills tab appeared; nothing is behind it");
});

test("🔴 connecting and disconnecting still drop the canvas's cached tool catalogue", () => {
  // That cache holds what a learner can ask Nemesis to do for up to two minutes. Without this,
  // connecting Gmail here and immediately asking a canvas about your mail reads as the connection
  // not having worked. The Settings card has always done it; the page inherited the duty.
  assert.match(pageCode, /forgetToolCatalogue\(\);/, "the tool catalogue is no longer dropped on refresh");
});

test("🔴 the consent tab is opened with noopener, in a new tab", () => {
  // The provider's page must not get a handle on this one, and the learner must not lose a
  // half-typed canvas to an OAuth redirect.
  assert.match(pageCode, /window\.open\(url, "_blank", "noopener,noreferrer"\)/, "the consent tab lost its noopener");
});

test("🔴 no em dash or en dash reaches anything a learner reads", () => {
  // Owner, 2026-08-25: no em dashes, anywhere the product speaks. Comments are stripped first,
  // because the rule cannot be explained without naming the thing it bans.
  const dashes = /—|–|&mdash;|&ndash;|&#8212;|&#8211;/;
  for (const [name, source] of [["plugins-page.tsx", pageCode], ["plugin-icon.tsx", iconCode]] as const) {
    const offenders = source.split("\n").filter((line) => dashes.test(line));
    assert.deepEqual(offenders, [], `${name} ships a dash in copy:\n${offenders.join("\n")}`);
  }
});
