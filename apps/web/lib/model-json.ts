// Reading JSON a model wrote, including the JSON it did not finish writing.
//
// 🔴🔴 A TRUNCATED OBJECT IS THE FAILURE MODE THAT COSTS THE MOST AND EXPLAINS THE LEAST. A cut-off
// sentence is still a sentence; a cut-off object is unparseable, so twelve slides of real work
// become "the slide plan came back unusable" and the learner is invited to try again — at the same
// cap, for the same result. The owner hit exactly that asking for a glycolysis deck.
//
// Raising the output cap is the first fix and `maxTokens` is now set wherever a PARSER reads the
// result. This is the second: when the answer still runs long, keep the elements that did arrive
// whole instead of throwing away the lot. A deck of nine good slides is a deck; nothing is not.
//
// 🔴 IT REPAIRS STRUCTURE, NEVER CONTENT. Nothing here invents a field, guesses a value or closes a
// string it did not see close. It walks to the last point where the document was complete, cuts
// there, and adds the brackets that were already open. Anything half-written is dropped, which is
// what makes the result honest: every element that survives is one the model actually finished.
//
// PURE. No I/O.

/**
 * The first balanced JSON value in `text` — object or array — repaired if it was cut off.
 *
 * 🔴 BOTH ROOTS, BECAUSE THE THREE CALLERS DISAGREE. A deck and a table arrive as objects; a pack
 * of flashcards arrives as a bare array. An object-only helper would have left the cards parser on
 * the old `JSON.parse`, which is the same truncation bug still live in one place — the kind of
 * partial fix that reads as done.
 *
 * Returns null when there is nothing recoverable — no JSON at all, or the truncation landed before
 * a single element was complete.
 */
export function readModelJson(text: string): unknown {
  const object = text.indexOf("{");
  const array = text.indexOf("[");
  const start = object === -1 ? array : array === -1 ? object : Math.min(object, array);
  if (start === -1) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";

  // The easy path: the model finished, and the value is already balanced.
  const end = text.lastIndexOf(closer);
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // Fall through and try to repair. A `}` further on than the object's own close (prose after
      // the JSON, a second fenced block) lands here too, and the walk below handles it correctly
      // because it stops at the first balanced point.
    }
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** The index AFTER the last point where the document could be cut without splitting a value. */
  let safe = -1;

  for (let at = start; at < text.length; at += 1) {
    const char = text[at]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        // A string that has just closed is a complete value — but only a safe cut point once the
        // comma or closer after it decides whether more is coming. So it is not marked here.
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }
    // 🔴 A COMMA IS THE MOST GENERAL SAFE CUT THERE IS, and cutting BEFORE it is what makes it
    // safe. Whatever precedes a comma is a complete value — an object, an array, a string, a
    // number, a keyword — so the document up to that point plus the open closers is valid JSON.
    // Cutting AFTER it would leave a trailing comma, which is not.
    if (char === "," && stack.length > 0) {
      safe = at;
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      // 🔴 THE ONLY SAFE CUT IS AFTER A CLOSED ELEMENT. Cutting after a comma would leave a
      // trailing comma; cutting mid-number would leave a broken literal. A closed brace or bracket
      // is the one position where appending the remaining closers yields valid JSON.
      if (stack.length > 0) safe = at + 1;
      if (stack.length === 0) {
        // Balanced. Everything after this is not ours.
        try {
          return JSON.parse(text.slice(start, at + 1));
        } catch {
          return null;
        }
      }
    }
  }

  // Ran out of text with brackets still open: repair at the last complete element.
  if (safe === -1) return null;
  const head = text.slice(start, safe);
  // Re-walk the kept region to learn which brackets are still open there, because `stack` describes
  // the WHOLE text and the cut may have closed some of what it counted.
  const closers: string[] = [];
  let s = false;
  let e = false;
  for (const char of head) {
    if (s) {
      if (e) e = false;
      else if (char === "\\") e = true;
      else if (char === '"') s = false;
      continue;
    }
    if (char === '"') s = true;
    else if (char === "{") closers.push("}");
    else if (char === "[") closers.push("]");
    else if (char === "}" || char === "]") closers.pop();
  }
  try {
    return JSON.parse(head + closers.reverse().join(""));
  } catch {
    return null;
  }
}
