// Nemesis revising ITS OWN work, on request.
//
// Owner, 2026-08-28, naming the sidebar's two jobs: sources are for pointing and asking, and
// Nemesis-built documents the user can *"ask for edits on"*. The line drawn the day before stands:
// the learner never gets a text cursor. What changes is that Nemesis will rewrite what NEMESIS
// made — the loop the owner runs in Claude Design ("page three does not fit well" → the file is
// edited and the change named).
//
// 🔴 A REVISION IS A FULL REGENERATION, NOT A SPLICE. These documents are a deterministic function
// of their markdown / plan (`canvas-deliverables.ts` built them that way so nothing is uploaded),
// so the model returns the complete revised text and the old one is KEPT as a revision — an edit
// that cannot be undone is an edit a learner rightly fears.

import { deckSystemPrompt, readDeckJson, type DeckPlan } from "../export/deck-plan";
import { postChatCompletion } from "@/lib/workspace/chat-api";

/** What the learner asked, and where they pointed. `spot` is prose ("paragraph 4", "slide 2"). */
export interface ReviseAsk {
  body: string;
  spot: string;
  /** The pointed-at content itself, when the surface could read it. The model gets the words, not
   *  just an ordinal, so "make this shorter" cannot land on the wrong paragraph after a reflow. */
  spotText: string;
}

const DOC_REVISE_SYSTEM =
  "You revise a document you wrote earlier. You get the complete document as Markdown, plus one " +
  "note from its owner pointing at a spot. Apply the note. Return the COMPLETE revised document " +
  "as Markdown and nothing else: no preamble, no fences, no commentary. Keep everything the note " +
  "does not touch exactly as it is. Never use em dashes.";

/** Pure, so the packet can be checked without a model in the loop. */
export function docReviseMessages(input: { title: string; markdown: string; ask: ReviseAsk }): { content: string; role: "system" | "user" }[] {
  const where = [input.ask.spot, input.ask.spotText ? `which currently says: "${input.ask.spotText}"` : ""].filter(Boolean).join(", ");
  return [
    { content: DOC_REVISE_SYSTEM, role: "system" },
    {
      content:
        `The document, titled "${input.title}":\n\n${input.markdown}\n\n` +
        `The owner's note${where ? ` (on ${where})` : ""}: "${input.ask.body.trim()}"`,
      role: "user",
    },
  ];
}

export async function reviseOutputMarkdown(
  uid: string,
  output: { title: string; markdown: string },
  ask: ReviseAsk,
): Promise<{ markdown: string } | { error: string }> {
  const reply = await postChatCompletion(uid, docReviseMessages({ ask, markdown: output.markdown, title: output.title }));
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. The document was not changed." };
  const markdown = reply.text.trim();
  // 🔴 A REVISION THAT LOST THE DOCUMENT IS REFUSED, NOT APPLIED. A reply a tenth the size of the
  // original is a summary or an apology, and "apply the note" must never quietly become "replace
  // the document with a sentence about it". The original stays; the learner is told.
  if (markdown.length < 40 || markdown.length < output.markdown.length / 10) {
    return { error: "The revision came back broken, so the document was left as it was. Try asking again." };
  }
  return { markdown };
}

const DECK_MAX_TOKENS = 8_000;

export async function reviseOutputDeck(
  uid: string,
  deck: DeckPlan,
  ask: ReviseAsk,
): Promise<{ deck: DeckPlan } | { error: string }> {
  const reply = await postChatCompletion(
    uid,
    [
      // 🔴 THE SAME SYSTEM PROMPT THE DECK WAS MADE WITH, so the revised plan speaks the same JSON
      // the parser reads — a second schema written here would drift from `deck-plan.ts` the first
      // time either moved.
      { content: deckSystemPrompt(), role: "system" },
      {
        content:
          `Here is the current slide plan as JSON:\n\n${JSON.stringify({ slides: deck.slides, subtitle: deck.subtitle, title: deck.title })}\n\n` +
          `The owner's note${ask.spot ? ` (on ${ask.spot})` : ""}: "${ask.body.trim()}"\n\n` +
          "Apply the note and return the COMPLETE revised plan in the same JSON shape. Keep every slide the note does not touch as it is.",
        role: "user",
      },
    ],
    { maxTokens: DECK_MAX_TOKENS },
  );
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. The deck was not changed." };
  const plan = readDeckJson(reply.text);
  if (!plan || plan.slides.length === 0) {
    return { error: "The revision came back unusable, so the deck was left as it was. Try asking again." };
  }
  // 🔴 THE FIGURE LIST AND REFERENCES ARE THE ORIGINAL'S, never the model's. The plan carries
  // 1-based indexes into `figures`; the revised slides may keep or drop them, but the LIST is not
  // the model's to change, and an index past its end is dropped exactly as at creation.
  plan.figures = deck.figures;
  plan.references = deck.references;
  for (const slide of plan.slides) {
    if (slide.figure > deck.figures.length) slide.figure = 0;
  }
  return { deck: plan };
}

/** How many prior states an output carries. Forty copies of a document riding every save is a
 *  cost with no matching benefit; five undos deep is more than a person tracks. */
export const UNDO_DEPTH = 5;

type OutputShape = {
  markdown?: string;
  deck?: DeckPlan;
  revisions?: { at: string; markdown?: string; deck?: DeckPlan }[];
};

/** The outgoing state is KEPT, then the new content lands. Pure, so undo can be tested as data. */
export function applyRevision<T extends OutputShape>(output: T, next: { markdown?: string; deck?: DeckPlan }, at = new Date().toISOString()): T {
  const kept = { at, ...(next.markdown !== undefined ? { markdown: output.markdown } : {}), ...(next.deck !== undefined ? { deck: output.deck } : {}) };
  return {
    ...output,
    ...(next.markdown !== undefined ? { markdown: next.markdown } : {}),
    ...(next.deck !== undefined ? { deck: next.deck } : {}),
    revisions: [...(output.revisions ?? []), kept].slice(-UNDO_DEPTH),
  };
}

/** Pop the last kept state back into place. An output with nothing to undo comes back unchanged. */
export function undoRevision<T extends OutputShape>(output: T): T {
  const last = output.revisions?.at(-1);
  if (!last) return output;
  return {
    ...output,
    ...(last.markdown !== undefined ? { markdown: last.markdown } : {}),
    ...(last.deck !== undefined ? { deck: last.deck } : {}),
    revisions: output.revisions!.slice(0, -1),
  };
}
