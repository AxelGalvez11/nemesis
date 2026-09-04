import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── one frame, three pages ───────────────────────────────────────────────────────────────────
//
// Owner 2026-09-04: "make sure spacing is consistent across projects, library, and apps pages".
// Consistency is a property of the SYSTEM, not of three files, so it is tested in one place: the
// frame's numbers are the measured ones, and every shelf page draws on the frame rather than on
// its own copy of a title row and a column. A page that stops importing the frame fails here
// before anyone measures a pixel.
//
// 🔴 EVERY NUMBER IS THE ONE READ OFF gemini.google.com/library IN THE OWNER'S CHROME on
// 2026-09-04 (see the header of `page-frame.tsx` for the full table). A number that drifts does
// not break anything, throws nothing, and is invisible in review — which is exactly why it needs
// a test.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const FRAME = read("./page-frame.tsx");
const PAGES = {
  Apps: read("../plugins/plugins-page.tsx"),
  Library: read("../library/library-outputs.tsx"),
  Project: read("../projects/project-page.tsx"),
  Projects: read("../projects/projects-page.tsx"),
};
/** Two surfaces carry the frame's grammar without its column: a full-width grid, and a popup. */
const GRAMMAR_ONLY = {
  Calendar: read("../calendar/calendar-header.tsx"),
  Settings: read("../../SettingsSurface.tsx"),
};

function measured(name: string): number {
  const found = new RegExp(`export const ${name} = (\\d+);`).exec(FRAME);
  assert.notEqual(found, null, `${name} is gone from the frame`);
  return Number(found?.[1]);
}

test("🔴🔴 the frame's numbers are the measured ones", () => {
  assert.equal(measured("FRAME_COLUMN_PX"), 760, "the column drifted from the reference's 760");
  assert.equal(measured("FRAME_TOP_PX"), 16);
  assert.equal(measured("FRAME_ROW_PX"), 40, "a title or heading row is no longer the round button's 40");
  assert.equal(measured("FRAME_SECTION_GAP_PX"), 24);
  assert.equal(measured("FRAME_HEAD_GAP_PX"), 16);
  assert.equal(measured("FRAME_ROW_GAP_PX"), 8);
  assert.equal(measured("FRAME_LIST_GAP_PX"), 4);
  assert.equal(measured("FRAME_ROW_H_PX"), 89);
  assert.equal(measured("FRAME_ROW_RADIUS_PX"), 28);
  assert.equal(measured("FRAME_ROW_PAD_PX"), 20);
  // And the constants are APPLIED, not merely declared.
  assert.match(FRAME, /maxWidth: FRAME_COLUMN_PX, paddingTop: FRAME_TOP_PX/, "the column constants are declared but not applied");
  assert.match(FRAME, /style=\{\{ height: FRAME_ROW_PX \}\}/, "the row height is declared but not applied");
  assert.match(FRAME, /marginTop: FRAME_SECTION_GAP_PX/, "the section gap is declared but not applied");
  assert.match(FRAME, /marginTop: FRAME_HEAD_GAP_PX/, "the heading gap is declared but not applied");
});

test("🔴🔴 the title, the heading and the row are on the product's five-step scale", () => {
  // §46.3: one scale, five steps, no sixth. Gemini's 17/13 become the body and small tokens; the
  // title is the scale's own 24. A heading is a row title made medium, as Gemini's 540 is to its
  // 400. Every size carries the `length:` hint, without which Tailwind reads the token as a COLOUR.
  assert.match(FRAME, /export const FRAME_TITLE_TEXT = "text-\[length:var\(--canvas-text-title\)\] leading-\[28px\] font-normal text-\(--ui-text-primary\)";/, "the title left the scale's 24");
  assert.match(FRAME, /export const FRAME_HEADING_TEXT = "text-\[length:var\(--canvas-text-body\)\] leading-\[24px\] font-medium text-\(--ui-text-primary\)";/, "the heading left the body step, or lost its weight");
  assert.match(FRAME, /<h1 className=\{cn\("min-w-0 flex-1 truncate", FRAME_TITLE_TEXT\)\}>/, "the title row does not use the one title string");
  assert.match(FRAME, /<h2 className=\{cn\("min-w-0 truncate", FRAME_HEADING_TEXT\)\}>/, "the heading row does not use the one heading string");
  assert.match(FRAME, /"flex h-\[40px\] shrink-0 items-center gap-\[6px\] rounded-full px-\[16px\] text-\[length:var\(--canvas-text-small\)\] leading-\[20px\] font-medium transition-colors"/, "the text pill left the 40px round grammar");
  assert.match(FRAME, /block truncate text-\[length:var\(--canvas-text-body\)\] leading-\[24px\] font-normal/, "the row title left the body step");
  assert.match(FRAME, /mt-\[6px\] block truncate text-\[length:var\(--canvas-text-small\)\] leading-\[18px\]/, "the row's second line left the small step, or moved off its 6px");
  assert.ok(!/text-\[\d+px\]/.test(FRAME), "a literal font size is on the frame — a sixth step nobody declared");
  assert.ok(!/text-\[var\(--canvas-text-/.test(FRAME), "a token size is missing its `length:` hint");
  assert.match(FRAME, /rounded-\[28px\] p-\[20px\]/, "the soft row lost its 28px radius or 20px padding");
  assert.match(FRAME, /size-\[40px\] shrink-0 items-center justify-center rounded-full/, "the round button is no longer 40px round");
});

test("🔴🔴 the row's fill and hover are one pair, and dark inverts them by the same rule", () => {
  // Gemini's row is ~3% darker than its ground and its hover is an 8% overlay. Ours is the same
  // relationship on the theme's ground, in both modes, and every surface on the frame shares it.
  assert.match(FRAME, /const FRAME_FILL = "bg-black\/\[0\.03\] hover:bg-black\/\[0\.08\] dark:bg-white\/\[0\.06\] dark:hover:bg-white\/\[0\.12\]";/);
  assert.match(FRAME, /const SOFT_ROW =[\s\S]{0,200}\+ FRAME_FILL;/, "the soft row does not use the shared fill pair");
  // 🔴 NOT THE PAGE GROUND. A hover that turns a row into the page colour makes it vanish; that
  // was the card hover on the Projects page before the frame, and it is what this guards against.
  assert.ok(!/hover:bg-\(--ui-bg-sidebar\)/.test(FRAME), "a hover on the frame turns a surface into the page ground");
});

for (const [name, source] of Object.entries(PAGES)) {
  test(`🔴🔴 ${name} draws on the frame and never redraws it`, () => {
    assert.match(source, /from "@\/components\/workspace\/shell\/page-frame"/, `${name} stopped importing the frame`);
    assert.match(source, /<PageFrame>/, `${name}'s scroller and column are not the frame's`);
    assert.match(source, /<PageTitle[\s>]/, `${name}'s title row is not the frame's`);
    assert.match(source, /SOFT_ROW/, `${name}'s rows are not the frame's soft row`);
    assert.match(source, /<RoundButton\b|<Pill\b/, `${name} has no round button or pill, so its controls are on a different grammar`);
    // 🔴 THE THINGS A PAGE MUST NOT WRITE FOR ITSELF. Each of these is a way for one page to
    // drift from the other two without anything looking wrong on its own.
    assert.ok(!/<h1\b/.test(source), `${name} draws its own <h1>`);
    // A centred `max-w` is a column; a paragraph's own `max-w` (the Apps consent line) is not.
    assert.ok(!/mx-auto[^"]*max-w-\[|max-w-\[[^"]*mx-auto/.test(source), `${name} sets its own column width`);
    assert.ok(!/text-\[28px\]/.test(source), `${name} still carries the ChatGPT-era 28px title`);
    // (The accent send button on a project's composer is `bg-(--ui-action)` too, by owner ruling;
    // the pill this forbids is the one with a WORD in it — `px-[16px]` after the fill.)
    assert.ok(!/bg-\(--ui-action\) px-\[16px\]/.test(source), `${name} still carries the ChatGPT-era filled pill button`);
    assert.ok(!/h-\[36px\] w-\[240px\]|width: SEARCH_W_PX/.test(source), `${name} still carries the ChatGPT-era 240x36 search pill`);
  });
}

test("🔴 the search opens from a round button on every shelf page, with the same words for the same thing", () => {
  for (const name of ["Apps", "Library", "Projects"] as const) {
    const source = PAGES[name];
    assert.match(source, /<RoundButton label="Search [a-z]+" onClick=\{\(\) => setSearching\(true\)\}>/, `${name}'s search is not the frame's round magnifier`);
    assert.match(source, /onBlur=\{\(\) => \{ if \(query === ""\) setSearching\(false\); \}\}/, `${name}'s emptied search does not fold back into its button`);
  }
});

for (const [name, source] of Object.entries(GRAMMAR_ONLY)) {
  test(`🔴🔴 ${name} carries the frame's grammar — its title string, its top, its 40px row — without its column`, () => {
    // The Calendar's grid is drawn to Google's pixels and must stay full width; Settings is a
    // popup with a rail. Neither can take the 760 column, so what they take is everything else:
    // the ONE title string, the frame's top padding and row height, and its buttons.
    assert.match(source, /from "@\/components\/workspace\/shell\/page-frame"/, `${name} stopped importing the frame`);
    assert.match(source, /FRAME_TITLE_TEXT/, `${name} draws its title with a string of its own`);
    assert.match(source, /FRAME_TOP_PX/, `${name} sets its own top padding`);
    assert.match(source, /FRAME_ROW_PX/, `${name} sets its own title-row height`);
    assert.ok(!/text-\[2[0-9]px\]|workspace-page-title|text-\[1\.\d+rem\]/.test(source), `${name} still carries a page-private title size`);
    assert.ok(!/\btext-(?:xs|sm|base|lg|xl)\b/.test(source), `${name} still uses Tailwind's rem type scale`);
  });
}
