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
  assert.match(CANVAS, /\}, \[canvasId, openingAsk\]\);/, "the landing is no longer re-armed per canvas");
  // 🔴🔴 AND IT DOES NOT RUN ON A CANVAS THAT WAS JUST CREATED — that is the prompt bounce (owner,
  // 2026-09-01: *"there will be flickering of my prompt message"*). This loop drives the scroller to
  // its FOOT so a saved conversation reopens where you left it; the pin in learning-canvas.tsx
  // drives it toward the TOP so a freshly sent prompt sits where you can read it. Both run on
  // `LANDING_TICK_MS`. On a canvas opened from the front door both were armed at once and took
  // turns: filmed at full frame rate, scrollTop alternated 0, 160, 0, 160 and the learner's sentence
  // jumped 160px, five times, in half a second.
  //
  // There is nothing here for this loop to do on such a canvas — there is no earlier position to
  // restore, because there is no earlier anything. `openingAsk` is the fact "this canvas was opened
  // by someone pressing send", which is exactly when that is true.
  assert.match(CANVAS, /if \(openingAsk\) return;/, "the landing runs on brand-new canvases again, so it fights the prompt pin");
  // 🔴🔴 IT MUST OUTLAST THE OPEN, AND THE FIRST VERSION DID NOT. Measured on production after
  // shipping a 1.5s window: the conversation is not readable until 9.7s, so a window keyed to the
  // MOUNT expired before there was anything to scroll and the landing never fired once.
  const landing = figure(/const LANDING_MS = ([\d_]+);/, CANVAS);
  assert.ok(landing >= 10_000, `${landing}ms expires before a saved canvas has finished opening`);
  // 🔴 AND IT LETS GO ONCE THE THREAD STOPS GROWING, rather than running the whole window out.
  assert.match(CANVAS, /const LANDING_SETTLE_MS = \d+;/, "the landing no longer notices when the thread has arrived");
  assert.match(CANVAS, /\} else if \(tallest > 0 && Date\.now\(\) - grewAt > LANDING_SETTLE_MS\) \{/, "the landing runs its whole window instead of stopping when the thread settles");
  // 🔴 A POLL, NOT A FRAME LOOP: twelve seconds of rAF is hundreds of layout reads during the exact
  // load this must not slow down.
  assert.match(CANVAS, /timer = window\.setInterval\(step, LANDING_TICK_MS\);/, "the landing went back to a frame loop");
  assert.ok(!/raf = requestAnimationFrame\(step\)/.test(CANVAS), "the landing went back to a frame loop");
  // 🔴 REPOINTED 2026-09-03: the element's ref is `attachThread` now, a callback that sets
  // `threadRef.current` AND hands the node to `useAnchoredScroll` — which needs to be told when the
  // column appears, because it appears after the not-ready gate. This landing loop still drives
  // `threadRef` and is unaffected; what it needs is for something to keep populating it.
  assert.match(CANVAS, /ref=\{attachThread\}/, "the thread scroller lost its ref, so there is nothing to scroll");
  assert.match(CANVAS, /threadRef\.current = node;/, "the ref callback stopped populating threadRef, so the landing has nothing to scroll");
  // 🔴 INSTANT, NOT SMOOTH. Asked for in the same sentence as "quick not laggy"; a smooth scroll
  // through eight screens of a conversation already read is the opposite of arriving at the end.
  assert.ok(!/behavior: "smooth"[\s\S]{0,200}threadRef/.test(CANVAS), "the landing became a smooth scroll");
});

test("🔴🔴 the learner outranks the landing, instantly", () => {
  // A thread that hauls itself back down while somebody is reading upward is worse than one that
  // opens in the wrong place.
  for (const event of ["wheel", "touchmove", "keydown"]) {
    assert.ok(CANVAS.includes(`addEventListener("${event}", stop`), `${event} no longer stops the landing`);
    assert.ok(CANVAS.includes(`removeEventListener("${event}", stop)`), `${event} listener is leaked`);
  }
  // 🔴 THE WINDOW IS LONG — TWELVE SECONDS — AND THAT IS ONLY SAFE BECAUSE OF THE THREE LISTENERS
  // ABOVE. A learner's own scroll ends it on the first event, so the length is a ceiling on how
  // long it will WAIT for content, never on how long it can fight somebody.
  const window_ = figure(/const LANDING_MS = ([\d_]+);/, CANVAS);
  assert.ok(window_ <= 20_000, `${window_}ms is longer than anyone waits for a canvas at all`);
});
