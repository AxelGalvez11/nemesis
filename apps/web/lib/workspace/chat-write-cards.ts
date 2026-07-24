// Turn a successful agent write into a thread card (owner item 2, 2026-07-24).
// Today a chat write is invisible: the executor hands JSON back to the model and
// the turn ends, so a student who asks for flashcards sees only prose. This maps
// one tool call's result to a SessionOutput card — the same card the recording
// flow mints — so the write shows up in the thread and opens to a short summary.
//
// Pure and node:test-able: the SessionOutput import is type-only (erased at
// compile), and the id/timestamp are injected so tests stay deterministic.

import type { SessionOutput } from "@/lib/workspace/sessions-store";

/** A tool result is either a write success (has the fields we read below) or an
 *  error shape `{ error }`. We only card the successes; an error already went
 *  back to the model, which reacts in text. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface WriteCardContext {
  id: string;
  createdAt: string;
}

/** Build the thread card for one executed tool call, or null when the call was
 *  not a write, failed, or has no card representation (calendar events and
 *  reads have no artifact kind, so they stay text-only). `result` is the raw
 *  return of executeAgentTool. */
export function writeCardFor(toolName: string, result: unknown, ctx: WriteCardContext): SessionOutput | null {
  if (!isRecord(result) || "error" in result) return null;
  const base = { createdAt: ctx.createdAt, id: ctx.id };

  switch (toolName) {
    case "add_flashcards": {
      const deck = str(result.deck) || "Flashcards";
      const added = num(result.added);
      return {
        ...base,
        kind: "flashcards",
        notes: `Added ${added} card${added === 1 ? "" : "s"} to the deck “${deck}”. Open the Study page to review them.`,
        title: deck,
      };
    }
    case "add_practice_test": {
      const title = str(result.title) || "Practice test";
      const questions = num(result.questions);
      return {
        ...base,
        kind: "test",
        notes: `Saved a ${questions}-question practice test to your Study page. Open Study to take it.`,
        title,
      };
    }
    case "add_mindmap": {
      const title = str(result.title) || "Mind map";
      return {
        ...base,
        kind: "mindmap",
        notes: "Saved a mind map to your Study page. Open Study to view it.",
        title,
      };
    }
    case "create_library_note": {
      const title = str(result.title) || "Note";
      const path = str(result.path);
      return {
        ...base,
        kind: "other",
        notes: path ? `Saved to your Library at ${path}.` : "Saved to your Library.",
        title,
      };
    }
    default:
      return null;
  }
}
