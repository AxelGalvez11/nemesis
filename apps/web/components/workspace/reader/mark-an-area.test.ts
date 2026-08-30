import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴 THE FEATURE THIS FILE GUARDS WAS HALF-BUILT AND SILENTLY BROKEN FOR MONTHS: the crop was
// computed on every drag and thrown away on every send, so "what is this showing?" was answered
// from surrounding text while reading as though the model saw the picture.
//
// 2026-08-28 the gesture moved house: "Mark an area" was absorbed into COMMENT MODE (the drag half
// of "click to comment, drag to draw a box" — see docs/claude-design-reference.md), and the send
// path became the note's "Send to Nemesis" button. The properties guarded here predate that move
// and survive it unchanged; each assertion names the file that owns the property NOW.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const READER = read("./document-reader.tsx");
const PAGE = read("./pdf-page-view.tsx");
const IMAGE = read("./image-document-view.tsx");
const DRAG = read("./use-region-drag.ts");
const BAR = read("./reader-top-bar.tsx");
const LAYER = read("./comment-layer.tsx");

test("🔴🔴 the cut-out travels with the question, and the wording follows whether it exists", () => {
  // Both halves, because either alone is a lie. Attaching without changing the words leaves the
  // model reconciling a picture against coordinates; changing the words without attaching claims a
  // picture that is not there.
  assert.match(READER, /const cropped = crop \? fileFromDataUrl\(crop/, "the comment's crop is computed and discarded");
  assert.match(READER, /cropAttached: cropped !== null/, "the wording no longer follows whether the picture really travelled");
  assert.match(READER, /\.\.\.\(cropped \? \[cropped\] : \[\]\)/, "the crop is not in the files the send carries");
  // The image view's own always-on drag still sends through the action bar, unchanged.
  assert.match(READER, /fileFromDataUrl\(region\.preview/, "the image drag's crop is discarded again");
});

test("🔴🔴 commenting is a MODE, because one drag cannot mean two things", () => {
  // pdf.js positions an invisible text layer over the page, and that layer IS what makes selection
  // work. An overlay that catches drags necessarily takes those events away from it. The overlay is
  // mounted only while the mode is on rather than left inert with `pointer-events-none`: an element
  // covering the page is exactly the thing that silently kills selection, and "present but inert"
  // is the state nobody can see.
  assert.match(LAYER, /\{commenting && \(/, "the capture overlay is no longer conditional on the mode");
  assert.match(BAR, /data-testid="reader-comment-mode"/, "there is no control to turn commenting on");
  // 🔴 The mode is offered wherever there is a surface to pin to — and the note's SEND button
  // exists only where the note has somewhere to go, the same rule the highlight bar follows.
  assert.match(READER, /onSend=\{onSendToChat \? sendComment : null\}/, "the send button ignores whether a chat lane exists");
  assert.match(LAYER, /\{onSend && \(/, "a send button renders with nowhere to send");
});

test("🔴🔴 a slide is never croppable, because a slide on screen is a reconstruction", () => {
  // `pptx-slides.ts` says it in as many words: what renders is the deck's text laid out again by
  // us. A crop of that is a picture of OUR layout — and worse here: a slide's section contains the
  // deck's own embedded <img>s, so "find an image and crop it" would cut a region of the WRONG
  // picture. The crop is scoped BY KIND, never by discovery. Calibration: crop from
  // `element.querySelector("img")` without the kind gate and this reddens.
  const gate = READER.slice(READER.indexOf("cropForComment"), READER.indexOf("cropForComment") + 1600);
  assert.match(gate, /source\.kind === "pdf"/, "the pdf crop lost its kind gate");
  assert.match(gate, /source\.kind === "image"/, "the image crop lost its kind gate");
  assert.ok(!/"slides"/.test(gate), "a reconstructed slide has become croppable");
});

test("🔴 one drag implementation, because two would disagree about the same two corners", () => {
  // Fractions rather than screen pixels (the only contract that survives a zoom), and the release
  // corner taken from the pointerup rather than the last move (a fast drag can finish with no move
  // events at all). Both found the hard way; neither would be re-derived by a second copy.
  assert.match(DRAG, /window\.addEventListener\("pointerup", up\)/, "the release is no longer read from the pointerup");
  assert.match(DRAG, /const point = pointFrom\(event\);\n\s+finish\(point/, "the release corner comes from somewhere other than the release");
  assert.match(IMAGE, /useRegionDrag\(/, "the image view has grown its own copy of the drag again");
  assert.match(LAYER, /useRegionDrag\(/, "the comment layer has grown its own copy of the drag again");
  assert.ok(!/addEventListener\("pointermove"/.test(IMAGE), "the image view is listening for its own drag again");
  assert.ok(!/addEventListener\("pointermove"/.test(LAYER), "the comment layer is listening for its own drag again");
});

test("🔴🔴 a page that has not painted yet crops to nothing, so it does not crop at all", () => {
  // Found on screen. An unrendered canvas is not empty, it is 300×150 — the element's default — so
  // a naive crop succeeds and what travels is a real PNG of a blank rectangle under a message that
  // says "attached as a picture". The crop moved OUT of the page view, so the invariant is now
  // carried on the DOM: the page stamps `data-painted` (cleared at the START of every render,
  // because a zoom leaves the OLD scale's pixels sitting there), and the reader honours it.
  //
  // Calibration: crop without checking `dataset.painted` and this reddens.
  assert.match(PAGE, /canvasRef\.current\.dataset\.painted = "false"/, "a re-render at a new scale leaves the old pixels croppable");
  assert.match(PAGE, /canvas\.dataset\.painted = "true"/, "nothing marks the page as painted for the reader to see");
  assert.match(READER, /canvas\.dataset\.painted === "true"/, "the reader crops without asking whether the page painted");
});

test("🔴 the crop comes off what is already drawn, at its own resolution", () => {
  // Device pixels, not CSS pixels, so a retina screen yields a crop at twice the layout size; and
  // no second render, because re-rasterising at crop time doubles the most expensive thing the
  // page view does for a picture the learner is already looking at.
  assert.match(READER, /cropFrom\(canvas, anchorBox, \{ height: canvas\.height, width: canvas\.width \}\)/, "the page crop is taken from something other than the rendered canvas");
  assert.match(READER, /cropFrom\(image, anchorBox, \{ height: image\.naturalHeight, width: image\.naturalWidth \}\)/, "the picture crop is no longer cut at natural size");
  assert.match(IMAGE, /cropFrom\(image, region, \{ height: image\.naturalHeight, width: image\.naturalWidth \}\)/, "the image view's own crop is no longer cut at natural size");
});
