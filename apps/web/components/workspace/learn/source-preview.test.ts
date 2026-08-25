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

test("🔴🔴 an empty shelf does not render, and Sources is the exception that anchors the panel", () => {
  // 🔴🔴 THIS GUARD HAS NOW SAID THREE DIFFERENT THINGS, AND THE HISTORY IS THE POINT — each turn
  // was an owner call, not a drift.
  //
  //   v1  no headings unless BOTH kinds of source are present. Reasoning: *"the panel's own tab
  //       already says sources, so 'Documents' printed under it is a label restating a label."*
  //   v2  every shelf prints its heading, empty or not. The tab was gone, so the heading became the
  //       only label there was, and a hidden one left "read nothing from the web" indistinguishable
  //       from "not tracked".
  //   v3  owner, 2026-08-25: *"outputs and inputs should only appear when there are some."* An
  //       empty shelf is noise on a panel opened to see what a canvas HAS.
  //
  // 🔴 THE RULE IS CARRIED BY THE PROP SHAPE, NOT BY A FLAG BESIDE IT. A section with both an empty
  // sentence AND a hide flag has two answers for one state, and whichever the code checked first
  // would win silently. No `empty` IS the instruction to disappear.
  //
  // Calibration: give Outputs an `empty` and this reddens; take Sources' away and it reddens.
  const start = CONTROLS.indexOf("function PanelSection");
  const section = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  assert.ok(start !== -1 && section.length > 0, "PanelSection moved — this guard is pointed at nothing");
  assert.match(section, /if \(rows\.length === 0 && !filled && !empty\) return null/, "an empty shelf still renders");
  assert.match(section, /empty\?: string/, "`empty` stopped being optional, so nothing can hide");

  // Outputs and Inputs pass no empty state; Sources does, and is therefore always on screen.
  assert.match(CONTROLS, /<PanelSection label="Outputs">/, "the Outputs shelf gained an empty state and can no longer hide");
  assert.match(CONTROLS, /<PanelSection label="Inputs" onAdd=/, "the Inputs shelf gained an empty state and can no longer hide");
  assert.match(CONTROLS, /empty="Nothing read from the web yet\./, "the Sources shelf lost the empty state that anchors the panel");
  assert.ok(!CONTROLS.includes("Nothing made yet"), "the Outputs description is back");
  assert.ok(!CONTROLS.includes("Nothing attached yet"), "the Inputs description is back");
});

test("🔴 the panel's own icon is the reference's, not the Library's", () => {
  // Owner, 2026-08-25, with the glyph screenshotted. `library` is a stack of books, which reads as
  // "go to the Library" — a different surface this panel is repeatedly mistaken for.
  assert.match(CONTROLS, /name="list-unordered" size="20px"/, "the panel trigger stopped using the reference's icon");
  assert.ok(!/name="library"/.test(CONTROLS), "the books icon is back on the panel trigger");
});

test("🔴🔴 Outputs has no `+`, because those three rows are not coming back", () => {
  // The reference offers "Create a file or site" on its Outputs heading. This is the one place its
  // styling is deliberately NOT copied — owner ruling, 2026-08-24: *"remove the make flash cards,
  // make slide, make summary note from the output section."* A `+` there is those rows returning
  // behind an icon. §38: a phrase to the composer, not a control.
  const outputs = CONTROLS.slice(CONTROLS.indexOf('<PanelSection label="Outputs"'));
  const heading = outputs.slice(0, outputs.indexOf("</PanelSection>"));
  assert.ok(!/onAdd/.test(heading), "the Outputs shelf grew an add control");
  // And the two that DO have one drive the file picker rather than making anything.
  assert.match(CONTROLS, /onAdd=\{\(\) => filePicker\.current\?\.click\(\)\}/, "the `+` no longer opens the file picker");
});

test("🔴🔴 every shelf folds, and folding stays safe without a count", () => {
  // Owner, 2026-08-25: *"make sure each section is collapsible."*
  //
  // 🔴 THE COUNT IS GONE AND THE INVARIANT IT PROTECTED IS STILL HELD — by a different mechanism,
  // which is why this is a repoint and not a deletion. The count existed because a collapsed
  // section with no number is indistinguishable from an empty one: the moment somebody concludes
  // their sources were lost. Empty shelves no longer render at all, so a visible collapsed shelf
  // always has something in it and that ambiguity cannot occur. The reference carries no count
  // either. Calibration: make an empty shelf render again and the guard above reddens.
  const start = CONTROLS.indexOf("function PanelSection");
  const section = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  assert.match(section, /const \[open, setOpen\] = useState\(true\)/, "shelves no longer fold, or no longer start open");
  assert.match(section, /aria-expanded=\{open\}/, "a screen reader is not told the shelf folds");
  assert.match(section, /open \? "chevron-down" : "chevron-right"/, "the shelf folds with no visible sign that it does");
  assert.ok(!/\{rows\.length\}<\/span>/.test(section), "the count is back — the reference has none");
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
