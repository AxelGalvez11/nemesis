import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The documents you dropped in are still on the page after you press send, and still there
// tomorrow.
//
// 🔴🔴 ONE COMPLAINT, TWO SEPARATE HOLES, AND EITHER ONE ALONE LOOKS LIKE "IT DIDN'T SAVE". Owner,
// 2026-09-03, having dropped a folder of lectures in: *"it's almost like it's not saving the
// chats… it only saved like the chat prompt… when I refreshed the page… it pretty much didn't
// show the sources that I dropped in. I need it to behave like a regular chat, please."*
//
//   1. LIVE — `commitStaged` clears the composer's cards on send and the turn was filed with
//      `attached: []`, a literal. Seven cards vanished and the conversation kept one sentence.
//   2. RELOADED — `sameMoment` compared kind, text, question and response, and a `source` moment
//      has none of those, so any two consecutive attachments were "the same moment recorded
//      twice". Read out of his production row: seven files in `sources`, ONE source moment
//      holding `sourceIds: ["s1"]`.
//
// Both are guarded here rather than in two files, because they are one behaviour: what you
// attached is part of what you said.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CANVAS = strip(read("./learning-canvas.tsx"));
const MOMENT = strip(read("../../../lib/learn/canvas-moment.ts"));
const SESSION = strip(read("./use-canvas-session.ts"));

test("🔴🔴 pressing send does not erase what was attached to it", () => {
  // The send commits the staged files and clears the composer; the titles have to survive that
  // hand-off or the turn is filed with nothing.
  assert.match(CANVAS, /committedTitles\.current = entries\.map\(\(entry\) => entry\.file\.name\)/, "the send stopped remembering what it committed");
  assert.match(CANVAS, /attached: outgoing\.attached/, "a filed turn is back to being given an empty attachment list");
  // 🔴 SCOPED TO THE `fileTurn` CALL, NOT THE WHOLE FILE. `onScreen`'s initial value is a genuinely
  // empty list and always will be; a file-wide ban on the literal would fail on that and say
  // nothing true. The claim is about what a TURN is filed with.
  const filing = CANVAS.slice(CANVAS.indexOf("fileTurn({"), CANVAS.indexOf("}),", CANVAS.indexOf("fileTurn({")));
  assert.ok(!/attached: \[\]/.test(filing), "a turn is still being filed with a literal empty attachment list");
  // 🔴 SINGLE-USE. Read and cleared in one step, or the next turn inherits the last one's files —
  // material silently claimed by a question it was never sent with.
  assert.match(CANVAS, /const attachedNow = committedTitles\.current;\s*committedTitles\.current = \[\];/, "the committed titles are no longer taken single-use");
});

test("🔴🔴 a turn shows its files as CARDS on one scrolling row, never as a list of names", () => {
  // 🔴 THREE SHAPES IN ONE DAY, AND THE OWNER IS CONSISTENT ACROSS ALL THREE. `#1098` drew the
  // names as a bare `<ul>` to fix turns being filed with no attachments at all. Hours later:
  // *"it shows the names of the PowerPoints … I don't need that there."* Then, back in the same
  // chat: *"I'm supposed to have the chat attached multiple documents and I don't see the cards
  // there. They should show up similarly to how they do in ChatGPT … but ideally this should be
  // horizontally, and you should be able to scroll."*
  //
  // He rejected a LIST OF NAMES and asked for a ROW OF CARDS. Same data, different object: seven
  // bare filenames is seven lines and reads as debug output; seven cards is one card tall however
  // many there are. This test holds both halves so neither can quietly come back as the other.
  const THREAD = strip(read("./canvas-thread-turn.tsx"));
  const ROW = strip(read("./attached-row.tsx"));
  assert.match(THREAD, /<AttachedRow titles=\{turn\.attached\}/, "a filed turn stopped showing what it was sent with");
  assert.match(CANVAS, /<AttachedRow titles=\{currentAttached\}/, "the newest exchange shows no files until it is reloaded");
  // 🔴 THE LIST MUST NOT COME BACK. `turn.attached.map` into bare text is exactly what was cut.
  assert.ok(!/turn\.attached\.map/.test(THREAD), "a filed turn is printing its file names as a list again");
  // 🔴 AND THE ROW HAS TO ACTUALLY SCROLL. Without `shrink-0` on the card, flexbox solves the
  // overflow by compressing every card to nothing — silently, and only at the file counts that
  // matter. Without `overflow-x-auto` the row widens the whole conversation instead.
  assert.match(ROW, /overflow-x-auto/, "the row of cards cannot scroll, so it widens the conversation");
  assert.match(ROW, /className="shrink-0"/, "the cards squash instead of scrolling");
});

test("🔴 the cards are above the words, which is the order the files arrived in", () => {
  const THREAD = strip(read("./canvas-thread-turn.tsx"));
  assert.ok(
    THREAD.indexOf("<AttachedRow") < THREAD.indexOf("data-learner-said"),
    "the files are drawn under the question that refers to them",
  );
});
test("🔴🔴🔴 two different files are not 'the same moment recorded twice'", () => {
  // Calibration: delete the `sameIds` line and this reddens. Every other field `sameMoment`
  // compares is `undefined` on both sides of a source moment, so without it the comparison is
  // `undefined === undefined` four times over and every attachment after the first is dropped.
  const body = MOMENT.slice(MOMENT.indexOf("export function sameMoment"), MOMENT.indexOf("function sameIds"));
  assert.match(body, /sameIds\(a\.sourceIds, b\.sourceIds\)/, "the duplicate guard is blind to which file it is looking at");
});

test("🔴 one drop is one row, however many files it holds", () => {
  // A row per file is seven lines in the conversation and seven marks on the History Rail, and
  // thirty for thirty files — which is the case the owner actually works in. Every chat product
  // draws one message carrying N attachments.
  const body = MOMENT.slice(MOMENT.indexOf("export function fileMoment"), MOMENT.length);
  assert.match(body, /input\.kind === "source" && arriving\.length > 0 && last\?\.kind === "source"/, "consecutive attachments stopped folding into one row");
  assert.match(body, /\.\.\.last,/, "the folded row no longer keeps its own id and time");
});

test("🔴 the session files moments through that one function, not around it", () => {
  // 🔴 THE DEDUPE AND THE FOLD LIVE IN `fileMoment` NOW, so a caller that appended directly would
  // silently opt out of both. `recordMoment` is the only production door.
  assert.match(SESSION, /const filed = fileMoment\(/, "recordMoment stopped filing through fileMoment");
  assert.ok(!/appendMoment/.test(SESSION), "the old append-without-folding path is back");
});

test("🔴🔴🔴 the first message of a new chat is not seeded over while it is still being answered", () => {
  // Reproduced on production, 2026-09-03: send from the front door and the answer arrives with NO
  // question bubble above it and no file names; reload the same canvas and both are there.
  //
  // 🔴 THE CANVAS IS MINTED DURING THAT FIRST TURN. `canvas.id` goes from nothing to something
  // while `converse` is running, so the seed sees a canvas it has not seeded, reads a moment log
  // that is still empty, and assigns `null` over the sentence `converse` set half a second
  // earlier. Deferred rather than skipped: the latch moves with the return, so the seed runs the
  // moment the turn settles and the log actually holds the exchange.
  //
  // Calibration: drop the `turnInFlight` guard and the first message of every new chat disappears
  // until the page is reloaded.
  const seed = CANVAS.slice(CANVAS.indexOf("const seededFor"), CANVAS.indexOf("}, [canvas.blocks.length"));
  assert.ok(seed.length > 200, "the seed effect is gone or was renamed");
  assert.match(seed, /if \(turnInFlight\) return;/, "the seed no longer stands aside while a turn owns the surface");

  // 🔴🔴 AND DEFERRING ALONE WAS NOT ENOUGH, WHICH IS WHY THE LATCH MOVED. On the front door the
  // canvas is MINTED FIRST and the opening ask is fired by a later effect, so the seed runs at
  // mount with nothing in flight, against an empty moment log — and if it latches there it never
  // runs again for that canvas. Measured on production after the deferral shipped: still no
  // question bubble and no file names until a reload.
  //
  // Calibration: move the latch back to the top of the effect and the first message of every new
  // chat disappears again until the page is reloaded.
  assert.match(seed, /if \(restored\.length > 0\) seededFor\.current = canvas\.id;/, "the seed latches on a canvas it had nothing to seed from");

  // 🔴🔴 AND A FIRST SEED ONLY EVER ADDS. Even deferred and unlatched, this effect runs repeatedly
  // against a moment log being written underneath it: on the front door there is an instant after
  // the source moment and before the answer's when `held` is the attachment row, its `said` is
  // undefined, and assigning it wipes the sentence `converse` has already put up. Replacing is
  // right only when there is a previous conversation to replace — which is what `switching` is.
  //
  // Calibration: drop the `switching ||` guards and the question bubble vanishes from every new
  // chat again until it is reloaded.
  assert.match(seed, /const switching = seededFor\.current !== null && seededFor\.current !== canvas\.id;/, "the seed stopped telling a switch from a first seed");
  assert.match(seed, /if \(switching \|\| held\?\.said\) setCurrentSaid/, "a first seed can erase the live question again");
  // 🔴 THE THIRD LINE, RESTORED EXACTLY AS ITS OWN TOMBSTONE SAID IT WOULD BE. It was retired for
  // half a day, while the live region held no attachment state at all, under a note ending "if the
  // names ever come back, this line comes back with them". They came back the same day as CARDS
  // (see `attached-row.tsx`), so the state is here again and a first seed can erase it again.
  assert.match(seed, /if \(switching \|\| held\?\.attached\?\.length\) setCurrentAttached/, "a first seed can erase the live attachments again");
  assert.ok(
    seed.indexOf("if (restored.length > 0) seededFor.current") > seed.indexOf("const restored = history"),
    "the latch runs before the seeding it is meant to record",
  );
  assert.equal((seed.match(/seededFor\.current = canvas\.id/g) ?? []).length, 1, "there is a second place that latches the seed");
});
