/**
 * The gate in front of every delete the chat can perform.
 *
 * `agent-tools.test.ts` used to carry a test named "deleting is deliberately not
 * on offer", and its note said plainly: *there is no confirm step inside a chat
 * turn. If this ever fails, the confirm has to come first.* Deletion shipped on
 * 2026-07-31 with guardrails instead of a confirm — recoverable or small — and
 * the owner asked for the real thing the same day. This is it.
 *
 * The shape is a two-phase call. When the MODEL asks for a delete, nothing is
 * deleted: the tool returns a request, the app shows the student a card, and the
 * delete only runs if they tap it. The tap re-enters the SAME executor with
 * `confirmed`, so every guard — the uuid check, the row lookup, the empty-deck
 * rule — runs again on the way through. A card tapped days later is not a
 * shortcut past anything; if the row is gone by then the guard says so, which is
 * the correct answer rather than a hole.
 *
 * Nothing here is persisted. A pending confirmation is a decision the student
 * has not made yet, and a decision is not a deliverable — closing the app is a
 * perfectly good way to decline. (It also keeps this clear of the insert-only
 * `chat_messages` trap that froze the recording card in #364.)
 */

/** Everything the app needs to describe, and later perform, one pending delete. */
export interface PendingDelete {
  /** The tool the model called, re-invoked verbatim when the student approves. */
  tool: string;
  /** The arguments it called with, re-invoked verbatim. */
  args: Record<string, unknown>;
  /** What is about to go, in the student's words: "the note “Pharm Ch. 4”". */
  target: string;
  /** True when the thing can be got back afterwards — changes what the card says. */
  recoverable: boolean;
}

interface DestructiveSpec {
  /** Which argument carries the handle or name. */
  handle: string;
  /** Where to look the label up. `null` means the argument IS the label. */
  table: "calendar_events" | "readable_library_documents" | "study_artifacts" | "study_cards" | null;
  /** The column worth showing the student. */
  labelColumn: string;
  /** What to call it on the card. */
  noun: string;
  /** Whether the student can get it back. Only the Library's soft delete can. */
  recoverable: boolean;
}

/**
 * Every tool that destroys something, and how to describe its target.
 *
 * 🔴 THE GATE READS THIS MAP, NOT A LIST OF `if`s INSIDE EACH HANDLER. A
 * per-handler check is one a future tool can forget, and the failure mode of
 * forgetting is a delete with no confirmation at all. Adding a name here is what
 * puts a tool behind the gate, and `destructive-tools.test.ts` asserts the map
 * and the tool catalogue agree, so a new destructive tool cannot be added to one
 * without the other.
 */
export const DESTRUCTIVE_TOOLS: Readonly<Record<string, DestructiveSpec>> = {
  delete_calendar_event: {
    handle: "event_id",
    table: "calendar_events",
    labelColumn: "title",
    noun: "the calendar event",
    recoverable: false,
  },
  delete_flashcard: {
    handle: "card_id",
    table: "study_cards",
    labelColumn: "front",
    noun: "the flashcard",
    recoverable: false,
  },
  delete_library_folder: {
    // A folder is addressed by PATH; the argument is already the label. The
    // executor soft-deletes the folder row and everything beneath it, so the
    // whole subtree is recoverable — but the blast radius is the largest of
    // any tool here, which is exactly why it sits behind the gate.
    handle: "path",
    table: null,
    labelColumn: "",
    noun: "the folder (and everything inside it)",
    recoverable: true,
  },
  delete_library_note: {
    handle: "note_id",
    table: "readable_library_documents",
    labelColumn: "title",
    noun: "the note",
    // `deleted` is a flag, so it goes to trash rather than away.
    recoverable: true,
  },
  delete_study_artifact: {
    handle: "artifact_id",
    table: "study_artifacts",
    labelColumn: "title",
    noun: "the study material",
    recoverable: false,
  },
  delete_study_deck: {
    // A deck is addressed by NAME, so the argument is already the label.
    handle: "deck_name",
    table: null,
    labelColumn: "",
    noun: "the deck",
    recoverable: false,
  },
} as const;

export function isDestructiveTool(name: string): boolean {
  return Object.hasOwn(DESTRUCTIVE_TOOLS, name);
}

export function destructiveSpec(name: string): DestructiveSpec | null {
  return isDestructiveTool(name) ? DESTRUCTIVE_TOOLS[name] as DestructiveSpec : null;
}

/** Trim a row's label to something that fits on a card without a scrollbar. */
export function confirmLabel(raw: unknown, max = 80): string {
  const text = (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** "the note “Pharm Ch. 4”", or just "the note" when there is nothing to quote. */
export function describeTarget(noun: string, label: string): string {
  const clean = confirmLabel(label);
  return clean ? `${noun} “${clean}”` : noun;
}

/**
 * What the model is told when its delete was held for confirmation.
 *
 * Written against two specific failure modes rather than in general terms. The
 * first is a loop: a tool that returns without deleting looks retryable, so the
 * model calls it again, and again. The second is a lie: the call returned with
 * no error, so the model reports "I've deleted it" and the student believes a
 * delete happened that did not. Both are named out loud because a tool result is
 * read far more literally than a system prompt.
 */
export function pendingDeleteInstruction(target: string, recoverable: boolean): string {
  return (
    `NOTHING HAS BEEN DELETED. ${target} is still there. The student has been shown a card asking them to `
    + "confirm, and only their tap can carry this out.\n"
    + "Do NOT call this tool again for this item — calling it again will not get past this, it will only show a "
    + "second card. Do NOT say it is deleted, done, or removed, and do not use the past tense.\n"
    + "Reply with ONE short line telling them to tap the card to confirm"
    + (recoverable
      ? ", and that it goes to their trash so they can get it back."
      : ", and that this one cannot be undone.")
  );
}
