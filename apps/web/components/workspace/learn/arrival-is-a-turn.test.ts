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
  assert.match(SESSION, /askCanvasChat\(id, latest\.current, said, \{ \.\.\.surroundings, arrived, \.\.\.extra \}/, "the packet does not learn how many documents arrived");
});

test("🔴 the model gets a sentinel for the empty words, and the learner's own text stays empty", () => {
  assert.equal(ARRIVAL_UTTERANCE, "(Sent documents without writing anything.)");
  assert.match(CHAT, /utterance: question\.trim\(\) \|\| ARRIVAL_UTTERANCE/, "an empty send puts an empty user message on the wire");
  assert.match(CHAT, /saidNothing: question\.trim\(\)\.length === 0/);
  // The recorded moment and the live bubble keep the empty text: nothing is forged in the learner's name.
  // `shown` is the learner's own words: their note when the reader handed one over, otherwise exactly
  // what they typed — and on an arrival that is still nothing at all (annotation-finish.test.ts).
  assert.match(CANVAS, /userText: shown,/);
  assert.match(CANVAS, /const shown = fromReader\.said\?\.trim\(\) \|\| trimmed;/);
  assert.match(CANVAS, /\{threadOpen && currentSaid\?\.trim\(\) && \(/);
  // The six-turn window keeps the arrival's reply, under the same sentinel the packet used.
  assert.match(CANVAS, /const exchange: TurnExchange = given\.said\.trim\(\) \? given : \{ \.\.\.given, said: ARRIVAL_UTTERANCE \};/);
});

test("🔴 a resumed arrival (the learner answered the card) is not refused for its empty words", () => {
  assert.match(SESSION, /const resumed = surroundings\.clarified\.length > 0;/);
});

test("🔴🔴 a \"study\" that cannot run on a fresh canvas is re-asked once as a reply, never left as a stub", () => {
  // Measured on production 2026-09-03: the learner picked "COPD and asthma" on the arrival card and
  // the whole answer was "The files are on the screen. Pick where you want to begin."
  assert.match(SESSION, /const runTurn = \(extra: Partial<TurnSurroundings> = \{\}\) => askCanvasChat\(/, "the turn cannot be re-asked");
  assert.match(SESSION, /if \(result\.decision\?\.then === "study" && !result\.decision\.question && isPreContent\(latest\.current\.state\)\) \{\s*result = await runTurn\(\{ studyUnavailable: true \}\);/, "a study on a pre-content canvas is not re-asked");
  assert.match(CHAT, /\.\.\.\(surroundings\.studyUnavailable \? \{ studyUnavailable: true \} : \{\}\)/, "the re-ask's fact does not reach the packet");
  const line = stateBlock({ ...BASE, studyUnavailable: true });
  assert.match(line, /Nothing can be built on this canvas this turn/);
  assert.match(line, /Answer as a full "reply" and teach what they asked for right here/);
  assert.doesNotMatch(stateBlock(BASE), /Nothing can be built/);
  assert.match(ROUTER, /Once they "\s*\+\s*"have answered the card, the next turn is a \\"reply\\" that teaches what they picked/);
});

test("🔴🔴 a turn the door took is remembered as done, so the next ask is not re-answered", () => {
  // Measured on production 2026-09-03: "make me flashcards on the transporters" made its deck through
  // the phrase door, the window kept that line with an EMPTY reply, and the next ask (a mind map)
  // came back "let me take the transporter request first", made a second deck, and claimed a map it
  // never drew.
  assert.match(CANVAS, /const made = withCapability && isMakerCapability\(withCapability\) \? withCapability : readDeliverableAsk\(trimmed\);/);
  assert.match(CANVAS, /const doorReply = !decision && made \? `\(Nemesis made the \$\{MADE_NOUN\[made\]\} from the material; it is open beside the conversation\.\)` : "";/);
  assert.match(CANVAS, /remember\(\{ replied: decision\?\.say \?\? doorReply, said: trimmed \}\);/, "a door-made turn is filed with an empty reply again");
  for (const kind of ["document", "flashcards", "note", "pdf", "report", "sheet", "slides"]) {
    assert.match(CANVAS, new RegExp(`\\b${kind}: "`), `${kind} has no learner-facing noun in MADE_NOUN`);
  }
});

test("🔴🔴 files sent from the FRONT DOOR with no words are an arrival turn too", () => {
  // The front door sends files-without-a-sentence as `/learn?new=1` with no `?ask=`, so the
  // opening-ask effect never runs. Found on production 2026-09-04: one PDF, Enter, thirty seconds of
  // nothing. The files effect now runs the same arrival the composer's empty send runs.
  assert.match(
    CANVAS,
    /if \(!openingAsk\) \{\n\s+committedTitles\.current = waiting\.map\(\(entry\) => entry\.file\.name\);\n\s+beginOrAnswer\(""\);\n\s+\}/,
    "the front door's files-only send asks nothing",
  );
  // And the ask effect is untouched: words from the front door still go through it once.
  assert.match(CANVAS, /if \(!openingAsk \|\| askedOnce\.current \|\| !session\.ready\) return;/);
});
