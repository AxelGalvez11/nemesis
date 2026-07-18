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

// --- in-session Anki-style scheduler (optimistic; the Mac owns real FSRS) ------
//
// The snapshot only carries isNew per card, so the phone rebuilds the Anki
// session buckets itself: New cards and due Review cards drop into "learning"
// when you start them and cycle back a few positions until they graduate — so a
// card you don't know keeps coming around within one session (owner: "like Anki,
// the card shows back again"). A new card takes two "good"s to leave (Anki's
// 1m/10m steps); a review card you lapse ("again") relearns in one step. The
// New / Learning / Review counters are derived live from the buckets.
//
// Emission is the CALLER's job (review.tsx): it sends each card's FIRST grade
// only — the "did I recall it when it fell due" signal FSRS actually models.
// The later learning-step grades stay on the phone, because the Mac applies
// every review_event as an independent review and re-sending would over-advance
// the schedule (and a first "again" must reach the Mac, or a lapse is lost).

export type CardBucket = "learning" | "new" | "review";

/** "Good"s a new card must clear before graduating — mirrors Anki's default
 *  1m/10m two-step learning. A lapsed review relearns in a single step. */
export const NEW_STEPS = 2;
export const RELEARN_STEPS = 1;
/** How far back a still-learning card is re-inserted, so it returns later in the
 *  same session rather than immediately. */
export const LEARNING_GAP = 3;

export interface SessionCard extends DeckQueueCard {
  bucket: CardBucket;
  /** "Good"s still needed to graduate — only meaningful while learning. */
  stepsLeft: number;
}

export interface ReviewSession {
  cards: SessionCard[];
  /** Cards that have graduated (left the session) — the progress numerator. */
  completed: number;
}

export interface SessionCounts {
  /** The "New" bucket (named `fresh` to avoid the `new` reserved word). */
  fresh: number;
  learning: number;
  review: number;
}

/** Seed a session from the (already graded-mark-filtered) queue. Pure. */
export function initSession(queue: DeckQueueCard[]): ReviewSession {
  return {
    cards: queue.map((card) => ({
      ...card,
      bucket: card.isNew ? "new" : "review",
      stepsLeft: card.isNew ? NEW_STEPS : 0,
    })),
    completed: 0,
  };
}

/** Live New / Learning / Review tallies for the counter row. Pure. */
export function sessionCounts(session: ReviewSession): SessionCounts {
  let fresh = 0;
  let learning = 0;
  let review = 0;
  for (const card of session.cards) {
    if (card.bucket === "new") fresh++;
    else if (card.bucket === "learning") learning++;
    else review++;
  }
  return { fresh, learning, review };
}

export interface SessionAdvance {
  session: ReviewSession;
  /** The card left the session (a terminal grade) — record its graded-mark. */
  graduated: boolean;
}

/** Grade the FIRST card and advance the session. Pure — the Mac reschedules for
 *  real from the events the caller emits. */
export function gradeCurrent(session: ReviewSession, grade: ReviewGrade): SessionAdvance {
  const [current, ...rest] = session.cards;
  if (!current) return { graduated: false, session };

  const graduate: SessionAdvance = {
    graduated: true,
    session: { cards: rest, completed: session.completed + 1 },
  };
  const requeue = (card: SessionCard): SessionAdvance => {
    const cut = Math.min(LEARNING_GAP, rest.length);
    return {
      graduated: false,
      session: { cards: [...rest.slice(0, cut), card, ...rest.slice(cut)], completed: session.completed },
    };
  };

  // "Easy" always graduates outright, whatever the bucket.
  if (grade === "easy") return graduate;

  // A still-untouched due review: a pass leaves the session; a lapse relearns.
  if (current.bucket === "review") {
    if (grade === "again") return requeue({ ...current, bucket: "learning", stepsLeft: RELEARN_STEPS });
    return graduate; // hard / good
  }

  // New or learning card — cycle through the steps.
  if (grade === "again") {
    return requeue({ ...current, bucket: "learning", stepsLeft: current.isNew ? NEW_STEPS : RELEARN_STEPS });
  }
  if (grade === "hard") {
    // Repeat the current step: no progress, but keeps cycling.
    return requeue({ ...current, bucket: "learning", stepsLeft: Math.max(current.stepsLeft, 1) });
  }
  // "Good": clear one step; graduate once the last step is cleared.
  const stepsLeft = current.stepsLeft - 1;
  if (stepsLeft <= 0) return graduate;
  return requeue({ ...current, bucket: "learning", stepsLeft });
}

// --- cloze answer highlight ----------------------------------------------------
//
// The Mac pre-renders a cloze card so the phone gets the front with the tested
// span blanked ("[...]" or "[hint]") and the back fully revealed. Anki also
// HIGHLIGHTS the tested word on the back; the phone recovers that span by
// aligning the two strings. Everything matches except where the front holds the
// blank and the back holds the answer, so the longest common prefix and suffix
// bracket the revealed text. Returns null for a normal Q/A card — its back
// shares no surrounding context, so `before` and `after` both come back empty.

export interface ClozeSplit {
  before: string;
  highlight: string;
  after: string;
}

export function clozeAnswerHighlight(prompt: string, answer: string): ClozeSplit | null {
  if (prompt === answer || !prompt.includes("[")) return null;
  const max = Math.min(prompt.length, answer.length);
  let pre = 0;
  while (pre < max && prompt[pre] === answer[pre]) pre++;
  let suf = 0;
  while (suf < max - pre && prompt[prompt.length - 1 - suf] === answer[answer.length - 1 - suf]) suf++;
  const before = answer.slice(0, pre);
  const highlight = answer.slice(pre, answer.length - suf);
  const after = answer.slice(answer.length - suf);
  // A real cloze reveal keeps surrounding context on at least one side and a
  // non-empty middle; a normal Q/A pair yields before === after === "".
  if (!highlight || (!before && !after)) return null;
  return { after, before, highlight };
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
