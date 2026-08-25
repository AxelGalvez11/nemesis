// A diagram is read once, ever — and the cache can never be the thing that breaks a turn.
//
// 🔴 OWNER 2026-08-25: *"I need image occlusion and diagrams to come clean and quick."* Quick is
// the whole reason `figure_occlusion_cache` exists. Producing one occlusion question costs a
// repository search, an image download and a vision read: tens of seconds, genuinely, and
// measured at more than 60 on a big picture. It is the SAME work every time, so the second learner
// to ask about a nephron pays nothing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROUTE = readFileSync(new URL("../../app/api/learn/figure-occlusion/route.ts", import.meta.url), "utf8");
const BARE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("🔴🔴🔴 the cache is consulted BEFORE any paid work", () => {
  // Reading it after the search or the vision call would make it a record of what happened rather
  // than a way to avoid doing it again.
  const lookup = BARE.indexOf("readCache(admin, key)");
  const search = BARE.indexOf("findReferenceImages(");
  const vision = BARE.indexOf("readImage(");
  assert.ok(lookup > 0, "the cache read is gone");
  assert.ok(lookup < search, "the repository search runs before the cache is checked");
  assert.ok(lookup < vision, "a vision read is paid for before the cache is checked");
});

test("🔴🔴🔴 a REFUSAL is cached too, not just a hit", () => {
  // 🔴 "this subject has no usable diagram" costs exactly as much to discover as a hit, and is far
  // more common — most subjects are not labelled diagrams. Caching only successes would mean every
  // hopeless subject paid full price forever, which is the majority of asks.
  assert.match(BARE, /async function refuse\(/, "refusals no longer go through one place");
  assert.match(BARE, /writeCache\(admin, key, answer\)/, "a refusal is not stored");
  // Every early exit after the key exists must go through it.
  const afterKey = BARE.slice(BARE.indexOf("const key = cacheKey"));
  const rawReturns = afterKey.match(/return NextResponse\.json\(\{ ok: false/g) ?? [];
  assert.equal(rawReturns.length, 0, `${rawReturns.length} refusals bypass the cache`);
});

test("🔴🔴 the cache never fails the request it exists to speed up", () => {
  // A cache that can throw is a downgrade. Both halves swallow, and the cost of a failure is one
  // re-read.
  for (const fn of ["async function readCache", "async function writeCache"]) {
    const body = BARE.slice(BARE.indexOf(fn), BARE.indexOf("}", BARE.indexOf("} catch", BARE.indexOf(fn))) + 1);
    assert.ok(body.length > 0, `${fn} is gone`);
    assert.match(body, /try \{/, `${fn} can throw into the request`);
  }
  assert.match(BARE, /catch \{\s*return null;\s*\}/, "readCache stopped degrading to a miss");
});

test("🔴🔴 a stored row is re-validated, never trusted", () => {
  // It was written by an EARLIER VERSION of this route, which is a different program. A row
  // missing its width would reach the renderer as viewBox="0 0 undefined undefined" and draw the
  // empty framed box this codebase has already shipped once.
  const read = BARE.slice(BARE.indexOf("async function readCache"), BARE.indexOf("async function writeCache"));
  assert.match(read, /allowedAssetUrl\(assetPath\)/, "a cached url is served without checking the allow list");
  assert.match(read, /width <= 0 \|\| height <= 0/, "a cached row with no size is served");
  assert.match(read, /!Array\.isArray\(row\.boxes\)/, "a cached row with no boxes is served");
});

test("🔴🔴 a refusal expires sooner than a hit, because they age differently", () => {
  // A diagram's printed labels do not move, so a hit keeps. A refusal often means the repositories
  // had nothing YET, or a provider was briefly down.
  const hit = /const HIT_TTL_MS = ([^;]+);/.exec(ROUTE);
  const refusal = /const REFUSAL_TTL_MS = ([^;]+);/.exec(ROUTE);
  assert.ok(hit && refusal, "the two lifetimes are gone");
  const value = (expr: string) => Function(`"use strict";return (${expr})`)() as number;
  assert.ok(value(refusal[1]!) < value(hit[1]!), "a refusal now outlives a hit");
});

test("🔴🔴 a refusal upserted over a hit CLEARS the old picture", () => {
  // Omitting the columns would leave a stale asset in place beside `ok: false` — a row that
  // contradicts itself, and whose picture would be served again the moment the flag was misread.
  const write = BARE.slice(BARE.indexOf("async function writeCache"), BARE.indexOf("async function refuse"));
  assert.match(write, /asset_path: answer\.ok \? answer\.asset\.assetPath : null/, "a stale asset survives a refusal");
  assert.match(write, /boxes: answer\.ok \? answer\.boxes : null/, "stale boxes survive a refusal");
  assert.match(write, /onConflict: "subject"/, "the upsert stopped keying on the subject");
});

test("🔴 the key normalises case and spacing, and nothing else", () => {
  // "Nephron", "nephron" and "  nephron " are one subject. Anything cleverer — stemming, synonyms,
  // dropping articles — starts MERGING subjects, and a merge here serves one diagram under
  // another's name.
  const key = BARE.slice(BARE.indexOf("function cacheKey"), BARE.indexOf("const HIT_TTL_MS"));
  assert.match(key, /toLowerCase\(\)/);
  assert.match(key, /replace\(\/\\s\+\/g, " "\)/, "spacing is no longer collapsed");
  assert.ok(!/stem|synonym|singular/i.test(key), "the key started interpreting the subject");
});

test("🔴🔴 the client waits longer than the server can take", () => {
  // 🔴 A CLIENT THAT GIVES UP FIRST ABANDONS A VISION READ WE HAVE ALREADY PAID FOR, and shows no
  // diagram anyway — the worst of both. This mismatch existed on the first cut: the route budgets
  // 56s of waiting inside a 60s function and the client gave up at 45.
  const client = readFileSync(new URL("./figure-occlusion-api.ts", import.meta.url), "utf8");
  const clientMs = Number(/FIGURE_OCCLUSION_TIMEOUT_MS = (\d+)/.exec(client)?.[1]);
  const maxDuration = Number(/export const maxDuration = (\d+)/.exec(ROUTE)?.[1]);
  assert.ok(Number.isFinite(clientMs) && Number.isFinite(maxDuration), "one of the two budgets is unreadable");
  assert.ok(clientMs / 1000 > maxDuration, `the client gives up at ${clientMs / 1000}s on a ${maxDuration}s function`);
});

console.log("occlusion-cache.test.ts OK");
