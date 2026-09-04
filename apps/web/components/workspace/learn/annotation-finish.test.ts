// The annotation reaches the conversation as an annotation: the picture and the "1 annotation"
// chip above the learner's OWN note on the live turn, the chip alone once the turn is filed or the
// canvas reopened, and never as a "PNG" card.
//
// Owner, 2026-09-04: *"there was another Claude that was supposed to be working on the annotation
// feature and I don't know if it finished it so could you pick that up too."* Driven on production
// that night: the pin kept, the box drew, Nemesis answered from the exact spot — and the chat showed
// no picture, no chip, a machine-written sentence in the bubble, and after a reload a "PNG" file
// card where the annotation had been. Four faults, one cause each, pinned here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { makeMoment } from "@/lib/learn/canvas-moment";
import { fileTurn } from "@/lib/learn/canvas-thread";
import { CROP_SUFFIX, cropFileName, isCropFileName } from "@/lib/reader/region-crop";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const CANVAS = read("./learning-canvas.tsx");
const TURN = read("./canvas-thread-turn.tsx");
const READER = read("../reader/document-reader.tsx");
const HISTORY = read("../../../lib/learn/canvas-history.ts");

test("🔴🔴 the reader's notes are TAKEN by the send, not set as state the send then clears", () => {
  // `setCurrentNotes` before `submit` was cleared by `converse` on the way in, so nothing drew.
  assert.match(CANVAS, /readerSend\.current = \{ notes: notes \?\? \[\], said: said\?\.trim\(\) \|\| null \};/, "the reader sets state before the send again");
  assert.match(CANVAS, /const fromReader = readerSend\.current;\n\s+readerSend\.current = \{ notes: \[\], said: null \};/, "the hand-off is not single-use");
  assert.ok(!/setCurrentNotes\(notes && notes\.length > 0 \? notes : \[\]\);/.test(CANVAS), "the cleared-before-it-drew path is back");
});

test("🔴🔴 the bubble carries the learner's note; the model still reads the whole prompt", () => {
  assert.match(READER, /\], draft\.body\.trim\(\)\);/, "the reader no longer hands over the learner's own words");
  assert.match(CANVAS, /const shown = fromReader\.said\?\.trim\(\) \|\| trimmed;/);
  assert.match(CANVAS, /setCurrentSaid\(shown\);/, "the live bubble shows the machine-written prompt");
  assert.match(CANVAS, /userText: shown,/, "the record keeps the machine-written prompt");
  // The six-turn window the model reads keeps the fuller sentence: file, page, picture attached.
  assert.match(CANVAS, /remember\(\{ replied: decision\?\.say \?\? doorReply, said: trimmed \}\);/);
  assert.match(CANVAS, /const decision = await session\.converse\(trimmed, surroundings\(\)/, "the model no longer receives the full prompt");
});

test("🔴 the count outlives the picture: it rides the moment and the filed turn", () => {
  const moment = makeMoment({ annotations: 2, kind: "user", userText: "Why not alone?" }, "2026-09-04T00:00:00.000Z", "m1");
  assert.equal(moment.annotations, 2);
  // Stored only when non-zero, so every ordinary moment's row is unchanged.
  assert.ok(!("annotations" in makeMoment({ kind: "user", userText: "hi" }, "2026-09-04T00:00:00.000Z", "m2")));
  assert.equal(fileTurn({ annotations: 1, at: "", id: "t", reply: "", said: "x" }).annotations, 1);
  assert.ok(!("annotations" in fileTurn({ at: "", id: "t", reply: "", said: "x" })));
  assert.match(CANVAS, /\.\.\.\(fromReader\.notes\.length > 0 \? \{ annotations: fromReader\.notes\.length \} : \{\}\),/, "the record does not count the marks");
  assert.match(CANVAS, /annotations: outgoing\.annotations,/, "the filed live turn drops the count");
  assert.match(CANVAS, /annotations: moment\.annotations,/, "the reopened turn drops the count");
  assert.match(HISTORY, /\.\.\.\(moment\.annotations \? \{ annotations: moment\.annotations \} : \{\}\),/);
  // And the filed turn draws the chip, above the note, from the count alone.
  assert.match(TURN, /\{\(turn\.annotations \?\? 0\) > 0 && \(/);
  assert.match(TURN, /<AnnotationNoteView notes=\{Array\.from\(\{ length: turn\.annotations \?\? 0 \}, \(\) => \(\{ thumbnail: null, where: null \}\)\)\} \/>/);
});

test("🔴🔴 a crop is not a card: the reopened thread keeps the marked region out of the file row", () => {
  assert.equal(isCropFileName(cropFileName("Asthma COPD drug chart.pdf", "page", 1)), true);
  assert.equal(cropFileName("Asthma COPD drug chart.pdf", "page", 1), `Asthma COPD drug chart page 1${CROP_SUFFIX}`);
  assert.equal(isCropFileName("Asthma COPD drug chart.pdf"), false);
  assert.equal(isCropFileName("lecture (marked area).PNG"), true, "case must not matter: a file system may not keep it");
  assert.match(HISTORY, /\.filter\(\(title\) => !isCropFileName\(title\)\);/, "the crop comes back as a PNG card on reopen");
});
