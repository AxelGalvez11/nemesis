import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the sidebar lists canvases, and nothing else ─────────────────────────────────────────────
//
// 🔴🔴 THIS FILE HAS NOW GUARDED THREE DIFFERENT ANSWERS, EACH THE OWNER'S. It began on
// 2026-08-24 pinning three named groups — `Pinned`, `Projects`, `Chats` — copied from the ChatGPT
// sidebar he asked us to match, with the middle header UNCONDITIONAL because it carried the only
// button that made a project. On 2026-09-07 it became one flat list of chats. Later the same day:
//
//   *"remove 'chats' from the left sidebar"*
//
// which followed from the two rulings before it — the canvas is the front door, and *"chats only
// live on boards"*. A rail listing a kind of thing the product no longer makes is a museum.
//
// 🔴 REPOINTED EACH TIME, NEVER DELETED, and the old claims are named above so a `git log -S` on
// "Projects", the earlier "Folders" label, or `folderRow` lands here and finds why they went. The
// risk has inverted twice: it used to be that the groups would collapse back into one list, then
// that a tidy-up would find the leftover `canvas_folders` plumbing and draw the headers again. It
// is now that someone restores the chat list because `listCanvases` is still exported and looks
// unused.
//
// 🔴 NO DATA WAS TOUCHED AT ANY POINT. `learning_canvases` and `canvas_folders` still hold every
// row, `canvas-store.ts` still exports every reader and mutator, and every chat made before today
// still opens at /learn?c=<id>. Nothing was migrated, so all three answers are one file apart.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SIDEBAR = strip(readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8"));
const BOARDS = strip(readFileSync(new URL("./sidebar-boards.tsx", import.meta.url), "utf8"));
const NAV = strip(readFileSync(new URL("../../../lib/workspace/sidebar-nav.ts", import.meta.url), "utf8"));
const STORE = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");

test("🔴🔴 the rail draws canvases and nothing else", () => {
  assert.match(SIDEBAR, /<SidebarBoards/, "the canvases list is gone from the rail");
  for (const gone of ["listCanvases", "canvasRow", "label=\"Chats\"", "label=\"Projects\"", "label=\"Pinned\"", "folderRow", "Move to project"]) {
    assert.ok(!SIDEBAR.includes(gone), `\`${gone}\` is back in the rail — chats and projects were both cut on 2026-09-07`);
  }
  assert.ok(!NAV.includes('route: "/projects"'), "the Projects row is back in the rail");
});

test("🔴🔴 the canvases are one flat list, newest first", () => {
  // Owner, asked what the list should look like once there was no Projects page: *"One flat list,
  // newest first"*. `listBoards` orders by `updated_at` descending, so the rail inherits it rather
  // than sorting a second time and being able to disagree.
  assert.match(BOARDS, /listBoards\(/, "the boards list stopped reading the store");
  assert.ok(!/pinnedAt|folderId|projectFolders/.test(BOARDS), "the boards list grew pinning or filing of its own");
  assert.equal(BOARDS.split("<SidebarSectionHeader").length - 1, 1, "the boards list grew a second section");
});

test("🔴🔴 nothing was deleted from the store, so all of this is reversible", () => {
  // The whole reason the cuts are safe to make this fast. If a reader here ever disappears, the
  // change stopped being a change of what is DRAWN and became a change of what EXISTS.
  for (const kept of ["export async function listCanvases", "export async function listFolders", "export async function setCanvasFolder"]) {
    assert.ok(STORE.includes(kept), `${kept} was removed — the chat list is no longer restorable`);
  }
});

test("🔴 the rail is one scroll region", () => {
  // Two lists once shared this column deliberately (owner 2026-09-03: "the sidebar will have chats
  // and canvases together"), which is why the scroller lives here and not inside `SidebarBoards`.
  // With one list left, moving it down would be the same mistake waiting for the next list.
  assert.match(SIDEBAR, /SCROLL_Y/, "the rail lost its scroll region");
  assert.ok(!BOARDS.includes("SCROLL_Y"), "the boards list grew a second scroll region");
});
