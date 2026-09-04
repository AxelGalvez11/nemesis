// Undo and redo for the board, saved BESIDE the document so a reload does not lose it.
//
// Only deletion is undoable (cards, notes, highlights), which is what Wondering ships and what a
// learner reaches for: the ⌘Z after a trash click. Every delete records its INVERSE (a restore
// operation carrying the removed items and their positions in their lists); undo applies the
// inverse and records the delete again for redo. 50 entries, 8 MB, oldest first out.
//
// 🔴 AN EDIT AFTER A DELETE CLEARS THE REDO STACK ONLY WHEN IT TOUCHES A CARD THE REDO WOULD —
// moving an unrelated card keeps the redo alive. `operationTouchesChangedCard` is that rule.

import { MAX_BOARD_CARDS, type BoardCard, type BoardHighlight, type BoardNote } from "./board-model";

export const MAX_HISTORY_ENTRIES = 50;
export const MAX_HISTORY_BYTES = 8 * 1024 * 1024;

export interface DeleteTarget {
  cardId: string;
  noteId?: string;
  highlightId?: string;
  /** Only un-save the highlight (drop `savedByUser`); keep it if a branch or a note still needs it. */
  savedByUserOnly?: boolean;
}

export interface RemoveOperation {
  kind: "remove";
  targets: DeleteTarget[];
}

export interface RestoreOperation {
  kind: "restore";
  cards: Array<{ item: BoardCard; index: number }>;
  notes: Array<{ cardId: string; item: BoardNote; index: number; linkedHighlightIds: string[] }>;
  highlights: Array<{ cardId: string; item: BoardHighlight; index: number }>;
  detachedChildren: Array<{ cardId: string; parentId: string }>;
}

export type HistoryOperation = RemoveOperation | RestoreOperation;

export interface HistoryEntry {
  id: string;
  operation: HistoryOperation;
}

export interface HistorySnapshot {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export interface HistoryState extends HistorySnapshot {
  cards: BoardCard[];
}

export type HistoryAction =
  | { type: "replace"; cards: BoardCard[]; history: HistorySnapshot }
  | { type: "update"; update: BoardCard[] | ((cards: BoardCard[]) => BoardCard[]) }
  | { type: "delete"; entryId: string; targets: DeleteTarget[]; cardSnapshots?: BoardCard[] }
  | { type: "undo"; entryId: string }
  | { type: "redo"; entryId: string };

export function createHistoryState(cards: BoardCard[] = [], history: HistorySnapshot = { past: [], future: [] }): HistoryState {
  return { cards, past: history.past, future: history.future };
}

export function emptyHistory(): HistorySnapshot {
  return { past: [], future: [] };
}

function targetKey(target: DeleteTarget): string {
  return `${target.cardId}:${target.noteId ?? ""}:${target.highlightId ?? ""}:${target.savedByUserOnly ? "saved-only" : "remove"}`;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** Which occurrence of a branch's excerpt the parent painted, when it can be told unambiguously. */
export function inferContextOccurrence(cards: readonly BoardCard[], card: BoardCard): number | undefined {
  if (card.contextOccurrence !== undefined) return card.contextOccurrence;
  if (card.parentId === null || !card.contextExcerpt) return undefined;
  const parent = cards.find((item) => item.id === card.parentId);
  if (!parent) return undefined;
  const excerpt = flat(card.contextExcerpt);
  const occurrences = new Set(
    parent.highlights
      .filter((highlight) => highlight.kind === "branch" && flat(highlight.text) === excerpt)
      .map((highlight) => highlight.occurrence ?? 0),
  );
  return occurrences.size === 1 ? occurrences.values().next().value : undefined;
}

/** Deleting a branch card also un-paints the parent's branch highlight, unless a sibling shares it. */
function branchHighlightTargetForCard(cards: readonly BoardCard[], card: BoardCard, deleting: Set<string>): DeleteTarget | null {
  if (card.parentId === null || !card.contextExcerpt || deleting.has(card.parentId)) return null;
  const excerpt = flat(card.contextExcerpt);
  const occurrence = inferContextOccurrence(cards, card);
  if (occurrence === undefined) return null;
  const parent = cards.find((item) => item.id === card.parentId);
  if (!parent) return null;
  const matches = parent.highlights.filter(
    (highlight) => highlight.kind === "branch" && highlight.text === excerpt && (highlight.occurrence ?? 0) === occurrence,
  );
  const siblingShares = cards.some((other) => {
    if (
      other.id === card.id ||
      deleting.has(other.id) ||
      other.parentId !== card.parentId ||
      other.contextExcerpt === null ||
      flat(other.contextExcerpt) !== excerpt
    ) {
      return false;
    }
    const otherOccurrence = inferContextOccurrence(cards, other);
    return otherOccurrence === undefined || otherOccurrence === occurrence;
  });
  const only = matches[0];
  if (matches.length !== 1 || !only || siblingShares) return null;
  return { cardId: parent.id, highlightId: only.id };
}

/** Everything one delete gesture removes: the named cards, the named notes, and the highlights
 *  those notes (or branches) were holding up. */
export function buildDeleteTargets(cards: readonly BoardCard[], ids: readonly string[]): DeleteTarget[] {
  const wanted = new Set(ids);
  const cardIds = new Set(cards.filter((card) => wanted.has(card.id)).map((card) => card.id));
  const notesByCard = new Map<string, Set<string>>();
  for (const card of cards) {
    if (cardIds.has(card.id)) continue;
    const notes = new Set(card.notes.filter((note) => wanted.has(note.id)).map((note) => note.id));
    if (notes.size > 0) notesByCard.set(card.id, notes);
  }
  const targets = new Map<string, DeleteTarget>();
  const add = (target: DeleteTarget) => targets.set(targetKey(target), target);
  for (const card of cards) {
    if (!cardIds.has(card.id)) continue;
    add({ cardId: card.id });
    const branch = branchHighlightTargetForCard(cards, card, cardIds);
    if (branch) add(branch);
  }
  for (const card of cards) {
    const notes = notesByCard.get(card.id);
    if (!notes) continue;
    for (const noteId of notes) add({ cardId: card.id, noteId });
    for (const highlight of card.highlights) {
      if (highlight.savedByUser || highlight.kind === "branch" || !highlight.noteIds.some((id) => notes.has(id))) continue;
      const stillHeld = highlight.noteIds.some((id) => !notes.has(id) && card.notes.some((note) => note.id === id));
      if (!stillHeld) add({ cardId: card.id, highlightId: highlight.id });
    }
  }
  return [...targets.values()];
}

function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const next = [...list];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}

export function removeTargets(
  cards: readonly BoardCard[],
  targets: readonly DeleteTarget[],
  snapshots: readonly BoardCard[] = cards,
): { cards: BoardCard[]; inverse: RestoreOperation | null } {
  const wholeCards = new Set(targets.filter((target) => !target.noteId && !target.highlightId).map((target) => target.cardId));
  const notesByCard = new Map<string, Set<string>>();
  const highlightsByCard = new Map<string, Set<string>>();
  const removeByCard = new Map<string, Set<string>>();
  const unsaveByCard = new Map<string, Set<string>>();
  for (const target of targets) {
    if (wholeCards.has(target.cardId)) continue;
    if (target.noteId) {
      const set = notesByCard.get(target.cardId) ?? new Set<string>();
      set.add(target.noteId);
      notesByCard.set(target.cardId, set);
    }
    if (target.highlightId) {
      const set = highlightsByCard.get(target.cardId) ?? new Set<string>();
      set.add(target.highlightId);
      highlightsByCard.set(target.cardId, set);
      const bucket = target.savedByUserOnly ? unsaveByCard : removeByCard;
      const kinds = bucket.get(target.cardId) ?? new Set<string>();
      kinds.add(target.highlightId);
      bucket.set(target.cardId, kinds);
    }
  }
  const removedCards: RestoreOperation["cards"] = [];
  const removedNotes: RestoreOperation["notes"] = [];
  const removedHighlights: RestoreOperation["highlights"] = [];
  const detached: RestoreOperation["detachedChildren"] = [];
  const kept: BoardCard[] = [];
  const snapshotById = new Map(snapshots.map((card) => [card.id, card]));

  cards.forEach((card, index) => {
    if (wholeCards.has(card.id)) {
      removedCards.push({ item: snapshotById.get(card.id) ?? card, index });
      return;
    }
    const noteIds = notesByCard.get(card.id) ?? new Set<string>();
    const highlightIds = highlightsByCard.get(card.id) ?? new Set<string>();
    const removeIds = removeByCard.get(card.id) ?? new Set<string>();
    const unsaveIds = unsaveByCard.get(card.id) ?? new Set<string>();
    const removedNoteIds = new Set<string>();
    card.notes.forEach((note, noteIndex) => {
      if (!noteIds.has(note.id)) return;
      removedNoteIds.add(note.id);
      removedNotes.push({
        cardId: card.id,
        item: note,
        index: noteIndex,
        linkedHighlightIds: card.highlights.filter((highlight) => highlight.noteIds.includes(note.id)).map((highlight) => highlight.id),
      });
    });
    const keepAsSaved = new Set<string>();
    card.highlights.forEach((highlight, highlightIndex) => {
      if (!highlightIds.has(highlight.id)) return;
      removedHighlights.push({ cardId: card.id, item: highlight, index: highlightIndex });
      const heldByNote = highlight.noteIds.some((id) => !removedNoteIds.has(id) && card.notes.some((note) => note.id === id));
      if (removeIds.has(highlight.id) && highlight.kind === "branch" && (highlight.savedByUser || heldByNote)) {
        keepAsSaved.add(highlight.id);
      }
    });
    const orphaned = card.parentId !== null && wholeCards.has(card.parentId);
    if (orphaned) detached.push({ cardId: card.id, parentId: card.parentId as string });
    const notes = removedNoteIds.size === 0 ? card.notes : card.notes.filter((note) => !removedNoteIds.has(note.id));
    let highlights =
      highlightIds.size === 0
        ? card.highlights
        : card.highlights.flatMap((highlight) => {
            if (!highlightIds.has(highlight.id)) return [highlight];
            if (removeIds.has(highlight.id)) {
              return keepAsSaved.has(highlight.id)
                ? [{ ...highlight, kind: "saved" as const, ...(unsaveIds.has(highlight.id) ? { savedByUser: false } : {}) }]
                : [];
            }
            return [{ ...highlight, savedByUser: false }];
          });
    if (removedNoteIds.size > 0) {
      highlights = highlights.map((highlight) => {
        const noteIdsLeft = highlight.noteIds.filter((id) => !removedNoteIds.has(id));
        return noteIdsLeft.length === highlight.noteIds.length ? highlight : { ...highlight, noteIds: noteIdsLeft };
      });
    }
    kept.push(
      notes === card.notes && highlights === card.highlights && !orphaned
        ? card
        : { ...card, notes, highlights, parentId: orphaned ? null : card.parentId },
    );
  });

  if (removedCards.length === 0 && removedNotes.length === 0 && removedHighlights.length === 0) {
    return { cards: [...cards], inverse: null };
  }
  return {
    cards: kept,
    inverse: { kind: "restore", cards: removedCards, notes: removedNotes, highlights: removedHighlights, detachedChildren: detached },
  };
}

export function canApplyOperation(cards: readonly BoardCard[], operation: HistoryOperation): boolean {
  if (operation.kind !== "restore") return true;
  const present = new Set(cards.map((card) => card.id));
  const incoming = new Set(operation.cards.map(({ item }) => item.id).filter((id) => !present.has(id)));
  return cards.length + incoming.size <= MAX_BOARD_CARDS;
}

export function restoreTargets(cards: readonly BoardCard[], operation: RestoreOperation): { cards: BoardCard[]; inverse: RemoveOperation | null } {
  if (!canApplyOperation(cards, operation)) return { cards: [...cards], inverse: null };
  let next: BoardCard[] = [...cards];
  const undoTargets: DeleteTarget[] = [];
  const present = new Set(cards.map((card) => card.id));
  for (const entry of [...operation.cards].sort((a, b) => a.index - b.index)) {
    if (present.has(entry.item.id)) continue;
    next = insertAt(next, entry.index, entry.item);
    present.add(entry.item.id);
    undoTargets.push({ cardId: entry.item.id });
  }
  const notesByCard = new Map<string, RestoreOperation["notes"]>();
  for (const entry of operation.notes) notesByCard.set(entry.cardId, [...(notesByCard.get(entry.cardId) ?? []), entry]);
  const highlightsByCard = new Map<string, RestoreOperation["highlights"]>();
  for (const entry of operation.highlights) highlightsByCard.set(entry.cardId, [...(highlightsByCard.get(entry.cardId) ?? []), entry]);
  const detachedByCard = new Map(operation.detachedChildren.map((entry) => [entry.cardId, entry]));

  next = next.map((card) => {
    const noteEntries = [...(notesByCard.get(card.id) ?? [])].sort((a, b) => a.index - b.index);
    const highlightEntries = [...(highlightsByCard.get(card.id) ?? [])].sort((a, b) => a.index - b.index);
    let notes = card.notes;
    let highlights = card.highlights;
    const relinked = new Map<string, string[]>();
    for (const entry of noteEntries) {
      if (notes.some((note) => note.id === entry.item.id)) continue;
      notes = insertAt(notes, entry.index, entry.item);
      relinked.set(entry.item.id, entry.linkedHighlightIds);
      undoTargets.push({ cardId: card.id, noteId: entry.item.id });
    }
    for (const entry of highlightEntries) {
      const noteIds = new Set(notes.map((note) => note.id));
      const existing = highlights.find((highlight) => highlight.id === entry.item.id);
      if (existing) {
        const becomesBranch = entry.item.kind === "branch" && existing.kind !== "branch";
        const becomesSaved = entry.item.savedByUser && !existing.savedByUser;
        if (becomesBranch || becomesSaved) {
          highlights = highlights.map((highlight) =>
            highlight.id === existing.id
              ? { ...highlight, kind: becomesBranch ? "branch" : highlight.kind, savedByUser: becomesSaved ? true : highlight.savedByUser }
              : highlight,
          );
        }
        if (becomesBranch) undoTargets.push({ cardId: card.id, highlightId: entry.item.id });
        if (becomesSaved) undoTargets.push({ cardId: card.id, highlightId: entry.item.id, savedByUserOnly: true });
        continue;
      }
      const same = highlights.find(
        (highlight) => flat(highlight.text) === flat(entry.item.text) && (highlight.occurrence ?? 0) === (entry.item.occurrence ?? 0),
      );
      if (same) {
        const extraNotes = entry.item.noteIds.filter((id) => noteIds.has(id) && !same.noteIds.includes(id));
        const becomesBranch = entry.item.kind === "branch" && same.kind !== "branch";
        const becomesSaved = entry.item.savedByUser && !same.savedByUser;
        if (becomesBranch || becomesSaved || extraNotes.length > 0) {
          highlights = highlights.map((highlight) =>
            highlight.id === same.id
              ? {
                  ...highlight,
                  kind: becomesBranch ? "branch" : highlight.kind,
                  savedByUser: becomesSaved ? true : highlight.savedByUser,
                  noteIds: [...highlight.noteIds, ...extraNotes],
                }
              : highlight,
          );
        }
        if (becomesBranch) undoTargets.push({ cardId: card.id, highlightId: same.id });
        if (becomesSaved) undoTargets.push({ cardId: card.id, highlightId: same.id, savedByUserOnly: true });
        continue;
      }
      highlights = insertAt(highlights, entry.index, { ...entry.item, noteIds: entry.item.noteIds.filter((id) => noteIds.has(id)) });
      undoTargets.push({ cardId: card.id, highlightId: entry.item.id });
    }
    if (relinked.size > 0) {
      highlights = highlights.map((highlight) => {
        const noteIds = [...highlight.noteIds];
        for (const [noteId, highlightIds] of relinked) {
          if (highlightIds.includes(highlight.id) && !noteIds.includes(noteId)) noteIds.push(noteId);
        }
        return noteIds.length === highlight.noteIds.length ? highlight : { ...highlight, noteIds };
      });
    }
    const detachedEntry = detachedByCard.get(card.id);
    const parentId = detachedEntry && card.parentId === null && present.has(detachedEntry.parentId) ? detachedEntry.parentId : card.parentId;
    return notes === card.notes && highlights === card.highlights && parentId === card.parentId
      ? card
      : { ...card, notes, highlights, parentId };
  });

  return { cards: next, inverse: undoTargets.length > 0 ? { kind: "remove", targets: undoTargets } : null };
}

export function applyOperation(
  cards: readonly BoardCard[],
  operation: HistoryOperation,
  snapshots?: readonly BoardCard[],
): { cards: BoardCard[]; inverse: HistoryOperation | null } {
  return operation.kind === "remove" ? removeTargets(cards, operation.targets, snapshots) : restoreTargets(cards, operation);
}

function historyBytes(past: HistoryEntry[], future: HistoryEntry[]): number {
  return new TextEncoder().encode(JSON.stringify({ past, future })).byteLength;
}

export function normalizeHistory(pastIn: HistoryEntry[], futureIn: HistoryEntry[]): HistorySnapshot {
  let past = pastIn.slice();
  let future = futureIn.slice();
  while (past.length + future.length > MAX_HISTORY_ENTRIES || historyBytes(past, future) > MAX_HISTORY_BYTES) {
    if (past.length > 1) past = past.slice(1);
    else if (future.length > 0) future = future.slice(1);
    else break;
  }
  return { past, future };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

export function historiesEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return JSON.stringify(sortKeys({ past: a.past, future: a.future })) === JSON.stringify(sortKeys({ past: b.past, future: b.future }));
}

function operationTouchesCards(operation: HistoryOperation, changed: Set<string>): boolean {
  if (operation.kind === "remove") return operation.targets.some((target) => changed.has(target.cardId));
  return (
    operation.cards.some(({ item }) => changed.has(item.id)) ||
    operation.notes.some(({ cardId }) => changed.has(cardId)) ||
    operation.highlights.some(({ cardId }) => changed.has(cardId)) ||
    operation.detachedChildren.some(({ cardId, parentId }) => changed.has(cardId) || changed.has(parentId))
  );
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "replace") return createHistoryState(action.cards, action.history);
  if (action.type === "update") {
    const cards = typeof action.update === "function" ? action.update(state.cards) : action.update;
    if (cards === state.cards) return state;
    const before = new Map(state.cards.map((card) => [card.id, card]));
    const after = new Map(cards.map((card) => [card.id, card]));
    const changed = new Set([...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id)));
    const future = state.future.some(({ operation }) => operationTouchesCards(operation, changed)) ? [] : state.future;
    return { ...state, cards, future };
  }
  if (action.type === "delete") {
    const result = applyOperation(state.cards, { kind: "remove", targets: action.targets }, action.cardSnapshots);
    if (!result.inverse) return state;
    return { cards: result.cards, ...normalizeHistory([...state.past, { id: action.entryId, operation: result.inverse }], []) };
  }
  const stack = action.type === "undo" ? state.past : state.future;
  const entry = stack.at(-1);
  if (!entry) return state;
  const result = applyOperation(state.cards, entry.operation);
  if (!result.inverse) return state;
  const rest = stack.slice(0, -1);
  if (action.type === "undo") {
    return { cards: result.cards, ...normalizeHistory(rest, [...state.future, { id: action.entryId, operation: result.inverse }]) };
  }
  return { cards: result.cards, ...normalizeHistory([...state.past, { id: action.entryId, operation: result.inverse }], rest) };
}
