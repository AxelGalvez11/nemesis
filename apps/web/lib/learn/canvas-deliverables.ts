// The canvas makes things the learner keeps — flashcard decks and summary notes.
//
// Owner 2026-08-25: "if the user asks the canvas for flash cards, it'll create the flash
// cards and save it as an artifact to the library… the library will be where Nemesis
// outputs any reports or notes and presentations and flashcards", and, on where a deck
// lands: "the study deck should land in the library, but it should also land in the
// output section of the Canvas as well."
//
// 🔴 NOTHING NEW IS INVENTED TO HOLD CONTENT. A deck is real `study_decks`/`study_cards`
// rows — the same tables the grading RPC schedules, the same shape canvas-study-bridge
// already writes for recall — so a deck made here is reviewable for real, not a picture of
// flashcards. A note is a real `readable_library_documents` row via writeLibraryNote, so it
// opens in the library's own reader. What IS new is the LEDGER: each deliverable also writes
// an `assets` row joined through `canvas_outputs` — the tables §12 built for exactly this and
// nothing had ever written — plus a `CanvasOutput` entry on the canvas itself, which is what
// the Outputs tab renders.
//
// Best-effort on the ledger, never on the content: if the assets write fails the learner
// still has the deck or the note; if the CONTENT write fails, the whole deliverable failed
// and says so.

import { supabase } from "@/lib/supabase";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { writeLibraryNote } from "@/lib/workspace/library-write";
import { normalizeStudyTags } from "@/lib/workspace/study-cloud-store";

import { deckSystemPrompt, readDeckJson } from "../export/deck-plan";

import type { CanvasOutput, LearningCanvas } from "./canvas-model";
import { CANVAS_DECK_TAG } from "./canvas-study-bridge";

/** What the canvas can make today. Reports join when they have a real home. */
export type DeliverableKind = "flashcards" | "note" | "slides";

export interface DeliverableResult {
  output: CanvasOutput;
}

export interface DeliverableFailure {
  error: string;
}

/** How much of the canvas the model sees. Enough for a study artifact; not the whole
 *  transcript of a long session. */
const BRIEF_LIMIT = 7000;

/** Everything the canvas knows, flattened for a prompt: the title, what it set out to teach,
 *  and the taught blocks in order. */
export function canvasBrief(canvas: LearningCanvas): string {
  const concepts = canvas.concepts.map((concept) => concept.label).filter(Boolean);
  const blocks = canvas.blocks
    .filter((block) => !block.collapsed)
    .map((block) => block.content)
    .filter(Boolean);
  const brief = [
    `Topic: ${canvas.title || "(untitled)"}`,
    concepts.length ? `Concepts: ${concepts.join("; ")}` : "",
    "",
    blocks.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n");
  return brief.slice(0, BRIEF_LIMIT);
}

/** A canvas with nothing taught yet has nothing to make a deliverable FROM, and a model call
 *  would return confident filler about the title alone. */
export function canvasHasMaterial(canvas: LearningCanvas): boolean {
  return canvas.blocks.some((block) => block.content.trim().length > 0);
}

// ---------------------------------------------------------------- parsing

/** The model's reply, read strictly: a JSON array of {front, back} strings, fences and
 *  preamble tolerated, anything else refused. Exported for its tests — this is the seam
 *  where a chatty model turns into bad rows. */
export function readCardsJson(text: string): { front: string; back: string }[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const cards: { front: string; back: string }[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const front = String((entry as { front?: unknown }).front ?? "").trim();
    const back = String((entry as { back?: unknown }).back ?? "").trim();
    if (!front || !back) continue;
    cards.push({ back: back.slice(0, 1000), front: front.slice(0, 300) });
    if (cards.length >= 40) break;
  }
  return cards.length >= 3 ? cards : null;
}

// ---------------------------------------------------------------- the ledger

/** The §12 ledger: an assets row for the made thing, joined to its canvas. Returns the asset
 *  id, or null — the ledger is bookkeeping, and bookkeeping never blocks a deliverable. */
async function recordLedger(canvasId: string, title: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("assets")
      .insert({ kind: "generated_document", title: title.slice(0, 300) })
      .select("id")
      .single();
    if (error || !data) return null;
    const assetId = (data as { id: string }).id;
    await supabase.from("canvas_outputs").insert({ asset_id: assetId, canvas_id: canvasId });
    return assetId;
  } catch {
    return null;
  }
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------- flashcards

const CARDS_SYSTEM =
  "You write flashcards from study material. Reply with ONLY a JSON array of objects, each " +
  'with exactly two string fields: "front" (a question or prompt) and "back" (the answer). ' +
  "Write 10 to 16 cards that cover the material's core ideas. No markdown fences, no commentary.";

export async function makeFlashcardsDeliverable(
  uid: string,
  canvas: LearningCanvas,
): Promise<DeliverableResult | DeliverableFailure> {
  if (!canvasHasMaterial(canvas)) return { error: "There's nothing on the canvas to make cards from yet." };
  const reply = await postChatCompletion(uid, [
    { content: CARDS_SYSTEM, role: "system" },
    { content: canvasBrief(canvas), role: "user" },
  ]);
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const cards = readCardsJson(reply.text);
  if (!cards) return { error: "The cards came back unusable, so nothing was saved. Try again." };

  const name = `${(canvas.title || "Nemesis canvas").slice(0, 100)} · flashcards`;
  const { data, error } = await supabase
    .from("study_decks")
    .insert({ description: "Made on a Nemesis canvas, at your request.", name: name.slice(0, 120), user_id: uid })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the deck to your library." };
  const deckId = (data as { id: string }).id;

  const rows = cards.map((card) => ({
    back: card.back,
    card_type: "basic",
    deck_id: deckId,
    front: card.front,
    tags: normalizeStudyTags([CANVAS_DECK_TAG]),
    user_id: uid,
  }));
  const { error: cardsError } = await supabase.from("study_cards").insert(rows);
  if (cardsError) return { error: "Couldn't save the cards to your library." };

  const assetId = await recordLedger(canvas.id, name);
  return {
    output: {
      ...(assetId ? { assetId } : {}),
      createdAt: new Date().toISOString(),
      deckId,
      id: newId(),
      kind: "flashcards",
      title: name,
    },
  };
}

// ---------------------------------------------------------------- summary note

const NOTE_SYSTEM =
  "You write a clean, self-contained summary note in Markdown for a learner's library. Start " +
  "with a single # title line, then short sections under ## headings. Bold the key terms where " +
  "they are defined. Cover the material faithfully and compactly. No preamble, no closing remarks.";

/** Where canvas-made notes are filed in the library's tree. */
export const CANVAS_NOTE_FOLDER = "Canvas outputs";

export async function makeNoteDeliverable(
  uid: string,
  canvas: LearningCanvas,
): Promise<DeliverableResult | DeliverableFailure> {
  if (!canvasHasMaterial(canvas)) return { error: "There's nothing on the canvas to summarise yet." };
  const reply = await postChatCompletion(uid, [
    { content: NOTE_SYSTEM, role: "system" },
    { content: canvasBrief(canvas), role: "user" },
  ]);
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const content = reply.text.trim();
  if (content.length < 80) return { error: "The note came back empty, so nothing was saved. Try again." };

  const title = (canvas.title || "Canvas summary").slice(0, 120);
  let saved: { path: string; title: string };
  try {
    saved = await writeLibraryNote({ content, folder: CANVAS_NOTE_FOLDER, title, userId: uid });
  } catch {
    return { error: "Couldn't save the note to your library." };
  }

  const assetId = await recordLedger(canvas.id, saved.title);
  return {
    output: {
      ...(assetId ? { assetId } : {}),
      createdAt: new Date().toISOString(),
      id: newId(),
      kind: "note",
      notePath: saved.path,
      title: saved.title,
    },
  };
}

// ---------------------------------------------------------------- slides

/**
 * Slides are the GENERALIST deliverable (owner 2026-08-25: "users will ask for slides on
 * anything… it needs to be a generalist tool just like ChatGPT and Claude"): grounded in the
 * canvas's material when there is any, and built from the model's own knowledge of the topic
 * when there is none. The other two makers refuse an empty canvas; this one only refuses an
 * empty canvas WITH no topic to work from.
 *
 * The model writes a slide PLAN (deck-plan.ts is the border control); the theme in
 * deck-pptx.ts does every visual. References are filled HERE from the canvas's own sources —
 * the prompt forbids the model inventing any.
 */
export async function makeSlidesDeliverable(
  uid: string,
  canvas: LearningCanvas,
  topic?: string,
): Promise<DeliverableResult | DeliverableFailure> {
  const grounded = canvasHasMaterial(canvas);
  const subject = (topic ?? "").trim() || canvas.title.trim();
  if (!grounded && !subject) {
    return { error: "Give the deck a topic first: type what the slides should be about." };
  }
  const brief = grounded
    ? canvasBrief(canvas)
    : `Topic: ${subject}\n\nThere is no attached material. Build the deck from your own knowledge of the topic, accurately and at student level.`;
  const reply = await postChatCompletion(uid, [
    { content: deckSystemPrompt(), role: "system" },
    { content: brief, role: "user" },
  ]);
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const plan = readDeckJson(reply.text);
  if (!plan) return { error: "The slide plan came back unusable, so nothing was saved. Try again." };
  // References only from what the canvas really holds — never from the model.
  plan.references = grounded
    ? canvas.sources.slice(0, 10).map((source) => ({
        title: source.title,
        ...(source.sourceUrl ? { url: source.sourceUrl } : {}),
      }))
    : [];

  const assetId = await recordSlidesLedger(canvas.id, plan.title);
  return {
    output: {
      ...(assetId ? { assetId } : {}),
      createdAt: new Date().toISOString(),
      deck: plan,
      id: newId(),
      kind: "slides",
      title: plan.title,
    },
  };
}

/** Slides get their own asset kind so the Library can list them without loading canvases. */
async function recordSlidesLedger(canvasId: string, title: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("assets")
      .insert({ kind: "generated_slides", title: title.slice(0, 300) })
      .select("id")
      .single();
    if (error || !data) return null;
    const assetId = (data as { id: string }).id;
    await supabase.from("canvas_outputs").insert({ asset_id: assetId, canvas_id: canvasId });
    return assetId;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the chat ask

/**
 * Read an UNMISTAKABLE artifact ask out of a chat turn — "make me a PowerPoint about…",
 * "create flashcards for this" — or nothing.
 *
 * 🔴 NARROW BY DESIGN, BECAUSE THE COST OF A FALSE MATCH IS A STOLEN TURN. A learner asking
 * "how do I make a good presentation?" wants teaching, and getting a file instead reads as
 * the system not listening. So: a make-verb within arm's reach of an artifact noun, and the
 * turn must not OPEN as a question about making (how/why/what/when/where/whether). Everything
 * ambiguous falls through to the ordinary turn, which can always still offer.
 */
export function readDeliverableAsk(text: string): DeliverableKind | null {
  const said = text.trim();
  if (/^(?:how|why|what|when|where|whether)\b/i.test(said)) return null;
  const match =
    /\b(?:make|create|build|generate|give)\b[^.?!\n]{0,60}?\b(?:(slides?|slide deck|power\s?point|presentation|pptx|ppt)|(flash\s?cards?|study deck)|(summary note|study note))\b/i.exec(
      said,
    );
  if (!match) return null;
  if (match[1]) return "slides";
  if (match[2]) return "flashcards";
  return "note";
}
