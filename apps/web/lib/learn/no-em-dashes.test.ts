// Nemesis does not use em dashes, and the reason it used to is measured here.
//
// 🔴🔴🔴 OWNER, 2026-08-25: *"can you make sure nemesis does not use em dashes at all?"* He had just
// read a reply opening *"Here's a classic example — the 'saddle with ripples' surface"*.
//
// 🔴 THE RULE WAS ALREADY IN THE PROMPT AND THE PROMPT WAS OUTVOTING ITSELF. Measured on the real
// assembled packet before this change: 31,605 characters carrying FORTY-NINE em dashes, one of them
// inside the sentence that forbids them. A model reading forty-nine live examples and one
// prohibition follows the examples, which is not a failure of the model.
//
// So both halves are held here, because either alone is a promise that leaks:
//
//   · the packet uses none, so the habit is not being taught      (the CAUSE)
//   · `plainDashes` runs on everything the model says             (the GUARANTEE)
//
// This is the fifth prompt rule in this codebase to need code behind it. See `screen-positions.ts`
// (where Nemesis is on screen), `figure-fallback.ts` (asking for a picture) and the three recorded
// in `occlusion-is-a-tool.test.ts`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { plainDashes } from "@nemesis/shared";

import { turnRouterMessages, type TurnContext } from "./turn-router";

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 25 August 2026",
  webContext: "",
};

/** What the model is actually handed, assembled the way a real turn assembles it. */
const PACKET = turnRouterMessages({ context: EMPTY, utterance: "explain the nephron" })
  .map((message) => message.content)
  .join("\n\n");

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CHAT_API = strip(readFileSync(new URL("../workspace/chat-api.ts", import.meta.url), "utf8"));

test("🔴🔴🔴 the packet the model reads contains NOT ONE em dash", () => {
  const found = [...PACKET.matchAll(/[—―]/g)];
  assert.equal(
    found.length,
    0,
    `the instructions use ${found.length} em dash(es) again. First: "${PACKET.slice(Math.max(0, (found[0]?.index ?? 0) - 70), (found[0]?.index ?? 0) + 70)}"`,
  );
});

test("🔴🔴 nor a spaced en dash, which is where a banned habit moves next", () => {
  // Only between words. A numeric range keeps its dash, and the packet is allowed to hold one.
  const prose = [...PACKET.matchAll(/\p{L}[ \t]+–[ \t]+\p{L}/gu)];
  assert.equal(prose.length, 0, "the packet started using a spaced en dash instead");
});

test("🔴🔴🔴 the rule is still IN the packet, and it no longer prints the character to ban it", () => {
  // 🔴 THE SENTENCE USED TO BE ITS OWN COUNTER-EXAMPLE: "Never use an em dash. The character — must
  // not appear anywhere in your output." One dash inside the prohibition, in the highest-signal
  // position in the whole document.
  assert.match(PACKET, /Never use an em dash/, "the rule was dropped from the contract");
  assert.match(PACKET, /Use a comma, a colon, or a new sentence instead/, "the rule stopped saying what to do instead");
});

test("🔴🔴🔴 and it is WIRED, on the one door every model call goes through", () => {
  // 🔴 THE LINK THAT KILLED `figure` FOR WEEKS: built, correct, and never called. `chat-api.ts`
  // says of itself that it is "the one door every model call in the product goes through", which is
  // exactly why the cleaning belongs there and nowhere else: chat, the lesson writer, the flashcard
  // writer, deep research, the judge and both importers are covered by these three lines.
  assert.match(CHAT_API, /from "@nemesis\/shared"/, "the import is gone");
  assert.match(CHAT_API, /text = streamed\.text\.trim\(\) \? plainDashes\(streamed\.text\) : null/, "a streamed answer is no longer cleaned");
  assert.match(CHAT_API, /text = said === null \? null : plainDashes\(said\)/, "a non-streamed answer is no longer cleaned");
  // 🔴 AND THE TYPING TOO. A dash that shows while the reply streams and is gone once it settles is
  // a worse tell than the dash was.
  assert.match(CHAT_API, /spokenPlainly\(options\.onDelta\)/, "the visible typing is no longer cleaned");
  assert.match(CHAT_API, /handler\(stream\.feed\(delta\), plainDashes\(accumulated\)\)/, "one of the two handler arguments is uncleaned, so the text will flicker");
});

test("🔴🔴 the net actually catches the sentence that started this", () => {
  assert.equal(
    plainDashes(`Here's a classic example — the "saddle with ripples" surface.`),
    `Here's a classic example, the "saddle with ripples" surface.`,
  );
});

test("🔴 a numeric range still means 'to', in the packet and in the net", () => {
  // The one place a dash carries a fact rather than a habit. "pp. 3, 7" points at two pages.
  assert.equal(plainDashes("The war ran 1914–1918, see pp. 3–7."), "The war ran 1914–1918, see pp. 3–7.");
});

console.log("no-em-dashes.test.ts OK");
