import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The sidebar's list is a READER of a store, kept honest by a broadcast. These guards pin the
// wiring that makes it truthful — the parts that fail silently: a mutator that forgets to
// broadcast leaves a stale rail; a list that re-fetches on every autosave hammers the database
// while an answer is streaming.
//
// 🔴🔴 EVERY ASSERTION HERE MOVED FROM THE CHAT LIST TO THE CANVAS LIST ON 2026-09-07. Owner:
// *"remove 'chats' from the left sidebar"*, after the canvas became the front door and *"chats only
// live on boards"*. The claims did not change; the store they are made about did, from
// `canvas-store` (`learning_canvases`) to `board-store` (`canvas_boards`). Six guards about the
// project row came down the same day and are named in `sidebar-groups.test.ts`.

const SIDEBAR = readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8");
const BOARDS = readFileSync(new URL("./sidebar-boards.tsx", import.meta.url), "utf8");
const SHELL = readFileSync(new URL("./chat-sidebar.tsx", import.meta.url), "utf8");
const STORE = readFileSync(new URL("../../../lib/board/board-store.ts", import.meta.url), "utf8");
const CHAT_STORE = readFileSync(new URL("../../../lib/learn/canvas-store.ts", import.meta.url), "utf8");

test("every board-store mutation broadcasts, so the rail can never go stale", () => {
  // A mutator that returns without telling anyone is the silent half of this: the write lands, the
  // rail keeps the old title, and nothing looks broken until a reload.
  const mutators = ["createBoard", "saveBoard", "renameBoard", "deleteBoard"];
  for (const name of mutators) {
    const at = STORE.indexOf(`export async function ${name}`);
    if (at === -1) continue;
    const body = STORE.slice(at, STORE.indexOf("\nexport ", at + 1) === -1 ? undefined : STORE.indexOf("\nexport ", at + 1));
    // 🔴 DIRECTLY, OR THROUGH THE ONE WRAPPER THAT DOES. `renameBoard` is three lines that call
    // `updateBoard`, which broadcasts; demanding the literal call in every body would have failed a
    // correct function and taught the next person to paste a redundant notify into it.
    assert.ok(
      body.includes("notifyBoardsChanged") || /\bupdateBoard\(/.test(body),
      `${name} changes a board without telling the sidebar`,
    );
  }
  assert.match(STORE, /export const BOARDS_CHANGED_EVENT/, "the broadcast itself is gone");
  // And the wrapper the rename leans on has to keep broadcasting, or that exemption is a hole.
  const update = STORE.slice(STORE.indexOf("export async function updateBoard"));
  assert.ok(update.slice(0, update.indexOf("\nexport ")).includes("notifyBoardsChanged"), "updateBoard stopped broadcasting, so every write through it is now silent");
});

test("the rail subscribes to the broadcast and coalesces the autosave storm", () => {
  assert.ok(BOARDS.includes("BOARDS_CHANGED_EVENT"), "the list no longer listens — it will go stale");
  assert.match(BOARDS, /REFRESH_DEBOUNCE_MS/, "un-debounced refresh re-reads the list on every autosave");
  // A streaming answer saves the board every few seconds and every save broadcasts, so the
  // debounce is not a nicety.
  assert.match(BOARDS, /const REFRESH_DEBOUNCE_MS = \d+;/);
});

test("🔴🔴 a section opens by GROWING — the rail never jump-cuts", () => {
  // Owner, 2026-09-01: *"clicking on projects in sidebar should only open the project folder and
  // have a smooth animation."* Every disclosure in this rail was `{open ? <ul/> : null}`, so the
  // rows appeared at full height in one frame and everything below them teleported.
  //
  // 🔴 THE PROJECT BODIES THIS WAS WRITTEN FOR ARE GONE, AND SO IS THE CHAT LIST THAT INHERITED IT.
  // The mechanism now runs the one section left, the canvases. It is guarded rather than dropped
  // because it was expensive to get right and every future section will use it.
  assert.ok(!/\{open \? \(\s*<ul/.test(BOARDS), "the disclosure went back to mounting and unmounting its rows");
  assert.match(BOARDS, /gridTemplateRows|Reveal/, "the section no longer animates open");
});

test("🔴 the store still hands the rail what it draws with", () => {
  assert.match(STORE, /\.order\("updated_at", \{ ascending: false \}\)/, "the canvases stopped arriving newest first");
  assert.match(STORE, /\.eq\("deleted", false\)/, "a deleted canvas is listed again");
  // 🔴 THE CHAT STORE IS UNTOUCHED, which is what makes the removal reversible. If these go, the
  // change stopped being about what is DRAWN and became about what EXISTS.
  assert.match(CHAT_STORE, /export async function listCanvases/, "listCanvases was deleted — the chat list is no longer restorable");
  assert.match(CHAT_STORE, /preview:document->moments->-1->>assistantText/, "listCanvases lost the in-select preview extraction");
});

test("destructive actions ask first, and rows open by canvas id", () => {
  assert.ok(BOARDS.indexOf("confirm(") < BOARDS.indexOf("deleteBoard("), "delete no longer confirms");
  assert.ok(BOARDS.includes("/canvas/${"), "rows stopped opening the stored canvas");
});

test("the rail records two owner reversals, and the second one undoes the first", () => {
  // §L said "destinations, not content" (2026-08-13). The owner reversed it on 2026-08-25: *"I
  // would like the chats or canvases to accumulate on the left sidebar, like it does in ChatGPT"*.
  // On 2026-09-07 the CHATS half of that went again — but the accumulating list did not, it just
  // lists canvases now. So §L is still reversed, and this guard still points at the decision.
  assert.ok(SHELL.includes("SidebarCanvases"), "the list left the sidebar — owner 2026-08-25 put it there");
  assert.ok(SHELL.includes("2026-08-25"), "the reversal lost its date — the §L history matters here");
  assert.match(SIDEBAR, /2026-09-07/, "the file no longer records when the chat list was cut");
});
