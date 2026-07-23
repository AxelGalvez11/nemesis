// Turning the model's live reasoning into ONE readable line.
//
// The engine already streams its own working-out (`reasoning_content`) roughly
// four seconds before the first word of the answer appears — we pay for it, it
// arrives on the wire, and until now the phone threw it away and showed a
// static "Thinking it through" instead. This file picks the fragment of that
// stream worth showing at any given moment.
//
// Two rules make it read well rather than twitch:
//  1. Follow the sentence being written, not the whole transcript — a wall of
//     text in a one-line slot is unreadable, and the newest words are the
//     interesting ones.
//  2. When a sentence has only just begun, keep showing the finished one. A
//     three-word stub flashing at every full stop looks like a glitch.
//
// Deliberately NOT done here: rewriting or hiding the model's opening
// restatement ("Okay, this is a pharmacology question about…"). Suppressing it
// was right for the old desktop experiment, which tried to pass one sentence
// off as a first-person PLAN and needed a second model call to write it. A live
// preview is a different promise: it says "here is what is happening right
// now", and thinking out loud is what is honestly happening.

/** Roughly two lines at the preview's text size — long enough to carry a
 *  thought, short enough that the line never becomes the page. */
const GLIMPSE_MAX = 140;

/** Below this many characters a new sentence is still a stub, so the previous
 *  (complete) one keeps the slot. */
const MIN_FRAGMENT = 24;

/** Flatten the raw stream to a single display line: markdown emphasis and
 *  headings are noise at this size, and newlines would break the layout. */
function clean(raw: string): string {
  return raw
    .replace(/[*#`_>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split flattened reasoning into sentence-ish segments.
 *
 * Hand-rolled rather than a split on a lookbehind pattern: Hermes (the phone's
 * JS engine) does not support lookbehind, and a regex that works in the test
 * runner but throws on device is the worst possible outcome here.
 *
 * A terminator only counts when the next character is a space or the string
 * ends, so decimals ("0.5 mg") and version numbers survive intact.
 */
export function reasoningSegments(flat: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const next = flat[i + 1];
    if (next !== undefined && next !== " ") continue;
    const segment = flat.slice(start, i + 1).trim();
    if (segment) out.push(segment);
    start = i + 1;
  }
  const rest = flat.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Keep the END of an over-long fragment — the newest words are the live ones,
 *  and cutting the front lets the line read like a ticker instead of freezing
 *  on an opening clause while the model keeps writing. */
function clipTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  const firstSpace = tail.indexOf(" ");
  // No space in the whole window (one very long token) — take it as-is rather
  // than returning a bare ellipsis.
  const body = firstSpace >= 0 ? tail.slice(firstSpace + 1) : tail;
  return `…${body}`;
}

/**
 * The single line to show for the reasoning received so far. Empty string means
 * show nothing — the caller falls back to the phase label, which is what an
 * Instant turn (no reasoning at all) always does.
 */
export function reasoningGlimpse(raw: string, max: number = GLIMPSE_MAX): string {
  const flat = clean(raw);
  if (!flat) return "";
  const segments = reasoningSegments(flat);
  if (!segments.length) return "";
  const last = segments[segments.length - 1];
  const finished = /[.!?]$/.test(last);
  // A sentence that has only just started keeps the previous, complete one on
  // screen — see rule 2 at the top.
  const pick = !finished && last.length < MIN_FRAGMENT && segments.length > 1 ? segments[segments.length - 2] : last;
  return clipTail(pick, max);
}
