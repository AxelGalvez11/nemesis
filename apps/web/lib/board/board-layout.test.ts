import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BoardCard, BoardOutputCard, BoardSource } from "./board-model";
import {
  CARD_WIDTH,
  CHILD_GAP_X,
  PLACEMENT_GAP,
  ROOT_GAP_X,
  SOURCE_DEFAULT_HEIGHT,
  SOURCE_MIN_HEIGHT,
  centeredViewportForNode,
  connectionSides,
  findFreeChildPosition,
  isLegacySourceHeight,
  makeRoomForDocuments,
  nextRootPosition,
  notePosition,
} from "./board-layout";

describe("board layout copies Wondering's placement", () => {
  it("pins the numbers the reference measured", () => {
    assert.equal(CARD_WIDTH, 720);
    assert.equal(ROOT_GAP_X, 140);
    assert.equal(CHILD_GAP_X, 160);
    assert.equal(PLACEMENT_GAP, 64);
  });

  it("puts the first root at the origin and the next one 140 past the right-most edge", () => {
    assert.deepEqual(nextRootPosition([]), { x: 0, y: 0 });
    const roots = [
      { parentId: null, position: { x: 0, y: 0 }, width: 720 },
      { parentId: null, position: { x: 860, y: 40 }, width: 720 },
    ];
    assert.deepEqual(nextRootPosition(roots), { x: 860 + 720 + 140, y: 40 });
  });

  it("counts a child's right edge even though it is not a root", () => {
    const items = [
      { parentId: null, position: { x: 0, y: 0 }, width: 720 },
      { parentId: "a", position: { x: 2000, y: 0 }, width: 720 },
    ];
    assert.deepEqual(nextRootPosition(items), { x: 2000 + 720 + 140, y: 0 });
  });

  it("places a right branch 160 past the parent, then pushes it below anything it overlaps", () => {
    const parent = { position: { x: 0, y: 0 }, width: 720, height: 320 };
    assert.deepEqual(findFreeChildPosition({ parent, occupied: [parent] }), { x: 880, y: 0 });
    const sibling = { position: { x: 880, y: 0 }, width: 720, height: 400 };
    assert.deepEqual(findFreeChildPosition({ parent, occupied: [parent, sibling] }), { x: 880, y: 400 + 64 });
  });

  it("places a bottom branch under the parent and pushes it right when blocked", () => {
    const parent = { position: { x: 0, y: 0 }, width: 720, height: 320 };
    assert.deepEqual(findFreeChildPosition({ parent, occupied: [parent], side: "bottom" }), { x: 0, y: 480 });
    const below = { position: { x: 0, y: 480 }, width: 720, height: 320 };
    assert.deepEqual(findFreeChildPosition({ parent, occupied: [parent, below], side: "bottom" }), { x: 720 + 64, y: 480 });
  });

  it("stacks notes to the right of the card, 192 apart", () => {
    const card = { position: { x: 10, y: 20 }, width: 720 };
    assert.deepEqual(notePosition(card, 0), { x: 10 + 720 + 72, y: 20 });
    assert.deepEqual(notePosition(card, 2), { x: 802, y: 20 + 384 });
  });

  it("joins the two closest sides", () => {
    const a = { position: { x: 0, y: 0 }, width: 720, height: 320 };
    const right = { position: { x: 880, y: 0 }, width: 720, height: 320 };
    assert.deepEqual(connectionSides(a, right), { sourceSide: "right", targetSide: "left" });
    const below = { position: { x: 0, y: 480 }, width: 720, height: 320 };
    assert.deepEqual(connectionSides(a, below), { sourceSide: "bottom", targetSide: "top" });
    const left = { position: { x: -880, y: 0 }, width: 720, height: 320 };
    assert.deepEqual(connectionSides(a, left), { sourceSide: "left", targetSide: "right" });
  });

  it("centres a node with 28px of side room, 24px of top room, never above the max zoom", () => {
    const viewport = centeredViewportForNode({
      nodePosition: { x: 0, y: 0 },
      nodeWidth: 720,
      nodeHeight: 320,
      viewportWidth: 1400,
      availableHeight: 700,
      maxZoom: 0.9,
    });
    assert.equal(viewport.zoom, 0.9);
    assert.equal(viewport.x, (1400 - 720 * 0.9) / 2);
    assert.equal(viewport.y, 24 + (676 - 320 * 0.9) / 2);
    const narrow = centeredViewportForNode({
      nodePosition: { x: 0, y: 0 },
      nodeWidth: 720,
      nodeHeight: 320,
      viewportWidth: 500,
      availableHeight: 700,
    });
    assert.equal(narrow.zoom, (500 - 56) / 720);
  });
});

// ── Old boards open their documents at a readable height, and make room for them ─────────────

function source(id: string, y: number, height: number | undefined, extra: Partial<BoardSource> = {}): BoardSource {
  return { id, type: "pdf", name: `${id}.pdf`, content: "", status: "ready", previewUrls: [], position: { x: 788, y }, width: 640, height, ...extra };
}

function card(id: string, x: number, y: number, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id, title: id, status: "idle", messages: [], highlights: [], savedImages: [], notes: [], sourceIds: [], inheritedContext: [], parentId: null, contextExcerpt: null,
    position: { x, y }, width: CARD_WIDTH, height: 400, ...extra,
  } as BoardCard;
}

function output(id: string, x: number, y: number): BoardOutputCard {
  return { id, cardId: null, kind: "note", status: "ready", topic: id, createdAt: "2026-09-04T00:00:00Z", position: { x, y }, width: 320, height: 132 };
}

describe("makeRoomForDocuments", () => {
  it("knows an old height when it sees one: anything under the minimum, or none at all", () => {
    assert.equal(isLegacySourceHeight(undefined), true);
    assert.equal(isLegacySourceHeight(172), true);
    assert.equal(isLegacySourceHeight(SOURCE_MIN_HEIGHT - 1), true);
    assert.equal(isLegacySourceHeight(SOURCE_MIN_HEIGHT), false);
    assert.equal(isLegacySourceHeight(560), false);
  });

  it("returns the very same state when no document is from the old design", () => {
    const state = { cards: [card("c1", 0, 0)], sources: [source("s1", 0, 560), source("s2", 700, 325)], outputs: [output("o1", 0, 600)] };
    assert.equal(makeRoomForDocuments(state), state);
  });

  it("opens the owner's stacked column at readable heights, in the same order, with nothing drawn over anything", () => {
    // His canvas on 2026-09-04: three documents at 217, 172 and 325 tall, 8px apart.
    const state = { cards: [], sources: [source("deck", -355, 217), source("list", -130, 172), source("lecture", 80, 325)], outputs: [] };
    const next = makeRoomForDocuments(state);
    const [deck, list, lecture] = next.sources;
    assert.equal(deck?.height, SOURCE_DEFAULT_HEIGHT);
    assert.equal(deck?.position.y, -355, "the top document does not move");
    assert.equal(list?.height, SOURCE_DEFAULT_HEIGHT);
    assert.equal(list?.position.y, -355 + SOURCE_DEFAULT_HEIGHT + PLACEMENT_GAP, "the second sits a gap under the opened first");
    assert.equal(lecture?.height, 325, "a height the learner set is kept");
    assert.equal(lecture?.position.y, (list?.position.y ?? 0) + SOURCE_DEFAULT_HEIGHT + PLACEMENT_GAP, "and it is pushed by the second, not the first");
  });

  it("leaves alone what is beside, above, or already clear", () => {
    const beside = card("beside", 1600, -300);
    const above = card("above", 788, -900);
    const clear = card("clear", 788, 900);
    const state = { cards: [beside, above, clear], sources: [source("deck", -355, 217)], outputs: [] };
    const next = makeRoomForDocuments(state);
    assert.equal(next.cards[0], beside);
    assert.equal(next.cards[1], above);
    assert.equal(next.cards[2], clear);
  });

  it("pushes a thread, then the thread pushes its own note", () => {
    const thread = card("thread", 788, -100, { notes: [{ id: "n1", category: "note", contextExcerpt: null, contextOccurrence: 0, text: "hm", position: { x: 788, y: 340 } }] } as Partial<BoardCard>);
    const state = { cards: [thread], sources: [source("deck", -355, 217)], outputs: [output("o1", 900, 300)] };
    const next = makeRoomForDocuments(state);
    const pushedThread = next.cards[0];
    assert.equal(pushedThread?.position.y, -355 + SOURCE_DEFAULT_HEIGHT + PLACEMENT_GAP);
    const noteY = pushedThread?.notes[0]?.position.y ?? 0;
    assert.ok(noteY >= (pushedThread?.position.y ?? 0) + 400 + PLACEMENT_GAP, `the note under the thread moved with it (y=${noteY})`);
    assert.ok((next.outputs[0]?.position.y ?? 0) > 300, "and so did the deliverable under the document");
  });

  it("gives a collapsed old document its height without moving anything under it", () => {
    const under = card("under", 788, -300);
    const state = { cards: [under], sources: [source("deck", -355, 172, { collapsed: true })], outputs: [] };
    const next = makeRoomForDocuments(state);
    assert.equal(next.sources[0]?.height, SOURCE_DEFAULT_HEIGHT);
    assert.equal(next.cards[0], under);
  });
});
