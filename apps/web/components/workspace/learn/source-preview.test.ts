import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PREVIEW_LIBRARY_SOURCES, loadLibrarySource } from "@/lib/workspace/library-sources";

// ── the source click, and what it opens (owner rulings, 2026-08-23) ─────────────────────────
//
// 🔴🔴 TWO ORDERS, ONE SURFACE. The click: *"when I clicked on the source attachment it took me to
// the old library. It's supposed to take me to a small preview of it, a pop up."* The content:
// *"it showed me markdown, and it wasn't even rendering well… just show me the preview of the
// actual document. A simple preview with the page thumbnails and just the source, and that's
// it."* And separately: *"remove the paste URL part because that's not really necessary."*

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CONTROLS = strip(readFileSync(new URL("./canvas-controls.tsx", import.meta.url), "utf8"));
const PREVIEW = strip(readFileSync(new URL("./source-preview.tsx", import.meta.url), "utf8"));

test("🔴 the paste-a-link field stays out of the sources panel", () => {
  // Calibration: put the form back and either line reddens.
  assert.ok(!CONTROLS.includes("Paste a link"), "the paste field is back");
  assert.ok(!/onUrl\??:/.test(CONTROLS), "the onUrl prop is back on the panel");
});

test("🔴🔴 a document row opens the preview card, and the old library link stays dead", () => {
  // The old anchor also interpolated the canvas-local slot id (`s1`…) into a route that resolves
  // `library_sources.id`, so it 404'd everywhere — the replacement must not resurrect it.
  // The row moved into a `SourceRow` component when the panel became three shelves; the press
  // calls the prop and the panel supplies the setter. Both halves, because a prop nothing passes is
  // a row that opens nothing.
  assert.match(CONTROLS, /onClick=\{\(\) => onPreview\(source\)\}/, "a document row no longer opens the preview");
  assert.match(CONTROLS, /onPreview=\{setPreviewing\}/, "the row is never given a way to open the preview");
  assert.ok(!CONTROLS.includes("/library/source/"), "the sources panel navigates to the old library again");
  assert.match(CONTROLS, /<SourcePreview /, "the preview card is not mounted");
});

test("🔴🔴 the preview shows the ORIGINAL document — bytes, pdf.js, page thumbnails — never the extraction", () => {
  // The same door and the same lazy thumbnail the Reader uses; no second pipeline.
  assert.match(PREVIEW, /loadLibrarySource\(/, "the preview does not resolve the library row");
  assert.match(PREVIEW, /librarySourceUrl\(/, "the preview does not sign a URL for the original");
  assert.match(PREVIEW, /openPdf\(/, "the preview does not open the real bytes");
  assert.match(PREVIEW, /<PdfThumbnail/, "the preview does not render page thumbnails");
  // And no extracted text: rendering `excerpts` here is exactly the badly-rendering markdown the
  // owner reported. The excerpt count belongs to the panel row, not to this card.
  assert.ok(!/excerpts/.test(PREVIEW), "the preview reaches for the extraction");
});

test("🔴 every page press does something real — the original opens at that page", () => {
  // PdfThumbnail is a button; a button that does nothing is this codebase's most-repeated defect.
  assert.match(PREVIEW, /#page=/, "a thumbnail press goes nowhere");
});

test("🔴 a source with no kept bytes gets a sentence, not a blank card", () => {
  assert.match(PREVIEW, /wasn't filed to your Library/, "the ephemeral case says nothing");
});

test("🔴 the worker's copy of the document is freed with the card", () => {
  // openPdf's own contract: skipping close() leaks a pdf.js worker per preview opened.
  assert.match(PREVIEW, /opened\?\.close\(\)/, "nothing closes the opened document on unmount");
});

test("🔴 loadLibrarySource serves the fixtures to the preview harness, and misses honestly", async () => {
  const known = PREVIEW_LIBRARY_SOURCES[0];
  assert.ok(known, "the fixture list is empty");
  const found = await loadLibrarySource(null, known.id);
  assert.equal(found?.id, known.id);
  assert.equal(await loadLibrarySource(null, "no-such-row"), null);
});

// ── websites told apart from documents (owner 2026-08-24, restated 2026-08-25) ───────────────
//
// *"can we just have it grouped under something that says websites with a websites icon or globe
// icon like it does in ChatGPT?"* — and then, with screenshots of the reference's own panel:
// *"the source panel look like that."*
//
// 🔴🔴 THE SPLIT SURVIVED; THE SHAPE AROUND IT CHANGED, AND THE OWNER ASKED FOR BOTH. The two asks
// are the same ask a day apart — the second is the first with the reference actually in frame. So
// the groups became the reference's three stacked shelves, in its words: Outputs, Sources (what
// Nemesis went and read), Inputs (what the learner handed it). `websites`/`documents` are
// unchanged and still feed them; only the labels and the container moved.

test("🔴🔴 the panel is three shelves, in the reference's order and its words", () => {
  // Calibration: rename a shelf and this reddens.
  assert.match(CONTROLS, /<PanelSection[\s\S]{0,200}?label="Outputs"/, "the Outputs shelf is gone");
  assert.match(CONTROLS, /<PanelSection[\s\S]{0,400}?label="Sources"/, "the Sources shelf is gone");
  assert.match(CONTROLS, /<PanelSection[\s\S]{0,200}?label="Inputs"/, "the Inputs shelf is gone");
  assert.match(CONTROLS, /websites\.map\(/, "the Sources shelf renders no websites");
  assert.match(CONTROLS, /documents\.map\(/, "the Inputs shelf renders no documents");
  // 🔴 AND THE TABS MUST NOT COME BACK. They are what made this one question into two clicks: the
  // learner checking their sources is the same learner asking whether the deck got made.
  assert.ok(!/setTab\(/.test(CONTROLS), "the sources/outputs tabs are back");
  assert.ok(!/tab === "sources"/.test(CONTROLS), "the panel branches on a tab again");
});

test("🔴🔴 every shelf prints its heading, including an empty one", () => {
  // 🔴🔴 THIS TEST USED TO ASSERT THE OPPOSITE AND THE REVERSAL IS EARNED, NOT CASUAL. It read:
  //
  //     assert.match(CONTROLS, /const grouped = websites\.length > 0 && documents\.length > 0;/)
  //
  // …with the reasoning: *"the panel's own tab already says sources, so 'Documents' printed under
  // it is a label restating a label."* That was true OF A PANEL WITH A TAB. The tab is gone, so
  // the heading is now the only thing naming what a list is, and a section that hides its heading
  // when empty leaves the learner unable to tell "this canvas has read nothing from the web" from
  // "this panel does not track that" — the second reads as something having been lost.
  //
  // Calibration: make PanelSection return null when it has no rows and this reddens.
  const start = CONTROLS.indexOf("function PanelSection");
  const section = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  assert.ok(start !== -1 && section.length > 0, "PanelSection moved — this guard is pointed at nothing");
  assert.match(section, /\{label\}/, "the shelf lost its heading");
  assert.ok(!/rows\.length === 0[\s\S]{0,80}return null/.test(section), "an empty shelf disappears instead of saying it is empty");
  assert.match(section, /\{empty\}/, "an empty shelf says nothing about being empty");
  assert.ok(!/const grouped =/.test(CONTROLS), "the conditional-headings rule is back");
});

test("🔴🔴 every shelf folds, and a folded one still says how much is inside it", () => {
  // Owner, 2026-08-25: *"make sure each section is collapsible."* Third time this has been asked
  // for in some form — 2026-08-24 for the websites group specifically, and now for all three.
  //
  // 🔴 THE COUNT IS WHAT MAKES FOLDING SAFE. A collapsed section with no number is
  // indistinguishable from an empty one, which is exactly the moment somebody concludes their
  // sources were lost. Calibration: drop the count and this reddens.
  const start = CONTROLS.indexOf("function PanelSection");
  const section = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  assert.match(section, /const \[open, setOpen\] = useState\(true\)/, "shelves no longer fold, or no longer start open");
  assert.match(section, /aria-expanded=\{open\}/, "a screen reader is not told the shelf folds");
  assert.match(section, /open \? "chevron-down" : "chevron-right"/, "the shelf folds with no visible sign that it does");
  assert.match(section, /\{rows\.length\}/, "a folded shelf no longer says how much is inside it");
});

test("🔴 a row is ONE line — the descriptions are gone", () => {
  // Owner, 2026-08-25: *"remove description for outputs, inputs and sources."* Three shelves of
  // two-line rows is a wall, and each second line was either a restatement of the icon
  // ("Flashcard deck") or bookkeeping about how Nemesis read something ("· 12 excerpts") rather
  // than an answer to "what is this".
  //
  // Calibration: put any of these back and the matching line reddens.
  assert.ok(!/excerpt\{source\.excerpts\.length === 1/.test(CONTROLS), "the excerpt count is back under every source");
  assert.ok(!CONTROLS.includes("Flashcard deck · click to review"), "the flashcards description is back");
  assert.ok(!CONTROLS.includes("Note · in your Library"), "the note description is back");
  assert.ok(!CONTROLS.includes("Slides · click to download .pptx"), "the slides description is back");
  // 🔴 AND THE ONE SECOND LINE THAT IS NOT A DESCRIPTION MUST SURVIVE. A source Nemesis could only
  // half read has to say so where the source is named; dropping this with the rest would have the
  // panel quietly claim a partial read was a whole one.
  assert.match(CONTROLS, /source\.coverageNote/, "a half-read source no longer says so");
  // What kind of output a row is moved onto the icon, which is where it costs no line at all.
  assert.match(CONTROLS, /const OUTPUT_ICONS: Record<string, string>/, "output rows lost the icon that says what they are");
});

test("🔴 the split uses the same host rule the rows already use", () => {
  // `sourceUrl` is absent for every upload and present only for a page. One idea, spelled once —
  // a second rule here would eventually disagree with the row rendering directly below it.
  assert.match(CONTROLS, /const websites = canvas\.sources\.filter\(\(source\) => hostnameOf\(source\.sourceUrl\) !== null\)/);
  assert.match(CONTROLS, /const documents = canvas\.sources\.filter\(\(source\) => hostnameOf\(source\.sourceUrl\) === null\)/);
});

test("🔴🔴 a heading is not pressable, and the thing that IS pressable looks it", () => {
  // 🔴🔴 THIS GUARD HAS NOW BEEN INVERTED TWICE, AND THE INVARIANT UNDERNEATH NEVER MOVED: nothing
  // may look pressable without being pressable, and nothing may be pressable without looking it.
  // That is this codebase's most-repeated defect.
  //
  //   v1  the heading is a <span> — it opens nothing, so it must not look like the rows that do.
  //   v2  owner: *"the websites in the source panel are supposed to be collapsible."* The heading
  //       became a real <button> with a chevron and a count, so it looked like what it did.
  //   v3  the fold is gone; a long shelf caps at six and offers the rest. The heading opens
  //       nothing again, so it is an <h3> again — and the tail, which DOES do something, is a real
  //       button that reads as one.
  //
  // Calibration: make the heading a <button> and this reddens; make the tail a <div> and it reddens.
  const start = CONTROLS.indexOf("function PanelSection");
  const section = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  const heading = section.slice(section.indexOf("<h3"), section.indexOf("</h3>"));
  assert.ok(!/onClick|role="button"|cursor-pointer/.test(heading), "the shelf heading looks or behaves like a control");
  assert.match(section, /<button[\s\S]{0,400}?Show \$\{hidden\} more/, "the tail is not a real button");
  assert.match(section, /"Show less"/, "a shelf that expands cannot be put back");
});

test("🔴 each shelf caps on its own, so opening one never lengthens another", () => {
  // 🔴 THE OLD RULE, PRESERVED THROUGH A CHANGE OF MECHANISM. It read: *"the two groups fold
  // independently, so shutting one never hides the other"* — sharing one flag would mean the
  // learner who collapsed a long list of searched websites also lost the three documents they
  // attached themselves. The cap inherits the requirement exactly: shelf state lives INSIDE
  // `PanelSection`, so each instance has its own and there is no shared flag to get wrong.
  const start = CONTROLS.indexOf("function PanelSection");
  const section = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  assert.match(section, /const \[all, setAll\] = useState\(false\)/, "shelf state left the component and can now be shared");
  assert.ok(!/shutGroups/.test(CONTROLS), "the old shared fold state is back");
  // 🔴 AND THE COUNT COMES OFF THE RENDERED ROWS. A caller passing its own length could filter its
  // list, forget the count, and print a tail that reveals nothing — with nothing to catch it.
  assert.match(section, /Children\.toArray\(children\)/, "the tail counts something other than the rows it hides");
});
