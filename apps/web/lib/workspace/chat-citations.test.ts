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

console.log("chat-citations: all assertions passed");
