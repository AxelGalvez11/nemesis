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

test("🔴 the live turn NAMES its files, the way a filed turn already did", () => {
  // `canvas-thread-turn.tsx` has drawn `turn.attached` as a list since the thread existed. The
  // live region drew nothing, so the newest exchange — the one on screen — was the only one whose
  // documents were invisible.
  assert.match(CANVAS, /threadOpen && currentAttached\.length > 0 && \(/, "the live turn stopped naming its files");
  assert.match(CANVAS, /setCurrentAttached\(held\?\.attached \?\? \[\]\)/, "a reopened canvas does not name the newest turn's files");
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
