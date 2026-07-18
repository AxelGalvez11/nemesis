// Study review pure logic — deck snapshot parsing + the optimistic session +
// the offline grade-queue shapes. Dependency-free by design (like
// library-sync.ts) so it Deno-tests without a bundler.
//
// The Mac precomputes each deck's due queue into an encrypted `kind: "deck"`
// document (nemesis-desktop src/app/study/phone-sync.ts builds it); the phone
// walks that queue and never runs scheduler code. Grades become append-only
// review_events rows the Mac ingests; within a session the phone advances
// optimistically so review feels instant even with the Mac asleep.

export type ReviewGrade = "again" | "easy" | "good" | "hard";

export const REVIEW_GRADES: readonly ReviewGrade[] = ["again", "hard", "good", "easy"];

export interface DeckQueueCard {
  /** The desktop study model's schedule key — echoed verbatim in review_events. */
  key: string;
  prompt: string;
  answer: string;
  note?: string;
  isNew: boolean;
}

export interface DeckSnapshot {
  v: 1;
  /** When the Mac computed this snapshot (ISO). */
  asOf: string;
  id: string;
  name: string;
  course?: string;
  stats: { due: number; fresh: number; total: number };
  queue: DeckQueueCard[];
}

/** A card's front/back should never contain a raw TAB — a tab means the Mac's
 *  pre-render tab-joined a trailing field (the deck's source/extra column) into
 *  the text. Recover the real front as everything before the first tab and hand
 *  back the trailing piece so it can ride along on the answer instead of
 *  leaking onto the front. Idempotent on tab-free text (the normal case). */
export function splitStrayField(text: string): { head: string; extra: string } {
  const tab = text.indexOf("\t");
  if (tab === -1) return { head: text, extra: "" };
  return { head: text.slice(0, tab).trim(), extra: text.slice(tab + 1).replace(/\t+/g, " ").trim() };
}

function cleanCard(raw: unknown): DeckQueueCard | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.key !== "string" || !value.key) return null;
  if (typeof value.prompt !== "string" || typeof value.answer !== "string") return null;
  // Only the FRONT is de-tabbed: a tab there is a leaked source column showing
  // on the card face. The answer is left verbatim — splitting it too is
  // speculative (it could truncate a legitimate multi-part back) and, when the
  // same trailing field rides on both fields, would duplicate it in the note.
  const front = splitStrayField(value.prompt);
  const rawNote = typeof value.note === "string" && value.note ? value.note : "";
  // Any field peeled off the front becomes the note (shown on reveal), deduped
  // against an existing note so it never reads "X · X".
  const note = [...new Set([rawNote, front.extra].filter(Boolean))].join(" · ");
  return {
    key: value.key,
    prompt: front.head,
    answer: value.answer,
    ...(note ? { note } : {}),
    isNew: value.isNew === true,
  };
}

/** Parse a decrypted deck doc's `content`. Null when the shape is wrong;
 *  individually malformed queue entries drop instead of failing the deck. */
export function parseDeckSnapshot(content: string): DeckSnapshot | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.id !== "string" || !parsed.id || typeof parsed.name !== "string" || !parsed.name) return null;
    const stats = (parsed.stats ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    const queue = Array.isArray(parsed.queue)
      ? parsed.queue.map(cleanCard).filter((card): card is DeckQueueCard => card !== null)
      : [];
    return {
      v: 1,
      asOf: typeof parsed.asOf === "string" ? parsed.asOf : "",
      id: parsed.id,
      name: parsed.name,
      ...(typeof parsed.course === "string" && parsed.course ? { course: parsed.course } : {}),
      stats: { due: num(stats.due), fresh: num(stats.fresh), total: num(stats.total) },
      queue,
    };
  } catch {
    return null;
  }
}

// --- graded marks: hide phone-graded cards until the Mac's snapshot catches up

export interface GradedMark {
  key: string;
  /** ISO time of the phone grade. */
  at: string;
}

/** Keep only marks at-or-after the snapshot — once the Mac republishes a
 *  snapshot computed AFTER a grade, that grade is reflected in the queue itself
 *  and the local mark retires. A timestamp TIE keeps the mark (the safer
 *  direction: a same-millisecond snapshot can't have ingested that grade yet). */
export function pruneGradedMarks(marks: GradedMark[], snapshotAsOf: string): GradedMark[] {
  const cutoff = Date.parse(snapshotAsOf);
  if (!Number.isFinite(cutoff)) return marks;
  return marks.filter((mark) => {
    const at = Date.parse(mark.at);
    return Number.isFinite(at) && at >= cutoff;
  });
}

/** The queue the session starts from: the snapshot minus cards already graded
 *  on this phone since the snapshot was computed. */
export function sessionQueue(snapshot: DeckSnapshot, marks: GradedMark[]): DeckQueueCard[] {
  const graded = new Set(pruneGradedMarks(marks, snapshot.asOf).map((mark) => mark.key));
  return snapshot.queue.filter((card) => !graded.has(card.key));
}

// --- optimistic in-session advance -------------------------------------------

/** "Again" re-shows the card a few positions later (Anki-ish feel) instead of
 *  ending its session — the REAL rescheduling happens on the Mac via FSRS. */
export const AGAIN_GAP = 3;

/** Advance the session queue for one grade of the FIRST card. `completed` says
 *  whether the card left the session (any grade but "again"). Pure. */
export function applyGradeToQueue(
  queue: DeckQueueCard[],
  grade: ReviewGrade,
): { queue: DeckQueueCard[]; completed: boolean } {
  if (!queue.length) return { completed: false, queue };
  const [current, ...rest] = queue;
  if (grade === "again") {
    const cut = Math.min(AGAIN_GAP, rest.length);
    return { completed: false, queue: [...rest.slice(0, cut), current, ...rest.slice(cut)] };
  }
  return { completed: true, queue: rest };
}

// --- offline grade queue shapes ------------------------------------------------

export interface PendingReviewEvent {
  client_event_id: string;
  /** Captured at grading time so a later sign-in by a DIFFERENT account on this
   *  phone can never claim (or upload) someone else's queued grades. */
  user_id: string;
  deck_path_hash: string;
  schedule_key: string;
  grade: ReviewGrade;
  reviewed_at: string;
}

/** Split a queue into the signed-in user's own events (flushable now) and
 *  everyone else's (kept queued until that account signs back in). Pure. */
export function partitionQueueByUser<T extends { user_id: string }>(
  events: T[],
  userId: string,
): { own: T[]; others: T[] } {
  const own: T[] = [];
  const others: T[] = [];
  for (const event of events) (event.user_id === userId ? own : others).push(event);
  return { others, own };
}

/** Remove exactly the given client_event_ids from a queue. Pure. */
export function removeByClientEventId<T extends { client_event_id: string }>(events: T[], ids: Set<string>): T[] {
  return events.filter((event) => !ids.has(event.client_event_id));
}

/** UUID-v4-shaped idempotency token from injected randomness (uniqueness for
 *  offline-retry dedupe, not a security boundary — the row is RLS-scoped). */
export function makeClientEventId(rand: () => number): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.floor(rand() * 16) & 0x3) | 0x8];
    else out += hex[Math.floor(rand() * 16) & 0xf];
  }
  return out;
}

export function chunkEvents<T>(events: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < events.length; i += size) out.push(events.slice(i, i + size));
  return out;
}
