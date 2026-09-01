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
  // Repointed 2026-08-28: the setter became `openDocument`, which also brings an already-open
  // document forward instead of listing it twice. The property is that the row has a way to open.
  assert.match(CONTROLS, /onPreview=\{openDocument\}/, "the row is never given a way to open the preview");
  assert.ok(!CONTROLS.includes("/library/source/"), "the sources panel navigates to the old library again");
  assert.match(CONTROLS, /<SourcePreview[\s>]/, "the preview card is not mounted");
});

test("🔴🔴 several documents stay open, and only the front one is mounted", () => {
  // Owner, 2026-08-28: *"it'd be nice if it could have, like, multiple tabs so that they could have
  // different PowerPoints or documents open at the same time."*
  //
  // 🔴 ONLY THE FRONT ONE RENDERS, and that is the design rather than an optimisation. A deck held
  // in memory costs about 20 MB per full-size slide — `slides-document-view.tsx` measured it — so
  // six background tabs rendering quietly is a seized browser. A tab that is not in front is a name
  // and a remembered page, which costs nothing and is why no cap is needed.
  //
  // Calibration: render `open.map(source => <DocumentReader …>)` and this reddens.
  assert.ok(!/open\.map\([\s\S]{0,400}?<DocumentReader/.test(PREVIEW), "every open tab is mounting its own reader");
  assert.match(PREVIEW, /const active = open\.find\(/, "the panel no longer picks one document to show");
  assert.match(PREVIEW, /key=\{active\.id\}/, "switching tabs hands one reader a different document, keeping the last one's zoom and mode");
});

test("🔴🔴 the list and the front tab move together, in one updater", () => {
  // Closing the front tab has to CHOOSE a new front tab, so the list and the choice are one fact.
  // Held apart they become a `setActive` nested inside a `setOpen` updater, which is a defect this
  // codebase has already paid for once: invisible in a diff, and wrong under StrictMode because the
  // updater runs twice. Calibration: split them into two `useState` calls and this reddens.
  assert.match(CONTROLS, /useState<\{ open: CanvasSource\[\]; activeId: string \| null \}>/, "the open list and the front tab are separate state again");
  // The lookahead is not cosmetic: `setDocs` itself matches `set[A-Z]…`, so without it this guard
  // fails on two consecutive well-formed calls and says nothing about nesting at all.
  assert.ok(!/setDocs\([\s\S]{0,300}?set(?!Docs)[A-Z][A-Za-z]*\(/.test(CONTROLS), "a setState is nested inside the docs updater");
});

test("🔴 a tab remembers the page it was left on", () => {
  // It is what makes a tab a tab rather than a bookmark. Only the front document is mounted, so
  // coming back to one is a fresh open; without this, a learner who marked something on page 40,
  // checked another file and came back would land on page 1 with no idea why. It arrives through
  // the same anchor a citation link uses, so there is one door into "open at this page".
  assert.match(PREVIEW, /lastUnit\[active\.id\] \?\? null/, "a reopened tab no longer starts where it was left");
  assert.match(PREVIEW, /onUnitChange=\{\(unit\) => rememberUnit\(active\.id, unit\)\}/, "nothing records the page a tab was on");
  const reader = strip(readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8"));
  // 🔴 AND IT COUNTS SCROLLING. Three things change the unit — the toolbar, a search step, and
  // simply scrolling — so a host told about only the first two reopens a scrolled document at the
  // top and reads as broken rather than forgetful.
  assert.match(reader, /onUnitChange=\{noteUnit\}/, "the views no longer report the page they scrolled to");
});

test("🔴🔴 the preview shows the ORIGINAL document, whatever kind it is — never the extraction", () => {
  // 🔴🔴 REPOINTED 2026-08-27, AND THE PROPERTY GOT STRONGER RATHER THAN THE GUARD LOOSER. This
  // pinned `openPdf` and `<PdfThumbnail>` — this file rendering pages ITSELF — which is precisely
  // why it could only ever show PDFs and images. Owner: *"it still won't let me view the attachment
  // I put in, it's a docx, users should be able to view slides, docs, pdf, xlsx, etc."*
  //
  // The renderers already existed: `DocumentReader` dispatches to the docx, slides, PDF and image
  // views and has had a trimmed `variant="dialog"` the whole time. It was never mounted here. So
  // the panel stopped rendering anything itself, and "shows the original" now holds for every kind
  // instead of two.
  assert.match(PREVIEW, /loadLibrarySource\(/, "the preview does not resolve the library row");
  assert.match(PREVIEW, /readerSourceFromLibrary\(row\)/, "the preview builds its own idea of the file's kind instead of the Library's");
  // Repointed 2026-08-28 when the mount grew props (`grounded`, `onSendToChat`). The property is
  // WHICH component renders the file and in which shape, not the exact prop list — pinning the
  // literal JSX made every later prop a false failure.
  assert.match(PREVIEW, /<DocumentReader\b/, "the preview no longer mounts the real reader");
  assert.match(PREVIEW, /source=\{state\.source\}/, "the reader is handed something other than the resolved library row");
  assert.match(PREVIEW, /variant="dialog"/, "the reader is mounted with the full page chrome inside a panel");
  // 🔴 AND IT MUST NOT GO BACK TO RENDERING PAGES ITSELF, which is the shape that excluded docx.
  assert.ok(!/openPdf\(/.test(PREVIEW), "the panel is opening PDF bytes itself again — that path cannot show a docx");
  assert.ok(!/<PdfThumbnail/.test(PREVIEW), "the panel is drawing its own thumbnails again");
  // And no extracted text: rendering `excerpts` here is exactly the badly-rendering markdown the
  // owner reported. The excerpt count belongs to the panel row, not to this card.
  assert.ok(!/excerpts/.test(PREVIEW), "the preview reaches for the extraction");
});

test("🔴🔴 the panel HAS a chat lane now, and the reader still hides its toolbar without one", () => {
  // 🔴🔴 DELIBERATELY INVERTED, 2026-08-28. This used to assert the OPPOSITE — that the panel omits
  // `onSendToChat` — and the reason it gave was true when it was written: the panel existed only to
  // SHOW the file, so a toolbar here would have been a control that does nothing. Owner then asked
  // for the thing that changes the premise: *"you can select a piece of the document on the sidebar
  // ... and send it to nemesis."* The canvas IS the chat lane. So the panel passes a route and the
  // toolbar lights up.
  //
  // What must NOT be lost is the property the old guard was really protecting, which is about the
  // READER and not about this panel: no action bar where there is nowhere to send. Both halves are
  // asserted below, because the Library's attachment popup still mounts the reader without a route.
  assert.match(PREVIEW, /onSendToChat=\{onSendToChat\}/, "the panel no longer forwards a way to ask about a selection");
  const reader = strip(readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8"));
  assert.match(reader, /onSendToChat\?: \(prompt: string, files: File\[\]\) => void;/, "the reader requires a chat lane again, which forces a dead toolbar wherever there is none");
  // 🔴 REPOINTED 2026-09-01. The bar this line pinned is gone — a highlight opens a comment box now
  // (owner: *"only comment like 'send to nemesis' or 'add comment'"*). The property it protected is
  // NOT gone and is asserted in its new form: without a chat lane the Send button is not rendered
  // at all, while "Add comment" still works, because keeping a note needs no lane. Absent, never
  // inert — the same rule, one level down.
  const layer = strip(readFileSync(new URL("../reader/comment-layer.tsx", import.meta.url), "utf8"));
  assert.match(reader, /onSend=\{onSendToChat \? sendComment : null\}/, "the note box is handed a send route that may not exist");
  assert.match(layer, /\{onSend && \([\s\S]{0,400}?data-testid="reader-comment-send"/, "the send button mounts without somewhere to send");
});

test("🔴🔴 the panel never files the same document into the same canvas twice", () => {
  // `DocumentReader` attaches its own extracted text to every action, and that is right in the
  // LIBRARY: that chat has never read the file being asked about, so naming it in the prompt would
  // ground nothing. The canvas is the opposite case by construction — this panel can only open a
  // source the canvas already holds — so the same behaviour here files a whole document a second
  // time on every "Explain this".
  //
  // Calibration: drop `grounded` and this reddens.
  assert.match(PREVIEW, /grounded/, "the reader is left free to re-attach a document the canvas already grounds");
  const reader = strip(readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8"));
  assert.match(reader, /if \(grounded\) return \[\];/, "grounded no longer suppresses the reader's text dump");
  // 🔴 AND ONLY THE TEXT DUMP. A cut-out of a marked area exists nowhere else, so it travels even
  // here — suppressing it would send a question about a picture with no picture attached.
  assert.match(reader, /\.\.\.documentAttachment\(\), \.\.\.\(cropped \? \[cropped\] : \[\]\)/, "the marked-area cut-out stopped travelling with the question");
});

test("🔴 a source with no kept bytes gets a sentence, not a blank card", () => {
  assert.match(PREVIEW, /wasn't filed to your Library/, "the ephemeral case says nothing");
});

test("🔴 the panel owns no document lifetime, because it opens no document", () => {
  // This held `opened?.close()` — openPdf's contract, one leaked worker per preview otherwise.
  // The panel no longer opens bytes at all; the reader owns that, and its own guards cover it.
  // What must stay true here is that this file does not grow a second pipeline with a second
  // lifetime to forget about.
  assert.ok(!/OpenedPdf|opened\?\.close\(\)/.test(PREVIEW), "the panel is managing a pdf.js document again");
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
