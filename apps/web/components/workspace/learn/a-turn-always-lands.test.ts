// A send always ends in something the learner can see.
//
// 🔴🔴🔴 THIS FILE EXISTS BECAUSE A FIX FOR AN ANNOYING MESSAGE PRODUCED A BLANK SCREEN, WHICH IS
// WORSE. The owner, 2026-08-24: *"[it] keeps saying that annoying thing, 'Nemesis had nothing to
// add'. Why is that even there? I don't even want that."* Correct — it was an error banner for
// something that is usually not an error: a turn whose work WAS the thing on screen.
//
// The first fix was `if (!decision.say) return null`, and it did not ask whether anything else had
// happened. Measured on production minutes later: "Show me a diagram of meiosis" came back with no
// prose, and the canvas stayed EMPTY for a full minute — no error, no picture, nothing to retry.
// Stored canvas e5e484dd, moment kind `user`, assistantText null. The learner cannot tell that
// apart from a request that never sent.
//
// So the rule is about what the turn PRODUCED, not about whether it spoke, and these tests hold
// the four cases apart. The one that matters most is the middle one: a turn that drew a picture
// and said nothing must render the picture, because "show me a diagram" is exactly that turn.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SESSION = strip(readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8"));

/** The reply branch, from the empty-prose test to the aside it guards. */
const BRANCH = SESSION.slice(SESSION.indexOf("const drew = decision.visuals.length"), SESSION.indexOf("setAside({", SESSION.indexOf("const drew = decision.visuals.length")));

test("🔴🔴🔴 an empty turn is never silent AND never a blank screen", () => {
  assert.ok(BRANCH.length > 0, "the empty-prose branch is gone — this guard is pointed at nothing");
  // The bare form is the bug: it returns null without asking whether anything was produced.
  assert.ok(
    !/if \(!decision\.say\) return null;/.test(SESSION),
    "a turn with no prose bails out without checking whether it drew or asked anything — that is the blank screen",
  );
  assert.match(BRANCH, /if \(!decision\.say && !drew\)/, "the guard no longer considers what the turn drew");
  assert.match(BRANCH, /if \(!asked\) setError\(/, "a turn that produced nothing at all now fails silently");
});

test("🔴🔴 a turn that DREW but said nothing still renders — that is 'show me a diagram'", () => {
  // The middle case, and the reason the guard is not simply `if (!say) setError`. A figure with no
  // sentence beside it is a complete answer to "show me a diagram of meiosis"; refusing it would
  // undo the whole figure lane.
  assert.match(BRANCH, /const drew = decision\.visuals\.length > 0;/, "the branch stopped noticing that a turn drew something");
  assert.ok(!/!decision\.say\s*\)\s*\{\s*setError/.test(BRANCH), "a drawn answer with no prose is reported as an empty turn");
});

test("🔴 a check with no prose stays quiet, because the chips are already on screen", () => {
  // The chips are their own surface and mount from `testRequested`; an error above them would be
  // the original complaint all over again.
  assert.match(BRANCH, /const asked = \(decision\.check\?\.questions\.length \?\? 0\) > 0;/, "the branch no longer notices a check");
});

test("🔴🔴 the sentence describes the LEARNER'S request, never Nemesis's state", () => {
  // 🔴 THAT DISTINCTION IS THE WHOLE OF THE OWNER'S OBJECTION. "Nemesis had nothing to add" reports
  // an internal condition and gives the learner nothing to do. The replacement says what happened
  // to the thing they asked for, and what will happen if they ask again.
  assert.ok(!/Nemesis had nothing to add/.test(SESSION), "the banned sentence is back");
  assert.match(SESSION, /That came back empty\. Ask again and it will retry\./, "the honest replacement is gone");
});

console.log("a-turn-always-lands.test.ts OK");
