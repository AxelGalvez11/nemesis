import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildProjects, findProject, matchesQuery, visibleProjects } from "./projects-model";
import type { CanvasSummary, Folder } from "@/lib/learn/canvas-store";

// Atlas is the selected production direction for Projects. The structural guards below pin its
// Claude-style two-card geometry while the model tests preserve the page's real folder behavior.

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


// ── The frame: an 832px Atlas column, with the existing title/control rhythm ─────────────────

// ── The frame ────────────────────────────────────────────────────────────────────────────────
//
// 🔴🔴 2026-09-04: THE NUMBERS LEFT THIS FILE. Until this date the page carried ChatGPT's measured
// title line (y=116) and then, for a day, Claude-style 404x112 cards. The owner then pointed at
// gemini.google.com/library and asked for "consistent spacing across projects, library, and apps
// pages", so the column, the title row, the round buttons and the soft row all live in
// `shell/page-frame.tsx` and are guarded once, in `page-frame.test.ts`. What this file guards is
// that Projects USES that frame rather than a private copy, and what a project row is made of.

test("🔴🔴 the page is drawn on the shared frame, not on a private copy of it", () => {
  assert.match(page, /from "@\/components\/workspace\/shell\/page-frame"/, "the page stopped importing the frame");
  assert.match(page, /<PageFrame>/, "the scroller and column are not the frame's");
  assert.match(page, /<PageTitle[\s\S]{0,600}>\s*Projects\s*<\/PageTitle>/, "the title row is not the frame's");
  assert.ok(!/<h1\b/.test(page), "the page draws its own <h1> beside the frame's");
  assert.ok(!/mx-auto[^"]*max-w-\[|COLUMN_PX|TITLE_TOP_PX|PILLS_TOP_PX|CARDS_TOP_PX/.test(page), "a page-private column or title line survived");
});

test("🔴🔴 a project is one soft row, two across, on the frame's own gaps", () => {
  // (760 - 8) / 2 = 376 each: the frame's column and the frame's row gap, nothing invented.
  assert.match(page, /const ACROSS = 2;/);
  assert.match(page, /gridTemplateColumns: `repeat\(\$\{ACROSS\}, minmax\(0, 1fr\)\)`/, "the two-across grid is not built on the frame's column");
  assert.match(page, /style=\{\{ gap: FRAME_ROW_GAP_PX, gridTemplateColumns[\s\S]{0,120}marginTop: FRAME_SECTION_GAP_PX \}\}/, "the grid's gap or its distance under the title is not the frame's");
  assert.match(page, /cn\("group\/row min-w-0", SOFT_ROW\)/, "a project row is not the frame's soft row");
  assert.match(page, /style=\{\{ minHeight: FRAME_ROW_H_PX \}\}/, "a project row is not the frame's 89px");
  assert.ok(!/rounded-\[12px\]|shadow-\[inset_0_0_0_1px|CARD_H_PX|CARD_GAP_PX/.test(page), "the Claude-style card came back");
});

test("🔴🔴 the row shows the project's own mark, its name and its date — nothing else", () => {
  // The card version dropped the mark; the sidebar row and the project page both draw it, and a
  // page showing the same project without it is the one place it looks like somebody else's.
  assert.match(page, /<Codicon aria-hidden name=\{project\.icon \?\? "folder"\} size="22px" style=\{projectTint\(project\)\} \/>/, "the project's icon and colour are missing from its row");
  assert.match(page, /<RowText meta=\{modified\(project\.modifiedAt\) \|\| "Nothing in it yet"\} title=\{project\.name\} \/>/);
  assert.ok(!/project\.description|project\.topic/.test(page), "a project description appeared on the row");
  assert.ok(!/>\s*Name\s*<|>\s*Modified\s*<|NameCells|rowBox/.test(page), "the old file-table anatomy returned");
});

test("🔴🔴 the whole row navigates, and the ⋯ is not inside the press", () => {
  // A menu trigger inside a button is a button inside a button. The press covers the row with
  // `inset-0`; the ⋯ floats at the right padding, quiet until the row is hovered.
  assert.match(page, /className="absolute inset-0 flex items-start gap-\[16px\] rounded-\[28px\] p-\[20px\] pr-\[72px\] text-left"/);
  assert.match(page, /onClick=\{\(\) => onOpen\(project\.id\)\}/);
  assert.match(page, /opacity-0 transition-\[background-color,color,opacity\] group-hover\/row:opacity-100 focus-visible:opacity-100 data-\[state=open\]:opacity-100/, "the ⋯ is painted at rest, or its fade and hover colour overwrite each other");
  const row = page.slice(page.indexOf("function ProjectRow"));
  assert.ok(row.indexOf("</button>") < row.indexOf("<DropdownMenu>"), "the menu trigger is nested inside the row's press");
  assert.ok(!/#[0-9a-f]{6}/i.test(row), "a literal colour leaked into the row");
});

test("🔴 project actions remain available from the row's menu", () => {
  assert.match(page, /Project settings/);
  assert.match(page, /project\.pinnedAt \? "Unpin project" : "Pin project"/);
  assert.match(page, /Delete project/);
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

test("🔴🔴 the token spelling that silently applies NO font size cannot land here unnoticed", () => {
  // 🔴 `text-[var(--canvas-text-small)]` IS A COLOUR UTILITY IN TAILWIND, NOT A SIZE. It compiles
  // to `color: var(--canvas-text-small)`, applies no font size at all, and reviews clean. The
  // Canvas guard's own header records that this shipped broken in this codebase once and was only
  // found when the CSS build choked on an unrelated line. The correct spelling carries the hint —
  // `text-[length:var(--canvas-text-small)]` — which `components/workspace` uses in 336 places and
  // the broken form in none.
  //
  // 🔴 THIS TAKES NO POSITION ON WHETHER TO CONVERT. §46.3's roots are `learn/` and `shell/`, so
  // this page is not in scope today, and whether they widen is an owner call between two of their
  // own rules (measured 1:1 literals vs one declared scale). What this guards is the branch nobody
  // owns: a conversion done on its own — "use the token like everywhere else" — lands here
  // UNguarded precisely because this file sits outside those roots. And it would not announce
  // itself: 14px is near enough the inherited body size that a page rendering no size at all still
  // looks roughly right. Whichever way the decision goes, it cannot go there silently.
  assert.ok(
    !/text-\[var\(--canvas-text-/.test(page),
    "a token font size is missing its `length:` hint — Tailwind reads that as a COLOUR, so the size never applies",
  );
});

// ── The controls ─────────────────────────────────────────────────────────────────────────────

test("🔴🔴 there are no filter pills — Pinned was removed, and a lone All would filter nothing", () => {
  // Owner 2026-09-04: "remove the pinned for projects". The reference's other pills describe
  // sharing, which Nemesis does not have, so nothing was left for a pill row to do. The page
  // still shows every project, and the pin itself survives in the card's menu because the
  // sidebar still orders by it.
  assert.ok(!/FILTERS/.test(page), "the filter pill row came back");
  assert.ok(!/label: "Pinned"/.test(page), "the Pinned pill came back");
  assert.ok(!/Shared with you|Created by you/.test(page), "a sharing filter appeared in a product with no sharing");
  assert.match(page, /visibleProjects\(projects, "all", query\)/, "the page no longer shows every project");
});

test("🔴 the search is the frame's round magnifier, and it says what it searches", () => {
  assert.match(page, /<RoundButton label="Search projects" onClick=\{\(\) => setSearching\(true\)\}>/);
  assert.match(page, /placeholder="Search projects"/);
  assert.match(page, /onBlur=\{\(\) => \{ if \(query === ""\) setSearching\(false\); \}\}/, "an emptied search no longer folds back into its button");
});

test("🔴 the New button really makes a folder, in the reference's own dialog, from the frame's round button", () => {
  assert.match(page, /import \{[\s\S]*?createFolder,[\s\S]*?\} from "@\/lib\/learn\/canvas-store";/);
  // 🔴🔴 THE GLYPH RIDES ALONG NOW, because the door is the dialog rather than a bare row. Owner,
  // 2026-09-04: *"creating a new project in the project page should work like in chatgpt
  // https://chatgpt.com/projects."* Their "New" pill opens the SAME "Create project" modal the
  // sidebar's row opens, so this page opens `ProjectCreateDialog` — the component measured
  // against it in #1107 — instead of writing an input into the table.
  assert.match(page, /await createFolder\(userId, name, null, icon\)/);
  assert.match(page, /<ProjectCreateDialog onCreate=\{addProject\}/, "the page stopped using the reference's dialog");
  assert.match(page, /<RoundButton label="New project" onClick=\{\(\) => setCreating\(true\)\}>/, "New project is not the frame's round button");
  // 🔴 AND THE ROW IS GONE, NOT MERELY UNUSED. It committed on Enter AND on blur, so clicking
  // anywhere else made a project; the Library lost the same row for the same reason (#1134).
  assert.ok(!/Name the new project/.test(page), "the inline naming row is back");
  assert.ok(!/onBlur=\{\(event\) => void addProject/.test(page), "a project is created by clicking away again");
});

test("🔴 the page sits on the reference's #fcfcfc ground, which is our own sidebar token", () => {
  // The reference's page background is `--component-sidebar-bg` (#fcfcfc), not white; our
  // `--ui-bg-sidebar` resolves to exactly that, so page and sidebar share one ground with no seam.
  // The ground is the frame's now (`PageFrame` paints `--ui-bg-sidebar`); the page must not repaint it.
  assert.ok(!/bg-\(--ui-bg-sidebar\)/.test(page), "the page repaints the frame's ground on its own");
  // `bg-white/[0.10]` is the dark row hover and is fine; a bare `bg-white` is the ground going wrong.
  assert.ok(!/bg-white(?![/-])/.test(page), "the page went to pure white, which reads wrong beside the sidebar");
});

// ── What a row does ──────────────────────────────────────────────────────────────────────────

// 🔴 THIS USED TO ASSERT THE OPPOSITE: "a project opens IN PLACE, and does not invent a detail
// route", on the grounds that there was nowhere else to send it. `project-page.tsx` is now that
// somewhere else — see its own header for the owner's report this answers — and a row that both
// expanded in place AND navigated would be two meanings for one click. The canvas-opens-where-the-
// sidebar-opens-it assertion moved WITH the canvas rows themselves: `project-page.test.ts` is
// where `/learn?c=` now lives, because `projects-page.tsx` no longer renders a canvas row at all.
test("🔴🔴 a project row navigates to its own page — the ChatGPT behaviour this page didn't have", () => {
  assert.match(page, /onOpen: \(id: string\) => void;/);
  assert.match(page, /project: ProjectNode;/);
  assert.match(page, /onOpen=\{\(id\) => router\.push\(`\/projects\/\$\{id\}`\)\}/);
  // No leftover toggle machinery: a click either navigates or it expands, never both.
  assert.ok(!/aria-expanded/.test(page), "the old expand/collapse state is still wired up alongside navigation");
  assert.ok(!/onToggle|isOpen/.test(page), "toggle state survived the move to navigation and is now dead code");
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

test("🔴🔴 Pinned means a project the learner really pinned — folders.pinned_at, since 20260830T40", () => {
  // This asserted the OPPOSITE until 2026-08-30: with no `folders.pinned_at`, "Pinned" filtered
  // on holds-a-pinned-canvas, the best real fact available. The migration exists now, the
  // sidebar pins projects with it, and a filter named like the reference's must mean what the
  // reference's means: the project's own pin, not its contents'.
  const projects = buildProjects(
    [folder("a", { pinnedAt: "2026-08-02T00:00:00.000Z" }), folder("deep", { parentId: "a" }), folder("b")],
    [
      // A pinned canvas inside an UNPINNED project must no longer light the filter…
      canvas({ folderId: "b", id: "p", pinnedAt: "2026-08-01T00:00:00.000Z" }),
    ],
  );
  const pinned = visibleProjects(projects, "pinned", "");
  assert.deepEqual(
    pinned.map((project) => project.id),
    ["a"],
  );
  // …while holdsPinned stays computed for readers that DO mean the contents.
  assert.equal(projects.find((node) => node.id === "b")?.holdsPinned, true);
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

// ── findProject: the new project PAGE's own lookup ──────────────────────────────────────────────

test("🔴 findProject finds a root project by id", () => {
  const projects = buildProjects([folder("a"), folder("b")], []);
  assert.equal(findProject(projects, "b")?.id, "b");
});

test("🔴🔴 findProject finds a SUB-project too — the project page has to resolve one if linked to directly", () => {
  const projects = buildProjects([folder("fall", { name: "Fall 2026" }), folder("torts", { name: "Torts", parentId: "fall" })], []);
  assert.equal(findProject(projects, "torts")?.name, "Torts");
});

test("findProject returns null for an id that is not there, rather than throwing", () => {
  const projects = buildProjects([folder("a")], []);
  assert.equal(findProject(projects, "nope"), null);
});
