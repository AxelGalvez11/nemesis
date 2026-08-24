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

test("a course canvas is marked in both lists, from the territory's own plan title", () => {
  // The mark must come from the SELECT (territory->plan->>title): a course deliberately has
  // no column, no table and no flag of its own — see curriculum-plan.ts.
  assert.match(STORE, /territory->plan->>title/, "listCanvases no longer selects the course title");
  assert.match(SIDEBAR, /courseTitle\s*\?/, "the sidebar row ignores courseTitle");
  assert.ok(SIDEBAR.includes("mortar-board"), "the sidebar course mark is gone");
  const manager = readFileSync(new URL("../library/canvas-manager.tsx", import.meta.url), "utf8");
  assert.match(manager, /courseTitle \? GraduationCap/, "the Library row ignores courseTitle");
  const index = readFileSync(new URL("../../../lib/library/canvas-index.ts", import.meta.url), "utf8");
  assert.match(index, /territory->plan->>title/, "the Library search no longer selects the course title");
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
