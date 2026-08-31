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

import { REFERENCE_SHELF } from "./reference-shelf";
import { searchCurated } from "./reference-images";
import { resolveStructures } from "./structure-lookup";
import { readModelJson } from "../model-json";
import { supabase } from "@/lib/supabase";
import { postChatCompletion, searchWebContext } from "@/lib/workspace/chat-api";
import { writeLibraryNote } from "@/lib/workspace/library-write";
import { normalizeStudyTags } from "@/lib/workspace/study-cloud-store";
import { hasCloze } from "@/lib/workspace/study-cloze";

import { deckSystemPrompt, readDeckJson, type DeckPlan } from "../export/deck-plan";
import { canvasFigures, figureMenu } from "./deck-figures";

import { reportMarkdown, reportTitle, researchSummaryLine } from "@/lib/research/report-markdown";
import type { OnResearchStep } from "@/lib/research/research-model";
import { runResearch } from "@/lib/research/run-research";

import type { CanvasOutput, LearningCanvas } from "./canvas-model";
import { CANVAS_DECK_TAG } from "./canvas-study-bridge";
import { deckName } from "./deck-name";
import { findLabelledFigure } from "./figure-occlusion-api";
import { dropCardsCoveredByFigure, pickCanvasFigure, labelCanvasFigure } from "./canvas-figure-occlusion";
import { readFigureSubject } from "./figure-subject";
import { occlusionCards } from "./occlusion-from-labels";

/**
 * What the canvas can make today.
 *
 * 🔴 `document`, `pdf` AND `sheet` ARE FILES, NOT LIBRARY ROWS, and that is the difference between
 * them and `note`. A note is Markdown filed in the Library to be read on screen; these are things
 * the learner takes away and opens in Word, a PDF reader or Excel. `document` and `pdf` are the
 * SAME Markdown with two file formats — one model call, two writers — because asking the model to
 * "write it again but as a PDF" would produce different prose for no reason.
 */
export type DeliverableKind = "document" | "flashcards" | "note" | "pdf" | "report" | "sheet" | "slides";

export interface DeliverableResult {
  /** A line about what it cost, when the maker has one. Shown instead of the generic notice. */
  note?: string;
  output: CanvasOutput;
}

export interface DeliverableFailure {
  error: string;
}

/**
 * Output headroom for the makers whose answer a PARSER reads.
 *
 * 🔴🔴 THESE EXIST BECAUSE NOTHING IN THIS APP EVER SET ONE, and the default cap is well below what
 * a full deck costs. A truncated sentence is still readable; a truncated JSON object is not, so the
 * whole answer was discarded and the learner told it "came back unusable" — a message that blames
 * the model for a limit we never raised. The owner hit it asking for a glycolysis deck.
 *
 * Sized to the artifact: a twelve-slide deck with notes and takeaways is the largest, a table of
 * short cells the smallest.
 */
const DECK_MAX_TOKENS = 8192;
const CARDS_MAX_TOKENS = 8192;
const TABLE_MAX_TOKENS = 4096;

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
  // Structure-only repair, so a long pack that ran past the cap keeps the cards that arrived whole.
  // A half-written card survives the repair and is dropped by the front/back check below, which is
  // where that judgement belongs. See lib/model-json.ts.
  const parsed = readModelJson(text);
  // 🔴🔴 TWO REPLY SHAPES, AND THE SECOND ONE IS EASY TO LOSE. The model answers either with a bare
  // array of cards or with `{"cards": [...], "figure": "..."}` when it wants a figure occluded. The
  // old parser sliced from the first `[` to the last `]`, which read the array out of BOTH by
  // accident. `readModelJson` returns the real root, so the object form has to be unwrapped on
  // purpose — and a guard caught this the moment it was not.
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { cards?: unknown } | null)?.cards)
      ? ((parsed as { cards: unknown[] }).cards)
      : null;
  if (!list) return null;
  const cards: { front: string; back: string }[] = [];
  for (const entry of list) {
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

export const CARDS_SYSTEM =
  "You write flashcards from study material. Reply with ONLY a JSON array of objects, each " +
  'with exactly two string fields: "front" (a question or prompt) and "back" (the answer). ' +
  "Write 10 to 16 cards that cover the material's core ideas. No markdown fences, no commentary. " +
  // 🔴🔴 ONE IDEA PER CARD, AND NOTHING ASKED FOR THAT UNTIL 2026-08-30. Without it the model
  // writes "name the three types of X" and puts a three-item list on the back, which is the card
  // spaced repetition handles worst: recall two of three and no grade is honest, so the schedule
  // learns nothing from the press. Splitting is free at write time and impossible afterwards.
  //
  // 🔴 STATED AS A RULE ABOUT SHAPE, NEVER ABOUT LENGTH. "Keep it short" invites a truncated
  // answer; "one fact, and split a list into one card per item" gets a short answer as a
  // consequence of being right. The 1000-character cap in `readCardsJson` is a safety limit, not
  // a target, and must not be lowered to enforce this: it would cut sentences in half.
  "ONE FACT PER CARD. If an answer would be a list, write one card for each item instead. Never " +
  'ask for several things at once ("name the three ..."), and never put a paragraph on the back: ' +
  "a phrase or a sentence. A card the learner can only half-remember cannot be graded honestly. " +
  // 🔴🔴 THE SPLIT RULE NEEDS A FLOOR, AND A LIVE RUN IS THE ONLY THING THAT SHOWED IT. Asked for
  // atomic cards on a four-stroke engine, the model split the material's parts list into seven of
  // these: "The {{c1::piston}} is a labelled part of the cylinder assembly." Each one is atomic,
  // correctly formatted, and worth nothing: it tests membership of a list, not what a piston does.
  //
  // 🔴 AND THEY COLLIDE WITH THE FIGURE. Those seven parts are exactly what the occlusion cards
  // cover, so the deck was about to carry seven dead text cards beside seven good image ones. The
  // rule therefore ends by pointing the parts at the picture instead of at more prose.
  "Split a list only when each item carries its OWN fact, something the learner could be asked " +
  "about on its own. A bare enumeration is not a set of cards: never write a card whose answer is " +
  "merely that something belongs to a list, appears in a diagram, or is one of the parts of a " +
  "thing. If the material's list is the labelled parts of a diagram, write NO cards about those " +
  "parts at all, in any form, including a cloze that hides one of them or the thing they belong " +
  "to. Name the figure instead and let the picture ask. " +
  // 🔴🔴 CLOZE WAS RENDERABLE AND UNREACHABLE. `study-cloze.ts` has parsed `{{c1::...}}` since the
  // Study tab shipped and `review-session.tsx` auto-detects it even on a card typed basic, but the
  // writer was never told the syntax existed, so no generated deck has ever contained one. Owner
  // asked for it directly, 2026-08-30.
  //
  // 🔴 ONE CLOZE PER CARD, ALWAYS c1, AND THAT IS THE ATOMICITY RULE AGAIN RATHER THAN A SEPARATE
  // ONE. `activeClozeNumber` rotates which blank is hidden by the card's repetition count, so a
  // card carrying c1/c2/c3 is three facts wearing one schedule: its interval reflects whichever
  // blank happened to come up. Anki splits those into separate cards, and so do we.
  "A card may hide a phrase inside a sentence instead of asking a question. Write the sentence as " +
  'the "front" with the hidden part wrapped as {{c1::the phrase}}, and put the complete sentence ' +
  'in "back". Use exactly ONE {{c1::...}} per card and never c2 or c3: a card that hides several ' +
  "things is several cards. Reach for this when a fact only means anything in its sentence and a " +
  "bare question would strip the context out of it. " +
  // 🔴 ONE FORM PER FACT, AND THIS ONE ALSO CAME FROM A LIVE RUN. Given both a question form and a
  // cloze form, the model used BOTH: a twelve-card engine deck where cards 7 to 12 were cloze
  // restatements of cards 1 to 6. Every duplicate is a second schedule for one memory, so the
  // learner is asked the same thing twice at drifting intervals and the deck feels padded.
  "Each fact appears ONCE, in one form. Never write the same fact as both a question and a cloze. " +
  // 🔴 THE OPTIONAL OBJECT FORM IS BACKWARDS COMPATIBLE BY CONSTRUCTION. `readCardsJson` slices
  // from the first "[" to the last "]", so it reads the cards array out of either shape without
  // knowing this field exists, which is why adding it cannot break a deck.
  //
  // 🔴 "WHEN ... REPLY", NOT "YOU MAY". It read as permission and was therefore usually declined;
  // a labelled diagram is exactly the material a written card serves badly, so the trigger is the
  // material having one, not the model feeling like it.
  "When the material has a LABELLED DIAGRAM worth knowing the parts of (anatomy, a circuit, a " +
  "cell, a map, an engine, a piece of apparatus), reply with an object instead: " +
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
  const reply = await postChatCompletion(
    uid,
    [
      { content: CARDS_SYSTEM, role: "system" },
      { content: canvasBrief(canvas), role: "user" },
    ],
    { maxTokens: CARDS_MAX_TOKENS },
  );
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
  // 🔴 THE SUBJECT THE CARD WRITER NAMED IS ALSO THE BEST FALLBACK NAME, and reading it here
  // rather than after the insert is the whole fix. Measured in production 2026-08-25: a nephron
  // canvas opened from a deep link has an EMPTY title, so a deck of twenty nephron cards saved as
  // "Untitled deck" — honest, and useless on a shelf. The model had just written `"figure":
  // "nephron"`; that word was sitting in the reply while the deck was being named after nothing.
  const subject = readFigureSubject(readCardsFigure(reply.text));
  // 🔴 THE FALLBACK IS CAPITALISED, THE LEARNER'S OWN TITLE IS NOT. The model writes its subject
  // index-style and lower case ("nephron"); a shelf of deck names wants "Nephron". A title the
  // learner typed is theirs and is left exactly as they wrote it.
  const named = canvas.title.trim() || (subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : "");
  const name = deckName(named);
  const { data, error } = await supabase
    .from("study_decks")
    .insert({ description: "Made on a Nemesis canvas, at your request.", name, user_id: uid })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the deck to your library." };
  const deckId = (data as { id: string }).id;

  const rows: Record<string, unknown>[] = cards.map((card) => ({
    back: card.back,
    // 🔴 THE MARKER DECIDES THE TYPE, NOT THE WRITER. Hard-coding "basic" here was the second half
    // of why cloze never appeared: even had the model written one, the row would have claimed to be
    // a plain card. The review screen already auto-detects a marker on a basic card, so this only
    // ever made the STORED row disagree with what the learner saw, which is the kind of quiet
    // mismatch that surfaces months later in an export or a stats query.
    card_type: hasCloze(card.front) ? "cloze" : "basic",
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
  if (subject) {
    // 🔴🔴 THE LEARNER'S OWN DOCUMENT IS ASKED FIRST (owner, 2026-08-30: *"diagrams should also be
    // from uploaded documents too if its appropriate"*). When the material IS a lecture PDF with a
    // labelled figure in it, that figure is the one worth covering: it is the one they will see in
    // the exam, with their lecturer's labels and their lecturer's emphasis. A licensed lookalike
    // found by name is a good second choice and a poor first one.
    //
    // 🔴 THE FALLBACK IS NOT A FAILURE PATH. Most material has no figure at all, and for it the
    // corpus is the only source there has ever been. Both lanes end in the same `occlusionCards`.
    const own = pickCanvasFigure(subject, await canvasFigures(canvas));
    const figure = (own ? await labelCanvasFigure(own) : null) ?? (await findLabelledFigure(subject));
    // 🔴 THE PICTURE WINS THE PARTS. Any written card whose whole answer is a part the image cards
    // now cover is that image card inverted, and keeping both means two schedules for one fact. See
    // `dropCardsCoveredByFigure`: the prompt asks for this and a live run showed it is not enough.
    if (figure) {
      const labels = figure.boxes.map((box) => box.label ?? "");
      const kept = dropCardsCoveredByFigure(rows.map((row) => ({ back: String(row.back), front: String(row.front), row })), labels);
      rows.length = 0;
      rows.push(...kept.map((entry) => entry.row));
    }
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

// ---------------------------------------------------------------- what the model is working from

/**
 * Pages from the web, when the canvas has nothing of its own to build from.
 *
 * 🔴🔴 OWNER, 2026-08-25: *"it should be able to use websearch to build documents or other
 * artifacts if it needs information."* A maker on an empty canvas was writing entirely from the
 * model's own memory — which is fine for what a model knows well and silently thin for anything
 * recent, contested or specific. One search costs what an ordinary chat turn that searches costs,
 * and the learner already asked for the artifact.
 *
 * 🔴 ONLY WHEN THERE IS NOTHING ATTACHED, AND THAT LIMIT IS THE POINT. A canvas WITH material has
 * already been told what to build from: the learner's own lecture, their own slides. Searching
 * anyway would spend a metered unit to add pages nobody asked for, and would let the web argue
 * with the source somebody uploaded. Grounded canvases are untouched.
 *
 * 🔴 IT CANNOT FAIL THE ARTIFACT. `searchWebContext` swallows its own errors and returns an empty
 * context, so a search outage means a deck built from model knowledge — exactly what happened
 * before this existed — rather than an error where a deck should be.
 */
async function webContextForTopic(uid: string, subject: string): Promise<string> {
  if (!subject.trim()) return "";
  const found = await searchWebContext(uid, subject);
  if (!found.context.trim()) return "";
  return `Recent pages on this topic, to build from where they are useful:\n\n${found.context}`;
}

// ---------------------------------------------------------------- document, PDF and spreadsheet

const DOC_SYSTEM =
  "You write a clean, self-contained document in Markdown that a learner will open in Word or as " +
  "a PDF. Start with a single # title line, then sections under ## headings, with short paragraphs " +
  "and bullet lists where they genuinely help. Cover the material faithfully and compactly. Write " +
  "and a Markdown table wherever the material is genuinely a comparison — Nemesis renders those " +
  "properly in both the Word file and the PDF. Write no preamble, no closing remarks and no code " +
  "blocks.";

const SHEET_SYSTEM =
  "You turn material into ONE table and return JSON, nothing else. Shape: " +
  '{"title": string, "columns": [string, ...], "rows": [[string, ...], ...]}. ' +
  "Every row must have exactly as many cells as there are columns. Choose columns that make the " +
  "material genuinely comparable — the point is a table somebody can sort and filter, not a " +
  "paragraph in a grid. Keep cells short. Between 2 and 8 columns. Return JSON only.";

/**
 * The prose deliverables: one model call, and the caller says which file comes out of it.
 *
 * 🔴 IT IS THE SAME MAKER FOR BOTH FORMATS BECAUSE IT IS THE SAME DOCUMENT. The kind is carried
 * through so the output row knows which writer to run; nothing about the writing changes.
 */
export async function makeDocumentDeliverable(
  uid: string,
  canvas: LearningCanvas,
  kind: "document" | "pdf",
  topic?: string,
): Promise<DeliverableResult | DeliverableFailure> {
  // 🔴 GENERALIST, LIKE SLIDES AND FOR THE OWNER'S OWN REASON (2026-08-25: these "are just general
  // things that a general chat AI should be able to do"). It refuses only when there is neither
  // material NOR a subject — with a topic it writes from what the model knows, and with material it
  // is grounded in that.
  const subject = (topic ?? "").trim() || canvas.title.trim();
  if (!canvasHasMaterial(canvas) && !subject) {
    return { error: "Tell me what the document should be about, and I'll write it." };
  }
  const brief = canvasHasMaterial(canvas)
    ? canvasBrief(canvas)
    : [`Write this document about: ${subject}`, await webContextForTopic(uid, subject)].filter(Boolean).join("\n\n");
  const reply = await postChatCompletion(uid, [
    { content: DOC_SYSTEM, role: "system" },
    { content: brief, role: "user" },
  ]);
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const markdown = reply.text.trim();
  if (markdown.length < 80) return { error: "The document came back empty, so nothing was made. Try again." };

  // The model's own # title when it wrote one, because it read the material and the canvas title
  // may still be untitled. Falls back the other way round.
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  const title = (heading || subject || "Document").slice(0, 120);
  const assetId = await recordLedger(canvas.id, title);
  return {
    output: {
      ...(assetId ? { assetId } : {}),
      createdAt: new Date().toISOString(),
      id: newId(),
      kind,
      markdown,
      title,
    },
  };
}

/**
 * Reads the model's table.
 *
 * 🔴🔴 EVERY ROW IS RESHAPED TO THE COLUMN COUNT, WHICH IS THE ONE THING A CSV CANNOT SURVIVE
 * GETTING WRONG. A short row shifts every later cell left in the spreadsheet and a long one spills
 * into a column with no header — both open successfully and are silently wrong, which is worse than
 * refusing. Padding and truncating means the grid is always rectangular.
 */
export function readSheetJson(text: string): { columns: string[]; rows: string[][]; title?: string } | null {
  // Structure-only repair, so a long table that ran past the cap keeps the rows that arrived
  // whole rather than becoming nothing. See lib/model-json.ts.
  const parsed = readModelJson(text);
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as { columns?: unknown; rows?: unknown; title?: unknown };
  const columns = Array.isArray(raw.columns) ? raw.columns.map((c) => String(c ?? "").trim()).filter(Boolean) : [];
  if (columns.length < 2 || columns.length > 12) return null;
  const rows: string[][] = [];
  for (const row of Array.isArray(raw.rows) ? raw.rows : []) {
    if (!Array.isArray(row)) continue;
    const cells = columns.map((_, index) => String(row[index] ?? "").trim());
    if (cells.some(Boolean)) rows.push(cells);
  }
  if (!rows.length) return null;
  return { columns, rows, ...(typeof raw.title === "string" && raw.title.trim() ? { title: raw.title.trim() } : {}) };
}

export async function makeSheetDeliverable(
  uid: string,
  canvas: LearningCanvas,
  topic?: string,
): Promise<DeliverableResult | DeliverableFailure> {
  const subject = (topic ?? "").trim() || canvas.title.trim();
  if (!canvasHasMaterial(canvas) && !subject) {
    return { error: "Tell me what the spreadsheet should cover, and I'll build it." };
  }
  const brief = canvasHasMaterial(canvas)
    ? canvasBrief(canvas)
    : [`Build this table about: ${subject}`, await webContextForTopic(uid, subject)].filter(Boolean).join("\n\n");
  const reply = await postChatCompletion(
    uid,
    [
      { content: SHEET_SYSTEM, role: "system" },
      { content: brief, role: "user" },
    ],
    { maxTokens: TABLE_MAX_TOKENS },
  );
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const table = readSheetJson(reply.text);
  if (!table) return { error: "The table came back in a shape I couldn't use. Try asking again." };

  const title = (table.title || subject || "Table").slice(0, 120);
  const assetId = await recordLedger(canvas.id, title);
  return {
    output: {
      ...(assetId ? { assetId } : {}),
      createdAt: new Date().toISOString(),
      id: newId(),
      kind: "sheet",
      sheet: { columns: table.columns, rows: table.rows },
      title,
    },
  };
}

// ---------------------------------------------------------------- the shared figure shelf

/**
 * Fills each slide's `illustration` request from the reference shelf, in place.
 *
 * 🔴 THE ATTRIBUTION AND LICENCE TRAVEL WITH THE PICTURE. Every row on the shelf was harvested with
 * its licence read through the repository API; a figure printed without its credit is the one way
 * this lane could turn a correctly licensed image into an incorrectly used one.
 */
function illustrate(plan: DeckPlan): void {
  for (const slide of plan.slides) {
    const concept = slide.illustration?.trim();
    if (!concept) continue;
    const [best] = searchCurated({ concept, limit: 1 }, REFERENCE_SHELF);
    if (!best?.assetPath) continue;
    plan.figures.push({
      caption: best.caption || concept,
      path: "",
      source: best.licence ? `${best.licence}` : "Reference shelf",
      url: best.assetPath,
    });
    slide.figure = plan.figures.length;
  }
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
    grounded ? "" : await webContextForTopic(uid, subject),
    menu,
  ]
    .filter(Boolean)
    .join("\n\n");
  // 🔴 THE HEADROOM IS THE FIRST FIX FOR "the slide plan came back unusable". A twelve-slide deck
  // is a large JSON object and every call in this app ran at the provider's default output cap, so
  // the answer was cut off mid-object and the parser could only report failure. See
  // `ChatCompletionOptions.maxTokens`.
  const reply = await postChatCompletion(
    uid,
    [
      { content: deckSystemPrompt(), role: "system" },
      { content: brief, role: "user" },
    ],
    { maxTokens: DECK_MAX_TOKENS },
  );
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  // 🔴🔴 EVERY NAMED COMPOUND BECOMES A LOOKUP BEFORE ANYTHING IS PARSED (§42). The model wrote
  // `{"kind":"structure","compound":"glucose"}`; this replaces it with what PubChem returned, and
  // `readDeckJson` drops any request that is still a request — a name that did not resolve loses
  // its picture, never its slide.
  //
  // 🔴 THE SAME LANE THE CANVAS USES, called on the raw reply text exactly as `canvas-chat.ts`
  // calls it. A second resolver for decks would be a second place for §42's rule to rot.
  const resolved = await resolveStructures(reply.text);
  const plan = readDeckJson(resolved);
  if (!plan) return { error: "The slide plan came back unusable, so nothing was saved. Try again." };
  // 🔴 THE FIGURE LIST IS THE CANVAS'S, AND SO IS THE RANGE. The model answered with numbers; a
  // number past the end of the real list is dropped here rather than carried into a saved plan,
  // so a deck reopened next week cannot suddenly resolve it against a different list.
  plan.figures = figures;
  for (const slide of plan.slides) {
    if (slide.figure > figures.length) slide.figure = 0;
  }
  // 🔴🔴 A CONCEPT BECOMES A LICENSED FIGURE, OR NOTHING. Owner, 2026-08-25: *"also pull in corpus
  // figures."* The model named what it wanted a picture OF; `searchCurated` decides which file that
  // is, from the checked-in shelf whose every row carries a licence that normalised. A model naming
  // a file would be a model choosing an asset, which is how an unlicensed or unrelated image
  // reaches a slide with nothing able to catch it.
  //
  // 🔴 THE SHELF'S OWN TWO-WORD FLOOR DOES THE REFUSING. It records what a weak match cost:
  // *"balance sheet matched a bathtub balance seat"*. A slide with no good figure keeps its points,
  // which is the same bargain an unresolved compound makes.
  //
  // 🔴 APPENDED AFTER THE LEARNER'S OWN, for the reason the figure clamp above exists: the model
  // chose its `figure` numbers against the list it was shown.
  illustrate(plan);
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
  /** The sub-questions the learner approved on the plan card, when they were shown one. */
  plan?: readonly string[],
): Promise<DeliverableResult | DeliverableFailure> {
  const outcome = await runResearch(uid, question, {
    ...(onStep ? { onStep } : {}),
    ...(plan?.length ? { plan } : {}),
  });
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
    // 🔴 THE NUMBERS TRAVEL WITH THE RESULT so the notice can say what actually happened —
    // "Research done in 1m 14s · 6 sources · 6 searches" — rather than the same cheerful sentence
    // whatever the run cost. It is the identical line printed inside the report's own footer, so a
    // learner reading both cannot find two accounts of one run.
    note: researchSummaryLine(outcome),
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
