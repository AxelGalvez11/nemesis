import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The sidebar's canvas list is a READER of canvas-store, kept honest by a broadcast. These
// guards pin the wiring that makes the list truthful — the parts that fail silently: a
// mutator that forgets to broadcast leaves a stale sidebar; a list that re-fetches on every
// autosave hammers the database while an answer streams.

const SIDEBAR = readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./chat-sidebar.tsx", import.meta.url), "utf8");
const STORE = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");

test("every canvas-store mutation broadcasts, so the sidebar can never go stale", () => {
  const mutators = [
    "saveCanvas",
    "deleteCanvas",
    "renameCanvas",
    "setCanvasPinned",
    "setFolderPinned",
    "setCanvasFolder",
    "createFolder",
    "renameFolder",
    "setFolderParent",
    "deleteFolder",
  ];
  for (const name of mutators) {
    const start = STORE.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} is gone — update this list with its replacement`);
    const next = STORE.indexOf("\nexport", start + 1);
    const body = STORE.slice(start, next === -1 ? undefined : next);
    assert.ok(body.includes("emitCanvasesChanged()"), `${name} mutates without broadcasting`);
  }
});

test("the sidebar subscribes to the broadcast and coalesces the autosave storm", () => {
  assert.ok(SIDEBAR.includes("CANVASES_CHANGED_EVENT"), "the list no longer listens — it will go stale");
  assert.match(SIDEBAR, /REFRESH_DEBOUNCE_MS/, "un-debounced refresh re-reads the list on every autosave");
});

test("a course canvas is KNOWN in both lists, but the sidebar row wears no icon for it", () => {
  // The fact still comes from the SELECT (territory->plan->>title): a course deliberately has
  // no column, no table and no flag of its own — see curriculum-plan.ts.
  assert.match(STORE, /territory->plan->>title/, "listCanvases no longer selects the course title");
  // 🔴 THE MORTAR-BOARD LEFT THE SIDEBAR ON 2026-08-30 — owner: "the canvases shouldnt have
  // icons, only the projects should be allowed to have icons", matching the reference where a
  // chat is always a bare title. The course fact survives as the row's tooltip.
  assert.ok(!SIDEBAR.includes("mortar-board"), "a canvas row grew an icon again");
  assert.match(SIDEBAR, /title=\{canvas\.courseTitle \? `Course: /, "the course fact lost its tooltip");
  const manager = readFileSync(new URL("../library/canvas-manager.tsx", import.meta.url), "utf8");
  assert.match(manager, /courseTitle \? GraduationCap/, "the Library row ignores courseTitle");
  const index = readFileSync(new URL("../../../lib/library/canvas-index.ts", import.meta.url), "utf8");
  assert.match(index, /territory->plan->>title/, "the Library search no longer selects the course title");
});

test("🔴 projects wear the learner's icon and colour, and canvases never do (owner 2026-08-30)", () => {
  assert.match(SIDEBAR, /folder\.icon \?\? \(isOpen/, "the folder row ignores the custom icon");
  assert.match(SIDEBAR, /folder\.color \? \{ color: folder\.color \}/, "the folder row ignores the custom colour");
  // Renamed from "Customize" 2026-08-30 to the reference's own words, measured in the owner's
  // Chrome: the project menu row that opens this dialog reads "Project settings" there.
  assert.ok(SIDEBAR.includes(">Project settings</DropdownMenuItem>"), "the Project settings door left the project menu");
  assert.ok(SIDEBAR.includes("ProjectCustomizeDialog"), "the customize dialog is not mounted");
});

test("🔴 the project row carries the reference's whole menu: settings, home, pin, delete (2026-08-30)", () => {
  // Measured in the owner's Chrome: a ChatGPT project row's ⋯ is Share / Rename / Project
  // settings / Project home, then Pin project / Delete project. Share is deliberately absent
  // (nothing to share a project WITH here — a dead door fails a 1:1 copy while matching it);
  // everything else exists and does what its label says.
  assert.match(SIDEBAR, />\s*Project home\s*<\/DropdownMenuItem>/, "Project home left the menu — the sidebar can no longer reach /projects/<id>");
  assert.match(SIDEBAR, /router\.push\(`\/projects\/\$\{folder\.id\}`\)/, "Project home no longer navigates to the project page");
  assert.match(SIDEBAR, /\{folder\.pinnedAt \? "Unpin project" : "Pin project"\}/, "the pin toggle left the project menu");
  assert.match(SIDEBAR, /setFolderPinned\(userId, folder\.id, !folder\.pinnedAt\)/, "Pin project no longer writes folders.pinned_at");
});

test("🔴 hover grammar is the reference's: pencil+⋯ on a project row, pin+⋯ on a canvas row", () => {
  // Measured 2026-08-30: hovering a project row reveals a compose pencil (new chat in that
  // project) and the ⋯; hovering a chat row reveals a pin toggle and the ⋯. The pencil rides
  // the same ?folder= lane the front door uses, so instructions ride the first answer.
  assert.match(SIDEBAR, /aria-label=\{`New canvas in \$\{folder\.name\}`\}/, "the project row lost its new-canvas pencil");
  assert.match(SIDEBAR, /\/learn\?new=1&folder=\$\{encodeURIComponent\(folder\.id\)\}/, "the pencil no longer files through the ?folder= lane");
  assert.match(SIDEBAR, /aria-label=\{canvas\.pinnedAt \? "Unpin canvas" : "Pin canvas"\}/, "the canvas row lost its hover pin");
});

test("🔴 an expanded project shows five canvases, then Show more — the reference's own cap", () => {
  assert.match(SIDEBAR, /const FOLDER_PREVIEW_ROWS = 5;/, "the five-row cap is gone");
  assert.match(SIDEBAR, /contents\.slice\(0, FOLDER_PREVIEW_ROWS\)/, "the cap is no longer applied to a project's canvases");
  assert.match(SIDEBAR, />\s*Show more\s*<\/button>/, "the Show more row is gone — the tail of a big project is unreachable");
  // Sub-projects are NOT capped: the cap is the reference's chat-list behaviour, and folding a
  // child project away behind Show more would hide a container, not a tail.
  assert.match(SIDEBAR, /\{children\.map\(\(child\) => folderRow\(child, depth \+ 1\)\)\}/, "sub-projects fell under the canvas cap");
});

test("🔴 projects order by recency through buildProjects — one rollup, shared with /projects", () => {
  // The sidebar must never disagree with the Projects page about which project was worked last,
  // so it reads the SAME tree rather than sorting folders by name (the store's own order) or by
  // a second, slightly different rollup.
  assert.match(SIDEBAR, /buildProjects\(folders, canvases\)/, "the sidebar stopped reading the shared recency tree");
  assert.match(STORE, /\.order\("name"\)/, "listFolders changed its order — the sidebar's comment about re-sorting is stale");
  // And a canvas summary now carries the conversation tail the project page prints — extracted
  // INSIDE the select, because a second read per row is the N+1 this feature refused.
  assert.match(STORE, /preview:document->moments->-1->>assistantText/, "listCanvases lost the in-select preview extraction");
});

test("🔴 a pinned project moves to Pinned — same row, and it leaves the Projects section", () => {
  assert.match(SIDEBAR, /pinnedFolders\.map\(\(folder\) => folderRow\(folder, 0\)\)/, "pinned projects no longer render in the Pinned section");
  assert.match(SIDEBAR, /Boolean\(f && !f\.pinnedAt\)/, "a pinned project still shows under Projects too — the reference never shows it twice");
  // The Move-to menu keeps the FULL list on purpose: filing into a pinned project must work.
  assert.match(SIDEBAR, /menuRootFolders/, "the move-to menu lost its own unfiltered list");
});

test("destructive actions ask first, and rows open by canvas id", () => {
  assert.ok(SIDEBAR.indexOf("await confirm(") < SIDEBAR.indexOf("await deleteCanvas("), "delete no longer confirms");
  assert.ok(SIDEBAR.includes("/learn?c=${id}"), "rows stopped opening the stored canvas");
});

test("the sidebar records the owner's reversal of the destinations-only rule", () => {
  // §L said "destinations, not content" (2026-08-13); the owner reversed it on 2026-08-25
  // with the old rule read back. If someone re-imposes §L and deletes the list, this fails
  // and points them at the decision they are re-reversing.
  assert.ok(SHELL.includes("SidebarCanvases"), "the canvas list left the sidebar — owner 2026-08-25 put it there");
  assert.ok(SHELL.includes("2026-08-25"), "the reversal lost its date — the §L history matters here");
});
