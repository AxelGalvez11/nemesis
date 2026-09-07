// What a chat reads, decided by where it stands.
//
// Owner, 2026-09-07, choosing between three shapes for the group: *"A frame, and whatever sits in
// it is what chats read"*. So a frame is not a picture of a stored list — it IS the list. A chat
// inside a frame is answered from the sources inside that same frame. A chat standing on open
// board reads everything, which is the *"global chat"* in his own words:
//
//   *"user can select what sources chats receive by selecting them in the source panel and that
//    should becomes its own group automatically and user can name the group, chats will all
//    sources selected should be 'global' chats"*
//
// 🔴🔴 THE RISK HE TOOK KNOWINGLY, AND WHAT PAYS FOR IT. The alternative was put to him in writing
// — ticks stored, the frame only a picture — precisely because with this rule dragging a card two
// inches changes what a chat answers from, and a wrong answer with no visible cause is the worst
// kind. He chose geometry anyway. The price is paid by making the change LOUD: every conversation
// card prints what it reads (`conversation-card.tsx`, `data-card-scope`) and that line is computed
// from this function on every render, so the drag that changes an answer changes a line on screen
// in the same frame. If that line is ever removed, this rule becomes the silent bug it was warned
// about.
//
// 🔴 INNERMOST WINS. Nothing stops a learner drawing a frame inside a frame, so "the group a card
// is in" has to mean the SMALLEST frame containing it. Without that, a chat in "COPD" that also
// sits inside "Exam 1" would read both and nesting would say nothing.
//
// 🔴 A FOLDED FRAME STILL SCOPES. Collapsing is a way of looking, not a way of unreading: the
// stored rectangle is untouched while a group is folded (board-groups.ts), so the same cards are
// inside it and the same chats read the same sources. A fold that changed answers would be a
// disaster nobody would connect to a chevron.

import { nodesInsideGroup, type BoardGroup, type GroupRect } from "./board-groups";

/** What a chat standing on open board reads from, said in the panel and on the card. */
export const GLOBAL_SCOPE_LABEL = "All sources";

export interface BoardScope {
  /** The frame it stands in, or null on open board. */
  group: BoardGroup | null;
  /**
   * The one document this chat hangs off, when it is in no frame.
   *
   * 🔴 THE GESTURE THAT WOULD OTHERWISE HAVE BEEN LOST. Dragging a question off a lecture makes a
   * chat joined to that lecture by a line, and it has always been answered from that lecture alone.
   * Under the frame rule and nothing else it would silently become global — a chat that visibly
   * points at one PDF, quietly reading eleven. The line on the board is the picture of this scope,
   * exactly as a frame is the picture of the other, so the rule is still "what you can see".
   */
  attachedSourceId: string | null;
  /** The sources it is answered from, in board order. */
  sourceIds: string[];
  /** Standing in no frame and joined to no document: it reads the whole board, and keeps reading whatever arrives. */
  global: boolean;
}

export interface ScopeInput {
  readonly groups: readonly BoardGroup[];
  /** Every node's rectangle, cards and sources alike (`useBoard().nodeRects`). */
  readonly rects: readonly GroupRect[];
  /** The ready sources, in the order the board holds them. */
  readonly sourceIds: readonly string[];
  /** `card.parentId` when it names a source: the document this chat was dragged off. */
  readonly attachedSourceId?: string | null;
}

/** True when `inner` sits wholly within `outer`. Frames are rectangles, so this is the same test. */
function encloses(outer: BoardGroup, inner: BoardGroup): boolean {
  if (outer.id === inner.id) return false;
  return (
    inner.position.x >= outer.position.x &&
    inner.position.y >= outer.position.y &&
    inner.position.x + inner.width <= outer.position.x + outer.width &&
    inner.position.y + inner.height <= outer.position.y + outer.height
  );
}

/**
 * The smallest frame holding this node, or null when it stands on open board.
 *
 * 🔴 SMALLEST BY AREA, NOT BY ENCLOSURE, and the difference matters for frames that overlap without
 * either containing the other. Two frames can both hold a card while neither is inside the other;
 * area is the only ordering that always answers, and it agrees with enclosure whenever enclosure
 * applies (a frame inside another is necessarily smaller).
 */
export function groupContaining(nodeId: string, input: Pick<ScopeInput, "groups" | "rects">): BoardGroup | null {
  const holding = input.groups.filter((group) => nodesInsideGroup(group, input.rects).includes(nodeId));
  if (holding.length === 0) return null;
  let best = holding[0]!;
  for (const group of holding.slice(1)) {
    if (encloses(best, group) || group.width * group.height < best.width * best.height) best = group;
  }
  return best;
}

/**
 * What this chat reads right now.
 *
 * Asked, never stored — the same discipline `nodesInsideGroup` follows, and for the same reason: a
 * saved answer would drift the moment anything moved, and the picture is the data.
 */
export function scopeForCard(cardId: string, input: ScopeInput): BoardScope {
  const group = groupContaining(cardId, input);
  if (group) {
    const inside = new Set(nodesInsideGroup(group, input.rects));
    return { group, attachedSourceId: null, sourceIds: input.sourceIds.filter((id) => inside.has(id)), global: false };
  }
  // 🔴 A FRAME OUTRANKS THE LINE. Drag a document-question into a group and the group is what it
  // reads, because the frame is the deliberate act and the line is only where it started.
  const attached = input.attachedSourceId && input.sourceIds.includes(input.attachedSourceId) ? input.attachedSourceId : null;
  if (attached) return { group: null, attachedSourceId: attached, sourceIds: [attached], global: false };
  return { group: null, attachedSourceId: null, sourceIds: [...input.sourceIds], global: true };
}

/**
 * The line a card prints about itself: the frame's name, or that it reads everything.
 *
 * 🔴 IT NAMES THE FRAME RATHER THAN COUNTING, because the count is what changes when a drag changes
 * an answer and a number alone gives the learner nothing to look at. "COPD, 3 sources" points at
 * the rectangle to check.
 */
export function scopeLabel(scope: BoardScope, sourceName?: (id: string) => string | undefined): string {
  const count = scope.sourceIds.length;
  const sources = count === 1 ? "1 source" : `${count} sources`;
  if (scope.attachedSourceId) return sourceName?.(scope.attachedSourceId) ?? "1 source";
  if (scope.global) return count === 0 ? GLOBAL_SCOPE_LABEL : `${GLOBAL_SCOPE_LABEL}, ${sources}`;
  return `${scope.group?.label || "Untitled group"}, ${sources}`;
}

/**
 * The frame that already holds exactly these sources and nothing else, if one does.
 *
 * 🔴 THIS IS WHAT STOPS A SECOND FRAME BEING DRAWN ON EVERY SEND. Ticking three sources and asking
 * two questions must put both chats in the SAME group; without this the panel would stack an
 * identical frame behind the first one every time.
 */
export function groupHoldingExactly(sourceIds: readonly string[], input: Pick<ScopeInput, "groups" | "rects"> & { readonly sourceIds: readonly string[] }): BoardGroup | null {
  const wanted = new Set(sourceIds);
  if (wanted.size === 0) return null;
  for (const group of input.groups) {
    const inside = new Set(nodesInsideGroup(group, input.rects));
    const sourcesInside = input.sourceIds.filter((id) => inside.has(id));
    if (sourcesInside.length === wanted.size && sourcesInside.every((id) => wanted.has(id))) return group;
  }
  return null;
}
