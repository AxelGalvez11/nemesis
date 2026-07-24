import assert from "node:assert/strict";

import { citationsToMarkdown, parseCitationHref } from "./chat-citations";

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

// A turn that ran no web search must look exactly as before.
assert.equal(citationsToMarkdown("See item [1] of the list.", 0), "See item [1] of the list.", "no sources means no rewriting");

// Models invent numbers. A pill pointing at a source that was never supplied
// would be a fabricated citation, so out-of-range markers stay plain text.
assert.equal(citationsToMarkdown("Claim [9].", 3), "Claim [9].", "out-of-range markers are left alone");
assert.equal(citationsToMarkdown("Claim [0].", 3), "Claim [0].", "zero is not a source index");

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

// --- Grouping: consecutive markers merge into one pill -----------------------

// The headline behaviour: "[1][2]" becomes a single pill whose href carries
// both indices, labelled from the first. Byte-for-byte this is what the renderer
// needs to paint "Fifa +1".
assert.equal(
  citationsToMarkdown("Argentina won [1][2].", 3),
  "Argentina won [1](#nemesis-cite=1,2).",
  "adjacent markers merge into one grouped pill",
);

// A single space between markers still reads as consecutive.
assert.equal(
  citationsToMarkdown("Argentina won [1] [2].", 3),
  "Argentina won [1](#nemesis-cite=1,2).",
  "a space-separated run merges, swallowing the gap",
);

// Three in a row.
assert.equal(
  citationsToMarkdown("Sources [1][2][3] agree.", 3),
  "Sources [1](#nemesis-cite=1,2,3) agree.",
  "a run of three merges",
);

// A comma reads as a list of separate citations, not one merged pill.
assert.equal(
  citationsToMarkdown("Both [1], [2] hold.", 3),
  "Both [1](#nemesis-cite=1), [2](#nemesis-cite=2) hold.",
  "a comma between markers keeps them separate",
);

// A newline is a different sentence — never merge across it.
assert.equal(
  citationsToMarkdown("First [1]\n[2] next.", 3),
  "First [1](#nemesis-cite=1)\n[2](#nemesis-cite=2) next.",
  "markers separated by a newline stay separate",
);

// THE BUG THE POSITION SCANNER GUARDS: an out-of-range marker between two valid
// ones must survive as literal text, not be swallowed into the group.
assert.equal(
  citationsToMarkdown("Mix [1][9][2] here.", 3),
  "Mix [1](#nemesis-cite=1)[9][2](#nemesis-cite=2) here.",
  "an out-of-range marker inside a run breaks the group and stays literal",
);

// Duplicates inside a run collapse to one index.
assert.equal(
  citationsToMarkdown("Dupe [1][1].", 3),
  "Dupe [1](#nemesis-cite=1).",
  "a repeated index in a run is de-duplicated",
);

// A lone marker must still emit EXACTLY the pre-grouping single-index link, so
// the existing renderer path and every assertion above it keep passing.
assert.equal(
  citationsToMarkdown("Solo [2].", 3),
  "Solo [2](#nemesis-cite=2).",
  "a lone marker is unchanged by grouping",
);

// --- parseCitationHref -------------------------------------------------------

assert.deepEqual(parseCitationHref("#nemesis-cite=3"), [3], "a lone href parses to one index");
assert.deepEqual(parseCitationHref("#nemesis-cite=1,2"), [1, 2], "a grouped href parses to every index");
assert.deepEqual(parseCitationHref("#nemesis-cite=1,2,3"), [1, 2, 3], "a three-way group parses in order");
assert.deepEqual(parseCitationHref("https://example.com"), [], "a non-citation href yields no indices");
assert.deepEqual(parseCitationHref(null), [], "null yields no indices");
assert.deepEqual(parseCitationHref("#nemesis-cite="), [], "an empty index list yields nothing");

console.log("chat-citations: all assertions passed");
