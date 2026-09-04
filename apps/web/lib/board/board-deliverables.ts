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

import type { BoardCard } from "./board-model";

export { readDeliverableAsk };
export type { DeliverableKind };

/** The + menu, in the chat's order: what changes the answer's shape first, then the files. */
export const BOARD_DELIVERABLE_MENU: ReadonlyArray<{ kind: DeliverableKind; label: string; detail: string }> = [
  { kind: "report", label: "Deep research", detail: "Get a detailed report" },
  { kind: "flashcards", label: "Flashcards", detail: "A deck you can review" },
  { kind: "note", label: "Note", detail: "A study note in the Library" },
  { kind: "document", label: "Document", detail: "Write and download a Word file" },
  { kind: "pdf", label: "PDF", detail: "Write and download a PDF" },
  { kind: "sheet", label: "Spreadsheet", detail: "Build a table you can open in Excel" },
  { kind: "slides", label: "Slides", detail: "Build a slide deck" },
  { kind: "html", label: "Page", detail: "Build an interactive page" },
];

/** The busy line on a card being made; the chat's own words. */
export const MAKING_LABELS: Record<DeliverableKind, string> = {
  document: "Writing your document",
  flashcards: "Making your flashcards",
  html: "Building your page",
  note: "Writing your note",
  pdf: "Writing your PDF",
  report: "Starting the research",
  sheet: "Building your spreadsheet",
  slides: "Building your slides",
};

export const KIND_LABELS: Record<DeliverableKind, string> = {
  document: "Document",
  flashcards: "Flashcards",
  html: "Page",
  note: "Note",
  pdf: "PDF",
  report: "Research",
  sheet: "Spreadsheet",
  slides: "Slides",
};

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
