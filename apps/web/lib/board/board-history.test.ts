import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { besideOf, buildDeleteTargets, createHistoryState, hasBeside, historyReducer, restoreBeside, type HistoryState } from "./board-history";
import type { BoardCard, BoardOutputCard, BoardSource } from "./board-model";

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

// ── Documents and deliverables ride the entry ──────────────────────────────────────────────

function source(id: string): BoardSource {
  return { id, type: "pdf", name: `${id}.pdf`, content: "", status: "ready", previewUrls: ["blob:runtime-only"], position: { x: 0, y: 0 }, width: 640, height: 560 };
}

function output(id: string): BoardOutputCard {
  return { id, cardId: null, kind: "note", status: "ready", topic: id, progress: "Reading…", createdAt: "2026-09-04T00:00:00Z", position: { x: 0, y: 0 }, width: 320 };
}

describe("board history: a deleted document or deliverable comes back with undo", () => {
  // Found on the 2026-09-04 board sweep: the trash on a dropped PDF left ⌘Z disabled, because the
  // reducer holds cards and a source is another list. The removed items ride the entry instead.
  it("records a document deleted on its own, with no card in the delete at all", () => {
    let state: HistoryState = createHistoryState([card("a")]);
    const beside = besideOf([{ item: source("s2"), index: 1 }], []);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: [], beside });
    assert.equal(state.past.length, 1, "a delete with no card targets recorded nothing");
    const inverse = state.past[0]!.operation;
    assert.equal(inverse.kind, "restore");
    assert.ok(hasBeside(inverse.beside), "the restore does not carry the document");
    assert.equal(inverse.beside?.sources[0]?.item.id, "s2");
    assert.equal(inverse.beside?.sources[0]?.index, 1, "the document forgot where it stood");
    assert.deepEqual(inverse.beside?.sources[0]?.item.previewUrls, [], "a runtime object URL was written into the saved history");
  });

  it("undo hands the document back for the provider to re-insert, and redo carries it to the remove again", () => {
    let state: HistoryState = createHistoryState([card("a"), card("b")]);
    const beside = besideOf([{ item: source("s1"), index: 0 }], [{ item: output("o1"), index: 0 }]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["b"]), beside });
    assert.equal(state.cards.length, 1);
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.equal(state.cards.length, 2, "the card did not come back");
    const redo = state.future[0]!.operation;
    assert.equal(redo.kind, "remove");
    assert.ok(hasBeside(redo.beside), "the redo lost the document and the deliverable");
    assert.equal(redo.beside?.outputs[0]?.item.id, "o1");
    assert.equal("progress" in (redo.beside?.outputs[0]?.item ?? {}), false, "a maker's live step was written into the saved history");
    state = historyReducer(state, { type: "redo", entryId: "e3" });
    assert.equal(state.cards.length, 1);
    assert.ok(hasBeside((state.past[0]!.operation as { beside?: unknown }).beside as never), "the undo after a redo lost the document");
  });

  it("puts a document back where it stood, and never twice", () => {
    const list = [source("s1"), source("s3")];
    const back = restoreBeside(list, [{ item: source("s2"), index: 1 }]);
    assert.deepEqual(back.map((item) => item.id), ["s1", "s2", "s3"]);
    assert.deepEqual(restoreBeside(back, [{ item: source("s2"), index: 1 }]).map((item) => item.id), ["s1", "s2", "s3"], "a document already present was inserted again");
    assert.deepEqual(restoreBeside(list, [{ item: source("s9"), index: 40 }]).map((item) => item.id), ["s1", "s3", "s9"], "an index past the end did not clamp");
  });

  it("an entry written before documents rode along still applies", () => {
    let state: HistoryState = createHistoryState([card("a"), card("b")]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["b"]) });
    assert.equal(hasBeside(state.past[0]!.operation.beside), false);
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.equal(state.cards.length, 2);
  });
});
