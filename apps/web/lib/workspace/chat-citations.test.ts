import assert from "node:assert/strict";

import { citationsToMarkdown } from "./chat-citations";

// The happy path: a marker the model was actually given becomes a pill link.
assert.equal(
  citationsToMarkdown("Argentina won in 2022 [1].", 3),
  "Argentina won in 2022 [1](#nemesis-cite=1).",
  "an in-range marker becomes a cite link",
);

// Several markers in one answer all convert.
assert.equal(
  citationsToMarkdown("First [1]. Second [2].", 2),
  "First [1](#nemesis-cite=1). Second [2](#nemesis-cite=2).",
  "every in-range marker converts",
);

// 🔴🔴 A MARKER THAT CANNOT BECOME A PILL IS DELETED. These two assertions used to say the
// opposite — "no sources means no rewriting" and "out-of-range markers are left alone" — on the
// reasoning that a bare "[9]" was less wrong than a pill pointing at nothing. The owner reported
// the result of that on 2026-08-31, twice: *"it's also made up citations"* and *"citations should
// only show up as the pill form."* His screenshot carried [1][2][3], [5], [2][6] on a turn with no
// sources attached at all, which is the `sourceCount === 0` path.
//
// A bare bracket number is not a smaller citation. It is a claim of evidence with nothing behind
// it, and in a product a student trusts to be right that is the worse failure. Deleting it also
// makes "citations appear only as pills" true by construction rather than by the model behaving.
assert.equal(citationsToMarkdown("See item [1] of the list.", 0), "See item of the list.", "an unsourced turn still printed a bracket number");
assert.equal(citationsToMarkdown("Claim [9].", 3), "Claim.", "an invented marker was left on screen");
assert.equal(citationsToMarkdown("Claim [0].", 3), "Claim.", "zero is not a source index and must not print");

// 🔴 FOUR DIGITS ARE NOT A CITATION. A law report ("[1998] AC 123") and a year in brackets must
// survive, which the 1-2 digit marker pattern already guarantees — pinned so a widened pattern
// cannot start eating them.
assert.equal(citationsToMarkdown("Donoghue [1932] AC 562.", 0), "Donoghue [1932] AC 562.", "a bracketed year was deleted as a citation");

// Already-linked text must not be double-wrapped.
assert.equal(
  citationsToMarkdown("See [1](https://example.com).", 3),
  "See [1](https://example.com).",
  "an existing markdown link is not rewritten",
);

// THE BUG THIS GUARDS: code legitimately contains bracketed integers. Turning
// `arr[1]` into a citation would corrupt the snippet.
assert.equal(
  citationsToMarkdown("Use `arr[1]` to index.", 3),
  "Use `arr[1]` to index.",
  "inline code is left untouched",
);
assert.equal(
  citationsToMarkdown("```js\nconst x = arr[1];\n```", 3),
  "```js\nconst x = arr[1];\n```",
  "fenced code blocks are left untouched",
);

// Prose around a code block still gets its pills.
assert.equal(
  citationsToMarkdown("Before [1].\n```js\narr[2]\n```\nAfter [2].", 2),
  "Before [1](#nemesis-cite=1).\n```js\narr[2]\n```\nAfter [2](#nemesis-cite=2).",
  "prose converts while the fenced block in between is preserved",
);

console.log("chat-citations: all assertions passed");
