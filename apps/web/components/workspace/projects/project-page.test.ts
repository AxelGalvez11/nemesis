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


// ── The frame: 768px column, and every gap derived rather than hard-coded ──────────────────────

// ── The frame ────────────────────────────────────────────────────────────────────────────────
//
// 🔴🔴 2026-09-04: THE NUMBERS LEFT THIS FILE. Until this date the page pinned ChatGPT's project
// page (title y=116, composer 176, tabs 260, rows 326). The owner then pointed at Gemini's library,
// asked for consistent spacing across the workspace pages, and said "do the project page,
// calendar, and settings too". The column, title row, pills and soft rows live in
// `shell/page-frame.tsx` and are guarded once, in `page-frame.test.ts`. What this file guards is
// that the page USES the frame, and what a row and the composer are made of.

test("🔴🔴 the page is drawn on the shared frame, not on a private copy of it", () => {
  assert.match(PAGE, /from "@\/components\/workspace\/shell\/page-frame"/, "the page stopped importing the frame");
  assert.match(PAGE, /<PageFrame>/, "the scroller and column are not the frame's");
  assert.match(PAGE, /<PageTitle\s/, "the title row is not the frame's");
  assert.ok(!/<h1\b|COLUMN_PX|TITLE_TOP_PX|TITLE_TEXT|max-w-3xl/.test(PAGE), "a page-private title or column survived");
  // The composer sits under the title at the frame's section gap, and the tabs under it at the
  // same gap; the rows at the frame's heading gap. All three read the frame's constants.
  assert.match(PAGE, /style=\{\{ marginTop: FRAME_SECTION_GAP_PX, minHeight: COMPOSER_H_PX, maxWidth: "var\(--composer-max-width\)" \}\}/, "the composer left the frame's rhythm");
  assert.match(PAGE, /role="tablist" style=\{\{ marginTop: FRAME_SECTION_GAP_PX \}\}/, "the tabs left the frame's rhythm");
  assert.match(PAGE, /style=\{\{ gap: FRAME_ROW_GAP_PX, marginTop: FRAME_HEAD_GAP_PX \}\}/, "the rows left the frame's gaps");
});

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
  // 🔴 REVERSED 2026-09-03: the owner renamed the conversation surface to "chat" ("rename the
  // current one to chat because I remember that accurately sums it up"), and "canvas" now names
  // the spatial board. The guard flips: the OLD word is the one that must not leak.
  assert.match(PAGE, /New chat in \$\{project\.name\}/);
  assert.ok(!/New canvas in/.test(PAGE), "the old word, \"canvas\", is back in the placeholder");
});

// ── The tabs: 38px pills, our own words, the reference's exact measurements ────────────────────

test("🔴🔴 a tab is the frame's 40px pill, and the live one is the only one with a fill", () => {
  assert.match(PAGE, /<Pill active=\{tab === option\.id\} key=\{option\.id\} onClick=\{\(\) => setTab\(option\.id\)\} pressed=\{tab === option\.id\}>/);
  assert.ok(!/TAB_H_PX|padding: "9px 16px"/.test(PAGE), "the ChatGPT-era 38px tab came back");
});

test("🔴 the tabs read Canvases and Sources — not Chats, which a canvas is not", () => {
  assert.match(PAGE, /\{ id: "canvases", label: "Canvases" \}/);
  assert.match(PAGE, /\{ id: "sources", label: "Sources" \}/);
  assert.ok(!/label: "Chats"/.test(PAGE), "the reference's own word, \"Chats\", leaked onto the tab");
});

test("🔴🔴 a row is the frame's soft row, and the ⋯ is not inside a press", () => {
  for (const name of ["CanvasRow", "MaterialRow"]) {
    const at = PAGE.indexOf(`function ${name}(`);
    assert.notEqual(at, -1, `${name} is gone`);
    const row = PAGE.slice(at, PAGE.indexOf("\nfunction ", at + 1));
    assert.match(row, /className=\{cn\(SOFT_ROW, "items-start"\)\}/, `${name} is not the frame's soft row`);
    assert.match(row, /style=\{\{ minHeight: FRAME_ROW_H_PX \}\}/, `${name} is not the frame's 89px`);
    assert.match(row, /<RowText meta=/, `${name} does not use the frame's two lines`);
  }
  assert.ok(!/ROW_H_PX = 40|ROW_PAD_Y_PX|border-b-black\/\[0\.05\]/.test(PAGE), "the ChatGPT-era hairline row came back");
});

test("🔴 line one is the canvas title, line two is a REAL fact or a plain label, never invented content", () => {
  assert.match(PAGE, /<RowText meta=\{snippet\(canvas\)\} title=\{canvas\.title \|\| "Untitled"\} \/>/, "line one or two of a canvas row changed shape");
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
  assert.match(PAGE, /className=\{cn\("flex size-\[40px\] shrink-0 items-center justify-center rounded-full text-\(--ui-text-primary\) transition-colors", FRAME_BUTTON_FILL\)\}/, "the ⋯ is not the frame's round button");
  assert.match(PAGE, />\s*Delete\s*</);
  // And the ⋯ carries what the reference's page ⋯ carries (measured 2026-08-30): Project
  // settings opens the same dialog the sidebar opens, Pin project writes folders.pinned_at.
  assert.match(PAGE, />\s*Project settings\s*</, "the page lost its Project settings door");
  assert.match(PAGE, /\{project\.pinnedAt \? "Unpin project" : "Pin project"\}/, "the page lost its pin toggle");
  assert.match(PAGE, /ProjectCustomizeDialog/, "the settings dialog is not mounted on the page");
});

test("🔴 the header wears the project's OWN icon and colour, beside the frame's title", () => {
  // The reference paints "school" as its blue mortar-board on the page header, not a generic
  // folder. `buildProjects` carries icon/colour through ProjectNode for exactly this read.
  assert.match(PAGE, /name=\{project\.icon \?\? "folder"\}/, "the header fell back to a generic glyph for customized projects");
  assert.match(PAGE, /size="28px"/, "the header icon is not the 28px the frame's 24px title takes beside it");
  assert.match(PAGE, /<PageTitle\s+before=\{\s*<Codicon/, "the icon left the title row");
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

test("🔴 the page sits on the frame's ground, and does not repaint it", () => {
  assert.ok(!/bg-\(--ui-bg-sidebar\)/.test(PAGE), "the page repaints the frame's ground on its own");
});

// ── The route ─────────────────────────────────────────────────────────────────────────────────

test("🔴 the route is thin, reads the id from the URL, and mounts the real page", () => {
  assert.match(ROUTE, /useAuth\(\)/);
  assert.match(ROUTE, /useParams<\{ id: string \}>\(\)/);
  assert.match(ROUTE, /<ProjectPage projectId=\{raw \?\? ""\} userId=\{session\?\.user\.id \?\? null\} \/>/);
});

