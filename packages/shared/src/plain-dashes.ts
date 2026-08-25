// Nemesis does not use em dashes.
//
// 🔴🔴🔴 OWNER, 2026-08-25, AFTER SEEING ONE ON SCREEN: *"can you make sure nemesis does not use em
// dashes at all?"* The reply he was looking at opened *"Here's a classic example — the 'saddle with
// ripples' surface"*, which is the exact cadence people read as machine-written.
//
// 🔴 THE RULE WAS ALREADY WRITTEN AND THE PACKET WAS ARGUING AGAINST ITSELF. `canvas-prompts.ts`
// has said *"Never use an em dash. The character — must not appear anywhere in your output"* for
// months. Measured on the real assembled packet: 31,605 characters carrying FORTY-NINE em dashes,
// one of them inside the sentence banning them. A model reading forty-nine live examples and one
// prohibition follows the examples. So the instruction is not wrong, it was outvoted.
//
// Both halves are therefore fixed together, and neither alone would do:
//
//   · the prompts stop using the character, so the habit is not being taught (the CAUSE)
//   · this function runs on everything the model says, so the promise holds anyway (the GUARANTEE)
//
// That pairing is the house answer whenever a prompt rule will not hold, and this is the fifth time
// in this codebase it has been needed. See `screen-positions.ts` and `figure-fallback.ts`.
//
// 🔴 IT SWAPS ONE MARK OF PUNCTUATION, IT DOES NOT REWRITE A SENTENCE. An em dash between two
// clauses becomes a comma, which is what the house style guide already says to use. Anything
// cleverer would be a regex deciding what the answer says, and an answer edited by a regex is a
// worse failure than the punctuation it was fixing.
//
// 🔴 A NUMERIC RANGE KEEPS ITS DASH. In "1914–1918" and "pp. 3–7" the dash means "to", which is a
// fact rather than a habit, and a comma there would change what the text says.
//
// PURE. No I/O, no React. Runs on web and mobile alike.

/** Spaces and tabs, never a newline: a dash must not be allowed to join two lines into one. */
const GAP = "[^\\S\\n]*";

/** Em dash and horizontal bar. The second is rarer and looks identical on screen. */
const DASH = "[\\u2014\\u2015]";

/**
 * The same prose with every em dash replaced by ordinary punctuation.
 *
 * "the axon — the long one — carries the signal" becomes "the axon, the long one, carries the
 * signal"; "He tried — and failed." becomes "He tried, and failed."
 */
export function plainDashes(text: string): string {
  if (!text || !/[–—―]/.test(text)) return text;
  return (
    text
      // A line that is nothing but a dash is a placeholder, not a sentence, so it empties out
      // rather than turning into a stray bullet.
      .replace(new RegExp(`^${GAP}${DASH}${GAP}$`, "gm"), "")
      // A dash opening a line is a bullet. A bullet is not a sentence break, so it becomes the
      // ordinary hyphen bullet rather than a comma with nothing in front of it.
      .replace(new RegExp(`^([ \\t]*)${DASH}${GAP}`, "gm"), "$1- ")
      // Nothing follows it: an interrupted sentence, or a trailing flourish. The dash simply goes.
      .replace(new RegExp(`${GAP}${DASH}${GAP}$`, "gm"), "")
      // Already punctuated on the left, so a comma would double up.
      .replace(new RegExp(`([,;:.!?])${GAP}${DASH}${GAP}`, "g"), "$1 ")
      // The ordinary case, spaced or unspaced.
      .replace(new RegExp(`${GAP}${DASH}${GAP}`, "g"), ", ")
      // 🔴 A SPACED EN DASH IS THE SAME HABIT IN A NARROWER CHARACTER, and it is where a model told
      // to drop the em dash goes next. Only between letters: a numeric range keeps its dash.
      .replace(/(\p{L})[ \t]+–[ \t]+(\p{L})/gu, "$1, $2")
      // A pair of dashes closing onto existing punctuation can leave these behind.
      .replace(/,[ \t]*,/g, ",")
      .replace(/[ \t]+,/g, ",")
  );
}

/**
 * A cleaner for text that arrives in pieces, because the answer is typed out as it streams.
 *
 * 🔴 EVERY RULE ABOVE NEEDS CONTEXT THE PIECE DOES NOT HAVE. A chunk boundary can land inside
 * " — ", and cleaning that piece alone sees a dash with no word in front of it. Worse, it sees a
 * dash at the START of the piece, which is what a bullet looks like — the first version of this
 * function typed "The axon - the long one" onto the screen for exactly that reason, and its own
 * test caught it.
 *
 * So nothing is cleaned in pieces. The WHOLE answer so far is cleaned every time, and what goes out
 * is the part that has not been sent yet. Every rule then sees the real line starts and both sides
 * of every mark, and there is no boundary case left to get wrong.
 *
 * 🔴 A TRAILING RUN OF SPACES OR DASHES IS HELD BACK, because that is the one thing the next chunk
 * can still change. Without it "He tried" would be sent, and then the dash arriving would want to
 * turn it into "He tried," — text already on screen, which cannot be un-typed.
 *
 * Re-cleaning the whole buffer per chunk is quadratic on paper. In practice `plainDashes` returns
 * on its first line when the text holds no dash at all, so an ordinary answer costs one scan per
 * chunk over a few kilobytes.
 */
export function streamingDashes(): { feed: (chunk: string) => string; flush: () => string } {
  let raw = "";
  let sent = "";
  const advance = (settled: string): string => {
    const cleaned = plainDashes(settled);
    // A replacement that reached back into text already sent would mean the hold-back above missed
    // a case. Resynchronise rather than duplicating what is on screen.
    if (!cleaned.startsWith(sent)) {
      sent = cleaned;
      return "";
    }
    const out = cleaned.slice(sent.length);
    sent = cleaned;
    return out;
  };
  return {
    feed(chunk: string): string {
      raw += chunk;
      const trailing = /[\s–—―]+$/.exec(raw);
      return advance(trailing ? raw.slice(0, trailing.index) : raw);
    },
    flush(): string {
      return advance(raw);
    },
  };
}
