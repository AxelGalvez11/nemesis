// Unit test for the citation helpers. No runner is wired into the web build, so run ad hoc:
//   npx tsx lib/cite.test.ts
// It exercises the pure join-key logic the chat highlight depends on (claim → cited source → the
// verbatim supporting sentence), which is the one piece here that can be checked without a browser.
import assert from "node:assert/strict";
import { normTag, supportQuoteFor } from "./cite";

// normTag strips brackets + whitespace so both sides of the join match.
assert.equal(normTag("[ FDA 1 ]"), "FDA1");

const support = [
  { citation_tag: "1", quote: "Dexamethasone reduced 28-day mortality." },
  { citation_tag: "FDA2", quote: "Warnings include hyperglycemia." },
];

// Resolves a tag to ITS claim's verbatim supporting quote.
assert.equal(supportQuoteFor(support, "1"), "Dexamethasone reduced 28-day mortality.");
// Normalizes both sides — a bracketed/spaced tag still matches.
assert.equal(supportQuoteFor(support, normTag("[FDA 2]")), "Warnings include hyperglycemia.");
// No matching tag → undefined (the card simply shows no highlight, never a fabricated one).
assert.equal(supportQuoteFor(support, "9"), undefined);
// Missing/empty support → undefined (older saved answers, or nothing cleared the support bar).
assert.equal(supportQuoteFor(undefined, "1"), undefined);
assert.equal(supportQuoteFor([], "1"), undefined);

console.log("cite.test.ts OK");
