import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CARD_WIDTH,
  CHILD_GAP_X,
  PLACEMENT_GAP,
  ROOT_GAP_X,
  centeredViewportForNode,
  connectionSides,
  findFreeChildPosition,
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
