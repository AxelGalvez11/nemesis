import assert from "node:assert/strict";

import { buildFreshSearchQuery, formatWebSearchContext, shouldSearchWeb } from "./chat-web-search";

assert.equal(shouldSearchWeb("Explain the renin angiotensin system"), false);
assert.equal(shouldSearchWeb("Who won the World Cup?"), true);
assert.equal(shouldSearchWeb("World Cup final result"), true);
assert.equal(shouldSearchWeb("What is the latest FDA guidance?"), true);
assert.equal(shouldSearchWeb("Look this up on the web"), true);
assert.equal(shouldSearchWeb("what is hermes agent"), true);
assert.equal(shouldSearchWeb("What is the Hermes Agent project?"), true);
assert.equal(shouldSearchWeb("What is a beta blocker?"), false);
assert.match(
  formatWebSearchContext([{ title: "Example", url: "https://example.com", description: "A result." }]),
  /URL: https:\/\/example\.com/,
);
assert.equal(buildFreshSearchQuery("Explain beta blockers", new Date("2026-07-19T12:00:00Z")), "Explain beta blockers");
assert.equal(buildFreshSearchQuery("Who won today's World Cup final?", new Date("2026-07-19T12:00:00Z")), "Who won today's World Cup final? current as of 2026-07-19");

console.log("chat-web-search.test.ts OK");
