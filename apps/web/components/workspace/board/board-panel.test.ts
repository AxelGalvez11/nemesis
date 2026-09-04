// The board's documents: drawn in their own cards, with no panel and no annotation layer.
//
// 🔴🔴🔴 READ THIS BEFORE "FIXING" A GUARD BELOW. This file has been rewritten three times in one
// day, and every rewrite was the owner reversing himself in writing, 2026-09-04:
//
//   1. *"i still want the right sidebar panel to work too where i can view many tabs of the sources
//      and also annotate any document"* — it shipped as a docked sidebar with tabs and annotations.
//   2. *"i dont want a sidebar to open in canvas, that does not make sense"* — it became a cover.
//   3. *"pdfs, docx, pptx, still cannot be seen in the canvas, they only render text"* and *"i dont
//      want any popups in canvas, everything should be seen and done within the cards"* — the
//      document moved INTO the card it was dropped as, and the panel went.
//   4. *"remove the annotation from pdf docs"* — the annotate layer went with it.
//
// So the tests that used to assert an annotation layer now assert its ABSENCE. They were flipped
// rather than deleted, because the parse and save of an annotated board still has to work: a board
// annotated between (1) and (4) holds notes that must survive every future save.
//
// 🔴 WHAT THE REST GUARD IS REUSE, not a new feature's wiring. The chat already had a reader; the
// risk was never that the board would lack one, it was that the board would grow a SECOND.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseBoardAnnotations, serializeBoardAnnotations, type BoardAnnotation } from "@/lib/board/board-annotations";
import { parseBoardState, serializeBoardState, type BoardSource, type BoardState } from "@/lib/board/board-model";
import { documentKey, withClosed, withOpened, type DockItem, type DockState } from "@/components/workspace/learn/document-dock";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const PANEL = read("./board-panel.tsx");
const DOC = read("./source-document.tsx");
const PAGE = read("./board-page.tsx");
const CARD = read("./other-cards.tsx");
const READER = readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8");
const CHROME = read("./board-chrome.tsx");
const CHAT = read("./conversation-card.tsx");
const PROVIDER = read("./board-provider.tsx");

// ── Many tabs ────────────────────────────────────────────────────────────────

const tab = (id: string): DockItem => ({
  key: documentKey(id),
  kind: "document",
  source: { excerpts: [], id, kind: "document", title: `Lecture ${id}` },
});

const EMPTY: DockState = { activeId: null, open: [], shut: null };

test("🔴🔴 several sources open as several tabs, and closing one keeps the rest", () => {
  // The whole point of the panel the owner asked for: *"view many tabs of the sources"*. A pane
  // that replaced its document on every open would be a viewer, not a place to work from.
  let state = withOpened(EMPTY, tab("a"));
  state = withOpened(state, tab("b"));
  state = withOpened(state, tab("c"));
  assert.deepEqual(state.open.map((item) => item.key), [documentKey("a"), documentKey("b"), documentKey("c")]);
  assert.equal(state.activeId, documentKey("c"), "the document just opened is not in front");

  // Closing the middle one leaves the other two alone and does not move the front tab.
  const middleGone = withClosed(state, documentKey("b"));
  assert.deepEqual(middleGone.open.map((item) => item.key), [documentKey("a"), documentKey("c")]);
  assert.equal(middleGone.activeId, documentKey("c"), "closing a background tab moved the front one");

  // Closing the FRONT one falls back to the end of the strip, which is where attention was.
  const frontGone = withClosed(state, documentKey("c"));
  assert.deepEqual(frontGone.open.map((item) => item.key), [documentKey("a"), documentKey("b")]);
  assert.equal(frontGone.activeId, documentKey("b"));

  // And the panel only closes when the LAST tab goes.
  const one = withClosed(withClosed(frontGone, documentKey("b")), documentKey("a"));
  assert.deepEqual(one.open, []);
  assert.equal(one.activeId, null);
});

test("🔴 opening a document already open brings it forward instead of listing it twice", () => {
  const state = withOpened(withOpened(EMPTY, tab("a")), tab("b"));
  const again = withOpened(state, tab("a"));
  assert.equal(again.open.length, 2, "the same document is in the strip twice");
  assert.equal(again.activeId, documentKey("a"), "re-opening did not bring it to the front");
});

test("🔴🔴 the panel reuses the chat's reader, strip and chrome, and builds none of its own", () => {
  // Every one of these was already built and tested. A second copy of any of them is the failure
  // this repo has shipped twice (a second reading pane, a second study panel) and deleted twice.
  assert.match(DOC, /import \{ DocumentReader \} from "@\/components\/workspace\/reader\/document-reader"/, "the card no longer uses the product's reader");
  assert.match(PANEL, /useDocumentDockState/, "the deliverable dock lost its state");
  // 🔴 AND NO PER-TYPE RENDERING. `DocumentReader` dispatches to the pdf/docx/slides/sheet/image
  // views; a board component reaching for one of them directly is a second reader being born.
  for (const view of ["PdfDocumentView", "DocxDocumentView", "SlidesDocumentView", "SheetDocumentView", "ImageDocumentView"]) {
    assert.ok(!DOC.includes(view) && !PANEL.includes(view), `the board renders ${view} itself instead of through the reader`);
  }
});

test("🔴🔴 a document opens IN ITS CARD: no sidebar, no cover, nothing over the board", () => {
  // 🔴🔴🔴 THE THIRD ARRANGEMENT IN ONE DAY, AND EVERY MOVE WAS THE OWNER'S. It shipped as a docked
  // sidebar that narrowed the board; he read it the same morning (*"i dont want a sidebar to open in
  // canvas, that does not make sense"*) so it became a cover over the window; and by the afternoon:
  // *"pdfs, docx, pptx, still cannot be seen in the canvas, they only render text"* and *"i dont
  // want any popups in canvas, everything should be seen and done within the cards"*. A canvas is
  // made of cards, so the document is drawn in the card it was dropped as.
  assert.match(CARD, /<SourceDocument interactive=/, "the source card does not draw its document");
  assert.ok(!CARD.includes("openInPanel"), "the source card still sends its document somewhere else");
  assert.match(DOC, /nodrag nopan nowheel/, "the reader in a card must opt out of React Flow's drag and wheel");
  // Nothing left for a document tab to open, and no width taken from the board.
  assert.match(PANEL, /useDocumentDockState\(\[\]\)/, "documents are back in the dock");
  assert.ok(!PANEL.includes("reader-cover-in"), "the document panel is still drawn over the board");
  // A deliverable is the one thing left with no card of its own, and it covers rather than docks.
  assert.match(PAGE, /initialMode="full"/, "a deliverable opens in a docked panel again");
  assert.match(PAGE, /const inset = useSidePanelInset\(\);/, "the board page stopped reading a panel's claim");
});

test("🔴🔴 a document on the board has NO annotation layer, and cannot grow one", () => {
  // Owner, 2026-09-04, hours after asking for it: *"remove the annotation from pdf docs"*. What he
  // saw is what his screenshot circled — a comment icon, a count and a three-dot menu stacked above
  // the first line of the document, which is a second grammar for talking to Nemesis on a board
  // whose whole grammar is cards.
  //
  // 🔴 THE READER TURNS THE WHOLE LAYER OFF WHEN IT IS GIVEN NO `commentsDoc` (`canComment` is
  // `Boolean(commentsDoc) && …`), so absence is the switch. Nothing is hidden with CSS and nothing
  // is left inert underneath.
  assert.ok(!/commentsDoc=/.test(DOC), "the card still hands the reader a comment document");
  assert.ok(!/annotationLook/.test(DOC), "the card still asks for an annotation look");
  assert.ok(!/CommentLayer/.test(DOC), "the card reaches for the comment layer itself");
  assert.match(READER, /Boolean\(commentsDoc\) &&/, "the reader stopped gating comments on being given a document");
  assert.ok(!/source-card-annotations/.test(CARD), "the source card still shows an annotation count");
});

test("🔴 an annotated board still loads and saves, with nothing left to draw its notes", () => {
  // The store that wrote these is deleted; the field is not. A learner who annotated a document
  // between the morning and the evening of 2026-09-04 has notes inside their board's JSON, and the
  // board reads them, carries them and writes them back. Dropping the field instead would delete
  // that learner's work on their next autosave.
  assert.ok(!/board-annotation-store/.test(DOC) && !/board-annotation-store/.test(PANEL), "the deleted store is still imported");
  const kept = parseBoardState(serializeBoardState(board([NOTE, ANSWER])));
  assert.equal(kept.annotations?.length, 2, "an annotated board lost its notes on a save");
});

test("🔴🔴 a document in a card fills the card, and says nothing above itself", () => {
  // Owner, 2026-09-04, twice in one message: *"remove this line"* (of the notice that used to sit
  // above every reconstructed document) and *"also fit document width to size of the card node by
  // default"*.
  assert.ok(!DOC.includes("This is the text Nemesis read out of the file"), "the notice is back above the document");
  assert.match(DOC, /\bbare\b/, "the card stopped asking for a bare reader");
  assert.match(READER, /data-bare=\{bare \? "true" : undefined\}/, "the reader stopped saying which window it is in");
  // 🔴 THE TRIM IS CSS ON AN ATTRIBUTE, NOT A MEDIA QUERY, and that distinction is the whole fix:
  // `@media (max-width: 640px)` already halved the page margin and never fired here, because it
  // asks the WINDOW (1800px) rather than the card (640px). Measured before and after: a .md file's
  // text column went from 424px to 561px inside a 640px card.
  const CSS = readFileSync(new URL("../../../app/styles/reader.css", import.meta.url), "utf8");
  assert.match(CSS, /\.nemesis-reader\[data-bare="true"\] \.nemesis-reader-room/, "the room keeps its full-screen padding inside a card");
  assert.match(CSS, /\.nemesis-reader\[data-bare="true"\] \.nemesis-reader-page/, "the sheet keeps its full-screen margin inside a card");
  // 🔴 ALL FOUR VIEWS HAVE TO CARRY THE HOOK, or a PDF and a deck keep the padding a .md loses.
  for (const view of ["pdf-document-view.tsx", "slides-document-view.tsx", "docx-document-view.tsx", "text-document-view.tsx"]) {
    const source = readFileSync(new URL(`../reader/${view}`, import.meta.url), "utf8");
    assert.ok(source.includes("nemesis-reader-room"), `${view}'s scroll room is not marked as one`);
  }
});

test("🔴🔴 a document card is a BOX you can move, not a page that grows out of one", () => {
  // Owner, 2026-09-04, of a canvas made before sources carried a default height: *"it's sort of not
  // contained within the box. It's sort of clipping out, and it's glitchy. I can't really grab it.
  // It's not functional like the other one, like the chats. It's like I can't move it."* Three
  // symptoms, two causes, both measured in a browser rather than reasoned about.
  const SURFACE = read("./board-surface.tsx");

  // 🔴 CAUSE ONE: a source saved before `SOURCE_DEFAULT_HEIGHT` existed has no height, so React
  // Flow let its node grow to its content, and its content is a whole document. Measured: a
  // 55-slide deck became a 1,581px node. Every open source gets a height now.
  assert.match(SURFACE, /source\.collapsed \? undefined : \(source\.height \?\? SOURCE_DEFAULT_HEIGHT\)/, "a source with no stored height is unbounded again");
  assert.ok(!/height: source\.height\b/.test(SURFACE), "a source node still takes its height raw");

  // 🔴 CAUSE TWO: the CARD only filled its node when a height had been stored, so on those same
  // boards a 1,579px card sat inside a 560px node, spilling over everything under it while the
  // board's hit-testing still used the node's box. That is the whole of "clipping out" and
  // "glitchy".
  assert.match(CARD, /const fixed = !source\.collapsed;/, "the card stopped filling its own node");

  // 🔴 AND THE DRAG: `nodrag nopan` covers nearly the whole card, so a press in the middle of a
  // document moved it 0px. A thread solved this long ago — a card you have not chosen is an object
  // you move, one you have chosen is a document you read — and a document card follows it now.
  assert.match(CARD, /<SourceDocument interactive=\{selected === true\} source=\{source\} \/>/, "the document is not told whether its card is chosen");
  assert.match(DOC, /interactive \? "nodrag nopan nowheel" : "pointer-events-none select-none"/, "the document is interactive before its card is chosen, so the card cannot be dragged");
  assert.match(CHAT, /selected \? "nodrag nopan cursor-auto select-text" : "select-none"/, "the rule the document card copies is gone from the conversation card");
});

test("🔴🔴 no board node is registered under one of React Flow's own type names", () => {
  // 🔴 THIS IS A REAL DEFECT THE OWNER REPORTED AND I FIRST MISREAD. *"tests and notes retain a box
  // outline around them"* (2026-09-04) was not our card's border and not the check's own ring: the
  // deliverable node was registered as `output`, which is a BUILT-IN React Flow type, and its
  // stylesheet styles built-ins by class name. `.react-flow__node-output` carries `padding: 10px`,
  // `width: 150px`, `text-align: center` and a solid border, so every deliverable was drawn inside
  // a second rectangle with a centred title. Found by reading `getComputedStyle` in a browser.
  const SURFACE = read("./board-surface.tsx");
  const types = SURFACE.match(/const NODE_TYPES = \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(types.length > 0, "the node type map moved or was renamed");
  for (const built of ["input", "output", "default", "group"]) {
    assert.ok(!new RegExp(`(^|[{,\\s])${built}:`).test(types), `a node is registered as "${built}", which React Flow styles itself`);
  }
  // And nothing builds a node with one of those names either.
  for (const built of ["input", "output", "default", "group"]) {
    assert.ok(!SURFACE.includes(`type: "${built}"`), `a node is built with the built-in type "${built}"`);
  }
});

test("🔴🔴 a document wears the conversation card's chrome, and the same verbs", () => {
  // Owner, 2026-09-04: *"make sure all card node designs are consistent and match, use
  // wondering.app/canvas for baseline"*, and *"users should be allowed to collapse, delete, make
  // note, make flashcards, and make tests from documents too that were dropped in"*.
  //
  // 🔴 ONE BAR, ONE SET OF PLUSES. Every card kind reaches for the shared parts rather than
  // hand-rolling a header row of its own, which is how the board came to have three of them: one
  // floating above a thread, one inside a document, one inside a deliverable.
  assert.match(CHROME, /export function CardTitleBar/, "the shared title bar is gone");
  assert.match(CHROME, /export function BranchButtons/, "the shared branch buttons are gone");
  for (const [name, file] of [["the document card", CARD], ["the conversation card", CHAT]] as const) {
    assert.match(file, /<CardTitleBar/, `${name} draws its own header row`);
    assert.match(file, /<BranchButtons/, `${name} has no four-sided pluses`);
  }
  for (const label of ["Make a note from this", "Make flashcards from this", "Make a test from this", "Collapse document", "Delete document"]) {
    assert.ok(CARD.includes(label), `a dropped document cannot ${label.toLowerCase()}`);
  }
  // 🔴 AND THE TWO BUTTONS UNDER IT ARE GONE — owner, same message: *"remove 'create lesson'"* and
  // *"remove 'ask about this'"*. A plus on the side of the document is how a thread starts from one
  // now, which is the same gesture a thread already used.
  assert.ok(!CARD.includes("Create lesson"), "the document card still offers to create a lesson");
  assert.ok(!CARD.includes("Ask about this"), "the document card still offers to ask about it");
  assert.ok(!PROVIDER.includes("const createLessonFromSource"), "the lesson maker outlived its button");
  assert.match(PROVIDER, /const source = parent \? undefined : sources\.find/, "a document cannot start a card of its own");
});

// ── The round trip ───────────────────────────────────────────────────────────

const SOURCE: BoardSource = {
  content: "Glargine precipitates at the neutral pH under the skin.",
  id: "src-1",
  name: "Lecture 9.md",
  position: { x: 0, y: 0 },
  previewUrls: [],
  status: "ready",
  type: "document",
  width: 640,
};

const NOTE: BoardAnnotation = {
  anchor: { quote: "precipitates at the neutral pH", x: 0.4, y: 0.6 },
  author: "learner",
  body: "Why does the lower pH keep it dissolved?",
  createdAt: "2026-09-04T09:00:00.000Z",
  id: "ann-1",
  parentId: null,
  resolvedAt: null,
  sourceId: "src-1",
  unit: 1,
};

const ANSWER: BoardAnnotation = {
  anchor: {},
  author: "nemesis",
  body: "Two extra arginines shift the point of least solubility up to about 6.7.",
  createdAt: "2026-09-04T09:00:20.000Z",
  id: "ann-1-a",
  parentId: "ann-1",
  resolvedAt: null,
  sourceId: "src-1",
  unit: 1,
};

const board = (annotations: BoardAnnotation[]): BoardState => ({
  annotations,
  cards: [],
  outputs: [],
  selectedSourceIds: [],
  sources: [SOURCE],
  useWebSearch: false,
});

test("🔴🔴 an annotation and its answers survive the save, and come back on the same spot", () => {
  // The owner's whole reason for the panel is a place to work from. A note that vanished on reload
  // would be worse than no note at all: the learner would stop trusting the ones that did survive.
  const reopened = parseBoardState(serializeBoardState(board([NOTE, ANSWER])));
  assert.equal(reopened.annotations?.length, 2, "the thread did not survive the round trip");
  const back = reopened.annotations?.find((row) => row.id === "ann-1");
  assert.equal(back?.body, NOTE.body);
  assert.equal(back?.anchor.quote, "precipitates at the neutral pH", "the words the note was made on were dropped");
  assert.equal(back?.anchor.x, 0.4, "the pin lost its position");
  assert.equal(back?.unit, 1);
  assert.equal(reopened.annotations?.find((row) => row.id === "ann-1-a")?.author, "nemesis", "Nemesis's answer came back as the learner's");
});

test("🔴🔴 a board saved before annotations existed still loads", () => {
  // Every board in the database predates this field. Missing reads as none, never as an error.
  const old = { cards: [], selectedSourceIds: [], sources: [SOURCE], useWebSearch: false, version: 1 };
  const loaded = parseBoardState(old);
  assert.equal(loaded.annotations, undefined, "an unannotated board grew an annotations field");
  assert.equal(loaded.sources.length, 1, "an old board stopped loading its sources");
  // And a board with nothing pinned writes no field at all rather than an empty array.
  assert.ok(!("annotations" in serializeBoardState(board([]))), "every board now carries an empty annotations array");
});

test("🔴 a note whose source is gone, and an answer whose note is gone, are both cut", () => {
  // The same rule `serializeBoardState` already applies to a card's `sourceIds`: a reference to
  // something that is not on the board points at nothing, and a reply with no question above it is
  // a turn in a conversation that no longer exists.
  const orphan: BoardAnnotation = { ...NOTE, id: "ann-2", sourceId: "gone" };
  const kept = serializeBoardAnnotations([NOTE, ANSWER, orphan], new Set(["src-1"]));
  assert.deepEqual(kept.map((row) => row.id), ["ann-1", "ann-1-a"]);
  assert.deepEqual(serializeBoardAnnotations([ANSWER], new Set(["src-1"])), [], "an answer outlived the note it answered");
});

test("🔴 a stored annotation is read defensively, because it is learner data in a JSON blob", () => {
  const rows = parseBoardAnnotations([
    null,
    "not an object",
    { body: "no id", sourceId: "src-1" },
    { body: "   ", id: "blank", sourceId: "src-1" },
    { anchor: { x: 7, y: -3, box: { height: "no", width: 1, x: 0, y: 0 } }, author: "someone", body: "kept", id: "ok", sourceId: "src-1", unit: "three" },
  ]);
  assert.equal(rows.length, 1, "a malformed row was let through");
  const row = rows[0]!;
  assert.equal(row.author, "learner", "an unknown author was allowed to speak as Nemesis");
  assert.equal(row.unit, null, "a unit that is not a number was kept");
  assert.equal(row.anchor.x, 1, "a fraction outside 0-1 was not clamped");
  assert.equal(row.anchor.y, 0);
  assert.equal(row.anchor.box, undefined, "a half-built box was kept");
});
