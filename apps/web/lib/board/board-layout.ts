// Where a card lands on the board, in world units at zoom 1.
//
// Copied from Wondering's placement code (docs/wondering-canvas-reference.md §2). Every constant
// is theirs; the tests pin them so a "tidy" later cannot move a card by a few pixels without
// saying so.

import type { BoardCard, BoardNote, BoardPosition, BoardSource, BoardViewport, BoardOutputCard } from "./board-model";

export const CARD_WIDTH = 720;
export const SOURCE_WIDTH = 640;
export const NOTE_WIDTH = 260;
/** A deliverable card: the width of the chat's artifact chip, standing on its own. */
export const OUTPUT_WIDTH = 320;
export const CARD_MIN_WIDTH = 300;
export const CARD_MAX_WIDTH = 840;
export const CARD_MIN_HEIGHT = 320;
export const SOURCE_MIN_HEIGHT = 320;

/**
 * How tall a dropped document opens.
 *
 * 🔴 A DOCUMENT CARD IS A READER NOW (owner 2026-09-04), so it opens at a height a page can be read
 * at rather than at the height of four lines of preview text. Resizable from every edge, and the
 * size the learner leaves it at is saved with the board.
 */
export const SOURCE_DEFAULT_HEIGHT = 560;
export const IMAGE_SOURCE_MIN_HEIGHT = 340;
/** A streaming card grows to the composer's top edge, and never past this. */
export const CARD_AUTO_MAX_HEIGHT = 900;
export const CARD_MAX_HEIGHT = 3000;
export const CONTRACTED_CARD_MIN_HEIGHT = 180;
export const EMPTY_CARD_HEIGHT = CARD_MIN_HEIGHT;
export const INITIAL_CARD_ZOOM = 0.9;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 1.5;

export const ROOT_GAP_X = 140;
export const CHILD_GAP_X = 160;
export const PLACEMENT_GAP = 64;
export const NOTE_GAP_X = 72;
export const NOTE_GAP_Y = 192;

export type BranchSide = "top" | "right" | "bottom" | "left";

export interface Rect extends BoardPosition {
  width: number;
  height: number;
}

interface Placed {
  position: BoardPosition;
  width?: number;
  height?: number;
}

export function toRect(item: Placed): Rect {
  return {
    x: item.position.x,
    y: item.position.y,
    width: item.width ?? CARD_WIDTH,
    height: item.height ?? EMPTY_CARD_HEIGHT,
  };
}

export function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.x - margin < b.x + b.width &&
    a.x + a.width + margin > b.x &&
    a.y - margin < b.y + b.height &&
    a.y + a.height + margin > b.y
  );
}

/** A new root card: to the right of everything, level with the right-most root. */
export function nextRootPosition(items: ReadonlyArray<Placed & { parentId?: string | null }>): BoardPosition {
  const roots = items.filter((item) => !("parentId" in item) || !item.parentId);
  if (roots.length === 0) return { x: 0, y: 0 };
  const rightMost = roots.reduce((best, item) => {
    const right = item.position.x + (item.width ?? CARD_WIDTH);
    const bestRight = best.position.x + (best.width ?? CARD_WIDTH);
    return right > bestRight ? item : best;
  });
  const farthestRight = items.reduce(
    (max, item) => Math.max(max, item.position.x + (item.width ?? CARD_WIDTH)),
    rightMost.position.x + (rightMost.width ?? CARD_WIDTH),
  );
  return { x: farthestRight + ROOT_GAP_X, y: rightMost.position.y };
}

/** A child card beside its parent on the chosen side, pushed along until it overlaps nothing. */
export function findFreeChildPosition({
  parent,
  occupied,
  side = "right",
  childWidth = CARD_WIDTH,
  childHeight = EMPTY_CARD_HEIGHT,
}: {
  parent: Placed;
  occupied: readonly Placed[];
  side?: BranchSide;
  childWidth?: number;
  childHeight?: number;
}): BoardPosition {
  const parentRect = toRect(parent);
  const start: BoardPosition = (() => {
    switch (side) {
      case "top":
        return { x: parentRect.x, y: parentRect.y - childHeight - CHILD_GAP_X };
      case "bottom":
        return { x: parentRect.x, y: parentRect.y + parentRect.height + CHILD_GAP_X };
      case "left":
        return { x: parentRect.x - childWidth - CHILD_GAP_X, y: parentRect.y };
      case "right":
        return { x: parentRect.x + parentRect.width + CHILD_GAP_X, y: parentRect.y };
    }
  })();
  const sideways = side === "left" || side === "right";
  for (let attempt = 0; attempt <= occupied.length; attempt += 1) {
    const overlapping = occupied
      .map(toRect)
      .filter((rect) => rectsOverlap({ ...start, width: childWidth, height: childHeight }, rect, PLACEMENT_GAP));
    if (overlapping.length === 0) break;
    if (sideways) start.y = Math.max(...overlapping.map((rect) => rect.y + rect.height)) + PLACEMENT_GAP;
    else start.x = Math.max(...overlapping.map((rect) => rect.x + rect.width)) + PLACEMENT_GAP;
  }
  return start;
}

/** The n-th note of a card: to its right, stacked downwards. */
export function notePosition(card: Placed, index: number): BoardPosition {
  return {
    x: card.position.x + (card.width ?? CARD_WIDTH) + NOTE_GAP_X,
    y: card.position.y + index * NOTE_GAP_Y,
  };
}

function sideMidpoint(rect: Rect, side: BranchSide): BoardPosition {
  switch (side) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

/** Which two sides an edge joins: the horizontal pair or the vertical pair, whichever is shorter. */
export function connectionSides(source: Placed, target: Placed): { sourceSide: BranchSide; targetSide: BranchSide } {
  const a = toRect(source);
  const b = toRect(target);
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  const horizontal: { sourceSide: BranchSide; targetSide: BranchSide } =
    dx >= 0 ? { sourceSide: "right", targetSide: "left" } : { sourceSide: "left", targetSide: "right" };
  const vertical: { sourceSide: BranchSide; targetSide: BranchSide } =
    dy >= 0 ? { sourceSide: "bottom", targetSide: "top" } : { sourceSide: "top", targetSide: "bottom" };
  const length = (pair: { sourceSide: BranchSide; targetSide: BranchSide }) => {
    const from = sideMidpoint(a, pair.sourceSide);
    const to = sideMidpoint(b, pair.targetSide);
    return Math.hypot(to.x - from.x, to.y - from.y);
  };
  return length(horizontal) <= length(vertical) ? horizontal : vertical;
}

/** The viewport that shows one node centred, no larger than `maxZoom`, above the composer. */
export function centeredViewportForNode({
  nodePosition,
  nodeWidth,
  nodeHeight,
  viewportWidth,
  availableHeight,
  horizontalPadding = 28,
  topPadding = 24,
  maxZoom = 1,
  fitHeight = false,
}: {
  nodePosition: BoardPosition;
  nodeWidth: number;
  nodeHeight: number;
  viewportWidth: number;
  availableHeight: number;
  horizontalPadding?: number;
  topPadding?: number;
  maxZoom?: number;
  fitHeight?: boolean;
}): BoardViewport {
  const usableWidth = Math.max(viewportWidth - horizontalPadding * 2, 1);
  const usableHeight = Math.max(availableHeight - topPadding, 1);
  const zoom = Math.min(maxZoom, usableWidth / nodeWidth, fitHeight ? usableHeight / nodeHeight : maxZoom);
  const shownWidth = nodeWidth * zoom;
  const shownHeight = nodeHeight * zoom;
  return {
    x: (viewportWidth - shownWidth) / 2 - nodePosition.x * zoom,
    y: topPadding + Math.max((usableHeight - shownHeight) / 2, 0) - nodePosition.y * zoom,
    zoom,
  };
}

/** Every rectangle a new card must avoid: cards, their notes (fixed width), sources. */
export function occupiedRects(cards: readonly BoardCard[], sources: readonly BoardSource[], outputs: readonly BoardOutputCard[] = []): Placed[] {
  return [
    ...cards,
    ...cards.flatMap((card) => card.notes.map((note: BoardNote) => ({ position: note.position, width: NOTE_WIDTH }))),
    ...sources,
    ...outputs.map((output) => ({ position: output.position, width: output.width, height: output.height ?? OUTPUT_MIN_HEIGHT })),
  ];
}

/** An output card before it is measured: title row plus the open button. */
export const OUTPUT_MIN_HEIGHT = 132;

/**
 * A test card is wider and taller than a deliverable chip, because it is PLAYED rather than opened.
 *
 * 🔴 MEASURED FROM THE CHAT'S OWN CHECK, not chosen: a question stem on two lines above four
 * options, each option a row of at least 40px, plus the progress line and the Back control. At 320
 * (the chip's width) every option wrapped onto three lines and the card became a column of text.
 */
export const CHECK_WIDTH = 420;
export const CHECK_MIN_HEIGHT = 300;
