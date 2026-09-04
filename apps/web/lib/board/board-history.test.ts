import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDeleteTargets, createHistoryState, historyReducer, type HistoryState } from "./board-history";
import type { BoardCard } from "./board-model";

function card(id: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    kind: "conversation",
    parentId: null,
    sourceIds: [],
    contextExcerpt: null,
    inheritedContext: [],
    title: id,
    highlights: [],
    savedImages: [],
    notes: [],
    status: "idle",
    position: { x: 0, y: 0 },
    width: 720,
    messages: [],
    ...extra,
  };
}

describe("board history: delete, undo, redo", () => {
  it("deleting a card records its inverse; undo puts it back in the same slot; redo removes it again", () => {
    let state: HistoryState = createHistoryState([card("a"), card("b"), card("c")]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["b"]) });
    assert.deepEqual(state.cards.map((item) => item.id), ["a", "c"]);
    assert.equal(state.past.length, 1);
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.deepEqual(state.cards.map((item) => item.id), ["a", "b", "c"]);
    assert.equal(state.past.length, 0);
    assert.equal(state.future.length, 1);
    state = historyReducer(state, { type: "redo", entryId: "e3" });
    assert.deepEqual(state.cards.map((item) => item.id), ["a", "c"]);
  });

  it("deleting a parent detaches its children, and undo re-attaches them", () => {
    let state = createHistoryState([card("p"), card("child", { parentId: "p" })]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["p"]) });
    assert.equal(state.cards[0]?.parentId, null);
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.equal(state.cards.find((item) => item.id === "child")?.parentId, "p");
  });

  it("deleting a branch card un-paints the parent's branch highlight, unless a sibling shares it", () => {
    const parent = card("p", {
      highlights: [{ id: "h", category: "highlighted-text", kind: "branch", text: "the excerpt", occurrence: 0, savedByUser: false, noteIds: [] }],
    });
    const branch = card("b", { parentId: "p", contextExcerpt: "the excerpt", contextOccurrence: 0 });
    const targets = buildDeleteTargets([parent, branch], ["b"]);
    assert.deepEqual(targets, [{ cardId: "b" }, { cardId: "p", highlightId: "h" }]);
    const sibling = card("s", { parentId: "p", contextExcerpt: "the excerpt", contextOccurrence: 0 });
    assert.deepEqual(buildDeleteTargets([parent, branch, sibling], ["b"]), [{ cardId: "b" }]);
  });

  it("an edit to an unrelated card keeps the redo stack; an edit to the restored card clears it", () => {
    let state = createHistoryState([card("a"), card("b")]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["b"]) });
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.equal(state.future.length, 1);
    state = historyReducer(state, { type: "update", update: (cards) => cards.map((item) => (item.id === "a" ? { ...item, title: "moved" } : item)) });
    assert.equal(state.future.length, 1);
    state = historyReducer(state, { type: "update", update: (cards) => cards.map((item) => (item.id === "b" ? { ...item, title: "edited" } : item)) });
    assert.equal(state.future.length, 0);
  });

  it("deleting a note drops the highlight it held, and undo restores both linked", () => {
    const withNote = card("p", {
      notes: [{ id: "n", category: "note", contextExcerpt: "the excerpt", contextOccurrence: 0, text: "my note", position: { x: 0, y: 0 } }],
      highlights: [{ id: "h", category: "highlighted-text", kind: "saved", text: "the excerpt", occurrence: 0, savedByUser: false, noteIds: ["n"] }],
    });
    let state = createHistoryState([withNote]);
    const targets = buildDeleteTargets(state.cards, ["n"]);
    assert.deepEqual(targets, [{ cardId: "p", noteId: "n" }, { cardId: "p", highlightId: "h" }]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets });
    assert.equal(state.cards[0]?.notes.length, 0);
    assert.equal(state.cards[0]?.highlights.length, 0);
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.equal(state.cards[0]?.notes.length, 1);
    assert.deepEqual(state.cards[0]?.highlights[0]?.noteIds, ["n"]);
  });

  it("keeps at most 50 entries", () => {
    let state = createHistoryState(Array.from({ length: 60 }, (_, index) => card(`c${index}`)));
    for (let index = 0; index < 60; index += 1) {
      state = historyReducer(state, { type: "delete", entryId: `e${index}`, targets: [{ cardId: `c${index}` }] });
    }
    assert.equal(state.past.length, 50);
  });
});
