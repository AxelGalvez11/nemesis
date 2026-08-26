import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildProjects, matchesQuery, visibleProjects } from "./projects-model";
import type { CanvasSummary, Folder } from "@/lib/learn/canvas-store";

// 🔴🔴🔴 THE OWNER'S ACCEPTANCE CONDITION FOR THIS PAGE WAS A NUMBER, NOT A FEELING: "pixel,
// sizing, spacing and colouring 1 to 1" with ChatGPT's Projects page. Every value asserted below
// was read off the live signed-in app at a 1456px viewport on 2026-08-26 with `getComputedStyle`
// / `getBoundingClientRect` and written down in scratchpad/ref/chatgpt-reference.md.
//
// A page can be tidied into failing this without anyone noticing: `h-[60px]` becomes `py-4`,
// a 5%-black hairline becomes `border-border`, `768px` becomes `max-w-3xl` (which is 48px
// narrower). Each of those is an ordinary-looking cleanup and each one breaks the only
// condition the page was accepted on. So the measurements are pinned to the source text, the
// way this repo pins other load-bearing source facts.

const PAGE = readFileSync(new URL("./projects-page.tsx", import.meta.url), "utf8");
const MODEL = readFileSync(new URL("./projects-model.ts", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../../../app/(workspace)/projects/page.tsx", import.meta.url), "utf8");

/** Comments quote the measurements constantly; only what SHIPS may satisfy an assertion. */
function code(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const page = code(PAGE);
const model = code(MODEL);
const route = code(ROUTE);

/** Pull a measured constant back out of the source so the test can do the reference's arithmetic. */
function measured(name: string): number {
  const found = new RegExp(`const ${name} = (\\d+);`).exec(page);
  assert.notEqual(found, null, `${name} is gone from the page`);
  return Number(found?.[1]);
}

// ── The frame: 768px column, and the title and pills on their measured lines ──────────────────

test("🔴 the content column is 768px, not a Tailwind size that is nearly 768px", () => {
  // `max-w-3xl` is 48rem = 768px ONLY at a 16px root; this app sets its own type scale and the
  // Library page uses `max-w-3xl` with `px-6`, which renders a 720px column. Naming the number
  // is what stops this page quietly inheriting that.
  assert.equal(measured("COLUMN_PX"), 768);
  assert.match(page, /maxWidth: COLUMN_PX/, "the column constant is declared but not applied");
  assert.ok(!/max-w-3xl/.test(page), "the column went back to a Tailwind size that is not 768px");
});

test("🔴🔴 the title lands on y=116 and the pills on y=204, by arithmetic and not by luck", () => {
  // The reference's two vertical anchors. They are 88px apart, and the gap is NOT 88 minus the
  // title's height: the h1 is 34px tall and centred inside a 36px row of controls, so the row
  // begins one pixel above the title. Both derived values are written as expressions in the
  // source precisely so this test can re-derive them; replacing either with a literal is the
  // failure mode being guarded against.
  const titleTop = measured("TITLE_TOP_PX");
  const pillsTop = measured("PILLS_TOP_PX");
  const controlH = measured("CONTROL_H_PX");
  const titleLine = measured("TITLE_LINE_PX");
  assert.equal(titleTop, 116);
  assert.equal(pillsTop, 204);
  assert.equal(controlH, 36);
  assert.equal(titleLine, 34);

  assert.match(page, /const HEADER_TOP_PX = TITLE_TOP_PX - \(CONTROL_H_PX - TITLE_LINE_PX\) \/ 2;/);
  assert.match(page, /const PILLS_GAP_PX = PILLS_TOP_PX - HEADER_TOP_PX - CONTROL_H_PX;/);

  const headerTop = titleTop - (controlH - titleLine) / 2;
  assert.equal(headerTop + (controlH - titleLine) / 2, 116, "the h1 no longer starts on the measured line");
  assert.equal(headerTop + controlH + (pillsTop - headerTop - controlH), 204, "the pills moved off y=204");

  assert.match(page, /paddingTop: HEADER_TOP_PX/, "the header offset is declared but not applied");
  assert.match(page, /marginTop: PILLS_GAP_PX/, "the pills offset is declared but not applied");
});

test("🔴 the title is 28px/500 on a 34px line", () => {
  assert.match(page, /text-\[28px\] font-medium text-\(--ui-text-primary\)/);
  assert.match(page, /lineHeight: `\$\{TITLE_LINE_PX\}px`/);
});

// ── The list: 60px rows, one 5% hairline, no card ─────────────────────────────────────────────

test("🔴🔴🔴 a row is 60px tall with `10px 8px 10px 0` of padding", () => {
  assert.equal(measured("ROW_H_PX"), 60);
  assert.equal(measured("ROW_PAD_Y_PX"), 10);
  assert.equal(measured("ROW_PAD_RIGHT_PX"), 8);
  // One box function, so a nested row cannot become a different height than a top-level one.
  const at = page.indexOf("function rowBox(");
  assert.notEqual(at, -1, "the shared row box is gone and every row now sizes itself");
  const box = page.slice(at, page.indexOf("}", page.indexOf("return {", at)));
  assert.match(box, /height: ROW_H_PX/);
  assert.match(box, /paddingTop: ROW_PAD_Y_PX/);
  assert.match(box, /paddingBottom: ROW_PAD_Y_PX/);
  assert.match(box, /paddingRight: ROW_PAD_RIGHT_PX/);
  // 🔴 NOTHING ON THE LEFT. The reference's rows run to the left edge of the column; a left pad
  // here would inset the folder icons and nothing would look obviously wrong.
  assert.match(box, /paddingLeft: indent/);
});

test("🔴🔴🔴 the divider is a 1px 5% hairline, and it is the ONLY thing between two rows", () => {
  // `--border-light` = rgba(0,0,0,0.05) light, rgba(255,255,255,0.05) dark. A default Tailwind
  // border is roughly three times heavier and reads as a table; this reads as a list.
  assert.match(page, /border-b border-b-black\/\[0\.05\] dark:border-b-white\/\[0\.05\]/);
  // The reference uses no shadow anywhere on this page, and no card or box around the rows.
  assert.ok(!/shadow-/.test(page), "a shadow appeared on a page whose reference has none");
  assert.ok(!/\brounded-xl\b|\brounded-2xl\b/.test(page), "the rows grew a card the reference does not have");
});

test("🔴 the row hover is the reference's `--interactive-bg-secondary-hover`, both themes", () => {
  assert.match(page, /hover:bg-black\/\[0\.05\] dark:hover:bg-white\/\[0\.10\]/);
});

test("🔴 the leading icon is 20x20 on `--icon-secondary`, and the name is 14px/400", () => {
  assert.equal(measured("ICON_PX"), 20);
  assert.match(page, /size=\{ICON_PX\}/);
  assert.match(page, /const NAME_TEXT = "text-\[14px\] leading-\[20px\] font-normal text-\(--ui-text-primary\)";/);
  assert.match(page, /const META_TEXT = "text-\[14px\] leading-\[20px\] font-normal text-\(--ui-text-secondary\)";/);
});

test("🔴🔴🔴 the columns pack from the LEFT and stop — a right-aligned Modified is a 200px seam", () => {
  // The reference's Library cells are Name 368 / Modified 160 / Size 88 (+16px pad) inside the
  // same 768px column. They sum to 632, so over a hundred pixels of every Library row are
  // deliberately empty at the right — which a right-aligned Modified cannot produce. Projects is
  // that list minus Size, so Name and Modified hold their positions and the dead space grows.
  //
  // This page right-aligned Modified until both pages were measured in one browser: Library put
  // its date 400px into the column and Projects put it at 600px, so the date column jumped 200px
  // between two sibling pages. Calibration: give the Name cell `flex-1` again and this reddens.
  assert.equal(measured("NAME_W_PX"), 368);
  assert.equal(measured("COLUMN_GAP_PX"), 32);
  const at = page.indexOf("function NameCell(");
  assert.notEqual(at, -1, "the shared Name cell is gone and each row now sizes its own columns");
  const cell = page.slice(at, page.indexOf("\n}", at));
  // 🔴 THE INDENT IS GIVEN BACK. The row indents with padding, so the cell must subtract it or an
  // opened project pushes its children's dates out of the column, one step per nesting level.
  assert.match(cell, /width: NAME_W_PX - indent/);
  assert.ok(
    !/min-w-0 flex-1 truncate", NAME_TEXT\)\}>\{project\.name/.test(page.replace(/\s+/g, " ")) ||
      /<NameCell indent=\{indent\}>/.test(page),
    "the project row stopped going through the shared Name cell",
  );
  assert.match(page, /<NameCell indent=\{indent \+ INDENT_PX\}>/, "canvas rows left the Name column");
});

test("🔴 there are two columns, Name and Modified, and Modified is the measured 160px", () => {
  assert.equal(measured("MODIFIED_W_PX"), 160);
  assert.equal(measured("HEADINGS_H_PX"), 20);
  assert.match(page, /width: MODIFIED_W_PX/);
  assert.match(page, />\s*Name\s*<\/span>/);
  assert.match(page, />\s*Modified\s*<\/span>/);
  // Projects has Name and Modified only — Size belongs to the Library's list.
  assert.ok(!/>\s*Size\s*</.test(page), "the Library's Size column leaked onto Projects");
});

test("🔴🔴🔴 no rem-based spacing class survives on this page — `px-4` is EIGHTEEN pixels here", () => {
  // `globals.css`: `html { font-size: 112.5% }`. Every rem-based Tailwind utility is therefore
  // 12.5% bigger than its name suggests, and the pills shipped with `0px 18px` of padding against
  // the reference's `0px 16px` until this was measured in a real browser. Nothing about the class
  // name says so, which is why the guard has to live in a test rather than in a comment.
  const spacing =
    /\b(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|size|w|h|min-[wh]|max-[wh]|top|right|bottom|left|inset(?:-[xy])?)-\d+(?:\.\d+)?\b(?!\/)/g;
  // `min-w-0` and friends are exempt: zero rem is zero pixels at any root size.
  const found = [...new Set(page.match(spacing) ?? [])].filter((cls) => !/-0$/.test(cls));
  assert.deepEqual(found, [], `rem-based spacing on a page measured in pixels: ${found.join(", ")}`);
  // Type is scaled by the same root: `leading-5` is 22.5px here, not 20, and `text-sm` is 15.75px.
  const type = [...new Set(page.match(/\bleading-\d+(?:\.\d+)?\b|\btext-(?:xs|sm|base|lg|xl|\dxl)\b/g) ?? [])];
  assert.deepEqual(type, [], `rem-based type on a page measured in pixels: ${type.join(", ")}`);
});

// ── The controls ─────────────────────────────────────────────────────────────────────────────

test("🔴🔴 a filter pill is 36px tall, `0 16px`, rounded full, 14px/500 on a 20px line", () => {
  const at = page.indexOf("{FILTERS.map(");
  assert.notEqual(at, -1, "the pills are gone");
  const pills = page.slice(at, page.indexOf("</div>", at));
  assert.match(pills, /rounded-full px-\[16px\] text-\[14px\] leading-\[20px\] font-medium/);
  assert.match(pills, /height: CONTROL_H_PX/);
  // Selected: `--bg-tertiary`, measured #f3f3f3 light / #414141 dark. We have no token for it —
  // `--ui-bg-tertiary` blends the accent in and lands near #e2e2e2, a visibly darker pill.
  assert.match(pills, /bg-\[#f3f3f3\] text-\(--ui-text-primary\) dark:bg-\[#414141\]/);
  // Unselected: transparent on `--text-secondary`.
  assert.match(pills, /bg-transparent text-\(--ui-text-secondary\)/);
});

test("🔴🔴 the pills are All and Pinned — the reference's sharing pills would be dead controls", () => {
  assert.match(page, /\{ id: "all", label: "All" \}/);
  assert.match(page, /\{ id: "pinned", label: "Pinned" \}/);
  // Nemesis has no sharing. Copying "Created by you / Shared with you" would match the reference
  // pixel for pixel and still be two buttons that change nothing.
  assert.ok(!/Shared with you|Created by you/.test(page), "a sharing filter appeared in a product with no sharing");
});

test("🔴 the search field is the measured 240x36 pill, and it says what it searches", () => {
  assert.equal(measured("SEARCH_W_PX"), 240);
  assert.match(page, /width: SEARCH_W_PX/);
  assert.match(page, /placeholder="Search projects"/);
  assert.match(page, /rounded-full border border-black\/\[0\.10\][^"]*dark:border-white\/\[0\.15\]/);
});

test("🔴 the New button really makes a folder, and wears the product's accent", () => {
  assert.match(page, /import \{[\s\S]*?createFolder,[\s\S]*?\} from "@\/lib\/learn\/canvas-store";/);
  assert.match(page, /await createFolder\(userId, name\)/);
  // `--ui-action` rather than the reference's #0d0d0d: three units apart on screen, but this is
  // the token the Settings accent picker writes, and the owner ruled the accent is one colour.
  assert.match(page, /bg-\(--ui-action\)[^"]*text-\(--ui-action-glyph\)/);
  assert.match(page, /height: CONTROL_H_PX/);
});

test("🔴 the page sits on the reference's #fcfcfc ground, which is our own sidebar token", () => {
  // The reference's page background is `--component-sidebar-bg` (#fcfcfc), not white; our
  // `--ui-bg-sidebar` resolves to exactly that, so page and sidebar share one ground with no seam.
  assert.match(page, /bg-\(--ui-bg-sidebar\)/);
  // `bg-white/[0.10]` is the dark row hover and is fine; a bare `bg-white` is the ground going wrong.
  assert.ok(!/bg-white(?![/-])/.test(page), "the page went to pure white, which reads wrong beside the sidebar");
});

// ── What a row does ──────────────────────────────────────────────────────────────────────────

test("🔴🔴 a canvas opens where the sidebar opens it, character for character", () => {
  // Two doors to the same canvas that disagree about the URL is how a deep link starts working
  // from one place and not the other. sidebar-canvases.tsx pushes exactly this.
  assert.match(page, /router\.push\(`\/learn\?c=\$\{id\}`\)/);
});

test("🔴 a project opens IN PLACE, and does not invent a detail route", () => {
  assert.match(page, /aria-expanded=\{isOpen\}/);
  assert.ok(!/\/projects\//.test(page), "a project detail route appeared; the sidebar would then have two truths");
});

test("🔴 the route is thin and mounts the real page", () => {
  assert.match(route, /useAuth\(\)/);
  assert.match(route, /<ProjectsPage userId=\{session\?\.user\.id \?\? null\} \/>/);
});

// ── The two computed columns ─────────────────────────────────────────────────────────────────

const CANVAS: CanvasSummary = { id: "c", state: "learn", title: "Canvas", updatedAt: "2026-01-01T00:00:00.000Z" };

function canvas(over: Partial<CanvasSummary> & { id: string }): CanvasSummary {
  return { ...CANVAS, ...over };
}

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return { createdAt: "2020-01-01T00:00:00.000Z", id, name: id, parentId: null, ...over };
}

test("🔴🔴🔴 Modified is rolled up from the canvases, because `folders.updated_at` NEVER MOVES", () => {
  // The column exists (`not null default now()`) and no trigger bumps it — `renameFolder` writes
  // `name` alone. Reading it would print the creation date under a heading that says "Modified",
  // for every project, forever. Calibration: make `buildProjects` read a folder timestamp instead
  // and this reddens while nothing else does.
  const [project] = buildProjects(
    [folder("f", { createdAt: "2020-01-01T00:00:00.000Z" })],
    [
      canvas({ folderId: "f", id: "old", updatedAt: "2026-03-01T00:00:00.000Z" }),
      canvas({ folderId: "f", id: "new", updatedAt: "2026-08-20T00:00:00.000Z" }),
    ],
  );
  assert.equal(project?.modifiedAt, "2026-08-20T00:00:00.000Z");
  assert.ok(!/updatedAt: folder|folder\.updatedAt/.test(model), "the dead folder timestamp is being read again");
});

test("🔴 an empty project still dates itself, from when it was made", () => {
  const [project] = buildProjects([folder("f", { createdAt: "2026-02-02T00:00:00.000Z" })], []);
  assert.equal(project?.modifiedAt, "2026-02-02T00:00:00.000Z");
});

test("🔴 work inside a SUB-project counts as work on the project", () => {
  const projects = buildProjects(
    [folder("parent"), folder("child", { parentId: "parent" })],
    [canvas({ folderId: "child", id: "k", updatedAt: "2026-08-25T00:00:00.000Z" })],
  );
  assert.equal(projects.length, 1, "a sub-project was listed as a top-level project");
  assert.equal(projects[0]?.modifiedAt, "2026-08-25T00:00:00.000Z");
  assert.equal(projects[0]?.children[0]?.id, "child");
});

test("🔴🔴 Pinned means a canvas the learner really pinned, at any depth", () => {
  // `folders` has no `pinned_at`; only `learning_canvases` does. So the pill filters on something
  // that exists rather than on a flag invented in the browser that the sidebar could not see.
  const projects = buildProjects(
    [folder("a"), folder("deep", { parentId: "a" }), folder("b")],
    [
      canvas({ folderId: "deep", id: "p", pinnedAt: "2026-08-01T00:00:00.000Z" }),
      canvas({ folderId: "b", id: "q", pinnedAt: null }),
    ],
  );
  const pinned = visibleProjects(projects, "pinned", "");
  assert.deepEqual(
    pinned.map((project) => project.id),
    ["a"],
  );
  assert.equal(visibleProjects(projects, "all", "").length, 2);
});

test("🔴 search finds a project by its own name AND by a sub-project's", () => {
  const projects = buildProjects([folder("a", { name: "Fall 2026" }), folder("b", { parentId: "a", name: "Torts" })], []);
  assert.equal(matchesQuery(projects[0]!, "torts"), true);
  assert.equal(matchesQuery(projects[0]!, "FALL"), true);
  assert.equal(matchesQuery(projects[0]!, "statics"), false);
  assert.deepEqual(visibleProjects(projects, "all", "  "), projects, "a blank search hid everything");
});

test("🔴 a parent_id ring cannot hang the page", () => {
  // `setFolderParent`'s own header warns that the database accepts a cycle. A naive recursive
  // build spins until the tab dies; this must simply terminate.
  // Calibration: drop the `if (!seen.has(...)) nodes.push(...)` rescue in buildProjects and this
  // reddens alone — with an empty page, not a hang, which is the quieter of the two failures.
  const projects = buildProjects([folder("x", { parentId: "y" }), folder("y", { parentId: "x" })], []);
  assert.ok(projects.length >= 1, "a ring made every project disappear");
  assert.ok(projects.length <= 2, "a ring was expanded into more projects than exist");
});

test("🔴 a folder whose parent is missing still shows, rather than vanishing", () => {
  const projects = buildProjects([folder("orphan", { parentId: "gone" })], []);
  assert.deepEqual(
    projects.map((project) => project.id),
    ["orphan"],
  );
});

test("🔴 the list reads most-recently-worked first, which is what a Modified column promises", () => {
  const projects = buildProjects(
    [folder("stale", { createdAt: "2020-01-01T00:00:00.000Z" }), folder("fresh", { createdAt: "2020-01-01T00:00:00.000Z" })],
    [canvas({ folderId: "fresh", id: "k", updatedAt: "2026-08-25T00:00:00.000Z" })],
  );
  assert.deepEqual(
    projects.map((project) => project.id),
    ["fresh", "stale"],
  );
});

test("🔴 a canvas filed nowhere belongs to no project", () => {
  const projects = buildProjects([folder("f")], [canvas({ folderId: null, id: "loose" })]);
  assert.equal(projects[0]?.canvases.length, 0);
});
