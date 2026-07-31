/**
 * The rules behind the chat's edit and delete verbs, shared by web and iOS.
 *
 * Every function here is pure. The Supabase calls that surround them are thin
 * wrappers that cannot be unit-tested, so anything that can actually be WRONG —
 * which fields an update is allowed to touch, whether a delete is safe to run,
 * whether a handle is real — lives here where a test can hold it.
 */

export const EVENT_KINDS = ["assignment", "exam", "rotation", "class", "other"] as const;
export type EventKind = typeof EVENT_KINDS[number];

const EVENT_KIND_SET: ReadonlySet<string> = new Set(EVENT_KINDS);

/** Postgres uuid, the handle every destructive verb keys on. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * A handle is only usable if it is really a uuid.
 *
 * This is the guard against the most dangerous failure mode a delete tool has:
 * a model that half-remembers an id and passes a title, an index, or a
 * truncated string. A loose check would let that reach the database, where
 * Postgres coerces or partially matches and something the student never named
 * gets destroyed. Anything that is not a uuid is not a handle, and the caller
 * turns that into an error the model can read and correct.
 */
export function workspaceId(value: unknown): string | null {
  const raw = text(value).trim();
  return UUID.test(raw) ? raw.toLowerCase() : null;
}

export interface CalendarEventFields {
  course: string | null;
  date: string;
  kind: EventKind;
  note: string | null;
  time: string | null;
  title: string;
}

export type CalendarEventPatch = Partial<CalendarEventFields>;

export interface PatchFailure {
  error: string;
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Rejects 2026-02-31 and friends: Date normalizes them to a different day,
  // and a silently-shifted deadline is worse than a refused edit.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Build the patch for update_calendar_event from whatever the model sent.
 *
 * The rule that matters: ONLY KEYS ACTUALLY PRESENT ARE TOUCHED. A student who
 * says "move that exam to 3pm" produces a call carrying `time` alone, and the
 * naive implementation — read every field, write every field — blanks the note
 * and the course on the way past because they came back `undefined`. So this
 * walks the supplied keys rather than the known ones.
 *
 * An explicit `null` (or empty string) IS a change: it clears an optional
 * field, which is how "take the time off that, it's all day" gets done.
 */
export function calendarEventPatch(args: Record<string, unknown>): CalendarEventPatch | PatchFailure {
  const patch: CalendarEventPatch = {};

  if ("title" in args) {
    const title = text(args.title).trim().slice(0, 300);
    if (!title) return { error: "An event title cannot be empty." };
    patch.title = title;
  }
  if ("date" in args) {
    const date = text(args.date).trim();
    if (!isDateKey(date)) return { error: "Date must be a real calendar date in YYYY-MM-DD form." };
    patch.date = date;
  }
  if ("kind" in args) {
    const kind = text(args.kind).trim().toLowerCase();
    if (!EVENT_KIND_SET.has(kind)) {
      return { error: `Kind must be one of ${EVENT_KINDS.join(", ")}.` };
    }
    patch.kind = kind as EventKind;
  }
  // The three optional fields: present-but-empty means clear it.
  if ("time" in args) patch.time = text(args.time).trim().slice(0, 40) || null;
  if ("course" in args) patch.course = text(args.course).trim().slice(0, 200) || null;
  if ("note" in args) patch.note = text(args.note).trim().slice(0, 4_000) || null;

  if (Object.keys(patch).length === 0) {
    return { error: "Nothing to change — name at least one of title, date, time, kind, course or note." };
  }
  return patch;
}

export function isPatchFailure(value: CalendarEventPatch | PatchFailure): value is PatchFailure {
  return "error" in value;
}

export interface DeckDeletionVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether the chat may delete a whole Study deck.
 *
 * `study_decks` has no soft-delete column, so this destroys the deck, every
 * card in it, and every scheduling record behind those cards — permanently, on
 * a model's reading of a sentence. Blast radius and reversibility are what
 * decide, not "may the AI delete things": one card is cheap to retype, a term's
 * review history is not.
 *
 * So the chat may tidy away a deck it just made or one that ended up empty,
 * and anything with cards in it is refused with a route the student can take
 * themselves. If they truly want it gone, the Study page's own delete asks them
 * first — which is the confirmation this lane cannot provide.
 */
export function deckDeletionVerdict(cardCount: number): DeckDeletionVerdict {
  const count = Number.isFinite(cardCount) ? Math.max(0, Math.trunc(cardCount)) : 0;
  if (count === 0) return { allowed: true };
  return {
    allowed: false,
    reason:
      `That deck still holds ${count} card${count === 1 ? "" : "s"}, so it can't be removed from chat — `
      + "deleting it would take their review history with it. Delete the cards first if that is really the "
      + "intent, or tell the student they can remove the whole deck from the Study page.",
  };
}

/** The replacement body for a note rewrite, or null when there is nothing usable. */
export function noteReplacementBody(value: unknown, max = 100_000): string | null {
  const body = text(value).replace(/\s+$/, "");
  return body.trim() ? body.slice(0, max) : null;
}
