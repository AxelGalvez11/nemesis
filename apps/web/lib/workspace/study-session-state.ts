// What a half-finished flashcard sitting consists of, and how it survives a
// refresh.
//
// The reviewer's position is NOT "which card index am I on" — the queue is
// derived, so an index would point at a different card as soon as anything
// moved. What actually has to persist is the logical state the queue is built
// from: which cards are done, which were failed and owe another pass, how far
// through its learning steps each one is, and which card an undo pulled to the
// front.
//
// Storage is per browser, keyed by account AND deck. A bare key would restore
// one account's sitting into another account's session on a shared browser.
// The tradeoff, stated plainly: a sitting does not follow the student to a
// different browser or device. Making it do so needs a table and a migration,
// which is a separate decision.

const VERSION = 1;

export interface StudySessionState {
  readonly passedIds: readonly string[];
  readonly retryIds: readonly string[];
  readonly progressById: Readonly<Record<string, number>>;
  readonly priorityId: string | null;
}

export const EMPTY_SESSION: StudySessionState = { passedIds: [], priorityId: null, progressById: {}, retryIds: [] };

export function studySessionKey(uid: string | null, deckId: string | null): string | null {
  if (!uid || !deckId) return null;
  return `nemesis.web.study-session.${uid}.${deckId}`;
}

/** A sitting worth restoring. An untouched one is not written at all. */
export function hasSessionProgress(state: StudySessionState): boolean {
  return state.passedIds.length > 0 || state.retryIds.length > 0 || Object.keys(state.progressById).length > 0 || state.priorityId !== null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Parse stored session JSON. Everything is validated: stored text is data from
 * a previous version of the app, not something to be trusted. Anything
 * unreadable restores as an empty sitting rather than throwing into a render.
 */
export function parseSessionState(raw: string | null): StudySessionState {
  if (!raw) return EMPTY_SESSION;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_SESSION;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY_SESSION;
  const record = parsed as Record<string, unknown>;
  if (record.version !== VERSION) return EMPTY_SESSION;

  const progressById: Record<string, number> = {};
  if (typeof record.progressById === "object" && record.progressById !== null) {
    for (const [id, step] of Object.entries(record.progressById as Record<string, unknown>)) {
      if (typeof step === "number" && Number.isFinite(step) && step >= 0) progressById[id] = step;
    }
  }
  return {
    passedIds: stringList(record.passedIds),
    priorityId: typeof record.priorityId === "string" ? record.priorityId : null,
    progressById,
    retryIds: stringList(record.retryIds),
  };
}

export function serializeSessionState(state: StudySessionState): string {
  return JSON.stringify({
    passedIds: state.passedIds,
    priorityId: state.priorityId,
    progressById: state.progressById,
    retryIds: state.retryIds,
    version: VERSION,
  });
}

/**
 * Drop anything naming a card the deck no longer has. Cards get deleted,
 * suspended or moved between sittings; without this a stale id would keep a
 * finished sitting looking unfinished forever.
 */
export function pruneSessionState(state: StudySessionState, liveCardIds: ReadonlySet<string>): StudySessionState {
  const progressById: Record<string, number> = {};
  for (const [id, step] of Object.entries(state.progressById)) {
    if (liveCardIds.has(id)) progressById[id] = step;
  }
  return {
    passedIds: state.passedIds.filter((id) => liveCardIds.has(id)),
    priorityId: state.priorityId && liveCardIds.has(state.priorityId) ? state.priorityId : null,
    progressById,
    retryIds: state.retryIds.filter((id) => liveCardIds.has(id)),
  };
}

// ── Undo ──────────────────────────────────────────────────────────────────
// A stack, not a single slot. The reported defect was that undo worked exactly
// once: the component kept one `lastGrade` and set it to null after unwinding
// it, so the second press did nothing.
//
// Deliberately NOT persisted. A snapshot restores a card row to the values it
// held before a grade; replaying that after a reload could clobber a change
// made somewhere else in between. Undo is for taking back the press you just
// made, inside the sitting you are in.

export interface GradeUndoEntry<TSnapshot> {
  readonly cardId: string;
  /** null for a session-only learning step — nothing was written to restore. */
  readonly snapshot: TSnapshot | null;
  readonly progress: number;
  readonly wasRetry: boolean;
}

export function pushUndo<T>(stack: readonly GradeUndoEntry<T>[], entry: GradeUndoEntry<T>): GradeUndoEntry<T>[] {
  return [...stack, entry];
}

export function popUndo<T>(stack: readonly GradeUndoEntry<T>[]): { entry: GradeUndoEntry<T> | null; rest: GradeUndoEntry<T>[] } {
  const entry = stack.at(-1);
  if (!entry) return { entry: null, rest: [] };
  return { entry, rest: stack.slice(0, -1) };
}
