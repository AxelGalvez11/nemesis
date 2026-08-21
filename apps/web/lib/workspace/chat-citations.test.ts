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

// 🔴 MARKDOWN REFERENCE LINKS ARE NOT CITATIONS (owner 2026-08-21). `[the trial][1]` with a
// `[1]: https://…` definition further down is ordinary markdown, and rewriting either half breaks
// it. Reproduced against the phone's real parser before fixing: converting first turned
// "[the Lancet paper][1]" into literal bracketed text plus a pill pointing at nothing, and dragged
// the definition lines up into the body as visible prose with the URLs naked on the page. Both real
// link targets were lost. The whole answer must therefore come back byte-identical.
const referenceAnswer = [
  "The trial was published in [the Lancet paper][1] last spring, and the",
  "registry entry [is here][2].",
  "",
  "[1]: https://www.thelancet.com/article/S0140",
  "[2]: https://clinicaltrials.gov/study/NCT01",
].join("\n");
assert.equal(
  citationsToMarkdown(referenceAnswer, 3),
  referenceAnswer,
  "a reference link and its definition lines are left exactly as written",
);

// An indented definition is still a definition — markdown allows up to three leading spaces.
assert.equal(
  citationsToMarkdown("text [x][1]\n\n   [1]: https://example.com", 2),
  "text [x][1]\n\n   [1]: https://example.com",
  "an indented reference definition is left alone",
);

// 🔴 THE TIE-BREAK. `[1][2]` is syntactically a reference link whose text is "1" — and it is also
// the commonest way a model stacks two citations. What decides it is the character before the run:
// prose here, so these are citations and both convert.
assert.equal(
  citationsToMarkdown("Confirmed by both [1][2].", 3),
  "Confirmed by both [1](#nemesis-cite=1)[2](#nemesis-cite=2).",
  "a run of bare markers after prose is citations, not a reference link",
);

// ...and the same run hanging off a bracketed PHRASE is a reference link all the way down, so
// neither marker is touched.
assert.equal(
  citationsToMarkdown("See [the summary][1][2] below.", 3),
  "See [the summary][1][2] below.",
  "a run hanging off bracketed words stays a reference link",
);

// A colon mid-sentence is not a definition line, so an ordinary marker before one still converts.
assert.equal(
  citationsToMarkdown("The finding [1]: striking.", 2),
  "The finding [1](#nemesis-cite=1): striking.",
  "a marker followed by a colon mid-line is still a citation",
);

console.log("chat-citations: reference-link assertions passed");
