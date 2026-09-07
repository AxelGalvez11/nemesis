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
    // A save broadcasts its summary (`emitCanvasesChanged({ kind: "save", ... })`) so the
    // sidebar can patch the row in place; every other mutation broadcasts the bare change.
    assert.ok(/emitCanvasesChanged\(/.test(body), `${name} mutates without broadcasting`);
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




test("🔴🔴 a section opens by GROWING — the rail never jump-cuts", () => {
  // Owner, 2026-09-01: *"clicking on projects in sidebar should only open the project folder and
  // have a smooth animation."* Every disclosure in this rail was `{open ? <ul/> : null}`, so the
  // rows appeared at full height in one frame and everything below them teleported.
  //
  // 🔴 THE PROJECT BODIES THIS WAS WRITTEN FOR ARE GONE (2026-09-07, owner: *"pretty much no more
  // projects"*), and the guard is repointed rather than deleted because the MECHANISM is what was
  // expensive to get right and it still runs the Chats section. Four hand-written copies was the
  // original defect; one copy and one caller is the same rule with less to go wrong.
  assert.ok(
    !/\{isOpen \? \(\s*<ul/.test(SIDEBAR) && !/closedSections\.has\("[a-z]+"\) \? \(?\s*<ul/.test(SIDEBAR),
    "a disclosure went back to mounting and unmounting its rows",
  );
  assert.match(SIDEBAR, /function Reveal\(\{ children, open \}/, "the shared disclosure is gone");
  assert.match(SIDEBAR, /gridTemplateRows: open \? "1fr" : "0fr"/, "the reveal stopped animating a grid track");
  // 🔴 BOTH OR NEITHER. `0fr` cannot shrink a track whose content sets a floor, so a list without
  // `min-h-0` AND `overflow-hidden` simply never closes — and it looks correct while open, which
  // is the only state anyone screenshots.
  assert.match(SIDEBAR, /<ul className="flex min-h-0 flex-col overflow-hidden">\{children\}<\/ul>/, "the reveal's list can no longer collapse");
  assert.match(SIDEBAR, /motion-safe:transition-\[grid-template-rows\]/, "the growth is no longer gated on the learner wanting motion");
  assert.match(SIDEBAR, /inert=\{!open\}/, "a closed section's rows are back in the tab order");
  assert.ok((SIDEBAR.match(/<Reveal /g) ?? []).length >= 1, "the one remaining disclosure stopped using the shared reveal");
});



test("🔴 the store still hands the sidebar what it draws with", () => {
  // 🔴 THE PROJECT-RECENCY HALF RETIRED 2026-09-07 with the Projects section itself; it pinned
  // `buildProjects(folders, canvases)` so the rail and the Projects page could never disagree
  // about which project was worked last. Neither surface exists now. What is left is the pair of
  // store facts the flat list still depends on.
  assert.match(STORE, /\.order\("name"\)/, "listFolders changed its order — folders are still read even though they are not drawn");
  // A canvas summary carries the conversation tail — extracted INSIDE the select, because a second
  // read per row is the N+1 this feature refused.
  assert.match(STORE, /preview:document->moments->-1->>assistantText/, "listCanvases lost the in-select preview extraction");
  // Recency is what the flat list sorts on, so the field has to arrive.
  assert.match(STORE, /updated_at/, "listCanvases stopped selecting when a chat was last touched");
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

test("🔴🔴 the project row is gone from the sidebar, and six guards came down with it", () => {
  // Owner, 2026-09-07: *"since the canvas is going to be like the main feature thing, I would like
  // there to be pretty much no more projects … each canvas is supposed to grow, you know, it's like
  // supposed to be a long term thing, not just a throwaway canvas like a chat"*.
  //
  // 🔴 WHAT USED TO BE GUARDED HERE, NAMED SO A `git log -S` FINDS IT: the project row wore the
  // learner's icon and no colour (2026-08-30, amended 2026-09-03); its ⋯ carried Project settings /
  // Project home / Pin project / Delete project, measured off ChatGPT; the pencil beside it was cut
  // by the owner on 2026-09-01; an expanded project showed five canvases then "Show more"; there
  // was deliberately no door to a sub-project; and a pinned project moved into Pinned and left the
  // Projects section. Every one of those is now unreachable, so the single live risk is a
  // well-meaning tidy-up finding the leftover `canvas_folders` plumbing and drawing it all again.
  //
  // `sidebar-groups.test.ts` holds the fuller absence guard; this one keeps the words above with
  // the file they were written against.
  for (const gone of ["folderRow", "Project settings", "Project home", "Pin project", "Show more", "FOLDER_PREVIEW_ROWS"]) {
    assert.ok(!SIDEBAR.includes(gone), `\`${gone}\` is back — projects were cut from the sidebar on 2026-09-07`);
  }
});
