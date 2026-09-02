// Three faults the owner reported on 2026-09-02, two of which I caused in #1042.
//
// 1. *"the movement of the mascot and the chat composer when it's supposed to be animating and
//    moving into place becomes super laggy and glitchy."*
// 2. *"the actual chat bubble of the user isn't right… it sort of stays like a single shape."*
// 3. *"whenever I switch chats the user bubbles aren't changing into the history of the chat…
//    the conversation history is not saving or something."*
//
// Measured before fixing, at full frame rate on production, over the 1,960ms arrival:
//
//   composer: 103 distinct positions   mascot: 17
//
// Seventeen is `MEASURE_MS` — the dock polls its anchor eight times a second, which is ample for a
// composer that grows a line and useless against one that is being ANIMATED. So the character
// crawled at 8fps beside a composer running at 60. After: 2.
//
// And the history one was not a saving fault at all. Read straight out of the row he linked
// (`ba87076e…`): one moment, `userText` "what can you teach me?", a full `assistantText`. On screen:
// the answer, no question, zero turns.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const DOCK = readFileSync("components/character/character-dock.tsx", "utf8");
const CANVAS = readFileSync("components/workspace/learn/learning-canvas.tsx", "utf8");
const UTTERANCE = readFileSync("components/workspace/learn/learner-utterance.tsx", "utf8");

test("🔴🔴🔴 the dock aims at where its anchor SITS, never at where an animation is holding it", () => {
  // A poller cannot follow a transform. `getBoundingClientRect` reports the painted box, so while
  // the composer is mid-arrival every measurement lands on a different intermediate position and
  // the character is dragged along in 120ms steps — each one also restarting its own 680ms
  // correction toward a target that has already moved again.
  assert.match(DOCK, /function restingRect\(el: HTMLElement\): DOMRect \{/, "the dock is measuring painted boxes again, so it will chase animations");
  assert.match(DOCK, /const r = restingRect\(el\);/, "the anchor measurement went back to getBoundingClientRect");
  assert.match(DOCK, /restingRect\(popover\)/, "the open menu is measured as painted, so it drags the character while it animates");
  // 🔴 THE ELEMENT'S OWN TRANSFORM ONLY. An animated ANCESTOR — the shell's rail column — is real
  // layout as far as this dock is concerned, and the character is supposed to ride it.
  assert.ok(
    !/offsetParent[\s\S]{0,80}transform/.test(strip(DOCK)),
    "the resting rectangle started walking up the tree; an animated ancestor is layout, not an animation to ignore",
  );
});

test("🔴🔴 the arrival marker is a prop on the bubble, never an element around it", () => {
  // 🔴 THIS IS THE SECOND TIME THE MARKER'S PLACEMENT BROKE SOMETHING, AND THE FIRST FIX CAUSED THE
  // SECOND FAULT. #1042 put `data-learner-said` on the COLUMN — the column is already almost where
  // it ends up, so the sentence rose 446px and moved 79px sideways, a lift rather than a flight.
  // Moving it to a `<span>` around the pill fixed the flight and broke the bubble: a span is
  // inline, so `max-width: 70%` no longer had a definite containing block to resolve against and
  // the bubble collapsed to a narrow blob that wrapped short messages. Measured on production the
  // owner's own sentence wrapped onto two lines at ~155px; ChatGPT renders the same length on one.
  assert.match(UTTERANCE, /live\?: boolean;/, "the bubble lost the prop that marks the newest exchange");
  assert.match(UTTERANCE, /\{\.\.\.\(live \? \{ "data-learner-said": "" \} : \{\}\)\}/, "the marker stopped landing on the bubble itself");
  assert.ok(
    !/<span data-learner-said>/.test(CANVAS),
    "the bubble is wrapped in an element again — a percentage max-width cannot resolve against an inline box",
  );
  assert.match(CANVAS, /<LearnerUtterance live via=\{currentSaidVia\}>/, "the live bubble stopped being marked, so the arrival has nothing to fly");
  // The reference's own numbers, re-measured 2026-09-02 in the owner's account: 70% of a 768px
  // column, radius 22, padding 10/16, 16px on 24. Ours already said all four; the wrapper is what
  // stopped them applying.
  assert.match(UTTERANCE, /max-w-\[70%\] rounded-\[22px\] px-\[16px\] py-\[10px\]/, "the bubble drifted off the reference's measurements");
});

test("🔴🔴🔴 reopening a chat brings back the QUESTION, not just the answer", () => {
  // The thread deliberately holds its newest exchange back when the live region is showing it —
  // and `use-canvas-session.ts` restores that exchange by seeding `aside` with `lastThingSaid`,
  // which is the assistant half and nothing else. So the newest question was dropped from the
  // thread and restored nowhere. On a canvas with exactly ONE exchange the thread is then empty and
  // the whole conversation is one orphaned reply with no bubble above it.
  assert.match(CANVAS, /const held = liveShowsLast \? restored\.at\(-1\) : null;/, "the held-back turn is no longer identified, so its question cannot come back");
  assert.match(CANVAS, /if \(held\?\.said\) \{\s*setCurrentSaid\(held\.said\);/, "the restored question is gone again");
  assert.match(CANVAS, /setCurrentSaidVia\(held\.saidVia \?\? null\);/, "a restored spoken turn loses the fact that it was spoken");
  // 🔴 FROM `restored`, NOT RE-DERIVED. The turn the thread just decided to hold back is the exact
  // turn the live region has to show; taking it from the same array is what stops the two
  // disagreeing about which one that is.
  assert.match(
    CANVAS,
    /setThread\(liveShowsLast \? restored\.slice\(0, Math\.max\(0, restored\.length - 1\)\) : restored\);/,
    "the thread stopped holding the live turn back, so it will now be drawn twice",
  );
});
