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

test("🔴 projects wear the learner's icon, and no colour at all (owner 2026-08-30, amended 2026-09-03)", () => {
  assert.match(SIDEBAR, /folder\.icon \?\? \(isOpen/, "the folder row ignores the custom icon");
  // 🔴 THE COLOUR HALF WAS REVERSED (owner 2026-09-03: "remove any color accents throughout the
  // app, there should only be accents on the mascot and the send button and chat bubble color").
  // A green `#46a758` flask on this very row is what prompted it. The icon half stands, above.
  // Comments stripped: this asserts an ABSENCE and the note left on the row quotes what it looks
  // for. See project-customization.test.ts for the matching guard on the dialog.
  const code = SIDEBAR.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
  assert.doesNotMatch(code, /folder\.color/u, "the project glyph is tinted again");
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

test("🔴 hover grammar: ⋯ ALONE on a project row, pin+⋯ on a canvas row", () => {
  // 🔴🔴 THE PENCIL WAS CUT BY THE OWNER, 2026-09-01: *"remove the pencil icon in the projects in
  // sidebar, clicking on projects in sidebar should only open the project folder."* It started a
  // canvas already filed in that project, and it was the reference's row grammar rather than a
  // need of ours — the front door's project picker files a new canvas through the same `?folder=`
  // lane, which is why removing this control takes no capability with it.
  //
  // Asserted as an ABSENCE as well as a presence: "the ⋯ is still there" would pass just as well
  // with the pencil sitting beside it, so the guard that matters is the one that fails if it
  // comes back.
  assert.ok(!/aria-label=\{`New canvas in \$\{folder\.name\}`\}/.test(SIDEBAR), "the project row's pencil came back");
  assert.ok(!/\/learn\?new=1&folder=/.test(SIDEBAR), "a second door onto the ?folder= lane reappeared in the rail");
  assert.match(SIDEBAR, /aria-label="Project actions"/, "the project row lost its ⋯ as well, so it has no menu at all");
  assert.match(SIDEBAR, /aria-label=\{canvas\.pinnedAt \? "Unpin canvas" : "Pin canvas"\}/, "the canvas row lost its hover pin");
  // With one control instead of two, the row's own trailing reserve halves. A row still padded for
  // two would print its name stopping 26px short of nothing.
  assert.match(SIDEBAR, /aria-expanded=\{isOpen\}[\s\S]{0,400}pr-\[30px\]/, "the project row still reserves room for the control it lost");
});

test("🔴🔴 a project opens by GROWING — the rail never jump-cuts", () => {
  // Owner, 2026-09-01: *"clicking on projects in sidebar should only open the project folder and
  // have a smooth animation."* Every disclosure in this rail was `{open ? <ul/> : null}`, so the
  // rows appeared at full height in one frame and everything below them teleported.
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
  assert.match(SIDEBAR, /inert=\{!open\}/, "a closed project's rows are back in the tab order");
  // One component, used by the project bodies AND all three section bodies: four hand-written
  // copies is four chances for one to keep the old jump-cut.
  assert.ok((SIDEBAR.match(/<Reveal /g) ?? []).length >= 4, "some disclosure in the rail is not using the shared reveal");
});

test("🔴 an expanded project shows five canvases, then Show more — the reference's own cap", () => {
  assert.match(SIDEBAR, /const FOLDER_PREVIEW_ROWS = 5;/, "the five-row cap is gone");
  assert.match(SIDEBAR, /contents\.slice\(0, FOLDER_PREVIEW_ROWS\)/, "the cap is no longer applied to a project's canvases");
  assert.match(SIDEBAR, />\s*Show more\s*<\/button>/, "the Show more row is gone — the tail of a big project is unreachable");
  // Sub-projects are NOT capped: the cap is the reference's chat-list behaviour, and folding a
  // child project away behind Show more would hide a container, not a tail.
  assert.match(SIDEBAR, /\{children\.map\(\(child\) => folderRow\(child, depth \+ 1\)\)\}/, "sub-projects fell under the canvas cap");
});

test("🔴 there is no door that makes a NEW sub-project", () => {
  // Owner 2026-09-01: "the projects have this option to do a sub project. I
  // don't get why that's there. I don't need that."
  //
  // The ROW still draws (the test above), because folders that already have a
  // parent exist in the database and hiding them would lose them. What is gone
  // is the menu item, and with it the only caller that ever passed a parent.
  // Matched as a rendered text node (`>...<`), not as a bare phrase: the note
  // at the call site explains what was removed and says the words to do it.
  assert.doesNotMatch(SIDEBAR, />New sub-project</, "the sub-project menu item came back");
  assert.doesNotMatch(SIDEBAR, /newFolder\(folder\.id\)/, "something is creating a folder under another again");
  // 🔴 REPOINTED, NOT WEAKENED (2026-09-03). This pinned `createFolder(userId, "New project", null)`
  // — one string carrying two unrelated claims, the top-level `null` and a placeholder NAME. The
  // name half is now wrong on purpose: a project is named in a dialog before it is written at all
  // (see `project-create-dialog.test.ts`, which guards that no placeholder row can be left behind).
  // The claim THIS test makes is the parent, and it is unchanged.
  assert.match(SIDEBAR, /createFolder\(userId, name, null, icon\)/, "new projects must be filed at the top level");
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
