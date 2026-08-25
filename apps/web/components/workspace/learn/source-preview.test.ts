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
  assert.match(CONTROLS, /setPreviewing\(source\)/, "a document row no longer opens the preview");
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

// ── websites told apart from documents (owner 2026-08-24) ───────────────────────────────────
//
// *"can we just have it grouped under something that says websites with a websites icon or globe
// icon like it does in ChatGPT?"*

test("🔴🔴 a mixed panel groups Documents and Websites, with a globe on the websites", () => {
  // Matched on the label+icon pairing rather than the whole self-closing tag: the groups gained
  // fold props on 2026-08-24, and a guard about WHICH GROUPS EXIST should not redden because a
  // group learned to collapse.
  assert.match(CONTROLS, /icon="globe"\s*\n?\s*label="Websites"/, "the websites group is gone");
  assert.match(CONTROLS, /icon="file"\s*\n?\s*label="Documents"/, "the documents group is gone");
  // No leading `{` required: each list is now behind its own fold condition, so the brace that
  // used to sit against `websites.map` is `{!shutGroups.websites && `. What this line cares about
  // is that each group renders its OWN list, which is unchanged.
  assert.match(CONTROLS, /websites\.map\(renderSource\)/, "websites are no longer rendered as their own group");
  assert.match(CONTROLS, /documents\.map\(renderSource\)/, "documents are no longer rendered as their own group");
});

test("🔴🔴 a panel of only documents gets NO headings", () => {
  // The panel's own tab already says "sources". "Documents" printed under it is a label restating
  // a label, and this codebase's minimalism rules treat that as noise rather than clarity.
  //
  // Calibration: make `grouped` unconditional and this reddens.
  assert.match(
    CONTROLS,
    /const grouped = websites\.length > 0 && documents\.length > 0;/,
    "headings now appear even when there is only one kind of source",
  );
  assert.match(CONTROLS, /if \(!grouped\) return canvas\.sources\.map\(renderSource\);/, "the ungrouped path is gone");
});

test("🔴 the split uses the same host rule the rows already use", () => {
  // `sourceUrl` is absent for every upload and present only for a page. One idea, spelled once —
  // a second rule here would eventually disagree with the row rendering directly below it.
  assert.match(CONTROLS, /const websites = canvas\.sources\.filter\(\(source\) => hostnameOf\(source\.sourceUrl\) !== null\)/);
  assert.match(CONTROLS, /const documents = canvas\.sources\.filter\(\(source\) => hostnameOf\(source\.sourceUrl\) === null\)/);
});

test("🔴🔴 a group heading IS a control now, and looks like one — owner reversal 2026-08-24", () => {
  // 🔴🔴 THIS TEST USED TO ASSERT THE OPPOSITE, AND THE REVERSAL IS THE OWNER'S OWN:
  // *"the websites in the source panel are supposed to be collapsible."* It read:
  //
  //     assert.ok(!/<button|onClick|href=/.test(helper), "the source group heading became pressable");
  //
  // …because every other row in this panel opens something, and a heading that LOOKED pressable
  // without being pressable is this codebase's most-repeated defect. That reasoning was never
  // wrong; it just answered a different question. The defect is a mismatch between what a thing
  // looks like and what it does — and the fix for "looks pressable but is not" is equally "make it
  // pressable and look it". So the invariant is preserved by inverting the test rather than
  // deleting it: the heading is now a real <button>, and it must ANNOUNCE that it folds.
  //
  // Calibration: drop the chevron and this reddens; drop aria-expanded and it reddens.
  const start = CONTROLS.indexOf("function SourceGroup");
  const helper = CONTROLS.slice(start, CONTROLS.indexOf("\nfunction ", start + 1));
  assert.ok(start !== -1 && helper.length > 0, "SourceGroup moved — this guard is pointed at nothing");

  assert.match(helper, /<button/, "the group heading stopped being a real control");
  assert.match(helper, /aria-expanded=\{open\}/, "a screen reader is no longer told the group folds");
  assert.match(helper, /open \? "chevron-down" : "chevron-right"/, "the heading folds with no visible sign that it does");
  assert.ok(!/<div[^>]*onClick/.test(helper), "the heading is a div pretending to be a button — not keyboard reachable");

  // 🔴 AND A SHUT GROUP STILL REPORTS ITS SIZE. A collapsed section with no number is
  // indistinguishable from an empty one, which is the moment someone concludes their sources were
  // lost. The count is what makes folding safe.
  assert.match(helper, /\{count\}/, "a folded group no longer says how much is inside it");
});

test("🔴 the two groups fold independently, so shutting one never hides the other", () => {
  // Sharing one flag would mean a learner who collapsed a long list of searched websites also lost
  // the three documents they attached themselves — which is the opposite of what folding is for.
  assert.match(CONTROLS, /shutGroups\.documents/, "the documents group lost its own fold state");
  assert.match(CONTROLS, /shutGroups\.websites/, "the websites group lost its own fold state");
  assert.match(CONTROLS, /documents: false,\s*\n\s*websites: false,/, "the groups no longer start open");
});
