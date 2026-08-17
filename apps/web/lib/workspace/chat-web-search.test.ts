import assert from "node:assert/strict";

import { buildFreshSearchQuery, citedWebResults, formatWebSearchContext, shouldSearchWeb } from "./chat-web-search";

assert.equal(shouldSearchWeb("Explain the renin angiotensin system"), false);
assert.equal(shouldSearchWeb("Who won the World Cup?"), true);
assert.equal(shouldSearchWeb("World Cup final result"), true);
assert.equal(shouldSearchWeb("What is the latest FDA guidance?"), true);
assert.equal(shouldSearchWeb("Look this up on the web"), true);
assert.equal(shouldSearchWeb("what is glimmerlane agent"), true);
assert.equal(shouldSearchWeb("What is the Glimmerlane Agent project?"), true);
assert.equal(shouldSearchWeb("What is a beta blocker?"), false);
assert.equal(shouldSearchWeb("who are you"), false);
assert.equal(shouldSearchWeb("who are u"), false);
assert.equal(shouldSearchWeb("who is this"), false);
assert.equal(shouldSearchWeb("who is nemesis"), false);
assert.equal(shouldSearchWeb("who is the president"), true);
assert.equal(shouldSearchWeb("who are the founders of OpenAI"), true);
assert.match(
  formatWebSearchContext([{ title: "Example", url: "https://example.com", description: "A result." }]),
  /URL: https:\/\/example\.com/,
);
assert.equal(buildFreshSearchQuery("Explain beta blockers", new Date("2026-07-19T12:00:00Z")), "Explain beta blockers");
assert.equal(buildFreshSearchQuery("Who won today's World Cup final?", new Date("2026-07-19T12:00:00Z")), "Who won today's World Cup final? current as of 2026-07-19");

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
