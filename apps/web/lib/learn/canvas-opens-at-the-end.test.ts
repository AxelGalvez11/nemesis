// Going back to an old canvas: where it lands, and how long it takes to get there.
//
// Owner, 2026-08-30: *"Going back to old pages should take user back to the most recent chat or
// output like in ChatGPT. It should be quick not laggy."*
//
// Both halves measured on production, in the owner's own signed-in browser, opening one saved
// canvas:
//
//   WHERE   every canvas opened at `scrollTop: 0` — the top of a conversation already read.
//   WHEN    the document was ready in 232ms and the conversation was not readable until 7,987ms.
//           48 writes to `knowledge_objects` and 48 to `learning_objectives`, ONE AT A TIME, the
//           last finishing at 13.8s. A second open seconds later did exactly the same again.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** The first capture of `re` in `src`, as a number, with any `_` digit separators removed. */
function figure(re: RegExp, src: string): number {
  return Number((re.exec(src)?.[1] ?? "").replace(/_/g, ""));
}

const KNOWLEDGE = readFileSync("lib/learn/canvas-knowledge.ts", "utf8");
const CANVAS = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");

test("🔴🔴 the knowledge replay runs in lanes, not one write after another", () => {
  // The 96 round trips are not the waste — the `await` in the loop was. Each object has its own
  // identity key, its own upsert and its own read-back; nothing about them is ordered.
  assert.match(KNOWLEDGE, /const WRITE_LANES = \d+;/, "the write concurrency is gone");
  const lanes = figure(/const WRITE_LANES = (\d+);/, KNOWLEDGE);
  assert.ok(lanes > 1, "one lane is the sequential loop this replaces");
  assert.ok(lanes <= 12, `${lanes} lanes is a burst on the learner's own database, and the browser queues most of it anyway`);
  assert.match(KNOWLEDGE, /await Promise\.all\(Array\.from\(\{ length: Math\.min\(WRITE_LANES, objects\.length\) \}, lane\)\)/, "the lanes no longer run together");
  // 🔴 AND NEITHER CALLER STILL WRITES IN SERIES.
  assert.ok(!/for \(const knowledge of objects\) \{\s*const stored = await saveKnowledge/.test(KNOWLEDGE), "the territory replay is sequential again");
  assert.ok(!/for \(const knowledge of \[\.\.\.extracted, \.\.\.mechanisms\]\) \{\s*const stored = await saveKnowledge/.test(KNOWLEDGE), "the document lane is sequential again");
});

test("🔴🔴 speed cannot change which question Nemesis asks first", () => {
  // Results land in indexed slots rather than being pushed as they finish, so the output is
  // byte-identical to the loop it replaces. `mergeObjectives` keeps the FIRST of a duplicated
  // identity and both callers sort on a key that can tie — an order that depended on which write
  // came back first would make the same canvas ask a different thing on a reload.
  assert.match(KNOWLEDGE, /const slots: ResolvedObjective\[\]\[\] = new Array\(objects\.length\);/, "results are no longer kept in input order");
  assert.match(KNOWLEDGE, /slots\[index\] = stored\.map\(\(objective\) => \(\{ knowledge, objective \}\)\);/, "results are being pushed as they finish");
  assert.match(KNOWLEDGE, /return slots\.filter\(Boolean\)\.flat\(\);/, "the slots are no longer read back in order");
});

test("🔴 it still writes through saveKnowledge, one object at a time", () => {
  // A batched upsert would be faster still and would be a SECOND implementation of the step the
  // cross-canvas evidence claim rests on. What changed is how many are in flight, and nothing else.
  assert.match(KNOWLEDGE, /const stored = await saveKnowledge\(userId, knowledge\);/, "the replay took a shortcut around saveKnowledge");
});

test("🔴🔴 an opening canvas lands on its most recent turn", () => {
  assert.match(CANVAS, /const LANDING_MS = [\d_]+;/, "the landing window is gone");
  assert.match(CANVAS, /if \(node\.scrollHeight > node\.clientHeight \+ 8\) node\.scrollTop = node\.scrollHeight;/, "the thread no longer opens at its foot");
  assert.match(CANVAS, /\}, \[canvasId\]\);/, "the landing is no longer re-armed per canvas");
  assert.match(CANVAS, /ref=\{threadRef\}/, "the thread scroller lost its ref, so there is nothing to scroll");
  // 🔴 INSTANT, NOT SMOOTH. Asked for in the same sentence as "quick not laggy"; a smooth scroll
  // through eight screens of a conversation already read is the opposite of arriving at the end.
  assert.ok(!/behavior: "smooth"[\s\S]{0,200}threadRef/.test(CANVAS), "the landing became a smooth scroll");
});

test("🔴🔴 the learner outranks the landing, instantly", () => {
  // A thread that hauls itself back down while somebody is reading upward is worse than one that
  // opens in the wrong place.
  for (const event of ["wheel", "touchmove", "keydown"]) {
    assert.ok(CANVAS.includes(`addEventListener("${event}", letGo`), `${event} no longer stops the landing`);
    assert.ok(CANVAS.includes(`removeEventListener("${event}", letGo)`), `${event} listener is leaked`);
  }
  const window_ = figure(/const LANDING_MS = ([\d_]+);/, CANVAS);
  assert.ok(window_ <= 3_000, `${window_}ms is long enough to fight a learner who is scrolling`);
  assert.ok(window_ >= 500, `${window_}ms ends before a thread that arrives in pieces has finished`);
});
