import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MAX_SEARCH_ROUNDS } from "./canvas-chat";

/** Source with comments stripped, so prose about a rule is never mistaken for the rule. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const chat = code(readFileSync(new URL("./canvas-chat.ts", import.meta.url), "utf8"));

// 🔴 THE LOOP ENDS WHEN THE MODEL STOPS ASKING, NOT WHEN A COUNTER RUNS OUT.
//
// This used to be a single `if (decision?.needsWeb)` — exactly one search, and the packet told the
// model "the search has happened, answer from them". So a first query aimed slightly wrong ended
// the turn: the model had to answer from pages it had already judged unhelpful, with no way to say
// so. Owner: *"deepseek should decide itself when it has enough information to answer."*

test("the search runs in a loop, and its condition is the model's answer", () => {
  // 🔴 ANCHORED ON THE CONDITION, NOT ON THE `for` LINE OR A CHARACTER COUNT. This read
  // `chat.indexOf("for (let round = 0")` and then `slice(0, 120)` — both of which encoded the
  // assumption that the header fits on one line. Adding the papers lane (2026-08-24) wrapped it
  // across four, so the anchor missed entirely and the slice cut the condition in half: a guard
  // about WHAT ENDS THE LOOP reddened over how the line was formatted. The condition is what this
  // test is about, so the condition is what it reads, at any width.
  const start = chat.indexOf("round < MAX_SEARCH_ROUNDS");
  assert.notEqual(start, -1, "the search loop was replaced by a single pass again");
  const header = chat.slice(start, chat.indexOf("round += 1", start));
  assert.match(header, /decision\?\.needsWeb/, "the loop no longer ends on the model's own answer");
  // The bound is a backstop, not the decision. If `needsWeb` ever stops being in the condition,
  // the turn would search a fixed number of times whatever the model said.
  assert.match(header, /round < MAX_SEARCH_ROUNDS/);
  // 🔴 AND THE PAPERS LANE IS IN THE CONDITION TOO, because `needsPapers` can be true while
  // `needsWeb` is false — what has been SHOWN is usually not a question about what is current. A
  // loop gated on `needsWeb` alone would silently never fetch papers on exactly those turns.
  assert.match(header, /decision\?\.needsPapers && !papersFetched/, "a papers-only turn cannot enter the search loop");
});

test("what each search finds accumulates rather than replacing what came before", () => {
  // A later search narrows or corrects an earlier one. Dropping the earlier pages would make the
  // model re-find them, and would make an inline [3] in the answer point at whatever happened to
  // be third in the last batch rather than third in what it was shown.
  assert.match(chat, /const seen = new Set<string>\(\)/, "results are no longer deduplicated across rounds");
  assert.match(chat, /if \(seen\.has\(source\.url\)\) continue;/);
  assert.match(chat, /formatWebSearchContext\(sources\)/, "each round no longer re-numbers over everything gathered");
});

test("the model is told how much rope is left, rather than being cut off silently", () => {
  // A model that knows it has one search left spends it on its best query. One that is cut off
  // mid-thought has already wasted it, and answers as though it had looked everywhere.
  assert.match(chat, /MAX_SEARCH_ROUNDS - round - 1/, "searchesLeft is no longer counted down");
  assert.match(chat, /ask\("", MAX_SEARCH_ROUNDS\)/, "the first pass no longer states the full budget");
});

test("a failed round leaves the previous answer standing and stops", () => {
  // Better for the learner than an error, and a null decision cannot ask for another search — so
  // a provider that starts failing cannot spin the loop.
  assert.match(chat, /if \(!next\.text\) break;/);
});

test("the bound is a real number and small enough to be honest about", () => {
  assert.ok(MAX_SEARCH_ROUNDS >= 2, "one round is the single-search behaviour this replaced");
  assert.ok(MAX_SEARCH_ROUNDS <= 6, `${MAX_SEARCH_ROUNDS} rounds is a turn nobody is waiting through`);
});

// ── The freshness window reaches the provider ────────────────────────────────────────────────
//
// Owner, 2026-08-21: *"let the model pick freshness."* This is a five-file chain — the contract
// offers the field, the reader keeps it, the loop passes it, `searchWebContext` puts it in the
// body, and the edge function hands it to Brave — and a break anywhere in it is SILENT: the answer
// still arrives, it is simply built from pages of any age, with nothing on screen to say so. Each
// link is checked at its own end; this one guards the two in this file's reach.

test("🔴 the model's chosen window is passed to the search, not dropped at the call site", () => {
  const call = chat.slice(chat.indexOf("searchWebContext("));
  assert.match(call.slice(0, 220), /decision\.webFreshness/, "the window is decided and then thrown away");
});

test("🔴 and `searchWebContext` puts it on the wire", () => {
  const api = code(readFileSync(new URL("../../../lib/workspace/chat-api.ts", import.meta.url), "utf8"));
  const fn = api.slice(api.indexOf("export async function searchWebContext"));
  const body = fn.slice(0, fn.indexOf("if (!response.ok)"));
  assert.match(body, /\.\.\.\(freshness \? \{ freshness \} : \{\}\)/, "the window never reaches the request body");
});
