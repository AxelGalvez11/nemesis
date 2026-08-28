import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 🔴🔴 THE FEATURE THIS FILE GUARDS WAS HALF-BUILT AND SILENTLY BROKEN FOR MONTHS.
//
// `ImageDocumentView` has always let a student drag a box over part of a picture, and has always
// cut that box out of the natural-size image on a canvas. `document-reader.tsx` stored the result
// as `preview` — and then sent the model a SENTENCE describing the rectangle in percentages. The
// picture was computed on every drag and thrown away on every send. A vision model cannot look at
// "40%,30%", so "what is this showing?" was answered from the surrounding text, from the document
// as a whole, or from nothing at all, and it read as a plausible answer either way.
//
// Owner, 2026-08-28, asking for the finished shape: *"you can select a piece of the document on the
// sidebar, maybe draw as well to circle things and send it to nemesis."* Asked whether the marks
// were for their own sake or so Nemesis could see them, they chose seeing.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const READER = read("./document-reader.tsx");
const PAGE = read("./pdf-page-view.tsx");
const IMAGE = read("./image-document-view.tsx");
const DRAG = read("./use-region-drag.ts");
const BAR = read("./reader-top-bar.tsx");

test("🔴🔴 the cut-out travels with the question, and the wording follows whether it exists", () => {
  // Both halves, because either alone is a lie. Attaching without changing the words leaves the
  // model reconciling a picture against coordinates; changing the words without attaching claims a
  // picture that is not there.
  assert.match(READER, /fileFromDataUrl\(region\.preview/, "the crop is computed and discarded again");
  assert.match(READER, /regionAttached: cropped !== null/, "the wording no longer follows whether the picture really travelled");
  assert.match(READER, /\.\.\.\(cropped \? \[cropped\] : \[\]\)/, "the crop is not in the files the action sends");
});

test("🔴 a marked area gets the same floating bar a highlight does", () => {
  // Its actions used to exist only in the "…" menu, so marking part of a diagram meant then hunting
  // a dropdown for what to do with it. One selection can only be one thing: the text anchor wins,
  // and `setRegion(null)` on every selection change is what makes that true rather than a race.
  assert.match(READER, /onSendToChat && \(selection \?\? region\)/, "the marked area has no action bar");
  assert.match(READER, /setRegion\(null\);/, "a text selection no longer clears a stale box");
  assert.match(READER, /setSelection\(null\);/, "marking an area no longer clears a stale highlight");
  // 🔴 FOUND ON SCREEN. Our own state is not what paints a highlight — the browser keeps painting
  // the range until it is dropped, so marking an area left a grey highlight AND a box on the page
  // while the bar acted on only one of them. Calibration: remove this line and the two are visible
  // together in the docked panel.
  assert.match(READER, /window\.getSelection\(\)\?\.removeAllRanges\(\)/, "a stale highlight stays painted under the new box");
});

test("🔴🔴 marking is a MODE on a PDF, because one drag cannot mean two things", () => {
  // pdf.js positions an invisible text layer over the page, and that layer IS what makes selection
  // work. An overlay that catches drags necessarily takes those events away from it. The overlay is
  // mounted only while marking rather than left inert with `pointer-events-none`: an element
  // covering the page is exactly the thing that silently kills selection, and "present but inert"
  // is the state nobody can see.
  assert.match(PAGE, /\{marking && \(/, "the marking overlay is no longer conditional on the mode");
  assert.ok(!/pointer-events-none[^"]*"\s*\n?\s*data-testid={`reader-page-\$\{pageNumber\}-marking/.test(PAGE), "the overlay is left in place and inert");
  assert.match(BAR, /data-testid="reader-mark-area"/, "there is no control to turn marking on");
  // 🔴 AND ONLY WHERE THE BAR HAS SOMEWHERE TO SEND, the same rule the highlight bar follows.
  assert.match(READER, /source\.kind === "pdf" && onSendToChat \? \(\) => setMarking/, "marking is offered where the resulting question goes nowhere");
});

test("🔴🔴 a slide is never croppable, because a slide on screen is a reconstruction", () => {
  // `pptx-slides.ts` says it in as many words: turning a slide into a picture needs a layout engine
  // Nemesis does not host, so what renders is the deck's real text and pictures laid out again by
  // us. A crop of that is a picture of OUR layout — truthful about the words, wrong about the
  // thing — and handing it to a vision model as though it were the deck is the failure this guard
  // exists to prevent. Calibration: add "slides" to the kinds that offer marking and this reddens.
  assert.ok(!/source\.kind === "slides".*setMarking/s.test(READER.slice(READER.indexOf("onToggleMarking"), READER.indexOf("onToggleMarking") + 600)), "marking is offered on a reconstructed slide");
});

test("🔴 one drag implementation, because two would disagree about the same two corners", () => {
  // Both of these were found the hard way and neither would be re-derived by a second copy:
  // fractions rather than screen pixels (the only contract that survives a zoom), and the release
  // corner taken from the pointerup rather than the last move (a fast drag can finish with no move
  // events at all, and reading the last one throws the selection away as a stray click).
  assert.match(DRAG, /window\.addEventListener\("pointerup", up\)/, "the release is no longer read from the pointerup");
  assert.match(DRAG, /const point = pointFrom\(event\);\n\s+finish\(point/, "the release corner comes from somewhere other than the release");
  assert.match(IMAGE, /useRegionDrag\(/, "the image view has grown its own copy of the drag again");
  assert.match(PAGE, /useRegionDrag\(/, "the PDF page has grown its own copy of the drag again");
  assert.ok(!/addEventListener\("pointermove"/.test(IMAGE), "the image view is listening for its own drag again");
});

test("🔴🔴 a page that has not painted yet crops to nothing, so it does not crop at all", () => {
  // Found on screen. An unrendered canvas is not empty, it is 300×150 — the element's default — so
  // `canvas.width > 0` passes, the crop succeeds, and what travels is a real PNG of a blank
  // rectangle under a message that says "attached as a picture". The flag is also cleared at the
  // START of every render, because a zoom leaves the OLD scale's pixels sitting there until the new
  // render lands, and those crop to the wrong part of the page.
  //
  // Calibration: put `canvas.width > 0` back and this reddens.
  assert.match(PAGE, /const crop = canvas && painted\.current \?/, "the crop no longer waits for the page to paint");
  assert.match(PAGE, /painted\.current = false;/, "a re-render at a new scale leaves the old pixels croppable");
  assert.match(PAGE, /await render\.promise;[\s\S]{0,200}?painted\.current = true;/, "nothing marks the page as painted");
});

test("🔴 the crop comes off the canvas that is already drawn", () => {
  // Re-rasterising the page at crop time would double the most expensive thing `PdfPageView` does,
  // for a picture the learner is already looking at. Device pixels, not CSS pixels, so a retina
  // screen yields a crop at twice the layout size.
  assert.match(PAGE, /cropFrom\(canvas, region, \{ height: canvas\.height, width: canvas\.width \}\)/, "the page crop is taken from something other than the rendered canvas");
  assert.match(IMAGE, /cropFrom\(image, region, \{ height: image\.naturalHeight, width: image\.naturalWidth \}\)/, "the picture crop is no longer cut at natural size");
});
