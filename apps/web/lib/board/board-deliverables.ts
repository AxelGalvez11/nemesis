// Deliverables on the board: the chat's makers, handed a chat-shaped view of one thread.
//
// Owner 2026-09-03: "do you think you could add deliverables to the canvas?", then "yes" to: ask in
// plain words in any card's follow-up box or from the + menu; the result is its own card beside
// the thread, joined by a line; and it lands in the Library exactly as chat deliverables do.
//
// 🔴 NOTHING IS MADE HERE. `makeFlashcardsDeliverable` and its siblings read a `LearningCanvas`'s
// title, moments, blocks, concepts and sources (lib/learn/canvas-deliverables.ts, `canvasContext`),
// and write the same rows the chat writes: a deck is `study_decks`/`study_cards`, a note is a
// Library page. This file only builds the canvas they read from a thread's messages. A second set
// of makers would be a second product.
//
// 🔴 THE LEDGER DOES NOT REACH THE BOARD. `canvas_outputs.canvas_id` is a foreign key to the chat's
// `learning_canvases`, so the best-effort `assets` join fails quietly for a board id and the output
// carries no `assetId`. The deck and the note are still real rows the Library lists; only the
// per-canvas ledger row is absent. A `board_outputs` table is the follow-up if that row is wanted.

import {
  makeDocumentDeliverable,
  makeFlashcardsDeliverable,
  makeHtmlDeliverable,
  makeNoteDeliverable,
  makeReportDeliverable,
  makeSheetDeliverable,
  makeSlidesDeliverable,
  readDeliverableAsk,
  type DeliverableFailure,
  type DeliverableKind,
  type DeliverableResult,
} from "@/lib/learn/canvas-deliverables";
import { emptyCanvas, type CanvasSource, type LearningCanvas } from "@/lib/learn/canvas-model";
import type { CanvasMoment } from "@/lib/learn/canvas-moment";
import { researchStepLabel } from "@/lib/research/research-progress";

import { readCheckAsk } from "./board-check";
import type { BoardCard } from "./board-model";

export { readDeliverableAsk };
export type { DeliverableKind };

/**
 * What a board card can be made INTO.
 *
 * 🔴 A CHECK IS NOT A DELIVERABLE, AND THE UNION SAYS SO RATHER THAN THE TYPE BEING WIDENED. Every
 * `DeliverableKind` ends up in the Library as a real row a learner keeps; a check is answered and
 * then marked in the conversation, and the owner's rule is that a test never becomes an artifact.
 * Adding "check" to `DeliverableKind` would also send it through `makeBoardDeliverable`'s switch,
 * whose default arm writes a NOTE, so an unhandled kind would quietly file the wrong thing.
 */
export type BoardMakeKind = DeliverableKind | "check";

/**
 * The + menu on the board.
 *
 * 🔴🔴 THREE ENTRIES, BY OWNER'S ORDER, 2026-09-04: *"the canvas shouldnt have deep research, pages,
 * or other options here"*. It was the chat's whole menu of eight, which is right in a chat, where
 * the point of the surface is to take something away with you: a Word file, a PDF, a spreadsheet, a
 * slide deck, a research report. The board is a thinking surface. What belongs beside a thread is
 * what you go on USING there: a test on what the thread taught, cards to review, a note that keeps
 * it.
 *
 * 🔴 THE CAPABILITY IS NOT REMOVED, ONLY THE BUTTON. Asking for slides, a document, a PDF, a
 * spreadsheet or a page in plain words in any card still makes one (`readDeliverableAsk`), because
 * a learner who says what they want should get it. What is gone is the menu offering it unasked.
 */
export const BOARD_DELIVERABLE_MENU: ReadonlyArray<{ kind: BoardMakeKind; label: string; detail: string }> = [
  { kind: "check", label: "Test", detail: "Questions you tap through" },
  { kind: "flashcards", label: "Flashcards", detail: "A deck you can review" },
  { kind: "note", label: "Note", detail: "A study note in the Library" },
];

/** The busy line on a card being made; the chat's own words. */
export const MAKING_LABELS: Record<BoardMakeKind, string> = {
  check: "Writing your questions",
  document: "Writing your document",
  flashcards: "Making your flashcards",
  html: "Building your page",
  note: "Writing your note",
  pdf: "Writing your PDF",
  report: "Starting the research",
  sheet: "Building your spreadsheet",
  slides: "Building your slides",
};

export const KIND_LABELS: Record<BoardMakeKind, string> = {
  check: "Test",
  document: "Document",
  flashcards: "Flashcards",
  html: "Page",
  note: "Note",
  pdf: "PDF",
  report: "Research",
  sheet: "Spreadsheet",
  slides: "Slides",
};

/**
 * What the learner asked for in plain words, if anything: a test first, then the chat's own reader.
 *
 * 🔴 THE CHECK IS ASKED FIRST BECAUSE THE TWO READERS OVERLAP. "make me a practice test" carries a
 * make-verb, and `readDeliverableAsk`'s note arm is wide enough to read a "test" ask as a study
 * note. A learner who asks to be tested gets questions.
 */
export function readBoardMakeAsk(text: string): BoardMakeKind | null {
  if (readCheckAsk(text)) return "check";
  return readDeliverableAsk(text);
}

function momentsOf(turns: ReadonlyArray<{ role: "user" | "assistant"; content: string }>, now: string): CanvasMoment[] {
  return turns
    .filter((turn) => turn.content.trim())
    .map((turn, index) => ({
      id: `m${index + 1}`,
      occurredAt: now,
      kind: turn.role,
      ...(turn.role === "user" ? { userText: turn.content } : { assistantText: turn.content }),
    }));
}

/**
 * The canvas a maker reads: one thread (its inherited context and its turns), or the whole board
 * when asked from the composer, plus every grounded source.
 */
export function boardCanvasFor(input: {
  boardId: string | null;
  title: string;
  cards: readonly BoardCard[];
  cardId: string | null;
  sources: readonly CanvasSource[];
}): LearningCanvas {
  const now = new Date().toISOString();
  const card = input.cardId ? input.cards.find((item) => item.id === input.cardId) : undefined;
  const turns = card
    ? [...card.inheritedContext, ...card.messages.filter((message) => !message.isError && !message.pending)]
    : input.cards.flatMap((item) => item.messages.filter((message) => !message.isError && !message.pending));
  return {
    ...emptyCanvas(input.boardId ?? "board", now),
    title: card?.title || input.title,
    moments: momentsOf(turns, now),
    sources: [...input.sources],
  };
}

/** The chat's dispatch, kind for kind (use-canvas-session.ts `makeDeliverable`). */
export async function makeBoardDeliverable(
  uid: string,
  canvas: LearningCanvas,
  kind: DeliverableKind,
  topic: string,
  onStep?: (label: string) => void,
): Promise<DeliverableResult | DeliverableFailure> {
  const subject = topic.trim() || undefined;
  switch (kind) {
    case "flashcards":
      return makeFlashcardsDeliverable(uid, canvas, subject);
    case "slides":
      return makeSlidesDeliverable(uid, canvas, subject);
    case "document":
    case "pdf":
      return makeDocumentDeliverable(uid, canvas, kind, subject);
    case "sheet":
      return makeSheetDeliverable(uid, canvas, subject);
    case "html":
      return makeHtmlDeliverable(uid, canvas, subject);
    case "report":
      return makeReportDeliverable(uid, canvas, subject || canvas.title || "", onStep ? (step) => onStep(researchStepLabel(step)) : undefined);
    default:
      return makeNoteDeliverable(uid, canvas, subject);
  }
}
