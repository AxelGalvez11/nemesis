import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The icon lane, guarded the way `plugins-page.test.ts` guards layout: by reading source rather
// than rendering it (this app has no DOM test harness; see that file's own header for why). This
// file is the counterpart for `plugin-icon.tsx` and `marks/`, the module that replaced the old
// "we do not ship logos" lucide glyphs with real, hand-drawn Google marks.
//
// Three things are worth a guard here.
//
// 🔴 ONE: EVERY APP THE ROUTE OFFERS HAS A DRAWN MARK. `/api/composio`'s `APPS` list is the one
// place the connectable set is named (see `plugins-page.test.ts`'s own note on why nothing here
// keeps a second copy). If a slug ever appears there without a matching entry in `marks/`, that
// app silently drops to the first-letter tile, which is a real fallback but a worse-looking one,
// and nothing else would say so.
//
// 🔴 TWO: NOTHING HOTLINKS. `plugin-icon.tsx`'s own header says why: a remote `<img>` is a
// third-party request on every load and a broken square the day the URL moves. Every mark must be
// inline SVG built from this repo's own source, never a fetched or hotlinked image.
//
// 🔴 THREE: AN UNKNOWN SLUG STILL GETS A TILE. The letter fallback is the safety net for whatever
// app Composio offers next before anyone draws it a mark; losing that line means a future app
// renders nothing at all.

const ICON = readFileSync(new URL("./plugin-icon.tsx", import.meta.url), "utf8");
const MARKS_INDEX = readFileSync(new URL("./marks/index.ts", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../../../app/api/composio/route.ts", import.meta.url), "utf8");

const MARK_FILES: Readonly<Record<string, string>> = {
  gmail: readFileSync(new URL("./marks/gmail-mark.tsx", import.meta.url), "utf8"),
  googlecalendar: readFileSync(new URL("./marks/google-calendar-mark.tsx", import.meta.url), "utf8"),
  googledocs: readFileSync(new URL("./marks/google-docs-mark.tsx", import.meta.url), "utf8"),
  googledrive: readFileSync(new URL("./marks/google-drive-mark.tsx", import.meta.url), "utf8"),
};

/** Source with every comment removed, the same stripper `plugins-page.test.ts` uses, so an
 *  assertion reads the rule rather than this file's own explanation of it. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const iconCode = code(ICON);
const marksIndexCode = code(MARKS_INDEX);

// ── Calibration: a guard pointed at a missing or empty file passes vacuously ────────────────────

test("the icon guard is reading real files", () => {
  assert.ok(ICON.length > 500, `plugin-icon.tsx read as ${ICON.length} chars`);
  assert.ok(MARKS_INDEX.length > 200, `marks/index.ts read as ${MARKS_INDEX.length} chars`);
  assert.ok(ROUTE.length > 4_000, `the composio route read as ${ROUTE.length} chars`);
  for (const [slug, source] of Object.entries(MARK_FILES)) {
    assert.ok(source.length > 200, `marks/*-mark.tsx for "${slug}" read as ${source.length} chars`);
  }
});

// ── One: every app the route offers has a drawn mark ─────────────────────────────────────────────

test("🔴 every app slug in the composio route's closed list has a real mark", () => {
  const slugs = [...ROUTE.matchAll(/key:\s*"([a-z0-9]+)"/g)]
    .map((match) => match[1])
    .filter((slug): slug is string => Boolean(slug));
  assert.ok(slugs.length >= 4, `expected at least 4 app slugs in the route, found ${slugs.length}`);
  for (const slug of slugs) {
    assert.match(
      marksIndexCode,
      new RegExp(`\\b${slug}:\\s*\\w+Mark\\b`),
      `"${slug}" is offered by /api/composio but marks/index.ts draws it no mark`,
    );
    assert.ok(slug in MARK_FILES, `"${slug}" has no marks/*-mark.tsx source file loaded by this test`);
  }
});

test("🔴 plugin-icon.tsx actually looks the slug up in MARKS, not a dead import", () => {
  assert.match(iconCode, /import\s*\{\s*MARKS\s*\}\s*from\s*"\.\/marks"/, "plugin-icon.tsx stopped importing MARKS");
  assert.match(iconCode, /MARKS\[appKey\]/, "plugin-icon.tsx stopped looking the app up in MARKS");
});

// ── Two: nothing hotlinks ─────────────────────────────────────────────────────────────────────

test("🔴🔴 no mark hotlinks a third-party image, and none loads a remote stylesheet URL", () => {
  const sources = [["plugin-icon.tsx", iconCode], ["marks/index.ts", marksIndexCode]] as const;
  const markSources = Object.entries(MARK_FILES).map(([slug, source]) => [`marks (${slug})`, code(source)] as const);
  // `url(#clip-id)` is how an SVG points a `clipPath` at its own `<defs>` a few lines up: a
  // same-document fragment reference, zero network I/O, and the idiom `GmailMark` uses so two
  // copies of one mark on the same page (the "Connected" strip and its grid row) do not fight over
  // one hardcoded id. A hotlink is `url(` pointed at an actual address instead of a local `#id` or
  // an inlined `data:` URI, so only THAT shape is what this checks for.
  const externalUrlRef = /url\(\s*['"]?(?!#|data:)\S/i;
  for (const [name, source] of [...sources, ...markSources]) {
    assert.ok(!/<img\b/i.test(source), `${name} draws an <img> element; marks must be inline SVG`);
    assert.ok(!/https?:\/\//i.test(source), `${name} references a network URL; that is a hotlink`);
    assert.ok(!externalUrlRef.test(source), `${name} points url() at something other than a local #id or a data: URI`);
  }
});

// ── Three: an unknown slug still gets a tile ──────────────────────────────────────────────────

test("🔴 an app the marks map has never heard of still gets a letter tile", () => {
  assert.match(iconCode, /charAt\(0\)\.toUpperCase\(\)/, "the unknown-app initial fallback is gone");
  // And the fallback has to be reachable: it must sit behind a check that the lookup came back
  // empty, not unconditionally after the real-mark branch already returned.
  assert.match(iconCode, /if\s*\(Mark\)\s*\{/, "the real-mark branch no longer guards on finding one");
});

// ── What a "real mark" has to mean: several brand colours, not a single-tone stand-in ───────────

test("🔴 each drawn mark uses more than one brand colour", () => {
  // Calendar's minimum is 2, not a typo-waiting-to-happen: the redraw below deliberately pared it
  // down to white and Google Blue, since that IS the real mark's palette. A higher floor here would
  // reward exactly the mistake the redraw fixed (piling on colours, like the old four-stripe
  // header, that Google's own icon does not have).
  const minimumColours: Readonly<Record<string, number>> = {
    gmail: 4,
    googlecalendar: 2,
    googledocs: 2,
    googledrive: 3,
  };
  for (const [slug, source] of Object.entries(MARK_FILES)) {
    const hexColours = new Set((source.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((hex) => hex.toUpperCase()));
    const expected = minimumColours[slug] ?? 2;
    assert.ok(
      hexColours.size >= expected,
      `"${slug}"'s mark uses ${hexColours.size} distinct colour(s) (${[...hexColours].join(", ")}); expected at least ${expected}`,
    );
  }
});

// ── Two redraws, 2026-08-26: Calendar read as a binder and Gmail as a flat colour block ─────────

test("🔴🔴 the Calendar mark actually draws its numeral, the one thing that makes it recognisable", () => {
  // The first draft had a frame, two ring tabs and a four-colour header and still read as a
  // generic desk calendar, because the one detail that says "Google Calendar" specifically, the
  // date numeral, was not there. This checks the numeral is literally in the markup, not just
  // decided in a comment somewhere.
  assert.match(
    MARK_FILES.googlecalendar ?? "",
    /<text\b[^>]*>\s*31\s*<\/text>/,
    "the Calendar mark no longer renders the \"31\" numeral",
  );
  assert.match(code(MARK_FILES.googlecalendar ?? ""), /fill="#4285F4"/, "the numeral is no longer Google Blue");
  // And the ring tabs are gone for good: they were the single biggest reason the first draft read
  // as a spiral-bound desk calendar rather than Google's mark, which has no binding at all.
  assert.ok(!/rx="1\.5"/.test(code(MARK_FILES.googlecalendar ?? "")), "a ring-tab shape is back on the Calendar mark");
});

test("🔴🔴 the Gmail mark is a white envelope with a stroked flap, not a solid four-colour block", () => {
  // The first draft filled the whole envelope with four polygons meeting at one centre point,
  // leaving no white at all: a colour-blocked rectangle, not an envelope. The fix keeps most of the
  // tile white and draws the flap as a stroked path (a checkmark line, the way the real fold reads)
  // instead of a filled triangle, so this checks for both halves of that shape.
  const gmailCode = code(MARK_FILES.gmail ?? "");
  assert.match(gmailCode, /fill="#FFFFFF"/i, "the Gmail mark lost its white interior");
  assert.match(
    gmailCode,
    /<path\b[^>]*stroke="#EA4335"[^>]*\/>/,
    "the red flap is no longer a stroked path; a filled polygon would solid-block the envelope again",
  );
  assert.match(gmailCode, /<path\b[^>]*fill="none"/, "the flap path is filled instead of stroked");
});

// ── The tile a real mark sits on is fixed, not tinted by the workspace theme ────────────────────

test("🔴🔴 a real mark sits on a fixed white tile, not a theme-mixed one, so dark mode cannot swallow it", () => {
  assert.match(iconCode, /bg-white\b/, "the real-mark tile is no longer a fixed white; check it still reads in dark mode");
  // The old lucide category glyphs are gone, not just supplemented: every offered app now has an
  // accurate mark, and a leftover generic glyph would be a second, unused way to draw an icon.
  assert.ok(!/lucide-react/.test(ICON), "plugin-icon.tsx still imports lucide-react; the generic glyph tier should be gone");
});

test("🔴 the 40x40 rounded tile survives for both the real-mark and fallback branches", () => {
  const tiles = iconCode.match(/h-\[40px\] w-\[40px\][^"]*rounded-\[10px\]/g) ?? [];
  assert.ok(tiles.length >= 2, `expected a 40x40/rounded-10px tile in both branches, found ${tiles.length}`);
});
