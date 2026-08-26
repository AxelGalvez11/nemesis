import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The Plugins page, guarded the way every other surface in this repo is guarded: by reading its
// own source. This app has no DOM test harness (see `canvas-runtime-branch.test.ts`), so a
// structural property is checked by reading the file rather than by rendering it. The idiom, the
// comment stripper and the two calibration tests below are copied from
// `components/workspace/learn/send-is-acknowledged.test.ts`.
//
// Two things are worth a guard here, and they are different in kind.
//
// 🔴 ONE: THE MEASURED NUMBERS. This page exists to match a reference that was measured off the
// live product on 2026-08-26 at a 1456px viewport, with `getComputedStyle` rather than by eye. A
// number that drifts does not break anything, throws nothing, and is invisible in review, which is
// exactly why it needs a test. Each assertion below names the reference section it came from.
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
  assert.match(pageCode, /All apps/, "a plain rendered string did not survive stripping");
});

// ── The measured numbers (reference: scratchpad/ref/chatgpt-reference.md) ──────────────────────

test("🔴 the page frame is a centred 776px box holding the reference's 768px reading column", () => {
  // Reference §2 measures the content column at 768px; §4 measures the app grid at 776px overall.
  // Both are true at once because the grid sits 4px proud of the column on each side, so the box
  // is 776 and everything that is not the grid is inset by 4 (`ALIGNED`).
  assert.match(pageCode, /max-w-\[776px\]/, "the 776px content box is gone");
  assert.match(pageCode, /mx-auto/, "the content box is no longer centred");
  assert.match(pageCode, /const ALIGNED = "px-\[4px\]";/, "the 4px reading-column inset is gone");
  // 🔴 AND THE PAGE PADDING IS NOT ON THE SAME ELEMENT. It was, in the first draft, and it ate
  // 48px out of the box: the two 384px tracks silently shrank to 356 and nothing errored. The
  // padding belongs to a wrapper OUTSIDE the box whose width is being measured.
  assert.ok(
    !/max-w-\[776px\][^"]*px-\[/.test(pageCode),
    "page padding is back on the 776px box; the 384px columns will shrink to fit",
  );
});

test("🔴 the title block is 28px/500 over a 16px subtitle", () => {
  // Reference §2 and §4: page title 28px / weight 500 / line-height 34px; the optional subtitle
  // directly under it is 16px / weight 400 / --text-secondary.
  assert.match(
    pageCode,
    /text-\[28px\] leading-\[34px\] font-medium text-\(--ui-text-primary\)/,
    "the title drifted from 28px / 34px / weight 500",
  );
  assert.match(
    pageCode,
    /text-\[16px\][^"]*text-\(--ui-text-secondary\)/,
    "the subtitle drifted from 16px in secondary text",
  );
});

test("🔴 the search input is a 36px rounded-full pill, 240px wide, at 14px", () => {
  // Reference §2: "Search input, right-aligned on the title row: height 36px, font 14px, rounded
  // full, 240px wide (Library) to 240-280px (Plugins). Leading magnifier icon."
  assert.match(pageCode, /h-\[36px\] w-\[240px\][^"]*rounded-full/, "the search pill drifted from 36x240 rounded-full");
  assert.match(pageCode, /text-\[14px\] text-\(--ui-text-primary\)/, "the search field is no longer 14px");
  assert.match(pageCode, /<Search\b/, "the leading magnifier is gone");
});

test("🔴 section headers are 14px / weight 500", () => {
  // Reference §4: 'Section headers ("Featured", "Productivity"): 14px / weight 500 /
  // --text-primary.' Two headers use it here, "Connected" and "All apps".
  const headers = pageCode.match(/text-\[14px\] font-medium text-\(--ui-text-primary\)/g) ?? [];
  assert.ok(headers.length >= 2, `expected both section headers at 14px/500, found ${headers.length}`);
});

test("🔴 the app grid is 2 columns of 384px, row-gap 16px, column-gap 8px", () => {
  // Reference §4: "App grid: 2 columns of 384px, row-gap 16px, column-gap 8px (776px overall)."
  assert.match(pageCode, /gap-x-\[8px\]/, "the 8px column gap is gone");
  assert.match(pageCode, /gap-y-\[16px\]/, "the 16px row gap is gone");
  assert.match(pageCode, /minmax\(0,384px\)/, "the 384px column width is gone");
  // Measured in a browser against the compiled stylesheet on 2026-08-26: at a 1456px viewport the
  // two tracks come out at exactly 384px and the grid at 776px. It only does so while the grid is
  // the full width of the 776px box, so the grid takes `w-full` and no max-width of its own.
  assert.match(pageCode, /grid w-full grid-cols-1/, "the grid stopped filling the 776px box");
});

test("🔴 an app row is 76px tall with a 40x40 icon slot", () => {
  // Reference §4: "App row height ~76px: icon 40x40, rounded ~10px". The icon is its own component
  // because the "Connected" strip draws the same 40px tile.
  //
  // 🔴 THE 10px CORNER NOW BELONGS TO THE FALLBACK TILE ONLY, and that is the 2026-08-26 change
  // rather than drift. A real brand mark carries its own silhouette and its own transparent ground;
  // sitting it inside our grey rounded square would frame someone else's logo in our furniture. The
  // unknown-app initial still gets the tile, because a bare letter has no shape of its own.
  assert.match(pageCode, /h-\[76px\][^"]*px-\[4px\]/, "the row drifted from 76px tall on the 4px reading inset");
  assert.match(iconCode, /h-\[40px\] w-\[40px\]/, "the app icon drifted from 40x40");
  assert.match(iconCode, /rounded-\[10px\]/, "the fallback tile's 10px corner is gone");
});

test("🔴🔴 the four Google apps show their REAL marks, drawn here, never fetched", () => {
  // Owner 2026-08-26: *"the plugins page still doesn't have the actual Gmail or Google app icons,
  // the real ones, not just a fake one."* This file used to say "we do not ship third-party logos"
  // and drew a grey lucide glyph naming the KIND of thing each app was. Side by side with any other
  // product's integrations page it read as a placeholder, because that is what it was.
  //
  // 🔴 THE OTHER HALF OF THE OLD RULE STANDS AND IS WHAT THIS GUARD PROTECTS. A remote <img> would
  // be a request to a third party on every page load, a broken square the day the URL moves, and a
  // beacon telling Google which of our users opened this page.
  assert.ok(!/<img|https?:\/\//.test(iconCode), "a plugin icon is being fetched from somewhere instead of drawn here");
  for (const slug of ["googlecalendar", "googledocs", "googledrive", "gmail"]) {
    assert.ok(iconCode.includes(slug), `${slug} lost its mark and falls back to an initial`);
  }
  // Brand marks are multi-colour by definition. A mark that inherited our ink would be the grey
  // placeholder again wearing a new shape.
  assert.ok(!/currentColor/.test(iconCode), "a brand mark is painting itself in our text colour");
  assert.ok((iconCode.match(/fill="#/g) ?? []).length >= 12, "the marks lost their own colours");
  // 🔴 KEYED BY SLUG, NOT BY LABEL. Labels are display copy the server may reword; the slug is the
  // identifier connect and disconnect already travel on.
  assert.ok(!/"Google Drive"|"Gmail"/.test(iconCode), "the mark map is keyed by display label again");
});

test("🔴 the row's title is 14px primary and its description one truncated line of 13px tertiary", () => {
  // Reference §4: "title 14px / weight 400 / --text-primary; description 13px / weight 400 /
  // --text-tertiary, one line, truncated".
  assert.match(
    pageCode,
    /truncate text-\[14px\][^"]*font-normal text-\(--ui-text-primary\)/,
    "the row title drifted from a truncated 14px/400 primary line",
  );
  assert.match(
    pageCode,
    /truncate text-\[13px\][^"]*font-normal text-\(--ui-text-tertiary\)/,
    "the row description drifted from a truncated 13px/400 tertiary line",
  );
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
  assert.match(pageCode, /configured && \(\s*<div className="shrink-0">/, "the trailing control is no longer gated on `configured`");
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
