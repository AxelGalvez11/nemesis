import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The icon lane, guarded the way `plugins-page.test.ts` guards layout: by reading source rather
// than rendering it (this app has no DOM test harness; see that file's own header for why). This
// file is the counterpart for `plugin-icon.tsx` and `marks/`, the module that replaced the old
// "we do not ship logos" lucide glyphs with the real Google marks, in their published geometry.
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
      `"${slug}" is offered by /api/composio but marks/index.ts gives it no mark`,
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

// ── Three redraws, and the third one stopped drawing ──────────────────────────────────────────
//
// 🔴🔴🔴 THE TWO GUARDS THAT USED TO SIT HERE ARE REPOINTED, NOT DELETED, AND THE HISTORY IS THE
// POINT. They pinned the SECOND draft of the Calendar and Gmail marks: a `<text>31</text>` in
// Arial over a white square with a blue border, and a red checkmark STROKED across a white
// envelope. Both were honest improvements on a first draft (a ring-bound binder; four solid colour
// quadrants), both were reviewed, and both were still hand-drawn approximations. The owner said so
// twice, the second time after the redraws had shipped: *"the plugins page still doesn't have the
// actual Gmail or Google app icons, the real ones, not just a fake one."*
//
// 🔴 THE PATTERN IS THE LESSON, AND THIS CODEBASE HAS IT ON RECORD ELSEWHERE (`character-signals-
// are-dead`): three rounds of redrawing a mark by eye, each one a true improvement, none of them
// the thing being asked for. The answer was never a better approximation. It was to stop
// approximating and draw the published geometry.
//
// So the guards below pin what a REAL mark has that a drawn-by-eye one does not, rather than the
// details of any one attempt. A future "let me just simplify this shape" reddens them.

test("🔴🔴 the Calendar numeral is DRAWN, never set in a font the machine happens to have", () => {
  // `<text font-family="Arial">31</text>` renders as whatever that machine calls Arial, at whatever
  // it interprets weight 700 as, and Google's numeral is neither. It is geometry, and geometry is
  // the same shape on every device that has ever existed.
  const calendar = code(MARK_FILES.googlecalendar ?? "");
  assert.ok(!/<text\b/.test(calendar), "the Calendar numeral is set in a font again; it must be paths");
  assert.ok(!/font-?[Ff]amily/.test(calendar), "the Calendar mark depends on a font being installed");
  // Two glyphs, and they are the reason anyone recognises this mark at 16px.
  const paths = calendar.match(/<path\b/g) ?? [];
  assert.ok(paths.length >= 8, `the Calendar mark is down to ${paths.length} paths; the numeral or the border colours were dropped`);
});

test("🔴🔴 the Calendar sheet keeps all four of its border colours", () => {
  // The draft before this one argued in its own comment that the real mark "is mostly blue and
  // white" and drew exactly that. It is not: blue down the left and across the top, yellow down the
  // right, green across the bottom, red in the corner. Strip them and it reads as any calendar
  // rather than as this one, which is the failure the owner reported.
  const calendar = code(MARK_FILES.googlecalendar ?? "").toUpperCase();
  for (const [hex, edge] of [["#EA4335", "red corner"], ["#FBBC04", "yellow right edge"], ["#34A853", "green bottom"], ["#4285F4", "blue body"]] as const) {
    assert.ok(calendar.includes(hex), `the Calendar mark lost its ${edge} (${hex})`);
  }
});

test("🔴🔴 Gmail's red is the filled M, not a stroke of constant width", () => {
  // The draft before this one traced the flap as one round-capped `stroke`, which is a good reading
  // of the fold and not the shape: Gmail's red is two filled areas whose boundary IS the letter M,
  // and a constant-width stroke cannot make that letter.
  const gmail = code(MARK_FILES.gmail ?? "");
  assert.ok(!/stroke=/.test(gmail), "the Gmail mark is stroking again; every part of it is a filled path");
  assert.ok(!/fill="none"/.test(gmail), "a Gmail path has no fill, so something is being drawn as a line");
  const paths = gmail.match(/<path\b/g) ?? [];
  assert.equal(paths.length, 5, `Gmail's mark is ${paths.length} paths; the published mark is 5`);
});

test("🔴 no mark is refitted into a square grid by hand", () => {
  // Every one of these logos is published in its own coordinate space, and re-fitting one to a
  // shared 32x32 box by eye is how a mark ends up subtly wrong in a way nobody can name but
  // everybody sees. Three of the four are not square; `preserveAspectRatio` centres them.
  const boxes = Object.entries(MARK_FILES).map(([slug, source]) => {
    const found = /viewBox="([^"]+)"/.exec(source);
    return [slug, found?.[1] ?? ""] as const;
  });
  for (const [slug, box] of boxes) {
    assert.ok(box.length > 0, `"${slug}" has no viewBox`);
  }
  const square = boxes.filter(([, box]) => {
    const [, , w, h] = box.split(/\s+/);
    return w === h;
  });
  assert.ok(square.length <= 1, `${square.length} marks share a square grid; they are being redrawn to fit rather than reproduced`);
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
