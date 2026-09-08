import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { activeSourceIds } from "./board-scope";

// ── every chat reads every source ────────────────────────────────────────────────────────────
//
// 🔴🔴 THIS FILE HELD ELEVEN GUARDS FOR THE OPPOSITE RULE, ALL SHIPPED AND ALL NOW GONE. Owner,
// 2026-09-07, choosing between three shapes: *"A frame, and whatever sits in it is what chats
// read"*. Later the same day: *"adding documents still loads them on canvas, please remove that"*
// and *"so all chats should contain all sources"*.
//
// Documents left the canvas, so a frame had nothing to hold; and every chat reads everything, so
// there was no scope left to decide. The old guards pinned: a global chat picking up sources added
// later; a chat inside a frame reading only what was in it; the drag that deliberately changed an
// answer; innermost-frame-wins; a folded frame scoping the same as an open one; the label naming
// the frame; reusing a frame instead of stacking a second; gathering ticked sources onto clear
// ground before framing them; growing a frame for a new chat; a question dragged off one document
// still reading that document; and `data-card-scope` being printed on the card.
//
// 🔴 THE ONE CLAIM WORTH KEEPING FROM ALL OF THAT is that a source arriving LATER is read without
// anything being ticked, because that was the property the owner wanted from a "global" chat and it
// is the only way the new rule can be wrong.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const sources = [
  { id: "s1", status: "ready" },
  { id: "s2", status: "processing" },
  { id: "s3", status: "ready" },
  { id: "s4", status: "error" },
];

test("🔴🔴 nothing ticked means EVERYTHING, and a source added later is included", () => {
  // Older than this file and the reason a canvas works with the panel closed: a learner who has
  // ticked nothing has not asked to be answered from thin air, and every board saved before ticks
  // existed carries an empty list.
  assert.deepEqual(activeSourceIds(sources, []), ["s1", "s3"], "a source still being read, or that failed, is being sent to the model");
  assert.deepEqual(activeSourceIds([...sources, { id: "s5", status: "ready" }], []), ["s1", "s3", "s5"]);
  assert.deepEqual(activeSourceIds([], []), []);
});

test("🔴🔴 ticking narrows it, which is the whole job of the tick", () => {
  // Owner, 2026-09-07: *"so all chats should contain all sources"*, *"thats why we have tickers"*.
  assert.deepEqual(activeSourceIds(sources, ["s3"]), ["s3"]);
  assert.deepEqual(activeSourceIds(sources, ["s1", "s3"]), ["s1", "s3"]);
  // A tick on something that is not ready yet is not a source: it has no text to ground in.
  assert.deepEqual(activeSourceIds(sources, ["s2"]), ["s1", "s3"], "a tick on an unreadable file emptied the scope");
  // Board order, not tick order, so two answers built from the same set cite the same numbers.
  assert.deepEqual(activeSourceIds(sources, ["s3", "s1"]), ["s1", "s3"]);
  // A tick pointing at a deleted source falls back rather than answering from nothing.
  assert.deepEqual(activeSourceIds(sources, ["gone"]), ["s1", "s3"]);
});

test("🔴🔴 nothing decides a per-chat scope any more", () => {
  // The risk now is the reverse of the old one: somebody reinstating a filter because `sourceIds`
  // is still a field on a card and looks unused. It round-trips for boards saved before today and
  // nothing reads it to narrow an answer.
  const PROVIDER = read("../../components/workspace/board/board-provider.tsx");
  const CARD = read("../../components/workspace/board/conversation-card.tsx");
  const STUDIO = read("../../components/workspace/board/board-studio.tsx");
  for (const gone of ["scopeForCard", "groupContaining", "groupHoldingExactly", "ensureTickGroup", "gatherIntoBlock"]) {
    assert.ok(!PROVIDER.includes(gone), `${gone} is back — every chat reads everything since 2026-09-07`);
  }
  assert.ok(!CARD.includes("data-card-scope"), "the card prints a scope again, and there is one answer for every chat");
  assert.ok(!STUDIO.includes("data-studio-group-ticked"), "the Group-these-sources row is back");
  // 🔴 THE TICKS ARE THE CONTROL AND MUST BE PRESENT — the opposite of what the frame rule needed.
  // Owner, 2026-09-07: *"thats why we have tickers"*. And they have to be reachable from INSIDE a
  // chat too, which is where one build hid them because a tick could not change a framed scope.
  assert.match(STUDIO, /Select all/, "the Select all row is gone");
  assert.match(STUDIO, /onTick=\{\(\) => toggleSourceSelection\(source\.id\)\}/, "a source row lost its tick");
  assert.ok(!/onTick=\{entered \?/.test(STUDIO), "the ticks are hidden inside a chat again");
  assert.match(STUDIO, /const listed = sources;/, "the panel filters the list again, and every chat sees every source");
});

test("🔴🔴 the board draws no source cards, and the model still carries their geometry", () => {
  // Owner, 2026-09-07: *"adding documents still loads them on canvas, please remove that"*.
  // Nothing was migrated, which is the condition for doing this in one line: a board saved before
  // today still has a position on every source and would draw again if the map came back.
  const SURFACE = read("../../components/workspace/board/board-surface.tsx");
  assert.ok(!/type: "source"/.test(SURFACE), "sources are back on the canvas");
  const MODEL = read("./board-model.ts");
  assert.match(MODEL, /position: BoardPosition;/, "BoardSource lost its geometry, so this is no longer reversible");
});

test("🔴 frames survive, and still hold nothing", () => {
  // Obsidian groups arrange the board. They stopped deciding retrieval; they did not stop existing.
  const GROUPS = read("./board-groups.ts");
  assert.match(GROUPS, /export function nodesInsideGroup/);
  assert.ok(!/memberIds|children|nodeIds\s*:/.test(GROUPS), "the group model grew a member list");
});
