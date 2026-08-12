import assert from "node:assert/strict";

import { formatWebSearchContext, numberWebResults, usableWebResults, type ChatWebResult } from "./chat-web-search";

// What this file USED to assert: that shouldSearchWeb("Who won the World Cup?")
// was true and shouldSearchWeb("What is a beta blocker?") was false — eight
// keyword judgements standing in for a routing decision. Every one of them
// passed while the same function searched the live web to answer "who are
// you?". A test can only pin the examples somebody thought of, and the cases
// nobody thought of were the product. The decision moved to the model
// (agent-tools.ts:search_web) and the acceptance set that scores it lives in
// source-routing-cases.ts. What is left here is the plumbing that carries
// results back, which is genuinely mechanical and genuinely worth pinning.

const result = (n: number): ChatWebResult => ({ description: `Result ${n}.`, title: `Example ${n}`, url: `https://example.com/${n}` });

// The fenced block the model reads, numbered as it must cite.
{
  const block = formatWebSearchContext([{ ...result(1), n: 1 }]);
  assert.match(block, /URL: https:\/\/example\.com\/1/);
  assert.match(block, /^1\. Example 1$/m, "the citation number leads the result");
}

assert.equal(formatWebSearchContext([]), "", "no results is no block, not an empty fence");

// 🔴 THE NUMBERS CONTINUE ACROSS SEARCHES. The model may search several times
// in one turn; [n] resolves positionally against the sources stored on the
// message, so a later batch that restarted at 1 would point every pill from it
// at a page from the first batch.
//
// 🔴 AND THE TEST MUST ACCUMULATE THE WAY THE CALLER DOES. `added` is the
// DELTA, not the running list. Feeding one call's `added` straight into the
// next as its `already` argument agrees with the real caller only at the first
// step — where `already` was empty and so the delta happens to equal the whole
// list — and diverges from the second step onward. That is why there are three
// searches here and not two: two would pass against a broken implementation.
{
  const sources: ChatWebResult[] = [];
  const search = (fresh: ChatWebResult[]) => {
    const { added, numbered } = numberWebResults(sources, fresh);
    sources.push(...added);
    return numbered;
  };
  assert.deepEqual(search([result(1), result(2)]).map((item) => item.n), [1, 2]);
  assert.deepEqual(search([result(3)]).map((item) => item.n), [3]);
  assert.deepEqual(search([result(4), result(5)]).map((item) => item.n), [4, 5], "the third search keeps counting");
  assert.deepEqual(sources.map((item) => item.url), [1, 2, 3, 4, 5].map((n) => `https://example.com/${n}`));
}

// Two searches on one topic legitimately return the same page. Cited twice
// under two numbers it reads as two independent sources agreeing.
{
  const sources: ChatWebResult[] = [];
  const search = (fresh: ChatWebResult[]) => {
    const { added, numbered } = numberWebResults(sources, fresh);
    sources.push(...added);
    return numbered;
  };
  search([result(1), result(2)]);
  assert.deepEqual(search([result(2), result(3)]).map((item) => item.n), [2, 3], "the repeat keeps its original number");
  assert.equal(sources.length, 3, "the repeat is not stored twice");
}

// A result with no URL cannot be opened or cited, so it never takes a number.
{
  const { numbered } = numberWebResults([], [{ description: "No link.", title: "Orphan", url: "" }, result(1)]);
  assert.deepEqual(numbered.map((item) => item.url), ["https://example.com/1"]);
}

assert.equal(usableWebResults(Array.from({ length: 25 }, (_, index) => result(index))).length, 10, "capped at MAX_WEB_RESULTS");

console.log("chat-web-search.test.ts OK");
