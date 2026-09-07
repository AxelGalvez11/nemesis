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
// 2026-09-06: the shelves became ChatGPT Work's Outputs/Sources card (work-panel.tsx); the control
// keeps the toggle, the dock and the reader.
const PANEL = strip(readFileSync(new URL("./work-panel.tsx", import.meta.url), "utf8"));
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
  assert.match(PANEL, /onClick=\{\(\) => onOpen\(source\)\}/, "a document row no longer opens the preview");
  // Repointed 2026-08-28: the setter became `openDocument`, which also brings an already-open
  // document forward instead of listing it twice. The property is that the row has a way to open.
  assert.match(CONTROLS, /onOpenDocument=\{openDocument\}/, "the row is never given a way to open the preview");
  assert.ok(!CONTROLS.includes("/library/source/"), "the sources panel navigates to the old library again");
  assert.match(CONTROLS, /<SourcePreview[\s>]/, "the preview card is not mounted");
});

test("🔴🔴 several documents stay open, and only the front one is mounted", () => {
  // Owner, 2026-08-28: *"it'd be nice if it could have, like, multiple tabs so that they could have
  // different PowerPoints or documents open at the same time."*
  //
  // 🔴 A BOUNDED SET RENDERS — REPOINTED 2026-09-01, AND THE OLD REASON IS STILL LOAD-BEARING.
  // This used to assert that ONLY the front tab renders, because a deck held in memory costs about
  // 20 MB per full-size slide (`slides-document-view.tsx` measured it) and six alive at once is a
  // seized browser. That is still true and still the ceiling this guards.
  //
  // What changed is the other half: rendering one meant every tab switch REMOUNTED the reader —
  // fetch, re-parse, re-render from page one, scroll and zoom lost — which the owner reported as
  // *"slow (it has to load each pdf continually)"*. Three mounted keeps the gesture people actually
  // make instant and bounds the worst case at roughly one deck. So the assertion is now the CAP,
  // not the count of one.
  assert.match(PREVIEW, /const MOUNT_LIMIT = (\d+);/, "the mounted set is unbounded again, which is the seized browser");
  const limit = Number(/const MOUNT_LIMIT = (\d+);/.exec(PREVIEW)?.[1]);
  assert.ok(limit >= 2 && limit <= 4, `MOUNT_LIMIT is ${limit}: 2-4 is the range that is both quick and affordable`);
  assert.match(PREVIEW, /open\.filter\(\(source\) => mounted\.has\(source\.id\)\)\.map/, "every open tab is mounting its own reader");
  // And nothing outside the mounted set is even fetched.
  assert.match(PREVIEW, /if \(states\[source\.id\] \|\| !mounted\.has\(source\.id\)\) continue;/,
    "documents nobody will render are still downloaded");
});

test("🔴🔴 the list and the front tab move together, in one updater", () => {
  // Closing the front tab has to CHOOSE a new front tab, so the list and the choice are one fact.
  // Held apart they become a `setActive` nested inside a `setOpen` updater, which is a defect this
  // codebase has already paid for once: invisible in a diff, and wrong under StrictMode because the
  // updater runs twice. Calibration: split them into two `useState` calls and this reddens.
  // 🔴 IT MOVED TO `document-dock.tsx` AND THE RULE MOVED WITH IT, UNCHANGED. `SourcesControl` used
  // to own this privately, which is why a citation chip could not reach it and a second reading
  // pane got built instead of a wire (owner 2026-09-03). Sharing the state is what let that pane be
  // deleted; the one-updater rule is exactly as load-bearing in its new home.
  const dock = strip(readFileSync(new URL("./document-dock.tsx", import.meta.url), "utf8"));
  // 🔴 REPOINTED FROM THE LITERAL TYPE TO THE PROPERTY (2026-09-03). This pinned the exact
  // `useState<{ open: DockItem[]; activeId: string | null }>` text, so adding a THIRD field to the
  // same single object — `shut`, which is what lets the corner toggle put the pane back the way it
  // was — reddened it while satisfying every word of the rule above. A guard that fails when the
  // one fact grows a field is pinning the sentence, not the claim. What matters is that there is
  // exactly ONE `useState` in this file and the list and the front tab are both inside it.
  const states = dock.match(/useState</g) ?? [];
  assert.equal(states.length, 1, "the dock holds more than one piece of state again");
  assert.match(dock, /useState<DockState>/, "the dock's one state is no longer a named single object");
  // 🔴 `DockItem[]`, NOT `CanvasSource[]` — documents and artifacts are one list since 2026-09-03,
  // which is what stopped an artifact opening a second panel over an open lecture.
  assert.match(dock, /interface DockState \{\s*open: DockItem\[\];\s*activeId: string \| null;/, "the open list and the front tab are separate state again");
  // The lookahead is not cosmetic: `setDocs` itself matches `set[A-Z]…`, so without it this guard
  // fails on two consecutive well-formed calls and says nothing about nesting at all.
  assert.ok(!/setDocs\([\s\S]{0,300}?set(?!Docs)[A-Z][A-Za-z]*\(/.test(dock), "a setState is nested inside the docs updater");
});

test("🔴 a tab remembers the page it was left on", () => {
  // It is what makes a tab a tab rather than a bookmark. Only the front document is mounted, so
  // coming back to one is a fresh open; without this, a learner who marked something on page 40,
  // checked another file and came back would land on page 1 with no idea why. It arrives through
  // the same anchor a citation link uses, so there is one door into "open at this page".
  // 🔴 STILL NEEDED WITH THREE MOUNTED, because the fourth document evicts the first: a learner
  // who opens four files and comes back to the first is remounting it, exactly as before.
  assert.match(PREVIEW, /lastUnit\[source\.id\] \?\? null/, "a reopened tab no longer starts where it was left");
  assert.match(PREVIEW, /onUnitChange=\{\(unit\) => rememberUnit\(source\.id, unit\)\}/, "nothing records the page a tab was on");
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
  // 🔴 THE SIGNATURE GREW A THIRD ARGUMENT 2026-09-03 — `notes`, what the learner marked — so this
  // matches the prop being OPTIONAL rather than its exact shape. What it protects is unchanged and
  // is the `?`: a reader mounted without a chat lane (the Library's attachment popup) must not grow
  // a dead toolbar. Pinning the full parameter list made a test about dead toolbars fail because an
  // annotation learned to describe itself.
  assert.match(reader, /onSendToChat\?: \(prompt: string, files: File\[\]/, "the reader requires a chat lane again, which forces a dead toolbar wherever there is none");
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

test("🔴🔴 the card is two sections, Outputs then Sources, in the owner's 2026-09-06 words", () => {
  // Owner's answer to "what should Sources list?": "Files + Web search". No Inputs shelf, no tabs.
  assert.match(PANEL, /<Section label="Outputs">/, "the Outputs section is gone");
  assert.match(PANEL, /label="Sources"/, "the Sources section is gone");
  assert.ok(PANEL.indexOf('label="Outputs"') < PANEL.indexOf('label="Sources"'), "the sections are not in the reference's order");
  assert.ok(!/label="Inputs"/.test(PANEL), "the Inputs shelf is back");
  assert.match(PANEL, /documents\.map\(/, "the Sources section renders no files");
  assert.match(PANEL, /Web search/, "the Sources section has no Web search row");
  assert.ok(!/setTab\(/.test(CONTROLS), "the sources/outputs tabs are back");
  assert.ok(!/tab === "sources"/.test(CONTROLS), "the panel branches on a tab again");
});

test("🔴🔴 both sections stand, and each says plainly when it is empty", () => {
  // ChatGPT's card prints both sections whatever they hold; an empty Outputs shows a placeholder
  // row. Ours says "Nothing made yet" / "Nothing attached yet" in the row's place, never a shelf
  // that vanishes and takes the model-knowledge disclosure with it (canvas-provenance.test.ts).
  assert.match(PANEL, /Nothing made yet/, "an empty Outputs section says nothing");
  assert.match(PANEL, /Nothing attached yet/, "an empty Sources section says nothing");
  assert.match(PANEL, /function Section\(/, "the section component moved — this guard is pointed at nothing");
});

test("🔴 the panel's own icon is the reference's, not the Library's", () => {
  // Owner, 2026-08-25, with the glyph screenshotted. `library` is a stack of books, which reads as
  // "go to the Library" — a different surface this panel is repeatedly mistaken for.
  // 2026-09-06: their own mark, lifted from their sprite, replaces the nearest codicon.
  assert.match(CONTROLS, /<SourcesGlyph \/>/, "the panel trigger stopped using the reference's icon");
  assert.match(readFileSync(new URL("../../icons.tsx", import.meta.url), "utf8"), /export function SourcesGlyph/, "the glyph is gone");
  assert.ok(!/name="library"/.test(CONTROLS), "the books icon is back on the panel trigger");
});

test("🔴🔴 Outputs has no `+`, because those three rows are not coming back", () => {
  const outputs = PANEL.slice(PANEL.indexOf('<Section label="Outputs">'));
  const heading = outputs.slice(0, outputs.indexOf("</Section>"));
  assert.ok(!/onAdd/.test(heading), "the Outputs section grew an add control");
  assert.match(PANEL, /onAdd=\{\(\) => picker\.current\?\.click\(\)\}/, "the `+` no longer opens the file picker");
});

test("🔴🔴 every section folds, and folding stays safe without a count", () => {
  const start = PANEL.indexOf("function Section");
  const section = PANEL.slice(start, PANEL.indexOf("\nfunction ", start + 1));
  assert.match(section, /const \[open, setOpen\] = useState\(true\)/, "sections no longer fold, or no longer start open");
  assert.match(section, /aria-expanded=\{open\}/, "a screen reader is not told the section folds");
  assert.match(section, /open \? "chevron-down" : "chevron-right"/, "the section folds with no visible sign that it does");
  assert.ok(!/\{rows\.length\}<\/span>/.test(section), "the count is back — the reference has none");
});

test("🔴 a row is ONE line — the descriptions are gone", () => {
  assert.ok(!/excerpt\{source\.excerpts\.length === 1/.test(PANEL), "the excerpt count is back under every source");
  assert.ok(!PANEL.includes("Flashcard deck · click to review"), "the flashcards description is back");
  assert.ok(!PANEL.includes("Note · in your Library"), "the note description is back");
  assert.ok(!PANEL.includes("Slides · click to download .pptx"), "the slides description is back");
  assert.match(PANEL, /source\.coverageLabel/, "a half-read source no longer says so");
  assert.match(PANEL, /OUTPUT_KIND_MARKS\[output\.kind\]/, "output rows lost the mark that says what they are");
});

test("🔴 the split uses the same host rule the rows already use", () => {
  // Only the files reach the card (2026-09-06); the host rule is still what tells a file from a page.
  assert.match(CONTROLS, /const documents = canvas\.sources\.filter\(\(source\) => hostnameOf\(source\.sourceUrl\) === null\)/);
  assert.ok(!/websites\.map\(/.test(PANEL), "pages Nemesis read are listed as sources again");
});

test("🔴🔴 a section heading is the fold, and it looks like one", () => {
  // ChatGPT's section label is a button with a chevron (measured 2026-09-06: 28px, `px-4 py-1`,
  // 14px label, 12px chevron). Pressable, and it says so.
  const start = PANEL.indexOf("function Section");
  const section = PANEL.slice(start, PANEL.indexOf("\nfunction ", start + 1));
  assert.match(section, /<button\s+aria-expanded=\{open\}/, "the heading is not a real button");
  assert.match(section, /name=\{open \? "chevron-down" : "chevron-right"\} size="12px"/, "the heading lost its chevron");
  assert.ok(!/Show \$\{hidden\} more/.test(PANEL), "the old capped tail is back");
});

test("🔴 the card scrolls instead of capping, as theirs does", () => {
  assert.match(PANEL, /max-h-\[calc\(100svh-84px\)\] overflow-y-auto/, "the card neither caps nor scrolls");
  assert.ok(!/shutGroups/.test(CONTROLS), "the old shared fold state is back");
});