// Every link in the chain from "the model may ask" to "the learner sees a covered diagram".
//
// 🔴🔴🔴 THIS FILE EXISTS BECAUSE OF WHAT HAPPENED TO `figure`. That capability was BUILT, its
// renderer WORKED, and it produced nothing for weeks — five separate links were broken, each one
// only visible after the one above it was fixed: named to the model → its shape stated → the model
// actually asks → the marker parses → the asset resolves → it RENDERS. There was a test for the
// first link and none for the last, so the gap between them swallowed the whole feature and
// nothing failed loudly.
//
// Occlusion has the same shape and one more link, because it also costs money:
//
//   1. named to the model            (the contract paragraph)
//   2. its field shape stated        (the JSON skeleton — shown FILLED IN, never as null)
//   3. read off the decision         (`checkFigure` survives parsing)
//   4. a route that can answer it    (the picture is found and vision reads it)
//   5. a client that calls the route (and never throws)
//   6. the questions get built       (`withFigureQuestions`)
//   7. THE PICTURE IS RENDERED       (`canvas-check.tsx` mounts a renderer)
//
// Every one of those is asserted below. The last is the one that killed `figure`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCardsFigure, readCardsJson } from "./canvas-deliverables";
import { turnRouterMessages, type TurnContext } from "./turn-router";

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  spokenConversation: false,
  materialContext: "",
  memory: "",
  projectInstructions: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  pinnedComments: "",
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 18 August 2026",
  webContext: "",
};

/** What the model is actually told, assembled the way the real turn assembles it. */
const PACKET = turnRouterMessages({ context: EMPTY, utterance: "quiz me on the nephron" })
  .map((message) => message.content)
  .join("\n\n");
const ROUTER = strip(read("./turn-router.ts"));
const CHECK_CARD = strip(read("../../components/workspace/learn/canvas-check.tsx"));
const SESSION = strip(read("../../components/workspace/learn/use-canvas-session.ts"));
const ROUTE = strip(read("../../app/api/learn/figure-occlusion/route.ts"));
const DELIVERABLES = strip(read("./canvas-deliverables.ts"));

test("🔴🔴🔴 link 1: the model is TOLD it can ask for a diagram to be tested on", () => {
  // `figure` failed here in spirit: it was named, but nothing said what to write in its one field.
  assert.match(PACKET, /checkFigure/, "the model is never told this field exists");
  assert.match(PACKET, /image occlusion|covers one labelled part|Which part is covered/i, "nothing explains what it does");
});

test("🔴🔴🔴 link 2: its shape is stated, and stated FILLED IN", () => {
  // 🔴 THE EXACT MISTAKE THAT KILLED `visuals`. It appeared in the JSON skeleton as `"visuals": []`
  // — an empty array in the contract's highest-signal position — and the model dutifully sent an
  // empty array on every single turn, including when it had just written `[figure 1]` in the prose.
  // A field shown as `null` teaches the model to send null.
  assert.match(PACKET, /"checkFigure": "nephron"/, "checkFigure is shown empty, so it will arrive empty");
  // And the SHORTEST-NAME rule, which is the other scar: "the stages of meiosis" fetched
  // *Naegleria fowleri*, "diagram of meiosis showing both divisions" fetched human skin.
  assert.match(PACKET, /SHORTEST NAME/, "the packet no longer demands an index-style name");
});

test("🔴🔴 link 3: it survives parsing, and only when a test was asked for", () => {
  // 🔴 REPOINTED 2026-08-26: "asked for" now includes flashcards, which open the same card and can
  // carry the same covered diagram. The PROPERTY is unchanged and is the one that matters — a
  // `checkFigure` is only read when the learner actually asked to be checked or to review, so a
  // turn that asked for neither never buys a vision read for a picture nothing will show.
  assert.match(
    ROUTER,
    /checkFigure: parsed\.wantsTest === true \|\| parsed\.wantsCards === true \? readFigureSubject\(parsed\.checkFigure\) : null/,
    "checkFigure is read some other way",
  );
  // 🔴 A `checkFigure` WITHOUT `wantsTest` WOULD BUY A VISION READ FOR A PICTURE NOTHING SHOWS.
  // Vision is the one primitive with no entitlement and no counter; a field that spends money on a
  // turn with nothing to render it is a bill with no product.
  assert.ok(!/checkFigure: readFigureSubject/.test(ROUTER), "a figure is resolved on turns with no test");
});

test("🔴🔴 link 4: the route measures the picture instead of asking the model how big it is", () => {
  // 🔴 `OCCLUSION_VISION_PROMPT` ITSELF SAYS "Do NOT report the image's size", because a vision
  // model does not reliably know and will confidently say 1024 for a 3024-wide picture. Believing
  // it puts EVERY mask somewhere wrong, which reads to the learner as "this feature is broken".
  assert.match(ROUTE, /imageSize\(bytes\)/, "the route stopped measuring the picture from its bytes");
  assert.match(ROUTE, /looksNormalized\(boxes\)/, "a wrong-scale reading is no longer refused");
  assert.match(ROUTE, /verifyDeviceKey/, "a paid vision read sits behind an open door");
  assert.match(ROUTE, /spend: \{/, "the vision read is no longer billed");
  // 🔴 THE PICTURE IS GRADED AGAINST, SO IT IS HELD TO THE HIGHER PROVENANCE BAR. A wrong label
  // under a box is scored as the LEARNER'S mistake — see visual-provenance.ts.
  assert.match(ROUTE, /accuracyBearing: true/, "a picture the learner is marked against is chosen as an illustration");
});

test("🔴🔴 link 5: the client never throws, so a missing diagram never costs the check", () => {
  const client = strip(read("./figure-occlusion-api.ts"));
  assert.match(client, /return null;/, "the client stopped degrading to null");
  assert.match(client, /catch \{\s*return null;/, "a network failure now propagates into the turn");
  // The shape is re-checked on arrival even though the route is ours: a deploy skew must degrade
  // to "no diagram", never to a payload whose width is undefined — which reaches the renderer as
  // viewBox="0 0 undefined undefined" and draws the empty framed box this codebase shipped once.
  assert.match(client, /const width = size\(result\.width\)/, "the width is trusted without checking it");
});

test("🔴🔴🔴 link 6: the questions are built, and a late diagram cannot land on a later turn", () => {
  assert.match(SESSION, /withFigureQuestions\(current, figure\)/, "the picture questions are never folded in");
  // 🔴 THE GUARD THIS FILE'S AUTHOR GOT WRONG FIRST. The obvious version was
  // `current === null ? null : …`, reasoning that a cleared check means the turn is over. That is
  // false in the exact case the feature exists for — a turn may ask for a picture check and write
  // NO text questions, so `current` is legitimately null and the diagram would be discarded every
  // time. A turn counter says what was actually meant.
  assert.match(SESSION, /if \(checkTurn\.current !== thisTurn\) return;/, "a stale diagram can land under a later turn's check");
  assert.ok(
    !/current === null \? null : withFigureQuestions/.test(SESSION),
    "the figure-only check is thrown away again",
  );
  // Dismissing must also invalidate one in flight, or a declined test reappears on its own.
  const clear = SESSION.slice(SESSION.indexOf("const clearTest = useCallback"), SESSION.indexOf("const clearMemoryNotice"));
  assert.match(clear, /checkTurn\.current \+= 1/, "closing a check leaves a diagram in flight that will re-open it");
});

test("🔴🔴🔴 link 7: THE PICTURE IS ACTUALLY RENDERED — the link that killed `figure`", () => {
  // 🔴 `SemanticVisual` had no `figure` branch for weeks. The asset resolved, the marker parsed,
  // and the learner got an empty bordered box 38 pixels tall. Nothing failed. There was no
  // render-side test, so there was nothing to go red.
  assert.match(CHECK_CARD, /<OcclusionCardView/, "an occlusion question renders no picture at all");
  assert.match(CHECK_CARD, /question\.figure && \(/, "the picture is drawn unconditionally, or not from the question");
  // 🔴 AND IT IS THE STUDY DECK'S RENDERER, NOT A SECOND ONE. Two components drawing the same
  // payload is two places for "what does a covered part look like" to drift.
  assert.match(CHECK_CARD, /from "@\/components\/workspace\/study\/occlusion-card"/, "the check grew its own occlusion renderer");
});

test("🔴🔴🔴 the answer is NEVER revealed while the run is live", () => {
  // The owner's rule for this whole card: *"the user does not immediately get feedback until the
  // end"*. A revealed mask IS the answer, printed on the question. `FigureOcclusion` states the
  // same rule for the course lane: revealing before the learner commits turns retrieval into
  // recognition, and the evidence then records neither.
  assert.match(CHECK_CARD, /revealed=\{false\}/, "the covered part is revealed before the learner answers");
  assert.ok(!/revealed=\{revealed\}|revealed=\{true\}/.test(CHECK_CARD), "the reveal became conditional on this screen");
});

test("🔴🔴 an untitled canvas names its deck after the diagram, not after nothing", () => {
  // 🔴 MEASURED IN PRODUCTION, 2026-08-25. A nephron canvas opened from a deep link has an EMPTY
  // title, so twenty nephron cards saved as "Untitled deck" — honest, and useless on a shelf. The
  // model had just written `"figure": "nephron"`; that word was sitting in the reply while the
  // deck was being named after nothing.
  //
  // 🔴 THE SUBJECT MUST BE READ BEFORE THE INSERT. It used to be read after, purely because the
  // cards were built after — which is why the name could not use it.
  const subjectAt = DELIVERABLES.indexOf("const subject = readFigureSubject(readCardsFigure(reply.text))");
  const nameAt = DELIVERABLES.indexOf("const name = deckName(named)");
  const insertAt = DELIVERABLES.indexOf('.from("study_decks")');
  assert.ok(subjectAt > 0 && nameAt > 0 && insertAt > 0, "one of the three anchors is gone");
  assert.ok(subjectAt < nameAt, "the figure subject is read after the deck is named");
  assert.ok(nameAt < insertAt, "the name is decided after the deck row is written");
  // …and the learner's own title still wins over it.
  assert.match(DELIVERABLES, /canvas\.title\.trim\(\) \|\| \(subject/, "a learner's own canvas title stopped taking precedence");
});

test("🔴🔴 flashcards: the model names a subject and code makes the cards", () => {
  // Owner: *"it should also be allowable for it to use image occlusion for flash cards."*
  assert.match(DELIVERABLES, /occlusionCards\(figure\)/, "image cards are never made for a deck");
  assert.match(DELIVERABLES, /card_type: "image_occlusion"/, "the rows are saved as ordinary text cards");
  // 🔴 ADDED TO THE TEXT CARDS, NEVER INSTEAD OF THEM. A deck of nothing but "what is the covered
  // part?" tests where things sit and nothing about what they do.
  assert.match(DELIVERABLES, /rows\.push\(\{/, "the image cards replaced the written ones");
});

test("🔴🔴 the object reply form cannot break a deck that does not use it", () => {
  // `readCardsJson` slices from the first "[" to the last "]", so it reads the cards out of either
  // shape. `readCardsFigure` parses the WHOLE reply or nothing, so on an ordinary array reply the
  // slice between the first "{" and last "}" is `{…}, {…}` — not valid JSON, so it returns null.
  const array = '[{"front":"a","back":"b"},{"front":"c","back":"d"},{"front":"e","back":"f"}]';
  const object = '{"cards":[{"front":"a","back":"b"},{"front":"c","back":"d"},{"front":"e","back":"f"}],"figure":"nephron"}';
  assert.equal(readCardsJson(array)?.length, 3, "the plain array form stopped parsing");
  assert.equal(readCardsFigure(array), null, "a plain array reply was read as naming a figure");
  assert.equal(readCardsJson(object)?.length, 3, "the object form loses its cards");
  assert.equal(readCardsFigure(object), "nephron");
});

console.log("occlusion-is-a-tool.test.ts OK");
