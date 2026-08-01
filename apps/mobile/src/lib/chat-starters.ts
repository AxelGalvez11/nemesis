// The three suggestions on an empty chat.
//
// Owner 2026-07-31: "change the landing chat suggestions to be related to the
// app functions like 'organize my library', or 'check my calendar'". The old
// three — quiz me, explain a concept, look something up — are things any chat
// window does, so the one screen a student sees first said nothing about what
// this one can reach: their notes, their decks, their week.
//
// Kept apart from chat.tsx so it can be tested. The ICONS stay on the screen,
// because they pull in react-native-svg and nothing in lib/ may.

export type ChatStarterKey = "calendar" | "library" | "flashcards";

export interface ChatStarter {
  key: ChatStarterKey;
  /** The row the student reads. */
  label: string;
  /** What lands in the composer. NOTHING SENDS — tapping a row fills the box
   *  and focuses it, so this either finishes as a whole sentence or trails off
   *  with a space where the student supplies the subject. Anything in between
   *  reads half-written the moment they press send. */
  prefill: string;
}

/** Exactly three, and that is load-bearing rather than a style choice: the chat
 *  measures its whole composer block — these rows included — and drives the
 *  bottom fade and the artifact card's clearance off that measurement. */
export const CHAT_STARTERS: readonly ChatStarter[] = [
  { key: "calendar", label: "Check my calendar", prefill: "What's on my calendar this week?" },
  { key: "library", label: "Organize my library", prefill: "Help me organize my library." },
  { key: "flashcards", label: "Make flashcards from a note", prefill: "Make flashcards from my note on " },
];

/** True when a prefill is safe to send as-is or is plainly waiting for more. */
export function starterPrefillIsWellFormed(prefill: string): boolean {
  if (prefill !== prefill.trimStart()) return false;
  if (prefill.endsWith(" ")) return true;
  return /[.?!]$/.test(prefill);
}
