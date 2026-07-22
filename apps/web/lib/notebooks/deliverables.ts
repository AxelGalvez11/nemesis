// Deliverable generation for notebooks (owner ask 2026-07-20): Flashcards /
// Test / Slides built by the engine FROM THE NOTEBOOK'S SOURCES ONLY, saved
// as notebook_outputs rows (pending → ready/failed) so the Outputs toggle can
// show skeletons while the engine works.

import { postChatCompletion } from "@/lib/workspace/chat-api";

import { buildSourceContext, type NotebookWireSource } from "./chat";
import { createNotebookOutput, updateNotebookOutput, type NotebookOutput, type NotebookOutputKind } from "./outputs-api";

export const DELIVERABLE_META: Record<NotebookOutputKind, { label: string; icon: string }> = {
  flashcards: { icon: "layers", label: "Flashcards" },
  mindmap: { icon: "type-hierarchy-sub", label: "Mindmap" },
  slides: { icon: "preview", label: "Slides" },
  test: { icon: "checklist", label: "Test" },
};

const GENERATION_SYSTEM =
  "You are Nemesis's study-deliverable engine. Build the requested deliverable STRICTLY from the " +
  "source text provided — never invent facts, citations, or coverage the sources do not contain. " +
  "If the sources are thin, produce a shorter deliverable and say what is missing at the top. " +
  "Output clean markdown only. Never use emojis.";

function deliverablePrompt(kind: NotebookOutputKind): string {
  if (kind === "flashcards") {
    return "Create a flashcard deck from the sources below. Start with a one-line '## <Deck title>' heading, " +
      "then a markdown table with columns 'Front' and 'Back'. Write 12-30 cards depending on how much the sources cover: " +
      "definitions, mechanisms, contrasts, numbers, and likely exam traps. One fact per card, fronts phrased as questions or cloze-style prompts.";
  }
  if (kind === "test") {
    return "Create a practice test from the sources below. Start with '## Practice test — <topic>'. Write 8-15 numbered " +
      "multiple-choice questions (options A-D) that probe understanding, not recall alone. After the questions add an " +
      "'## Answer key' section listing each number, the correct letter, and a one-sentence explanation grounded in the sources.";
  }
  // Markdown, like every other notebook deliverable — this is a notebook_outputs
  // row, NOT a study_artifacts mindmap (which carries a parsed outline object).
  if (kind === "mindmap") {
    return "Create a mind map from the sources below as a nested markdown outline. Start with '## Mind map — <topic>'. " +
      "Use one '- ' bullet per idea and indent two spaces per level, 3-4 levels deep: the central topic's main branches " +
      "first, then their sub-ideas, then concrete details, numbers, or examples at the leaves. Keep every bullet under " +
      "10 words so the structure stays readable, and group branches so siblings are genuinely parallel.";
  }
  return "Create a slide outline from the sources below. Start with '## Slide deck — <topic>'. Then one '### Slide N: <title>' " +
    "section per slide (8-14 slides) with 3-5 tight bullet points each, building a logical teaching arc: hook, core concepts, " +
    "mechanisms, applications, pitfalls, summary. Keep bullets presentation-short.";
}

export interface GenerateDeliverableOpts {
  uid: string;
  notebookId: string;
  notebookName: string;
  instructions?: string | null;
  sources: NotebookWireSource[];
  kind: NotebookOutputKind;
}

/** Create the pending row, run one non-streaming generation turn, then mark
 *  the row ready (or failed). Returns the finished output. Throws with a
 *  student-readable message on failure — the caller owns the error UI. */
export async function generateNotebookDeliverable(opts: GenerateDeliverableOpts): Promise<NotebookOutput> {
  const meta = DELIVERABLE_META[opts.kind];
  const title = `${meta.label} — ${opts.notebookName}`;
  const row = await createNotebookOutput({ kind: opts.kind, notebookId: opts.notebookId, title });
  if (!row) throw new Error("Sign in to generate deliverables.");
  try {
    const sourceContext = buildSourceContext(opts.sources);
    const instructions = opts.instructions?.trim();
    const userParts = [
      deliverablePrompt(opts.kind),
      ...(instructions ? [`The student's standing instructions for this notebook:\n${instructions}`] : []),
      sourceContext ||
        `No sources are attached to this notebook ("${opts.notebookName}"). Say at the top that the deliverable is built from the notebook's title alone and recommend attaching sources, then do your best from the topic name.`,
    ];
    const reply = await postChatCompletion(opts.uid, [
      { content: GENERATION_SYSTEM, role: "system" },
      { content: userParts.join("\n\n"), role: "user" },
    ]);
    if (!reply.text) {
      throw new Error(reply.errorText ?? "The engine couldn't generate that. Try again.");
    }
    await updateNotebookOutput(row.id, { content: reply.text, status: "ready" });
    return { ...row, content: reply.text, status: "ready" };
  } catch (cause) {
    await updateNotebookOutput(row.id, { status: "failed" }).catch(() => undefined);
    throw cause instanceof Error ? cause : new Error("The engine couldn't generate that. Try again.");
  }
}
