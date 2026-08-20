import assert from "node:assert/strict";

import { carriesUrl, citedWebResults, formatWebSearchContext } from "./chat-web-search";

// 🔴 shouldSearchWeb AND buildFreshSearchQuery ARE GONE, and so are the assertions that pinned
// them: "Who won the World Cup?" true, "What is a beta blocker?" false, and so on. They were
// pinning a list of English words standing in for "does this need the live web" — a rule that
// bought a search for any sentence containing "update", refused one for "has that guideline been
// revised", and could not read a question asked in Spanish at all. The model answers it now, in
// the same envelope as everything else (chat-intent.ts), and the phrasings are exercised against
// the real model by `scripts/chat-intent-acceptance.mts`.

// A URL is the one web fact that needs no reading: the address is literally in the message.
assert.equal(carriesUrl("summarise https://example.com/paper for me"), true);
assert.equal(carriesUrl("HTTPS://EXAMPLE.COM"), true);
assert.equal(carriesUrl("what is the latest FDA guidance"), false);
assert.equal(carriesUrl("explain the renin angiotensin system"), false);
// Deliberately narrow: a bare domain is how people write about a company, not how they ask for a
// page, and promoting "is example.com down" into a fetch would spend money on a guess.
assert.equal(carriesUrl("what does example.com do"), false);

assert.match(
  formatWebSearchContext([{ title: "Example", url: "https://example.com", description: "A result." }]),
  /URL: https:\/\/example\.com/,
);

const sources = [
  { description: "one", title: "One", url: "https://one.test" },
  { description: "two", title: "Two", url: "https://two.test" },
  { description: "three", title: "Three", url: "https://three.test" },
];
assert.deepEqual(
  citedWebResults("The current rule is supported here [2], then qualified here [1]. [2]", sources),
  [sources[1], sources[0]],
);
assert.deepEqual(citedWebResults("Out-of-range references [0] [9] are ignored, but [1] is real.", sources), [sources[0]]);
assert.deepEqual(citedWebResults("No citation means no automatic source promotion.", sources), []);

console.log("chat-web-search.test.ts OK");
