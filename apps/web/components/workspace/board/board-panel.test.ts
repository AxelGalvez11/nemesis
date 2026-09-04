// The board's reading panel: many documents open at once, and an annotation that survives the save.
//
// Owner, 2026-09-04: *"i still want the right sidebar panel to work too where i can view many tabs
// of the sources and also annotate any document to have an inline chat with the annotation"*, and
// *"preferably in the style of the canvas chats"*.
//
// 🔴 WHAT THESE GUARD IS THE REUSE, not a new feature's wiring. The chat already had a reader, a tab
// strip, a comment layer and a model door for a margin answer; the risk in this change was never
// that the board would lack one of those, it was that the board would grow a SECOND of each. So
// half of what is below asserts that a thing is imported rather than rebuilt.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  annotationCountLabel,
  openAnnotationCount,
  parseBoardAnnotations,
  serializeBoardAnnotations,
  type BoardAnnotation,
} from "@/lib/board/board-annotations";
import { parseBoardState, serializeBoardState, type BoardSource, type BoardState } from "@/lib/board/board-model";
import { documentKey, withClosed, withOpened, type DockItem, type DockState } from "@/components/workspace/learn/document-dock";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const PANEL = read("./board-panel.tsx");
const DOC = read("./source-document.tsx");
const PAGE = read("./board-page.tsx");
const CARD = read("./other-cards.tsx");
const STORE = read("./board-annotation-store.ts");
const LAYER = readFileSync(new URL("../reader/comment-layer.tsx", import.meta.url), "utf8");
const READER = readFileSync(new URL("../reader/document-reader.tsx", import.meta.url), "utf8");

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
  assert.match(CARD, /<SourceDocument source=\{source\} \/>/, "the source card does not draw its document");
  assert.ok(!CARD.includes("openInPanel"), "the source card still sends its document somewhere else");
  assert.match(DOC, /nodrag nopan nowheel/, "the reader in a card must opt out of React Flow's drag and wheel");
  // Nothing left for a document tab to open, and no width taken from the board.
  assert.match(PANEL, /useDocumentDockState\(\[\]\)/, "documents are back in the dock");
  assert.ok(!PANEL.includes("reader-cover-in"), "the document panel is still drawn over the board");
  // A deliverable is the one thing left with no card of its own, and it covers rather than docks.
  assert.match(PAGE, /initialMode="full"/, "a deliverable opens in a docked panel again");
  assert.match(PAGE, /const inset = useSidePanelInset\(\);/, "the board page stopped reading a panel's claim");
});

test("🔴🔴 an annotation opens ONE conversation, in the board's card language, through the one model door", () => {
  // Owner: *"an inline chat with the annotation ... preferably in the style of the canvas chats"*.
  assert.match(DOC, /annotationLook="card"/, "the board's annotations wear the margin's look");
  assert.match(READER, /annotationLook\?: "margin" \| "card";/, "the reader lost the look it draws annotations in");
  assert.match(LAYER, /look\?: "margin" \| "card";/, "the comment layer cannot be asked for the card look");
  // The card's own grammar: the learner's turn in the learner's bubble, Nemesis's in the chat's
  // markdown, and a follow-up field. All three are what a conversation card on the board is.
  assert.match(LAYER, /bg-\(--ui-learner-bubble\)/, "the learner's turn lost the learner's colour");
  assert.match(LAYER, /<AssistantMarkdown className="text-\[14px\] leading-\[1\.625\]" key=\{reply\.id\} text=\{reply\.body\} \/>/, "Nemesis's answer is no longer drawn in the chat's markdown");
  assert.match(LAYER, /placeholder=\{card \|\| replies\.length > 0 \? "Ask a follow-up…"/, "the card stopped inviting a follow-up");
  assert.match(LAYER, /w-\[360px\]/, "the annotation card is no longer the width it was asked for");

  // 🔴 ONE MODEL DOOR. The margin's answer already goes through `postChatCompletion` by way of
  // `answerComment`; a board lane calling the API itself would be a second cognition with its own
  // opinions about length, stance and tools.
  assert.ok(!/postChatCompletion/.test(PANEL), "the board panel calls the model itself");
  assert.match(READER, /await answerComment\(/, "the in-document answer no longer goes through the shared lane");

  // 🔴 AND NO "SEND TO NEMESIS" ON THE BOARD, because the board's send takes text and no files, so
  // a marked region's cut-out could not travel with it. `commentAskPrompt` would then claim a
  // picture that is not there, which is the exact defect `mark-an-area.test.ts` exists to stop.
  // 🔴 THE PROP, NOT THE WORD. The header explains at length why the send is absent, and a guard
  // that fails on its own explanation teaches the next person to delete the explanation.
  assert.ok(!/onSendToChat=/.test(PANEL), "the board panel offers a send that cannot carry the crop");
});

test("🔴🔴 board annotations are kept in the BOARD, not in the comments table", () => {
  // A file dropped on a board is read for its text and need never be filed, so there is usually no
  // durable `library_sources.id` to key a row to. What the reader gets is a store over the board's
  // own document; nothing else about the annotate layer changes.
  assert.match(DOC, /store,/, "the card stopped handing the reader its own store");
  assert.match(STORE, /export function boardAnnotationStore/, "the board's store is gone");
  assert.ok(!/supabase/i.test(STORE), "the board's annotation store reaches for the database");
  // 🔴 THE STORE READS THROUGH A FUNCTION, NEVER A CAPTURED ARRAY. Held as a value, the second note
  // of a session is written on top of the first.
  assert.match(DOC, /boardAnnotationStore\(source\.id, \(\) => annotationsRef\.current, updateAnnotations\)/, "the store captured the annotation list");
});

test("🔴 a source card says how many notes are on its document, and can be worked on", () => {
  assert.match(CARD, /data-testid="source-card-annotations"/, "the source card lost its annotation chip");
  assert.match(CARD, /\{annotationCountLabel\(marks\)\}/, "the chip stopped using the shared phrase");
  for (const label of ["Make a note from this", "Make flashcards from this", "Make a test from this", "Collapse document", "Delete document"]) {
    assert.ok(CARD.includes(label), `a dropped document cannot ${label.toLowerCase()}`);
  }
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

test("🔴 the count is OPEN notes, never replies, and it reads the way the chat's chip reads", () => {
  const resolved: BoardAnnotation = { ...NOTE, id: "ann-3", resolvedAt: "2026-09-04T10:00:00.000Z" };
  const second: BoardAnnotation = { ...NOTE, id: "ann-4" };
  assert.equal(openAnnotationCount([NOTE, ANSWER, resolved, second], "src-1"), 2, "an answer or a resolved note was counted as a mark");
  assert.equal(openAnnotationCount([NOTE], "other"), 0);
  assert.equal(annotationCountLabel(1), "1 annotation");
  assert.equal(annotationCountLabel(3), "3 annotations");
});
