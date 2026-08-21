import assert from "node:assert/strict";

import { carriesUrl, citedWebResults, formatWebSearchContext, PROVIDER_MAX_WEB_RESULTS, usableWebResults } from "./chat-web-search";

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

// 🔴 NOTHING IS TRUNCATED ANY MORE. Four caps used to sit between the provider and the model — a
// constant of 10, the limit the app sent, the search function's default of 5, and this filter's own
// slice, which discarded pages AFTER they had been fetched and paid for. One search bills one
// metered unit whatever comes back, so every one of them threw away evidence that cost the same
// either way. How many to read is the model's call now (`webResults`); the only ceiling left is the
// provider's, and it is 50.
{
  const many = Array.from({ length: 47 }, (_, index) => ({
    description: `result ${index}`,
    title: `Result ${index}`,
    url: `https://example.com/${index}`,
  }));
  assert.equal(usableWebResults(many).length, 47, "results were silently truncated again");
  assert.equal(PROVIDER_MAX_WEB_RESULTS, 50);
}

// What it still filters is a row that is not a result: no address, or nothing to read.
assert.deepEqual(
  usableWebResults([
    { description: "", title: "", url: "https://nothing-to-read.test" },
    { description: "readable", title: "", url: "https://fine.test" },
    { description: "no address", title: "Orphan", url: "" },
  ]),
  [{ description: "readable", title: "", url: "https://fine.test" }],
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
