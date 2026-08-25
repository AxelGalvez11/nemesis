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
import { canvasFigures, figureMenu } from "./deck-figures";

import { reportMarkdown, reportTitle } from "@/lib/research/report-markdown";
import type { OnResearchStep } from "@/lib/research/research-model";
import { runResearch } from "@/lib/research/run-research";

import type { CanvasOutput, LearningCanvas } from "./canvas-model";
import { CANVAS_DECK_TAG } from "./canvas-study-bridge";
import { deckName } from "./deck-name";
import { findLabelledFigure } from "./figure-occlusion-api";
import { readFigureSubject } from "./figure-subject";
import { occlusionCards } from "./occlusion-from-labels";

/** What the canvas can make today. Reports join when they have a real home. */
export type DeliverableKind = "flashcards" | "note" | "report" | "slides";

export interface DeliverableResult {
  output: CanvasOutput;
}

export interface DeliverableFailure {
  error: string;
}

/** How much of the canvas the model sees. Enough for a study artifact; not the whole
 *  transcript of a long session. */
const BRIEF_LIMIT = 7000;

/**
 * Everything the canvas knows, flattened for a prompt: the title, what it set out to teach, the
 * taught blocks in order, and — since 2026-08-24 — WHAT WAS ACTUALLY SAID.
 *
 * 🔴🔴 THE CONVERSATION IS MATERIAL, AND LEAVING IT OUT MADE THESE THREE UNREACHABLE. This read
 * `canvas.blocks` alone, which was right while every lesson arrived as blocks. Once teaching moved
 * into the conversation, a canvas that had just taught a full lesson on female anatomy from 31
 * sources still held `blocks: 0` — so `canvasHasMaterial` was false and asking for flashcards
 * answered "There's nothing on the canvas to make cards from yet." The owner hit exactly that and
 * ruled on it: flashcards and slide decks "are just general things that a general chat AI should be
 * able to do… it should use the uploaded documents as a reference, but not ONLY create them from
 * the uploaded document."
 *
 * 🔴 BLOCKS FIRST, THEN THE TALK. A laid-out lesson is the more considered text when one exists, so
 * it leads; the conversation follows and fills the rest of the budget. Whichever is present, the
 * deliverable is built from what the learner actually saw.
 */
export function canvasBrief(canvas: LearningCanvas): string {
  const concepts = canvas.concepts.map((concept) => concept.label).filter(Boolean);
  const blocks = canvas.blocks
    .filter((block) => !block.collapsed)
    .map((block) => block.content)
    .filter(Boolean);
  const said = canvas.moments
    .map((moment) => {
      const asked = (moment.userText ?? "").trim();
      const answered = (moment.assistantText ?? "").trim();
      return [asked ? `Q: ${asked}` : "", answered].filter(Boolean).join("\n");
    })
    .filter(Boolean);
  const brief = [
    `Topic: ${canvas.title || "(untitled)"}`,
    concepts.length ? `Concepts: ${concepts.join("; ")}` : "",
    "",
    blocks.join("\n\n"),
    said.length ? `What was taught in conversation:\n${said.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return brief.slice(0, BRIEF_LIMIT);
}

/**
 * Whether there is anything to make a deliverable FROM.
 *
 * 🔴 THE GATE STAYS, BECAUSE THE FAILURE IT PREVENTS IS REAL: a model asked for flashcards about a
 * bare title returns confident filler. What changed is what counts as material — taught blocks OR
 * something Nemesis actually said. An empty canvas still refuses, and still says so plainly.
 */
export function canvasHasMaterial(canvas: LearningCanvas): boolean {
  if (canvas.blocks.some((block) => block.content.trim().length > 0)) return true;
  return canvas.moments.some((moment) => (moment.assistantText ?? "").trim().length > 0);
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
  "Write 10 to 16 cards that cover the material's core ideas. No markdown fences, no commentary. " +
  // 🔴 THE OPTIONAL OBJECT FORM IS BACKWARDS COMPATIBLE BY CONSTRUCTION. `readCardsJson` slices
  // from the first "[" to the last "]", so it reads the cards array out of either shape without
  // knowing this field exists — which is why adding it cannot break a deck.
  'If the material has a LABELLED DIAGRAM worth knowing the parts of — anatomy, a circuit, a ' +
  "cell, a map, an engine, a piece of apparatus — you may instead reply with an object: " +
  '{"cards": [...], "figure": "nephron"}. "figure" is the SHORTEST NAME for the thing, the way ' +
  'an index would list it: "nephron", "chloroplast", "four-stroke engine". Never a phrase, never ' +
  'a request, never "diagram of ...". Nemesis finds a licensed diagram and makes one image card ' +
  "per labelled part, in addition to your written cards. Leave it out for anything that is not a " +
  "labelled diagram.";

/**
 * The diagram the card writer named, if it used the object form.
 *
 * 🔴 IT PARSES THE WHOLE REPLY OR NOTHING, WHICH IS WHAT MAKES IT SAFE ALONGSIDE `readCardsJson`.
 * On the ordinary array reply, the first "{" is the first CARD and the last "}" is the last card,
 * so the slice between them is `{…}, {…}` — not valid JSON, so this returns null and the deck is
 * built from the array exactly as before. Only a genuine object reply parses.
 */
export function readCardsFigure(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const figure = (parsed as { figure?: unknown }).figure;
  return typeof figure === "string" && figure.trim() ? figure.trim() : null;
}

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

  // 🔴 THE DECK IS NAMED AFTER THE SUBJECT, AND NOTHING ELSE (owner 2026-08-25: "in the
  // flashcards, it had this title called nemesis flashcards, and I don't really need that
  // there"). This line used to read `${canvas.title || "Nemesis canvas"} · flashcards`, which
  // put the product's name and the word "flashcards" into a label that already sits on the
  // Flashcards shelf, under a heading that says Flashcards, above a stack of flashcards. On an
  // untitled canvas it produced "Nemesis canvas · flashcards" — a deck named after the tool
  // that made it instead of the thing it is about.
  const name = deckName(canvas.title);
  const { data, error } = await supabase
    .from("study_decks")
    .insert({ description: "Made on a Nemesis canvas, at your request.", name, user_id: uid })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the deck to your library." };
  const deckId = (data as { id: string }).id;

  const rows: Record<string, unknown>[] = cards.map((card) => ({
    back: card.back,
    card_type: "basic",
    deck_id: deckId,
    front: card.front,
    tags: normalizeStudyTags([CANVAS_DECK_TAG]),
    user_id: uid,
  }));

  // 🔴🔴 IMAGE CARDS, WHEN THE MATERIAL HAS A DIAGRAM WORTH KNOWING THE PARTS OF (owner
  // 2026-08-25: *"it should also be allowable for it to use image occlusion for flash cards.
  // Similar to Anki."*). The model names the subject and nothing else — it never sees the picture,
  // never places a box and never chooses what to hide. Code finds a licensed diagram, has vision
  // locate the labelled parts, and makes one card per part.
  //
  // 🔴 THEY ARE ADDED TO THE TEXT CARDS, NEVER INSTEAD OF THEM. A deck of nothing but "what is the
  // covered part?" tests where things sit and nothing about what they do, and the learner asked
  // for flashcards on the material rather than on one picture.
  //
  // 🔴 AND A FAILURE HERE COSTS THE PICTURES, NEVER THE DECK. No diagram, no labels, vision off,
  // an unreachable repository: every one of them leaves `figure` null and the text cards save
  // exactly as they would have. `findLabelledFigure` never throws for precisely this reason.
  const subject = readFigureSubject(readCardsFigure(reply.text));
  if (subject) {
    const figure = await findLabelledFigure(subject);
    for (const card of figure ? occlusionCards(figure) : []) {
      rows.push({
        back: card.back,
        card_type: "image_occlusion",
        deck_id: deckId,
        front: card.front,
        payload: card.payload,
        tags: normalizeStudyTags([CANVAS_DECK_TAG]),
        user_id: uid,
      });
    }
  }

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
  // The learner's own diagrams, offered as a numbered menu. Only a grounded canvas can have any:
  // a figure lives in storage, and a canvas with no filed source has nothing stored.
  const figures = grounded ? await canvasFigures(canvas) : [];
  const menu = figureMenu(figures);
  const brief = [
    grounded
      ? canvasBrief(canvas)
      : `Topic: ${subject}\n\nThere is no attached material. Build the deck from your own knowledge of the topic, accurately and at student level.`,
    menu,
  ]
    .filter(Boolean)
    .join("\n\n");
  const reply = await postChatCompletion(uid, [
    { content: deckSystemPrompt(), role: "system" },
    { content: brief, role: "user" },
  ]);
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const plan = readDeckJson(reply.text);
  if (!plan) return { error: "The slide plan came back unusable, so nothing was saved. Try again." };
  // 🔴 THE FIGURE LIST IS THE CANVAS'S, AND SO IS THE RANGE. The model answered with numbers; a
  // number past the end of the real list is dropped here rather than carried into a saved plan,
  // so a deck reopened next week cannot suddenly resolve it against a different list.
  plan.figures = figures;
  for (const slide of plan.slides) {
    if (slide.figure > figures.length) slide.figure = 0;
  }
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

// ------------------------------------------------------------------ research

/** Where research reports are filed. Their own folder rather than "Canvas outputs": a report is
 *  something a learner comes back to and cites, not a by-product of one session. */
export const RESEARCH_FOLDER = "Research";

// 🔴 THERE IS NO `readResearchAsk`, AND ITS ABSENCE IS THE POINT. It existed for one day: a regex
// matching research / look into / dig into / deep dive / investigate. It was wrong in the way this
// codebase has already documented twice. A learner writing "I need everything on X for my essay,
// with sources" got nothing; a learner writing in Spanish could never get a report at all; and
// `chat-intent.ts` had ALREADY deleted a `RESEARCH_PATTERN` for those exact reasons, in this exact
// product, and names it in the list of things it replaced.
//
// Whether a turn wants a report is now `TurnDecision.wantsReport` — read from the sentence by the
// model, once, in the same packet that already decides whether the turn needs the web. See
// `turn-router.ts`, where the three-way distinction is written out.

/**
 * Research a question on the live web and file the cited report in the library.
 *
 * The one deliverable that does not read the canvas. The others turn material the learner already
 * has into another shape; this one goes and gets material they do not have, which is the whole
 * reason it exists: the Learn lane never touches the web on its own, so a canvas with nothing on it
 * has nothing to teach from.
 */
export async function makeReportDeliverable(
  uid: string,
  canvas: LearningCanvas,
  question: string,
  onStep?: OnResearchStep,
): Promise<DeliverableResult | DeliverableFailure> {
  const outcome = await runResearch(uid, question, { ...(onStep ? { onStep } : {}) });
  if ("error" in outcome) return { error: outcome.error };

  const title = reportTitle(outcome.question);
  let saved: { path: string; title: string };
  try {
    saved = await writeLibraryNote({ content: reportMarkdown(outcome), folder: RESEARCH_FOLDER, title, userId: uid });
  } catch {
    return { error: "The research finished but I couldn't save it to your library." };
  }

  const assetId = await recordLedger(canvas.id, saved.title);
  return {
    output: {
      ...(assetId ? { assetId } : {}),
      createdAt: new Date().toISOString(),
      id: newId(),
      kind: "report",
      notePath: saved.path,
      title: saved.title,
    },
  };
}
