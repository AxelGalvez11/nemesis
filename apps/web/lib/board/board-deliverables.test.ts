import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DELIVERABLE_MENU,
  EMPTY_THREAD_REFUSAL,
  OUTPUT_KIND_LABELS,
  REPORT_NEEDS_QUESTION,
  boardAsCanvas,
  boardSourceAsCanvasSource,
  deliverableAskIn,
  pairMoments,
  refusalFor,
} from "./board-deliverables";
import { buildDeleteTargets, createHistoryState, historyReducer, type HistoryState } from "./board-history";
import { OUTPUT_UNFINISHED_ERROR, parseBoardState, serializeBoardState, type BoardCard, type BoardSource } from "./board-model";

const AT = "2026-09-03T10:00:00.000Z";

function card(id: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    id,
    kind: "conversation",
    parentId: null,
    sourceIds: [],
    contextExcerpt: null,
    inheritedContext: [],
    title: id,
    highlights: [],
    savedImages: [],
    notes: [],
    status: "idle",
    position: { x: 0, y: 0 },
    width: 720,
    messages: [],
    ...extra,
  };
}

function source(id: string, extra: Partial<BoardSource> = {}): BoardSource {
  return { id, type: "pdf", name: `${id}.pdf`, content: "", status: "ready", previewUrls: [], position: { x: 0, y: 0 }, width: 640, ...extra };
}

function outputCard(id: string, parentId: string, extra: Partial<BoardCard> = {}): BoardCard {
  return card(id, {
    kind: "output",
    parentId,
    title: "Flashcards: insulin analogues",
    width: 320,
    outputKind: "flashcards",
    outputStatus: "ready",
    output: { createdAt: AT, deckId: "deck-1", id: "o1", kind: "flashcards", title: "Flashcards: insulin analogues" },
    ...extra,
  });
}

describe("board deliverables: the card as a canvas", () => {
  it("pairs a question with the answer that follows it, one moment per pair", () => {
    const moments = pairMoments(
      [
        { role: "user", content: "What is onset?" },
        { role: "assistant", content: "When the effect begins." },
        { role: "user", content: "And peak?" },
        { role: "assistant", content: "When it is strongest." },
      ],
      AT,
    );
    assert.equal(moments.length, 2);
    assert.deepEqual(
      moments.map((moment) => [moment.userText, moment.assistantText]),
      [
        ["What is onset?", "When the effect begins."],
        ["And peak?", "When it is strongest."],
      ],
    );
    assert.ok(moments.every((moment) => moment.kind === "assistant" && moment.occurredAt === AT));
  });

  it("an answer with no question before it stands alone; two questions in a row do not share an answer", () => {
    const moments = pairMoments(
      [
        { role: "assistant", content: "A dive-deeper card starts with an answer." },
        { role: "user", content: "First question" },
        { role: "user", content: "Second question" },
        { role: "assistant", content: "Answer to the second." },
        { role: "assistant", content: "   " },
      ],
      AT,
    );
    assert.deepEqual(
      moments.map((moment) => [moment.userText, moment.assistantText]),
      [
        [undefined, "A dive-deeper card starts with an answer."],
        ["First question", undefined],
        ["Second question", "Answer to the second."],
      ],
    );
  });

  it("dresses the card as a canvas: the board id, the title, the pairs, and only READY sources", () => {
    const canvas = boardAsCanvas(
      {
        boardId: "board-1",
        title: "  Insulin analogues ",
        messages: [
          { role: "user", content: "Compare them." },
          { role: "assistant", content: "Aspart is fast; glargine is flat." },
        ],
        sources: [
          source("s1", { content: "Lecture text.\n\nAspart peaks in one to three hours." }),
          source("s2", { status: "processing" }),
          source("s3", { status: "error", error: "unreadable" }),
          source("s4", { content: "   " }),
        ],
      },
      AT,
    );
    assert.equal(canvas.id, "board-1");
    assert.equal(canvas.title, "Insulin analogues");
    assert.equal(canvas.moments.length, 1);
    assert.deepEqual(
      canvas.sources.map((item) => item.id),
      ["s1"],
    );
    assert.equal(canvas.sources[0]?.excerpts.length, 2, "the flat text is cut into excerpts the makers can read");
    assert.equal(canvas.blocks.length, 0);
    assert.equal(canvas.createdAt, AT);
  });

  it("a board with no saved id still has a canvas id to hand the makers", () => {
    assert.equal(boardAsCanvas({ boardId: null, title: "t", messages: [], sources: [] }).id, "board");
  });

  it("uses a source's own excerpts when it carries them, and builds them when it does not", () => {
    const carried = boardSourceAsCanvasSource({
      ...source("s1", { content: "Whole text." }),
      ...({ excerpts: [{ id: "s1:e9", label: "Given", text: "Carried excerpt." }] } as object),
    } as BoardSource);
    assert.deepEqual(carried.excerpts, [{ id: "s1:e9", label: "Given", text: "Carried excerpt." }]);
    assert.equal(carried.kind, "pdf");
    assert.equal(carried.title, "s1.pdf");
    const built = boardSourceAsCanvasSource(source("s2", { type: "document", content: "Para one.\n\nPara two." }));
    assert.deepEqual(
      built.excerpts.map((excerpt) => excerpt.text),
      ["Para one.", "Para two."],
    );
    assert.equal(built.excerpts[0]?.id, "s2:e1");
  });
});

describe("board deliverables: when a make may start", () => {
  it("an empty thread refuses in plain words, and says what to do", () => {
    const canvas = boardAsCanvas({ boardId: "b", title: "New thread", messages: [], sources: [] }, AT);
    assert.equal(refusalFor("flashcards", canvas), EMPTY_THREAD_REFUSAL);
    assert.equal(refusalFor("note", canvas), EMPTY_THREAD_REFUSAL);
    assert.ok(!/—/.test(EMPTY_THREAD_REFUSAL), "no em dash in learner-facing copy");
  });

  it("a question alone is not material; an answer is, and so is a readable source", () => {
    const asked = boardAsCanvas({ boardId: "b", title: "t", messages: [{ role: "user", content: "Make flashcards" }], sources: [] }, AT);
    assert.equal(refusalFor("flashcards", asked), EMPTY_THREAD_REFUSAL);
    const answered = boardAsCanvas(
      { boardId: "b", title: "t", messages: [{ role: "user", content: "Why?" }, { role: "assistant", content: "Because it precipitates." }], sources: [] },
      AT,
    );
    assert.equal(refusalFor("flashcards", answered), null);
    const attached = boardAsCanvas({ boardId: "b", title: "t", messages: [], sources: [source("s1", { content: "A lecture." })] }, AT);
    assert.equal(refusalFor("document", attached), null);
  });

  it("a report needs a question, not material: a titled thread passes, a bare branch does not", () => {
    const bare = boardAsCanvas({ boardId: "b", title: "", messages: [], sources: [] }, AT);
    assert.equal(refusalFor("report", bare), REPORT_NEEDS_QUESTION);
    assert.equal(refusalFor("report", bare, "the history of insulin"), null);
    const titled = boardAsCanvas({ boardId: "b", title: "Insulin analogues", messages: [], sources: [] }, AT);
    assert.equal(refusalFor("report", titled), null);
  });

  it("reads a plain-words ask with the chat's own classifier", () => {
    assert.equal(deliverableAskIn("make flashcards from this"), "flashcards");
    assert.equal(deliverableAskIn("Can you write a document about the peak times"), "document");
    assert.equal(deliverableAskIn("how do I build a document parser"), null);
    assert.equal(deliverableAskIn("Why does glargine have no peak?"), null);
  });

  it("the + menu offers the seven kinds with the agreed words, and every kind has a label", () => {
    assert.deepEqual(
      DELIVERABLE_MENU.map((entry) => entry.label),
      ["Make flashcards", "Make a note", "Make a document", "Make a PDF", "Make a sheet", "Make slides", "Write a report"],
    );
    assert.deepEqual(Object.keys(OUTPUT_KIND_LABELS).sort(), ["document", "flashcards", "html", "note", "pdf", "report", "sheet", "slides"]);
    assert.equal(OUTPUT_KIND_LABELS.html, "Page");
  });
});

describe("board deliverables: an output card in the document and in history", () => {
  it("round-trips through save and load with its output intact", () => {
    const state = { cards: [card("a"), outputCard("o", "a")], sources: [], selectedSourceIds: [], useWebSearch: false };
    const loaded = parseBoardState(JSON.parse(JSON.stringify(serializeBoardState(state))));
    const restored = loaded.cards.find((item) => item.id === "o");
    assert.equal(restored?.kind, "output");
    assert.equal(restored?.parentId, "a");
    assert.equal(restored?.outputStatus, "ready");
    assert.equal(restored?.output?.deckId, "deck-1");
    assert.equal(restored?.width, 320);
  });

  it("a card saved while still being made comes back failed, with a reason the learner can retry from", () => {
    const making = outputCard("o", "a", { status: "streaming", outputStatus: "making", output: undefined, title: "Making flashcards" });
    const loaded = parseBoardState(JSON.parse(JSON.stringify(serializeBoardState({ cards: [card("a"), making], sources: [], selectedSourceIds: [], useWebSearch: false }))));
    const restored = loaded.cards.find((item) => item.id === "o");
    assert.equal(restored?.status, "idle");
    assert.equal(restored?.outputStatus, "failed");
    assert.equal(restored?.outputError, OUTPUT_UNFINISHED_ERROR);
  });

  it("deleting an output card records its inverse; undo puts it back in its slot; redo removes it again", () => {
    let state: HistoryState = createHistoryState([card("a"), outputCard("o", "a"), card("b")]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["o"]) });
    assert.deepEqual(
      state.cards.map((item) => item.id),
      ["a", "b"],
    );
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.deepEqual(
      state.cards.map((item) => item.id),
      ["a", "o", "b"],
    );
    assert.equal(state.cards[1]?.output?.deckId, "deck-1", "the made thing survives the round trip");
    state = historyReducer(state, { type: "redo", entryId: "e3" });
    assert.deepEqual(
      state.cards.map((item) => item.id),
      ["a", "b"],
    );
  });

  it("deleting the thread leaves its output standing, detached, the way a branch card is", () => {
    let state: HistoryState = createHistoryState([card("a"), outputCard("o", "a")]);
    state = historyReducer(state, { type: "delete", entryId: "e1", targets: buildDeleteTargets(state.cards, ["a"]) });
    assert.deepEqual(
      state.cards.map((item) => [item.id, item.parentId]),
      [["o", null]],
    );
    state = historyReducer(state, { type: "undo", entryId: "e2" });
    assert.deepEqual(
      state.cards.map((item) => [item.id, item.parentId]),
      [
        ["a", null],
        ["o", "a"],
      ],
    );
  });
});
