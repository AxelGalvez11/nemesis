import assert from "node:assert/strict";
import test from "node:test";

import {
  groundingQuery,
  groundingSources,
  GROUNDING_SOURCE_LIMIT,
  needsGrounding,
  type WebHit,
} from "./topic-grounding";

const hit = (url: string, title = "A page"): WebHit => ({ title, url });

test("🔴 the query is the subject, not the instruction aimed at Nemesis", () => {
  // Searching "teach me innate immunity" verbatim spends the query on the word "teach" and returns
  // tutoring services rather than immunology.
  assert.equal(groundingQuery("Teach me innate immunity."), "innate immunity");
  assert.equal(groundingQuery("Help me understand inflation"), "inflation");
  assert.equal(groundingQuery("I want to learn about promissory estoppel"), "promissory estoppel");
  assert.equal(groundingQuery("walk me through the Krebs cycle"), "the Krebs cycle");
});

test("a bare topic is left exactly as the learner wrote it", () => {
  assert.equal(groundingQuery("innate immunity"), "innate immunity");
  assert.equal(groundingQuery("shear stress in a fillet weld"), "shear stress in a fillet weld");
});

test("🔴 stripping never eats the whole subject", () => {
  // A topic that happens to BE one of the stripped words must still search for something.
  for (const topic of ["review", "study", "teach"]) {
    assert.ok(groundingQuery(topic).length > 0, `"${topic}" produced an empty query`);
  }
});

test("🔴 FIELD-AGNOSTIC: only instructions to the system are removed, never subject matter", () => {
  // The stripped prefixes are all things said TO Nemesis. Nothing here knows what a discipline is.
  const pairs: [string, string][] = [
    ["Teach me the rule against perpetuities", "the rule against perpetuities"],
    ["Teach me austenitic stainless steel", "austenitic stainless steel"],
    ["Review mens rea", "mens rea"],
  ];
  for (const [asked, expected] of pairs) assert.equal(groundingQuery(asked), expected);
});

test("only pages with something to read are promoted", () => {
  const chosen = groundingSources([
    { url: "https://a.test/1" },                                  // no title, no description
    hit("https://b.test/1"),
    { description: "About the thing", url: "https://c.test/1" },
  ]);
  assert.deepEqual(chosen.map((entry) => entry.url), ["https://b.test/1", "https://c.test/1"]);
});

test("🔴 one page per host — a topic taught from one domain inherits its framing", () => {
  const chosen = groundingSources([
    hit("https://same.test/a"),
    hit("https://same.test/b"),
    hit("https://www.same.test/c"),
    hit("https://other.test/a"),
  ]);
  assert.deepEqual(chosen.map((entry) => entry.url), ["https://same.test/a", "https://other.test/a"]);
});

test("the promotion count is bounded — search rank must not become the curriculum", () => {
  const many = Array.from({ length: 10 }, (_, i) => hit(`https://site${i}.test/p`));
  assert.equal(groundingSources(many).length, GROUNDING_SOURCE_LIMIT);
  assert.ok(GROUNDING_SOURCE_LIMIT <= 3, "grounding must stay small");
});

test("an unparseable URL is skipped rather than promoted into a failing fetch", () => {
  const chosen = groundingSources([hit("not a url"), hit("https://ok.test/1")]);
  assert.deepEqual(chosen.map((entry) => entry.url), ["https://ok.test/1"]);
});

test("duplicate URLs are promoted once", () => {
  const chosen = groundingSources([hit("https://a.test/1"), hit("https://a.test/1")]);
  assert.equal(chosen.length, 1);
});

test("🔴 a canvas with material is NEVER grounded from the web", () => {
  // Their lecture is the curriculum. Adding search results beside it dilutes the thing they came
  // to study with whatever a search engine returned.
  assert.equal(needsGrounding({ attachedSources: 1, topic: "innate immunity" }), false);
  assert.equal(needsGrounding({ attachedSources: 0, topic: "innate immunity" }), true);
  assert.equal(needsGrounding({ attachedSources: 0, topic: "   " }), false);
});
