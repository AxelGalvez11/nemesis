// Files sent with no words are a turn, and the first turn over a fresh pile orients before it teaches.
//
// Owner, 2026-09-03: *"once I drop it in, even if I don't drop in like a prompt or anything, I might
// usually say like 'help me learn this'... it should be able to say like, okay, yes, I see what you
// dropped in. You dropped in all these lectures that are about this. What would you like to learn
// first."* Measured on his own canvas that day: seven lectures, "help me learn this", and the reply
// taught lecture one's comparison table without naming the other six. And a send with files and no
// text produced NO turn at all: `beginOrAnswer` went to `begin(undefined)` and `converse` returned on
// an empty string.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ARRIVAL_UTTERANCE, stateBlock, type TurnContext } from "@/lib/learn/turn-router";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const CANVAS = read("./learning-canvas.tsx");
const SESSION = read("./use-canvas-session.ts");
const CHAT = read("./canvas-chat.ts");
const ROUTER = readFileSync(new URL("../../../lib/learn/turn-router.ts", import.meta.url), "utf8");

const BASE: TurnContext = {
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
  pinnedComments: "",
  projectInstructions: "",
  searchesLeft: 0,
  sources: 7,
  spokenConversation: false,
  stagedPassage: "",
  today: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  webContext: "",
};

test("🔴🔴 the state block says how many documents arrived with THIS message, and only then", () => {
  assert.doesNotMatch(stateBlock(BASE), /arrived with THIS message/, "an ordinary turn claims an arrival");
  const arrival = stateBlock({ ...BASE, arrived: 7 });
  assert.match(arrival, /7 sources attached\./);
  assert.match(arrival, /7 of them arrived with THIS message/);
  assert.doesNotMatch(arrival, /without writing anything/);
  const silent = stateBlock({ ...BASE, arrived: 7, saidNothing: true });
  assert.match(silent, /sent it without writing anything: read that as an open ask to help them learn it/);
});

test("🔴🔴 the router carries an ARRIVAL rule: say what arrived, then ask what to take first, suggest at most one approach", () => {
  assert.match(ROUTER, /"ARRIVAL\. When the state says documents arrived with THIS message/);
  assert.match(ROUTER, /name each document and what it covers in a few words/);
  assert.match(ROUTER, /Then ask what they "\s*\+\s*"want first, through \\"question\\" on a \\"study\\" turn/);
  assert.match(ROUTER, /You may add ONE suggestion for how to take the whole pile/);
  assert.match(ROUTER, /offer it, never impose it, and never by rote/);
  // Step 1's ban on asking "which part first" names the exception, or the two rules fight.
  assert.match(ROUTER, /The one exception is an ARRIVAL with open "\s*\+\s*"words/);
  // The one-sentence cap above a card yields to the account of what arrived.
  assert.match(ROUTER, /The ARRIVAL turn above is the one exception: there the account of what arrived comes first/);
});

test("🔴🔴 an empty send with committed files is a turn, not a bare begin", () => {
  assert.match(CANVAS, /if \(!trimmed && committedTitles\.current\.length === 0\) \{\s*session\.begin\(undefined\);/, "an empty send with files goes to begin again");
  assert.match(CANVAS, /const trimmed = asked\.trim\(\);\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(!trimmed && committedTitles\.current\.length === 0\) return null;/, "the canvas-side converse refuses empty words with files again");
  assert.match(SESSION, /if \(!said && !resumed && attaching\.current\.size === 0 && arrivals\.current === 0\) return null;/, "the session refuses an empty send with material in flight");
  assert.match(SESSION, /const arrived = arrivals\.current;\s*arrivals\.current = 0;\s*if \(!said && !resumed && arrived === 0\) return null;/, "the arrival count is not consumed by the turn");
  assert.match(SESSION, /askCanvasChat\(id, latest\.current, said, \{ \.\.\.surroundings, arrived \}/, "the packet does not learn how many documents arrived");
});

test("🔴 the model gets a sentinel for the empty words, and the learner's own text stays empty", () => {
  assert.equal(ARRIVAL_UTTERANCE, "(Sent documents without writing anything.)");
  assert.match(CHAT, /utterance: question\.trim\(\) \|\| ARRIVAL_UTTERANCE/, "an empty send puts an empty user message on the wire");
  assert.match(CHAT, /saidNothing: question\.trim\(\)\.length === 0/);
  // The recorded moment and the live bubble keep the empty text: nothing is forged in the learner's name.
  assert.match(CANVAS, /userText: trimmed,/);
  assert.match(CANVAS, /\{threadOpen && currentSaid\?\.trim\(\) && \(/);
  // The six-turn window keeps the arrival's reply, under the same sentinel the packet used.
  assert.match(CANVAS, /const exchange: TurnExchange = given\.said\.trim\(\) \? given : \{ \.\.\.given, said: ARRIVAL_UTTERANCE \};/);
});

test("🔴 a resumed arrival (the learner answered the card) is not refused for its empty words", () => {
  assert.match(SESSION, /const resumed = surroundings\.clarified\.length > 0;/);
});
