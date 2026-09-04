import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 🔴🔴🔴 THE OWNER'S ACCEPTANCE CONDITION FOR THIS PAGE IS THE SAME ONE `/projects` SHIPPED
// UNDER: every number below was read off the owner's own signed-in ChatGPT account, 1470px
// viewport, 2026-08-26, and is recorded in `docs/chatgpt-reference.md`. This file pins the
// numbers to the source text — see `projects-page.test.ts`'s own header for why a comment that
// only says the right thing is not the same as a page that does it.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PAGE = strip(readFileSync(new URL("./project-page.tsx", import.meta.url), "utf8"));
const ROUTE = strip(readFileSync(new URL("../../../app/(workspace)/projects/[id]/page.tsx", import.meta.url), "utf8"));

function measured(name: string): number {
  const found = new RegExp(`const ${name} = (\\d+);`).exec(PAGE);
  assert.notEqual(found, null, `${name} is gone from the page`);
  return Number(found?.[1]);
}

// ── The frame: 768px column, and every gap derived rather than hard-coded ──────────────────────

test("🔴 the content column is 768px, the same one every page in this feature shares", () => {
  assert.equal(measured("COLUMN_PX"), 768);
  assert.ok(!/max-w-3xl/.test(PAGE), "the column went back to a Tailwind size that is not 768px");
});

test("🔴🔴🔴 composer/tabs/rows land on y=176/260/326 BY ARITHMETIC, not by luck", () => {
  // The four numbers the owner actually measured: the title at 116, and the composer, tabs and
  // rows tops at 176 / 260 / 328... no — 326. Everything else on this page (the header row's own
  // height, the three gaps, the composer and tab heights) is written as an expression over those
  // anchors specifically so this test can recompute them, the same discipline
  // `projects-page.test.ts` already applies to HEADER_TOP_PX and PILLS_GAP_PX.
  const titleTop = measured("TITLE_TOP_PX");
  const headerH = measured("HEADER_H_PX");
  const composerGap = measured("COMPOSER_GAP_PX");
  const composerH = measured("COMPOSER_H_PX");
  const tabsGap = measured("TABS_GAP_PX");
  const tabH = measured("TAB_H_PX");
  const rowsGap = measured("ROWS_GAP_PX");

  assert.equal(titleTop, 116);
  assert.equal(composerGap, 24);
  assert.equal(composerH, 52);
  assert.equal(tabsGap, 32);
  assert.equal(tabH, 38);
  assert.equal(rowsGap, 28);

  const composerTop = titleTop + headerH + composerGap;
  const tabsTop = composerTop + composerH + tabsGap;
  const rowsTop = tabsTop + tabH + rowsGap;
  assert.equal(composerTop, 176, "the composer no longer lands on the measured y=176");
  assert.equal(tabsTop, 260, "the tabs no longer land on the measured y=260");
  assert.equal(rowsTop, 326, "the rows no longer land on the measured y=326");

  assert.match(PAGE, /const COMPOSER_TOP_PX = TITLE_TOP_PX \+ HEADER_H_PX \+ COMPOSER_GAP_PX;/);
  assert.match(PAGE, /const TABS_TOP_PX = COMPOSER_TOP_PX \+ COMPOSER_H_PX \+ TABS_GAP_PX;/);
  assert.match(PAGE, /const ROWS_TOP_PX = TABS_TOP_PX \+ TAB_H_PX \+ ROWS_GAP_PX;/);
  assert.match(PAGE, /paddingTop: TITLE_TOP_PX/, "the header offset is declared but not applied");
  assert.match(PAGE, /marginTop: COMPOSER_GAP_PX/, "the composer's offset is declared but not applied");
  assert.match(PAGE, /marginTop: TABS_GAP_PX/, "the tabs' offset is declared but not applied");
  assert.match(PAGE, /marginTop: ROWS_GAP_PX/, "the rows' offset is declared but not applied");
});

test("🔴 the title is 28px/500 on a 34px line, same as the /projects list page", () => {
  assert.match(PAGE, /const TITLE_TEXT = "text-\[28px\] font-medium text-\(--ui-text-primary\)";/);
  assert.match(PAGE, /style=\{\{ lineHeight: "34px" \}\}/);
});

// ── The composer: the SAME object, by token, not a hand-rolled shadow ──────────────────────────

test("🔴🔴 the composer is 52 tall and uses the shared --composer-* tokens, never a literal shadow", () => {
  assert.match(PAGE, /rounded-\[var\(--composer-radius\)\]/);
  assert.match(PAGE, /shadow-\[var\(--composer-edge\)\]/);
  assert.match(PAGE, /bg-\(--composer-fill\)/);
  assert.match(PAGE, /minHeight: COMPOSER_H_PX/);
  // 🔴 NOT A SECOND, HAND-ROLLED EDGE. `globals.css`'s own header on `--composer-edge` records
  // that a duplicated `0 1px 2px rgba(...)`-style literal here would be exactly the double-drawn
  // hairline the token exists to prevent.
  assert.ok(!/boxShadow:\s*["'`]/.test(PAGE), "a hand-rolled boxShadow appeared instead of the --composer-edge token");
  assert.ok(!/0 1px 2px rgba/.test(PAGE), "the old, doubled composer shadow literal came back");
});

test("🔴 the composer's placeholder says our own word, in this project's name", () => {
  assert.match(PAGE, /New canvas in \$\{project\.name\}/);
  assert.ok(!/New chat in/.test(PAGE), "the reference's own word, \"chat\", leaked into the placeholder");
});

// ── The tabs: 38px pills, our own words, the reference's exact measurements ────────────────────

test("🔴🔴 a tab pill is 38px tall, `9px 16px`, fully rounded, 14px/500", () => {
  assert.match(PAGE, /rounded-full text-\[14px\] leading-\[20px\] font-medium/);
  assert.match(PAGE, /height: TAB_H_PX, padding: "9px 16px"/);
});

test("🔴 the tabs read Canvases and Sources — not Chats, which a canvas is not", () => {
  assert.match(PAGE, /\{ id: "canvases", label: "Canvases" \}/);
  assert.match(PAGE, /\{ id: "sources", label: "Sources" \}/);
  assert.ok(!/label: "Chats"/.test(PAGE), "the reference's own word, \"Chats\", leaked onto the tab");
});

test("🔴 selected/unselected tab colours match the measured rgba(0,0,0,.05) / rgb(143,143,143)", () => {
  assert.match(PAGE, /bg-black\/\[0\.05\] text-\(--ui-text-primary\) dark:bg-white\/\[0\.10\]/);
  assert.match(PAGE, /bg-transparent text-\(--ui-text-tertiary\)/);
});

// ── The rows: 40px, no divider, no fill, no radius ──────────────────────────────────────────────

test("🔴🔴🔴 a row is 40px — exactly two 20px lines, which is why there is no gap between them", () => {
  assert.equal(measured("ROW_H_PX"), 40);
  assert.match(PAGE, /style=\{\{ height: ROW_H_PX \}\}/);
});

test("🔴 the divider is on the li, the hover on the row, and still no radius (re-measured 2026-08-30)", () => {
  // The 2026-08-26 spec said "no divider" and it was true THEN — the reference changed under us:
  // its project list now draws the same 5% hairline its Library table always had, with 13px of
  // air each side of the 40px content box. The date on a measurement is part of the measurement.
  const at = PAGE.indexOf("function CanvasRow(");
  assert.notEqual(at, -1, "CanvasRow is gone");
  const row = PAGE.slice(at, PAGE.indexOf("\n}\n", at));
  assert.match(row, /border-b border-b-black\/\[0\.05\] dark:border-b-white\/\[0\.05\]/, "the re-measured hairline is gone");
  assert.ok(!/rounded-(?!full)/.test(row.replace("rounded-full", "")), "a radius appeared on a row the spec says has none");
});

test("🔴 line one is the canvas title (14/500), line two is a REAL fact or a plain label, never invented content", () => {
  assert.match(PAGE, /const ROW_NAME_TEXT = "text-\[14px\] leading-\[20px\] font-medium text-\(--ui-text-primary\)";/);
  assert.match(PAGE, /const ROW_META_TEXT = "text-\[14px\] leading-\[20px\] font-normal text-\(--ui-text-secondary\)";/);
  // Line two is the conversation's REAL tail now — `CanvasSummary.preview`, extracted inside
  // listCanvases's own SELECT, flattened of markdown — with the old honest fallbacks behind it.
  assert.match(PAGE, /\{snippet\(canvas\)\}/, "line two stopped reading the snippet helper");
  assert.match(PAGE, /return canvas\.courseTitle \|\| "Canvas";/, "the fallback stopped being a real fact (courseTitle) or an honest label");
  assert.match(PAGE, /canvas\.preview\?\.trim\(\)/, "the snippet stopped reading the stored preview");
});

test("🔴 a canvas row opens where the sidebar opens it, character for character", () => {
  assert.match(PAGE, /router\.push\(`\/learn\?c=\$\{id\}`\)/);
});

test("🔴🔴 only THIS project's own direct canvases are listed — no sub-project rows invented", () => {
  assert.match(PAGE, /project\.canvases\.map\(\(canvas\)/, "the row list stopped reading the project's own canvases");
  assert.ok(!/project\.children\.map/.test(PAGE), "a sub-project grew a row the measured spec never described");
});

// ── No sharing invented, no rem-based spacing, the two-write filing pattern ─────────────────────

test("🔴 no Share button — we have no sharing, and a dead control fails a 1:1 copy while matching it", () => {
  assert.ok(!/>\s*Share\s*</.test(PAGE), "a Share button appeared in a product with no sharing");
  assert.match(PAGE, />Rename</);
  assert.match(PAGE, />\s*Delete\s*</);
  // And the ⋯ carries what the reference's page ⋯ carries (measured 2026-08-30): Project
  // settings opens the same dialog the sidebar opens, Pin project writes folders.pinned_at.
  assert.match(PAGE, />\s*Project settings\s*</, "the page lost its Project settings door");
  assert.match(PAGE, /\{project\.pinnedAt \? "Unpin project" : "Pin project"\}/, "the page lost its pin toggle");
  assert.match(PAGE, /ProjectCustomizeDialog/, "the settings dialog is not mounted on the page");
});

test("🔴 the header wears the project's OWN icon and colour at 32px (measured 2026-08-30)", () => {
  // The reference paints "school" as its blue mortar-board on the page header, not a generic
  // folder. `buildProjects` carries icon/colour through ProjectNode for exactly this read.
  assert.match(PAGE, /name=\{project\.icon \?\? "folder"\}/, "the header fell back to a generic glyph for customized projects");
  assert.match(PAGE, /size="32px"/, "the header icon left the measured 32px");
  // 🔴 THE COLOUR IS DRAWN THROUGH A TOKEN NOW, NOT AS THE STORED HEX. This page never lost its
  // tint during the 2026-09-03 accent sweep — only the sidebar and the dialog did — so it had been
  // painting a LIGHT-MODE hex in dark mode the whole time. `projectTint` maps the stored value onto
  // the `--ui-kind-*` pair, which desktop-ui.css defines once per theme. See project-look.ts.
  assert.match(PAGE, /style=\{projectTint\(project\)\}/, "the header ignores the project's colour");
  // 🔴 SCOPED TO A `style=`, NOT THE BARE PHRASE. `color: project.color` also appears where the
  // "…" menu builds the Folder object it hands the customize dialog, which is DATA and correct.
  assert.doesNotMatch(PAGE, /style=\{\{[^}]*color: project\.color/u, "the header paints the raw stored hex again");
});

test("🔴🔴🔴 no rem-based spacing class survives — `px-4` is EIGHTEEN pixels here, not sixteen", () => {
  const spacing =
    /\b(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|size|w|h|min-[wh]|max-[wh]|top|right|bottom|left|inset(?:-[xy])?)-\d+(?:\.\d+)?\b(?!\/)/g;
  const found = [...new Set(PAGE.match(spacing) ?? [])].filter((cls) => !/-0$/.test(cls));
  assert.deepEqual(found, [], `rem-based spacing on a page measured in pixels: ${found.join(", ")}`);
  const type = [...new Set(PAGE.match(/\bleading-\d+(?:\.\d+)?\b|\btext-(?:xs|sm|base|lg|xl|\dxl)\b/g) ?? [])];
  assert.deepEqual(type, [], `rem-based type on a page measured in pixels: ${type.join(", ")}`);
});

test("🔴 starting a canvas here is create-then-file, the same two writes every other filing control uses", () => {
  assert.match(PAGE, /const canvas = newCanvas\(\);/);
  assert.match(PAGE, /await saveCanvas\(userId, canvas\);/);
  assert.match(PAGE, /await setCanvasFolder\(userId, canvas\.id, project\.id\);/);
});

test("🔴 the page sits on the reference's #fcfcfc ground, the same token every page here shares", () => {
  assert.match(PAGE, /bg-\(--ui-bg-sidebar\)/);
});

// ── The route ─────────────────────────────────────────────────────────────────────────────────

test("🔴 the route is thin, reads the id from the URL, and mounts the real page", () => {
  assert.match(ROUTE, /useAuth\(\)/);
  assert.match(ROUTE, /useParams<\{ id: string \}>\(\)/);
  assert.match(ROUTE, /<ProjectPage projectId=\{raw \?\? ""\} userId=\{session\?\.user\.id \?\? null\} \/>/);
});

test("🔴🔴 rows have the reference's rhythm, not just its row height", () => {
  // Twice re-measured now. First (2026-08-26, two-chat project): 40px rows, 25px gap, no divider.
  // Second (2026-08-30, six-chat project, the owner's own Chrome): the reference grew hairline
  // dividers, and the air moved to 13px of li padding each side of the 40px box — title-to-title
  // pitch 66-67 confirmed on screen. The 13s live on the li WITH the hairline so the divider
  // spans the full column; the hover stays on the 40px content box, where dead hover cannot sit
  // above the title.
  assert.match(PAGE, /const ROW_PAD_Y_PX = 13;/, "the measured row padding is gone");
  assert.match(PAGE, /paddingBottom: ROW_PAD_Y_PX, paddingTop: ROW_PAD_Y_PX/, "the li stopped carrying the air");
  assert.match(PAGE, /marginTop: ROWS_GAP_PX - ROW_PAD_Y_PX/, "the first row's top no longer lands on the measured 326+13");
  assert.match(PAGE, /const ROW_H_PX = 40;/, "the row stopped being the reference's 40px");
});
