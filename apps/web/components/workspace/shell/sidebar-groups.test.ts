import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the sidebar is ONE flat list of chats, and projects are gone from it ─────────────────────
//
// 🔴🔴 THIS FILE USED TO GUARD THE OPPOSITE, AND THE REVERSAL IS THE OWNER'S. It held ten guards
// pinning three named groups — `Pinned`, `Projects`, `Chats` — built from the ChatGPT sidebar he
// asked to copy on 2026-08-24, with the middle header UNCONDITIONAL because it carried the only
// button that made a project. On 2026-09-07 he cut the concept:
//
//   *"since the canvas is going to be like the main feature thing, I would like there to be
//    pretty much no more projects … each canvas is supposed to grow, you know, it's like supposed
//    to be a long term thing, not just a throwaway canvas like a chat"*
//
// and, asked directly what the list should look like without a Projects page: *"One flat list,
// newest first"*. Filing answered a pile of throwaway conversations. A canvas you keep returning
// to does not need filing; it needs to be at the top when you last touched it.
//
// 🔴 REPOINTED, NOT DELETED. The old guards are named in this comment so a `git log -S` on
// "Projects" or the earlier "Folders" label lands here and finds the reason, and the assertions
// below now protect the ABSENCE — because the risk has inverted. The danger used to be that the
// groups quietly collapsed back into one list; it is now that a future tidy-up reads the leftover
// `canvas_folders` plumbing and helpfully draws the headers again.
//
// 🔴 THE DATA LAYER IS UNTOUCHED AND MUST STAY THAT WAY. `Folder`, `folderId`, `createFolder` and
// the `canvas_folders` rows all still exist and still round-trip; a chat filed last week still
// carries its folder id. Nothing was migrated and nothing was deleted, so this is reversible by
// putting the headers back. That is why these guards read the RENDER and not the store.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SIDEBAR = strip(readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8"));
const PRIMITIVES = strip(readFileSync(new URL("./sidebar-primitives.tsx", import.meta.url), "utf8"));
const NAV = strip(readFileSync(new URL("../../../lib/workspace/sidebar-nav.ts", import.meta.url), "utf8"));

test("🔴🔴 no Projects and no Pinned section: the chats are one list", () => {
  assert.ok(!SIDEBAR.includes('label="Projects"'), "the Projects header is back in the sidebar");
  assert.ok(!SIDEBAR.includes('label="Pinned"'), "the Pinned header is back in the sidebar");
  assert.ok(SIDEBAR.includes('label="Chats"'), "the one remaining header is gone too — there is nothing over the rows");
  // One header, so exactly one section renders rows.
  assert.equal(SIDEBAR.split("<SidebarSectionHeader").length - 1, 1, "a second section header appeared");
});

test("🔴🔴 newest first, and it is a sort rather than an accident of the query", () => {
  assert.match(SIDEBAR, /const everyChat = useMemo\(/, "nothing builds the flat list");
  assert.match(SIDEBAR, /\(b\.updatedAt \?\? ""\)\.localeCompare\(a\.updatedAt \?\? ""\)/, "the flat list is no longer ordered by recency");
  assert.match(SIDEBAR, /everyChat\.map\(\(canvas\) => canvasRow\(canvas, 0\)\)/, "the rows come from somewhere other than the flat list");
  // A pinned chat is in the list like any other. Pinning still exists on the row's menu, it just
  // no longer lifts a chat into a section of its own.
  assert.ok(!SIDEBAR.includes("pinnedFolders"), "pinned projects are back");
});

test("🔴🔴 nothing in the sidebar files a chat into a project any more", () => {
  for (const gone of ["Move to project", "New project…", "Remove from project", "const folderRow", "newFolderButton", "<ProjectCreateDialog", "<ProjectCustomizeDialog"]) {
    assert.ok(!SIDEBAR.includes(gone), `\`${gone}\` is back in the sidebar — projects were cut on 2026-09-07`);
  }
  assert.ok(!NAV.includes('route: "/projects"'), "the Projects row is back in the rail");
});

test("🔴 the section still collapses, because one section is still a section", () => {
  // A learner with two hundred old chats wants them folded away under the canvases, and the
  // collapse state has persisted since 2026-08-30. Losing that with the groups would have been an
  // unrelated regression riding along with a deliberate change.
  assert.match(SIDEBAR, /toggleSection\("canvases"\)/);
  assert.match(SIDEBAR, /closedSections\.has\("canvases"\)/);
  assert.match(PRIMITIVES, /aria-expanded/, "the header no longer tells assistive tech it folds");
});

test("🔴 the old chats are still reachable, which is the condition for taking a door away", () => {
  // Nothing new arrives at /learn since the canvas became the front door, but every conversation
  // made before that is real work. This list is the last route to it.
  assert.match(SIDEBAR, /const canvasRow = /, "the chat row itself is gone");
  assert.match(SIDEBAR, /listCanvases\(userId\)/, "the sidebar stopped reading the chats at all");
});
