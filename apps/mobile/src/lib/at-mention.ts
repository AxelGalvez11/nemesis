// Parsing the composer's "@" capability trigger (CapabilityPicker.tsx) — pure, so it Deno-tests
// like composer-send.ts.
//
// 🔴 DERIVED FROM THE END OF THE STRING, NOT FROM WHERE THE CARET ACTUALLY IS. React Native's
// TextInput gives no reliable live caret/selection stream without wiring extra state for a
// picker this small — Composer.tsx's own header note on the capability chip's removal makes
// exactly this same call ("no reliable caret-at-0 signal"). A student opening this picker is,
// in every reference screenshot, typing linearly with the caret already at the end, so reading
// the tail of the string is the same thing in practice and stays pure and trivially testable.
//
// THE RULE (matched to the reference, IMG_6529): "@" triggers the picker only as the very
// first character of the field, or right after a space — never mid-word (so an email-shaped
// "name@host" never opens it) — and only while there is no space yet between "@" and the
// caret (so "@course, tell me…" closes the picker the moment a space is typed, same as the
// reference's own composer, which shows plain text with no highlighted mention once you've
// moved on).

export interface AtMentionState {
  /** Whether the trailing run of the string is an open "@…" trigger. */
  active: boolean;
  /** Index of the "@" character itself within the text. -1 when inactive. */
  at: number;
  /** Whatever was typed after "@", lowercased for filtering. Empty right after typing "@". */
  query: string;
}

const NOT_ACTIVE: AtMentionState = { active: false, at: -1, query: "" };

// Captures the boundary before "@" (start-of-string or one whitespace char) so `at` can be
// computed exactly, then everything after "@" up to the end of the string with no whitespace
// or second "@" in it.
const TRAILING_AT = /(^|\s)@([^\s@]*)$/;

export function atMentionState(text: string): AtMentionState {
  const match = TRAILING_AT.exec(text);
  if (!match) return NOT_ACTIVE;
  return { active: true, at: match.index + match[1].length, query: match[2].toLowerCase() };
}

/** Strip the active "@…" trigger back out of the text, leaving whatever came before it (a
 *  trailing space and all) — called once a capability is picked, so the chip replaces the
 *  typed "@word" rather than sitting beside it. A no-op when nothing is active. */
export function removeAtMention(text: string, state: AtMentionState): string {
  return state.active ? text.slice(0, state.at) : text;
}
