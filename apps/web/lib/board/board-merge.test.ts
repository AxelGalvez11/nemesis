import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { mergeLoaded, mergeTicks } from "./board-merge";

// ── a drop that lands while the canvas is still loading ──────────────────────────────────────
//
// Owner, 2026-09-07: *"I dropped in the sources ... and it pretty much just stayed on the landing
// canvas"*. The landing is up while `getBoard` runs, it accepts drops, and the fetch then replaced
// every piece of state with the stored document. The file was thrown away and the landing came
// back. See lib/board/board-merge.ts.

const s = (id: string) => ({ id });

test("🔴🔴 anything started during the load survives it", () => {
  const stored = [s("a"), s("b")];
  const local = [s("dropped")];
  assert.deepEqual(mergeLoaded(stored, local).map((x) => x.id), ["a", "b", "dropped"], "the dropped file was thrown away");
});

test("🔴 stored first, then local, so nothing already on the canvas is renumbered", () => {
  // Citation ids (s1, s2…) are assigned by position, so putting the new arrival first would point
  // every mark in every saved answer at a different document.
  assert.deepEqual(mergeLoaded([s("a"), s("b")], [s("c")]).map((x) => x.id), ["a", "b", "c"]);
});

test("🔴 the stored copy wins a clash, and nothing is duplicated", () => {
  assert.deepEqual(mergeLoaded([s("a")], [s("a")]).map((x) => x.id), ["a"]);
  assert.deepEqual(mergeLoaded([s("a")], [s("a"), s("new")]).map((x) => x.id), ["a", "new"]);
});

test("🔴 the common path returns the stored array itself, not a copy", () => {
  // This runs inside a setState updater and nothing is usually started during a load. A new array
  // every time would re-render every card on the board for no change.
  const stored = [s("a")];
  assert.equal(mergeLoaded(stored, []), stored);
  assert.equal(mergeLoaded(stored, [s("a")]), stored, "a local list of things already stored still churned");
  assert.notEqual(mergeLoaded(stored, [s("b")]), stored);
  assert.deepEqual(mergeLoaded([], []), []);
});

test("🔴🔴 a file dropped mid-load arrives TICKED, like every other arrival", () => {
  // The subtlest half of the same bug: the stored tick list has never heard of the new file, so
  // seeding from it alone leaves the document visibly in the panel and out of every answer.
  assert.deepEqual(mergeTicks(["a", "b"], ["dropped"], ["a", "b"]), ["a", "b", "dropped"]);
  // A tick on something the stored document DOES know about is already accounted for.
  assert.deepEqual(mergeTicks(["a"], ["b"], ["a", "b"]), ["a"], "a stored source was ticked twice");
  assert.deepEqual(mergeTicks(["a"], ["a"], ["a"]), ["a"]);
  assert.deepEqual(mergeTicks([], [], []), []);
});

test("🔴🔴 the provider merges rather than replaces, on all three lists", () => {
  const PROVIDER = readFileSync(new URL("../../components/workspace/board/board-provider.tsx", import.meta.url), "utf8");
  for (const call of ["mergeLoaded(state.sources", "mergeLoaded(state.outputs", "mergeTicks("]) {
    assert.ok(PROVIDER.includes(call), `${call} is gone — a drop during the load is thrown away again`);
  }
  // The cards are merged too: the landing's composer starts a thread, so a question typed in the
  // same second was lost the same way.
  assert.match(PROVIDER, /cardsRef\.current/, "cards started during the load are dropped again");
  // 🔴 THE LOAD PATH ONLY. `setSources(state.sources)` also appears in the version-conflict
  // recovery, where another session has won and its document is deliberately taken whole; merging
  // there would resurrect a card that session had deleted. So this asserts the shape of the LOAD
  // rather than the absence of the string.
  const load = PROVIDER.slice(PROVIDER.indexOf("getBoard(boardIdRef.current)"), PROVIDER.indexOf("setLoaded(true);", PROVIDER.indexOf("getBoard(boardIdRef.current)")));
  assert.ok(!/setSources\(state\.sources\)/.test(load), "the load overwrites the sources again");
  assert.ok(!/setOutputs\(state\.outputs\)/.test(load), "the load overwrites the made things again");
  assert.ok(!/dispatch\(\{ type: "replace", cards: settled,/.test(load), "the load overwrites the cards again");
});

test("🔴🔴 a made card can be moved: its title bar is the drag handle", () => {
  // Owner, 2026-09-07, twice: *"I still can't move any notes in the canvas"*. It was not hard, it
  // was impossible: a check wraps its whole body in `nodrag nopan nowheel` so a tap answers a
  // question instead of dragging the board, and a made card's body is one full-width button that
  // opens it. Measured on the harness before the fix: EVERY point on a check card — 6, 14, 30, 60
  // and 158 pixels down — sat inside a `.nodrag`.
  const CHROME = readFileSync(new URL("../../components/workspace/board/board-chrome.tsx", import.meta.url), "utf8");
  const SURFACE = readFileSync(new URL("../../components/workspace/board/board-surface.tsx", import.meta.url), "utf8");
  assert.match(CHROME, /export const CARD_DRAG_HANDLE = "board-card-handle";/, "the handle's name is gone");
  assert.match(CHROME, /\$\{CARD_DRAG_HANDLE\} absolute bottom-full/, "the title bar is no longer the handle");
  assert.match(SURFACE, /dragHandle: `\.\$\{CARD_DRAG_HANDLE\}`/, "a made card has no handle, so it cannot be moved at all");
  // 🔴 AND THE FAN STAYS OPEN WHILE YOU WORK. It used to close on any press on empty board, which
  // is exactly what a learner does between deciding to move a note and reaching for it, so the note
  // vanished mid-gesture. Pressing the stack again is what puts them away.
  assert.ok(!/const clearSelection[\s\S]{0,200}closeFan\(\)/.test(SURFACE), "a press on the board hides a fanned chat's things again");
});
