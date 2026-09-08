// Groups on the board: a labelled rectangle that holds whatever is standing inside it.
//
// Owner, 2026-09-06: *"can you copy the obsidian way to make groups in canvas and color them?"* and
// *"there should be a way to collapse groups too"*.
//
// 🔴🔴 A GROUP OWNS WHATEVER IS INSIDE IT AND STORES NO LIST. This is the whole of Obsidian's trick,
// read out of their own bundle (docs/obsidian-canvas-reference.md): `createGroupNode` builds the
// rectangle from the selection's bounding box padded by 20, and membership is answered live by
// `canvas.getContainingNodes(bbox)`. Their saved node is only `{type: "group", label?, background?}`
// — there is no array of children anywhere in the file.
//
// That is why grouping in Obsidian never has a broken-membership state. A stored list can disagree
// with the picture: delete a card and the list holds a dead id; drag a card in and the list does not
// know. Geometry cannot disagree with itself, because the picture IS the data. Everything below
// follows from that one decision.
//
// 🔴 CONTAINMENT IS THE WHOLE BOX, NOT THE CENTRE. A card half in and half out is not in the group:
// Obsidian's own test is containment of the node's rectangle, and a centre test makes a card that
// visibly sticks out of the frame move with it, which reads as a bug.

import type { BoardPosition } from "./board-model";

/** Obsidian pads the selection's bounding box by 20 before it becomes the group. */
export const GROUP_PADDING = 20;
/**
 * How far a card's own title reaches ABOVE its rectangle.
 *
 * 🔴🔴 THIS NUMBER IS WHY THE FIRST FRAME LOOKED WRONG. Owner, 2026-09-06, of the first build:
 * *"the grouping still doesnt work like in obsidian, theres weird attachment"*. Every card on this
 * board draws its title bar OUTSIDE its node box — `CardTitleBar` is `absolute bottom-full mb-[6px]`,
 * so a 20px line plus 6px of margin hangs above the rectangle React Flow measures. A frame built
 * from the measured boxes alone therefore drew its own label bar straight through the top card's
 * title, and the two rows of icons ran together into one strip that belonged to neither.
 */
export const CARD_LABEL_ABOVE = 26;
/** The label bar at the top of the frame, and what the whole group folds down to. */
export const GROUP_HEADER = 36;
export const GROUP_MIN_WIDTH = 200;
export const GROUP_MIN_HEIGHT = 120;

/**
 * The six colours, named as Obsidian names them (`--canvas-color-1` … `-6`: red, orange, yellow,
 * green, cyan, purple), plus "none" for a frame that is only a frame.
 *
 * 🔴 A NUMBER, NOT A HEX, IS WHAT IS SAVED. The board document must not carry literal colours or a
 * theme change would leave old groups wearing last season's palette; the CSS behind these names
 * lives in board.css and answers for both themes.
 */
export const GROUP_COLORS = ["none", "1", "2", "3", "4", "5", "6"] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export const GROUP_COLOR_NAMES: Record<GroupColor, string> = {
  none: "No colour",
  "1": "Red",
  "2": "Orange",
  "3": "Yellow",
  "4": "Green",
  "5": "Cyan",
  "6": "Purple",
};

export const UNTITLED_GROUP = "Untitled group";

export interface BoardGroup {
  id: string;
  label: string;
  position: BoardPosition;
  width: number;
  height: number;
  /** Absent means an uncoloured frame. */
  color?: GroupColor;
  /** Folded to its label bar; what is inside is still where it was. */
  collapsed?: true;
}

export interface GroupRect {
  readonly id: string;
  readonly position: BoardPosition;
  readonly width: number;
  readonly height: number;
}

function contains(outer: GroupRect, inner: GroupRect): boolean {
  return (
    inner.position.x >= outer.position.x &&
    inner.position.y >= outer.position.y &&
    inner.position.x + inner.width <= outer.position.x + outer.width &&
    inner.position.y + inner.height <= outer.position.y + outer.height
  );
}

/**
 * What is standing inside this group right now.
 *
 * 🔴 ASKED, NEVER STORED. Call it wherever the answer is needed — drawing, dragging, collapsing —
 * and it is right by construction. `rects` never includes the group itself; a group inside a group
 * is a case Obsidian allows and we do not, because a card would then move twice on one drag.
 */
export function nodesInsideGroup(group: BoardGroup, rects: readonly GroupRect[]): string[] {
  return rects.filter((rect) => rect.id !== group.id && contains(group, rect)).map((rect) => rect.id);
}

/** The frame that would hold exactly these, with Obsidian's 20px of air around them. */
export function groupBoundsFor(rects: readonly GroupRect[]): { position: BoardPosition; width: number; height: number } | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.position.x);
    top = Math.min(top, rect.position.y);
    right = Math.max(right, rect.position.x + rect.width);
    bottom = Math.max(bottom, rect.position.y + rect.height);
  }
  // 🔴 THE HEADER AND THE CARDS' OWN TITLES ARE EXTRA HEIGHT AT THE TOP, not padding taken out of
  // the frame: the frame's label bar sits above the cards' labels, which themselves sit above the
  // boxes React Flow measured.
  const above = GROUP_PADDING + GROUP_HEADER + CARD_LABEL_ABOVE;
  return {
    position: { x: left - GROUP_PADDING, y: top - above },
    width: Math.max(GROUP_MIN_WIDTH, right - left + GROUP_PADDING * 2),
    height: Math.max(GROUP_MIN_HEIGHT, bottom - top + above + GROUP_PADDING),
  };
}

/** A new group around a selection, ready to be named. */
export function groupFromSelection(rects: readonly GroupRect[], id: string): BoardGroup | null {
  const bounds = groupBoundsFor(rects);
  if (!bounds) return null;
  return { id, label: UNTITLED_GROUP, ...bounds };
}

/** Read groups off a stored document without trusting any of it. */
export function parseBoardGroups(raw: unknown): BoardGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: BoardGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const position = value.position as Record<string, unknown> | undefined;
    const x = Number(position?.x);
    const y = Number(position?.y);
    const width = Number(value.width);
    const height = Number(value.height);
    if (typeof value.id !== "string" || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    const color = GROUP_COLORS.includes(value.color as GroupColor) ? (value.color as GroupColor) : undefined;
    groups.push({
      id: value.id,
      label: typeof value.label === "string" ? value.label : UNTITLED_GROUP,
      position: { x, y },
      width: Math.max(GROUP_MIN_WIDTH, width),
      height: Math.max(GROUP_MIN_HEIGHT, height),
      ...(color && color !== "none" ? { color } : {}),
      ...(value.collapsed === true ? { collapsed: true as const } : {}),
    });
  }
  return groups;
}

// 🔴 `gatherIntoBlock` AND `growGroupFor` WERE REMOVED ON 2026-09-07. They brought ticked sources
// together onto clear ground and grew a frame to take a new chat, both in service of the rule that
// a frame's contents were what its chats read. Documents left the board that day (*"adding
// documents still loads them on canvas, please remove that"*) and ticks became the whole answer
// (*"thats why we have tickers"*), so neither had anything to act on. See lib/board/board-scope.ts.
