// The AI actions the reader offers, and the exact words each one sends.
//
// 🔴 EVERY prompt names where the material came from — the file and, when it
// was measured, the page or slide. That is what makes an answer traceable back
// to the document instead of floating free. The locator is only ever included
// when the reader MEASURED it (the page the selection is physically on); it is
// never asked for and never guessed.
//
// Kept out of the components so the wording is in one place, testable, and the
// same whether the action was fired from the selection menu, the right panel or
// a keyboard shortcut.

export type ReaderActionId = "ask" | "explain" | "note" | "flashcards" | "related";

export interface ReaderActionContext {
  fileName: string;
  /** "page" | "slide" | "image" — what a unit is called in this document. */
  unitLabel: string;
  /** The measured page/slide the material is on, or null when there is none. */
  unit: number | null;
  /** The exact text the student selected, or null for a whole-document action. */
  selection: string | null;
  /** Set when the student boxed a region of an image instead of selecting text. */
  region?: { x: number; y: number; width: number; height: number } | null;
}

export const READER_ACTIONS: ReadonlyArray<{ id: ReaderActionId; label: string; icon: string; hint: string }> = [
  { id: "ask", label: "Ask about this", icon: "comment-discussion", hint: "Open a chat about this passage" },
  { id: "explain", label: "Explain", icon: "lightbulb", hint: "Have it explained in plain terms" },
  { id: "note", label: "Add to notes", icon: "note", hint: "Save it into your Library notes" },
  { id: "flashcards", label: "Make flashcards", icon: "layers", hint: "Turn it into cards to revise" },
  { id: "related", label: "Find related concepts", icon: "references", hint: "See what else connects to it" },
];

/** How the reader refers to a location in words. Returns an empty string when
 *  nothing was measured, so callers can concatenate without a stray comma. */
export function locatorPhrase(context: Pick<ReaderActionContext, "unitLabel" | "unit">): string {
  return context.unit === null ? "" : ` (${context.unitLabel} ${context.unit})`;
}

function quoted(selection: string): string {
  const trimmed = selection.replace(/\s+/g, " ").trim();
  // Long selections are sent whole — truncating would change what was asked
  // about — but the quote marks stay balanced whatever is inside.
  return `"${trimmed.replace(/"/g, "'")}"`;
}

/** The message the action sends. Written as a student would ask it, with the
 *  source named so the answer can cite it. */
export function readerActionPrompt(action: ReaderActionId, context: ReaderActionContext): string {
  const where = locatorPhrase(context);
  const from = `${context.fileName}${where}`;

  if (context.region && !context.selection) {
    const percent = (value: number) => Math.round(value * 100);
    const area = `the region at ${percent(context.region.x)}%,${percent(context.region.y)}% (${percent(context.region.width)}% wide, ${percent(context.region.height)}% tall)`;
    switch (action) {
      case "ask":
        return `Looking at ${from} — ${area}. What is this showing?`;
      case "explain":
        return `Explain what is in ${area} of ${from}, in plain terms.`;
      case "note":
        return `Write a short note about ${area} of ${from} and save it to my Library, citing the file.`;
      case "flashcards":
        return `Make flashcards from ${area} of ${from}, citing the file on each card.`;
      case "related":
        return `What concepts connect to ${area} of ${from}? Point me at my own notes where they exist.`;
    }
  }

  const passage = context.selection ? quoted(context.selection) : null;
  if (!passage) {
    switch (action) {
      case "ask":
        return `I'm reading ${from}. Ask me nothing yet — just tell me what it covers and what matters most in it.`;
      case "explain":
        return `Explain ${from} in plain terms, and say which parts are the load-bearing ones.`;
      case "note":
        return `Write notes on ${from} and save them to my Library, citing the file.`;
      case "flashcards":
        return `Make flashcards from ${from}, citing the file on each card.`;
      case "related":
        return `What connects to ${from}? Point me at my own notes and at the concepts it depends on.`;
    }
  }

  switch (action) {
    case "ask":
      return `From ${from}:\n\n${passage}\n\nWhat should I understand about this?`;
    case "explain":
      return `Explain this passage from ${from} in plain terms:\n\n${passage}`;
    case "note":
      return `Add this to my Library notes, citing ${from}:\n\n${passage}`;
    case "flashcards":
      return `Make flashcards from this passage in ${from}, citing it on each card:\n\n${passage}`;
    case "related":
      return `What concepts does this passage from ${from} connect to? Point me at my own notes where they exist.\n\n${passage}`;
  }
}
