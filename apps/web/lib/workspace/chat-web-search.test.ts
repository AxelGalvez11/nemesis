import assert from "node:assert/strict";

import { formatWebSearchContext, shouldSearchWeb } from "./chat-web-search";

assert.equal(shouldSearchWeb("Explain the renin angiotensin system"), false);
assert.equal(shouldSearchWeb("Who won the World Cup?"), true);
assert.equal(shouldSearchWeb("What is the latest FDA guidance?"), true);
assert.equal(shouldSearchWeb("Look this up on the web"), true);
assert.match(
  formatWebSearchContext([{ title: "Example", url: "https://example.com", description: "A result." }]),
  /URL: https:\/\/example\.com/,
);

console.log("chat-web-search.test.ts OK");
