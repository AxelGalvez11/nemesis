// Opening an old canvas puts the learner back in their conversation.
//
// 🔴🔴🔴 OWNER, 2026-08-25, WITH A SCREENSHOT: *"i never want to see this ever. i clicked on an
// older canvas and got this."* The screen read *"Nemesis hasn't found anything to ask you about
// yet"* with a Try again button. His own diagnosis was right:
//
//   *"it seems clicking on to older canvases causes canvas to look for material to teach
//    automatically (this is a rigid behavior). a chatbot style interface wouldnt do this, it would
//    just take user to where the user left off in the conversation"*
//
// Two things were true at once, and each alone would have produced it:
//
//   1. THE REPLY LANE HAS NO MEMORY. `aside` is React state and starts null, so a canvas whose
//      whole content was a conversation reopened with an empty surface. The conversation itself was
//      never lost: `moments` has carried up to 80 turns of `userText`/`assistantText` since the
//      History Rail shipped. Nothing read them back.
//   2. THE STAND-IN ACCUSED THE MATERIAL THAT DID NOT EXIST. `quiet` is honest about a lecture that
//      produced no questions. On a canvas with no sources, nothing was attached, so nothing was
//      searched, so there is nothing to have failed to find.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { lastThingSaid } from "@/lib/learn/canvas-moment";
import { canvasPresentation } from "./canvas-presence";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SESSION = strip(readFileSync(new URL("./use-canvas-session.ts", import.meta.url), "utf8"));
const CANVAS = strip(readFileSync(new URL("./learning-canvas.tsx", import.meta.url), "utf8"));

const moment = (kind: string, assistantText?: string) =>
  ({ id: `m${assistantText ?? kind}`, kind, occurredAt: "2026-08-25T10:00:00.000Z", ...(assistantText ? { assistantText } : {}) }) as never;

test("🔴🔴🔴 the last thing Nemesis said is recoverable from a reopened canvas", () => {
  const said = lastThingSaid([
    moment("assistant", "A nephron is the filtering unit of the kidney."),
    moment("question"),
    moment("assistant", "The loop of Henle concentrates the filtrate."),
  ]);
  assert.equal(said, "The loop of Henle concentrates the filtrate.", "the conversation cannot be restored");
});

test("🔴🔴 only an assistant turn counts, because only that one carries an answer", () => {
  // A `user` moment started a lesson and has no answer of its own.
  assert.equal(lastThingSaid([moment("user"), moment("question"), moment("response")]), null);
  assert.equal(lastThingSaid([]), null);
  // An empty or whitespace answer is not something to put back on screen.
  assert.equal(lastThingSaid([moment("assistant", "   ")]), null);
});

const surface = (input: Parameters<typeof canvasPresentation>[0]) => canvasPresentation(input).presence;

test("🔴🔴🔴 a reopened conversation shows the conversation, not the stand-in", () => {
  // With the aside seeded from the last turn, the reply lane owns the surface.
  assert.equal(
    surface({ aside: "reply", blocks: 0, canvasState: "learn", hasMaterial: false, policyPresenting: false, working: false }),
    "reply",
  );
});

test("🔴🔴🔴 with nothing attached, an empty canvas INVITES rather than accusing", () => {
  // 🔴 THE EXACT SCREEN THE OWNER PHOTOGRAPHED. No sources, no blocks, nothing running: "Nemesis
  // hasn't found anything to ask you about yet" is a report on a search that never happened.
  assert.equal(
    surface({ aside: "none", blocks: 0, canvasState: "learn", hasMaterial: false, policyPresenting: false, working: false }),
    "invitation",
  );
});

test("🔴🔴 and `quiet` still says the true thing when material really did come up empty", () => {
  // The state has its own reason to exist: 2026-08-21, a 276-page lecture that produced no
  // questions. Deleting it would replace an honest report with a cheerful blank page.
  assert.equal(
    surface({ aside: "none", blocks: 0, canvasState: "learn", hasMaterial: true, policyPresenting: false, working: false }),
    "quiet",
  );
});

test("🔴🔴🔴 a canvas holding a LESSON still reopens on the lesson", () => {
  // 🔴 THE REGRESSION THIS RULE IS SHAPED TO AVOID. `reply` outranks `reading`, so seeding the last
  // chat line on a canvas that holds a document would show one sentence INSTEAD of the lesson it
  // was said beside. The seed is therefore gated on there being no blocks at all.
  assert.match(SESSION, /found\.blocks\.length === 0 \? lastThingSaid\(found\.moments\) : null/, "the seed stopped being gated on an empty document");
  assert.equal(
    surface({ aside: "none", blocks: 12, canvasState: "learn", hasMaterial: true, policyPresenting: false, working: false }),
    "reading",
  );
});

test("🔴🔴🔴 it is WIRED: the load path seeds it and the surface is told about material", () => {
  // The link that killed `figure` for weeks: built, correct, and never called.
  // 🔴 UNCONDITIONAL SINCE 2026-09-02, AND THE `if` WAS A BUG OF ITS OWN. Restoring only when there
  // is something to restore left the PREVIOUS conversation's reply on screen when a learner switched
  // to a chat that had nothing — `LearningCanvas` is the same component either side of a switch, so
  // React keeps the state. What this guard protects is unchanged: a reopened conversation lands back
  // in itself. The null branch is what makes that true of the chat you switch AWAY from too.
  assert.match(SESSION, /setAside\(said \? \{ blockId: null, kind: "reply", text: said \} : null\);/, "a reopened canvas no longer restores its conversation");
  assert.match(CANVAS, /hasMaterial: canvas\.sources\.length > 0/, "the surface is guessing again about whether there was material");
});

console.log("reopen-lands-in-the-conversation.test.ts OK");
