// Deliverables on the spatial Canvas: a card's thread, handed to the chat's seven makers.
//
// Owner, 2026-09-03: "ask for one in plain words in any card's follow-up box, or from a + menu; the
// result appears as its own card beside the thread it came from, joined by a line, and also lands
// in the Library exactly as chat deliverables do."
//
// 🔴 NOTHING HERE MAKES ANYTHING. The makers live in `lib/learn/canvas-deliverables.ts` and read a
// `LearningCanvas` — its title, concepts, blocks, moments and sources — so this file's whole job is
// to dress a board card up as one (`boardAsCanvas`) and dispatch by kind exactly the way
// `use-canvas-session.ts`'s `makeDeliverable` does. A second copy of a maker would be a second
// place for the owner's card rules to drift.
//
// 🔴 THE LEDGER WRITE (`canvas_outputs`) HAS A FOREIGN KEY TO `learning_canvases`, and a board id
// is not one. The makers already treat the ledger as bookkeeping — `recordLedger` swallows the
// join failure — so a board deliverable still lands its CONTENT (a real deck, a real Library note)
// and only the canvas join is missed. No migration is added here; the report says so.
//
// PURE apart from the makers. No React.

import { buildExcerpts } from "@/lib/learn/canvas-grounding";
import {
  canvasHasMaterial,
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
import { emptyCanvas, type CanvasSource, type LearningCanvas, type SourceExcerpt } from "@/lib/learn/canvas-model";
import type { CanvasMoment } from "@/lib/learn/canvas-moment";
import type { OnResearchStep } from "@/lib/research/research-model";

import type { BoardMessage, BoardSource } from "./board-model";

export type { DeliverableKind } from "@/lib/learn/canvas-deliverables";

/** The `+` menu, in the order it is shown. Seven of the eight kinds: a page is asked for in words. */
export const DELIVERABLE_MENU: ReadonlyArray<{ kind: DeliverableKind; label: string }> = [
  { kind: "flashcards", label: "Make flashcards" },
  { kind: "note", label: "Make a note" },
  { kind: "document", label: "Make a document" },
  { kind: "pdf", label: "Make a PDF" },
  { kind: "sheet", label: "Make a sheet" },
  { kind: "slides", label: "Make slides" },
  { kind: "report", label: "Write a report" },
];

/** What the finished card calls its kind. */
export const OUTPUT_KIND_LABELS: Record<DeliverableKind, string> = {
  document: "Document",
  flashcards: "Flashcards",
  html: "Page",
  note: "Note",
  pdf: "PDF",
  report: "Report",
  sheet: "Sheet",
  slides: "Slides",
};

/** The card's title while the maker is working. Replaced by the output's own title when it lands. */
export const MAKING_TITLES: Record<DeliverableKind, string> = {
  document: "Writing a document",
  flashcards: "Making flashcards",
  html: "Building a page",
  note: "Writing a note",
  pdf: "Writing a PDF",
  report: "Writing a report",
  sheet: "Building a sheet",
  slides: "Building slides",
};

export const EMPTY_THREAD_REFUSAL = "There is nothing in this thread to make that from yet. Ask a question first, then try again.";
export const REPORT_NEEDS_QUESTION = "Say what the report should be about, then try again.";
export const SIGN_IN_TO_MAKE = "Sign in to make things on the canvas.";

/** Everything a maker needs from the board, gathered by the provider. */
export interface BoardDeliverableInput {
  /** The saved board's id, or null before the first save. Stands in for the canvas id. */
  boardId: string | null;
  /** The card's title: the first question, or the model's own title for the thread. */
  title: string;
  /** The card's turns, inherited context first. Errors already removed (see `cardContext`). */
  messages: ReadonlyArray<Pick<BoardMessage, "role" | "content">>;
  /** The sources attached to the card, ready ones only. */
  sources: readonly BoardSource[];
  /** What the learner asked for, in their words, when they asked in words. */
  topic?: string;
}

/** Plain words that ask for a deliverable, read by the chat's own classifier. Null = an ordinary turn. */
export function deliverableAskIn(text: string): DeliverableKind | null {
  return readDeliverableAsk(text);
}

/**
 * A card's turns as the chat's moments: one moment per question-and-answer PAIR.
 *
 * A user line opens a moment and the assistant line that follows closes it. An assistant line with
 * no question before it (a dive-deeper card starts that way) is a moment on its own; two questions
 * in a row leave the first without an answer rather than borrowing the next one's.
 */
export function pairMoments(messages: ReadonlyArray<Pick<BoardMessage, "role" | "content">>, at: string): CanvasMoment[] {
  const moments: CanvasMoment[] = [];
  let open: CanvasMoment | null = null;
  messages.forEach((message, index) => {
    const content = message.content.trim();
    if (!content) return;
    if (message.role === "user") {
      open = { id: `bm${index + 1}`, kind: "assistant", occurredAt: at, userText: content };
      moments.push(open);
      return;
    }
    if (open && open.assistantText === undefined) {
      open.assistantText = content;
      open = null;
      return;
    }
    moments.push({ id: `bm${index + 1}`, kind: "assistant", occurredAt: at, assistantText: content });
    open = null;
  });
  return moments;
}

/**
 * A board source as a canvas source.
 *
 * 🔴 `excerpts` ARE TAKEN WHEN THE SOURCE CARRIES THEM AND BUILT WHEN IT DOES NOT. Another change
 * is adding an excerpts field to `BoardSource`; until it lands (and for any board saved before it),
 * the flat text is cut the way the chat cuts a pasted file, so a citation made either way resolves.
 */
export function boardSourceAsCanvasSource(source: BoardSource): CanvasSource {
  const carried = (source as { excerpts?: unknown }).excerpts;
  const excerpts = Array.isArray(carried) && carried.length > 0 ? (carried as SourceExcerpt[]) : buildExcerpts(source.id, source.content);
  return { excerpts, id: source.id, kind: source.type, title: source.name };
}

/** The card, dressed as the canvas the makers read. Only ready sources travel. */
export function boardAsCanvas(input: BoardDeliverableInput, now = new Date().toISOString()): LearningCanvas {
  return {
    ...emptyCanvas(input.boardId ?? "board", now),
    moments: pairMoments(input.messages, now),
    sources: input.sources.filter((source) => source.status === "ready" && source.content.trim()).map(boardSourceAsCanvasSource),
    title: input.title.trim(),
  };
}

/**
 * Why a make cannot start, in the learner's words, or null when it can.
 *
 * 🔴 THE GATE IS THE CHAT'S OWN (`canvasHasMaterial`): an attached file, or something Nemesis said.
 * A report is the one kind that needs no material — it goes to the web — but it does need a
 * question, and a fresh branch card with no title has none.
 */
export function refusalFor(kind: DeliverableKind, canvas: LearningCanvas, topic?: string): string | null {
  if (kind === "report") return (topic ?? "").trim() || canvas.title ? null : REPORT_NEEDS_QUESTION;
  return canvasHasMaterial(canvas) ? null : EMPTY_THREAD_REFUSAL;
}

/**
 * Make one deliverable from a card. Dispatch mirrors `use-canvas-session.ts` `makeDeliverable`
 * kind for kind; the result is the chat's own `CanvasOutput`, so it opens in the chat's own reader.
 */
export async function makeBoardDeliverable(
  uid: string,
  kind: DeliverableKind,
  input: BoardDeliverableInput,
  onStep?: OnResearchStep,
): Promise<DeliverableResult | DeliverableFailure> {
  const canvas = boardAsCanvas(input);
  const refusal = refusalFor(kind, canvas, input.topic);
  if (refusal) return { error: refusal };
  const topic = input.topic?.trim() || undefined;
  switch (kind) {
    case "flashcards":
      return makeFlashcardsDeliverable(uid, canvas, topic);
    case "slides":
      return makeSlidesDeliverable(uid, canvas, topic);
    case "document":
    case "pdf":
      return makeDocumentDeliverable(uid, canvas, kind, topic);
    case "sheet":
      return makeSheetDeliverable(uid, canvas, topic);
    case "html":
      return makeHtmlDeliverable(uid, canvas, topic);
    case "report":
      return makeReportDeliverable(uid, canvas, topic || canvas.title, onStep);
    case "note":
      return makeNoteDeliverable(uid, canvas, topic);
  }
}
