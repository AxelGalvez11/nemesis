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
import { materialText } from "./canvas-grounding";
import { chunksAsMaterial, excerptsInChunks, inventoryNote, retrievalNote, retrieveChunks, DELIVERABLE_CHUNKS } from "./canvas-retrieval";
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

/** How much of the canvas CONVERSATION the model sees. Enough for a study artifact; not the whole
 *  transcript of a long session. The attached files are budgeted separately — see `canvasBrief`. */
const BRIEF_LIMIT = 7000;

/** Said before the attached files, because a model handed a title and a document has to be told
 *  which of the two it is writing about. */
const MATERIAL_LEAD =
  "The learner's own attached material is below. Build this from what it actually says, covering it " +
  "end to end. Do not write about the title instead.";

/**
 * Everything the canvas knows, flattened for a prompt: the title, what it set out to teach, the
 * taught blocks in order, WHAT WAS ACTUALLY SAID, and — since 2026-09-02 — THE FILES THE LEARNER
 * ATTACHED.
 *
 * 🔴🔴🔴 THE FILES WERE THE ONE THING MISSING, AND EVERY DELIVERABLE WAS BLIND TO THEM. This read
 * the title, the blocks and the conversation, and never once touched `canvas.sources`. Chat could
 * see an attached document — that is how `[s1:e4]` citations resolve at all — but every FILE the
 * canvas produced was written from the chat around the document instead of from the document.
 *
 * Owner, 2026-09-02, on a two-hour COPD pharmacotherapy lecture: *"i dropped in my lecture
 * transcript and i dont think it read it well. because i asked for a document and it was not
 * related at all."* It had read the transcript perfectly: 2,530 excerpts, parsed and stored. The
 * whole brief the document writer received was 190 characters of it:
 *
 *     Topic: Still fired up to be here
 *     What was taught in conversation:
 *     Q: this is transcript from lecture
 *     Thanks for sharing the transcript. What would you like to do with it?
 *
 * The namer had taken its title from the transcript's first caption line, so "Still fired up to be
 * here" was the only subject in the prompt — and the model wrote a competent, well-structured essay
 * about that phrase as a figure of speech, with a table of the settings it gets used in. It was not
 * hallucinating. It was answering the only question it was asked.
 *
 * 🔴 THE SYMPTOM POINTED AT THE PARSER AND THE PARSER WAS FINE. Diagnose this class of report from
 * `learning_canvases`, not from the reply: the excerpt COUNT proves the read, the BRIEF proves the
 * write. Those are two different questions and this bug lived between them.
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
  const context = canvasContext(canvas);

  // 🔴 THE ATTACHED FILES GO IN LAST AND ARE BUDGETED SEPARATELY, because they are the largest
  // thing here and `BRIEF_LIMIT` is sized for a conversation. Slicing them together at 7,000
  // characters would put a lecture's opening pleasantries in and the lecture itself out.
  const material = materialText(canvas.sources);
  return material ? `${context}\n\n${MATERIAL_LEAD}\n\n${material}` : context;
}

/**
 * The canvas without its attached material: the title, the concepts, the taught blocks and the
 * conversation. Split out so retrieval can put its own selection where the whole pile used to go.
 */
export function canvasContext(canvas: LearningCanvas): string {
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
  return [
    `Topic: ${canvas.title || "(untitled)"}`,
    concepts.length ? `Concepts: ${concepts.join("; ")}` : "",
    "",
    blocks.join("\n\n"),
    said.length ? `What was taught in conversation:\n${said.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, BRIEF_LIMIT);
}

/**
 * What this deliverable is about, in the learner's own words, for the embedding.
 *
 * 🔴 THE TOPIC, THE LAST THING ASKED, AND THE TITLE — ALL THREE. A retrieval query is only as good
 * as the words in it, and each of these is thin alone: "make it a document" carries no subject, a
 * title can be one caption line off the front of a transcript, and the ask often refines a subject
 * established two turns earlier. Concatenated they embed as what the learner is actually working on.
 */
function askOf(canvas: LearningCanvas, topic?: string): string {
  const asked = [...canvas.moments].reverse().find((moment) => (moment.userText ?? "").trim());
  return [(topic ?? "").trim(), (asked?.userText ?? "").trim(), canvas.title.trim()]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

/**
 * The brief a deliverable is built from, with the material CHOSEN rather than merely truncated.
 *
 * 🔴🔴🔴 THIS IS THE TWENTY-DOCUMENT FIX. `canvasBrief` reads every attached source in order until
 * a character budget runs out, which is fine for one document and silently wrong for ten: the
 * tenth is never seen, and nothing in the output says so. This asks the retrieval index which
 * passages bear on what the learner asked for, across every attached document at once, and sends
 * those.
 *
 * 🔴 FALLING BACK IS NOT A FAILURE MODE, IT IS THE NORMAL PATH FOR A FRESH ATTACHMENT. Chunking and
 * embedding happen after a parse, so a file dropped in ten seconds ago has no rows yet.
 * `retrieveChunks` returns null for that and for every other problem, and the deliverable is built
 * the old way — which is exactly as good as it was yesterday, never worse.
 */
export async function canvasBriefFor(
  canvas: LearningCanvas,
  topic?: string,
  limit: number = DELIVERABLE_CHUNKS,
): Promise<string> {
  const retrieved = await retrieveChunks(canvas.sources, askOf(canvas, topic), limit);
  if (!retrieved) return canvasBrief(canvas);
  const material = chunksAsMaterial(retrieved);
  if (!material) return canvasBrief(canvas);
  const documents = new Set(retrieved.map((chunk) => chunk.parsedDocumentId)).size;
  // 🔴 THE FULL LIST TRAVELS EVEN WHEN THE PASSAGES DO NOT. A writer that only knows about the four
  // documents this question matched will write a study guide that silently covers four of ten.
  const shown = excerptsInChunks(canvas.sources, retrieved).sources;
  return [
    canvasContext(canvas),
    MATERIAL_LEAD,
    inventoryNote(canvas.sources, shown),
    retrievalNote(documents, retrieved.length),
    material,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Whether there is anything to make a deliverable FROM.
 *
 * 🔴 THE GATE STAYS, BECAUSE THE FAILURE IT PREVENTS IS REAL: a model asked for flashcards about a
 * bare title returns confident filler. What changed is what counts as material — an ATTACHED FILE,
 * taught blocks, OR something Nemesis actually said. An empty canvas still refuses, and still says
 * so plainly.
 *
 * 🔴 ATTACHED FILES ARE CHECKED FIRST, AND THAT ORDER IS THE POINT. A canvas holding a 2,530-line
 * lecture and nothing else passed this gate only by accident, on the throwaway "what would you like
 * to do with it?" that Nemesis had replied — the strongest material on the canvas was the one thing
 * the gate could not see. Drop a file, say nothing, ask for a document: before this, that refused.
 */
export function canvasHasMaterial(canvas: LearningCanvas): boolean {
  if (canvas.sources.some((source) => source.excerpts.some((excerpt) => excerpt.text.trim().length > 0))) return true;
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
  "Write one card for every unit of knowledge in the material worth recalling: a full lecture " +
  "usually yields 15 to 30 cards, a short passage fewer, and a narrow ask only the cards it " +
  "supports. Never pad. No markdown fences, no commentary. " +
  // 🔴🔴 THE OWNER'S OWN RULES, 2026-09-03, WRITTEN BY SHAPE. He sent a full rule sheet that day:
  // *"clear prompt, one recall target, minimum redundancy, vertical lists when grouping is
  // necessary."* Every rule below is one of his, with his subject examples turned into shape
  // ("a named thing" rather than a named field's noun), because the product is field-agnostic and
  // `canvas-deliverables.test.ts` fails on a subject word in this prompt.
  //
  // 🔴🔴 ONE RECALL TARGET PER CARD, AND THAT REPLACED "ONE FACT PER CARD, SPLIT EVERY LIST". The
  // 2026-08-30 rule split the names one thing goes by into one card each: four cards with the
  // same answer, four schedules for one memory, a deck that felt padded. Owner: *"it should not
  // make four separate cards. It should make just one card... compress redundancy, not concepts."*
  //
  // 🔴 STATED AS A RULE ABOUT SHAPE, NEVER ABOUT LENGTH. The 1000-character cap in `readCardsJson`
  // is a safety limit, not a target, and must not be lowered to enforce brevity: it would cut a
  // list off mid-item.
  "ONE RECALL TARGET PER CARD. A card asks for exactly one unit of knowledge: one definition, " +
  "one category, one mechanism, one use, one risk, one number, or one named set. Never combine " +
  "unrelated things on a card: two separate effects are two cards, and recognising a thing " +
  '("what category is X?") is a different card from explaining it ("what does X do?"). ' +
  "Compress redundancy, not concepts: when several items are really one unit (the names one " +
  "thing goes by, the members of one set, the steps of one procedure, the parts of one whole, " +
  "the conditions under which one rule holds), write ONE card whose back lists them, never one " +
  "card per item and never several cards that share one answer. Use a list only when the items " +
  "naturally belong together. " +
  // 🔴 VERTICAL, NUMBERED, COUNTED. His words: *"Lists must be vertical, not inline"* and *"Show
  // the number of expected items when helpful. This gives you a retrieval target."* The review
  // screen renders markdown, so a numbered list and bold both draw as such.
  'A list on the back is VERTICAL, one item per line as a numbered list ("1. ...", then a new ' +
  'line, "2. ..."), never an inline comma list. When the front asks for a set, say how many to ' +
  'expect ("X: 3 serious risks?", "What are the 4 names given for X?"), so the learner has a ' +
  "target to retrieve against. " +
  // 🔴 TWO FORMS, EACH FOR WHAT IT DOES BEST. Front/Back when the prompt itself names the target;
  // cloze for definitions, terminology, abbreviations and short associations. Cloze was
  // renderable and unreachable until 2026-08-30 because the writer was never told the syntax.
  // 🔴 QUOTING CONVENTION, LOAD-BEARING FOR THE GUARD: `canvas-deliverables.test.ts` reads this
  // prompt back out of the source with a plain quote matcher, so a fragment that contains a double
  // quote is written as a single-quoted string with no apostrophe inside, and never with `\"`.
  'Use Front/Back when the prompt itself makes the retrieval target clear: "What category is X?" ' +
  'with the back "Y". Facts ABOUT a named thing (its category, how it works, what it is ' +
  "used for, its risks, what to watch for, what to tell someone, the names it goes by) are " +
  "usually Front/Back. Use cloze when the card is better as sentence completion: write the " +
  'sentence as the "front" with the hidden part wrapped as {{c1::the phrase}} and the complete ' +
  'sentence in "back". Cloze is best for definitions, terminology, abbreviations and short ' +
  'associations ("Torque means {{c1::a turning force}}.", "GDP stands for {{c1::gross domestic ' +
  'product}}."), and a technical term the material defines generally gets its own cloze card. ' +
  // 🔴 ONE CLOZE PER CARD, ALWAYS c1. `activeClozeNumber` rotates the hidden blank by repetition
  // count, so c1/c2/c3 on one card is three facts wearing one schedule. Anki splits those; so do we.
  "Use exactly ONE {{c1::...}} per card and never c2 or c3: a card that hides several things is " +
  "several cards. Each unit of knowledge appears ONCE, in one form: never the same fact as both a " +
  "question and a cloze. " +
  // 🔴 SHORT, BOLD ANCHORS. *"Keep answers short. Bare fact first. Use bolding for key anchors."*
  "Keep answers short: the bare fact first, and extra explanation only when it separates the " +
  "answer from something it is easily confused with. Never put a paragraph on the back. Bold " +
  "the key anchors with markdown: the named thing, its category, a warning, or the main answer " +
  '("**Y**"). ' +
  // 🔴🔴 THE CARD IS BUILT FROM WHAT IS IN FRONT OF IT (owner 2026-09-03: cards must be "generated
  // from the actual source material rather than generic background knowledge"). The target above
  // is a target, and a target with no floor under it is an instruction to invent the difference.
  "Every card comes from THIS material. Write what the material says, never what you happen to " +
  "know about the subject: a fact you are sure of but cannot point to in the text does not belong " +
  "in this deck, however true it is. If the material only supports six good cards, write six. " +
  // 🔴🔴 A CARD THAT LOSES THE SPECIFIC TESTS A VAGUE MEMORY OF A FACT INSTEAD OF THE FACT (owner
  // 2026-09-03: preserve exact values, names, definitions, mechanisms, timings and formulas). Stated
  // by shape so it covers a titration, a filing deadline and a load limit without naming any.
  // 🔴 NO EM DASH IN ANY OF THIS, on purpose: the writer's instructions are the only prose it has
  // in front of it, and a prompt that models the banned punctuation is how forty-nine of them got
  // into the turn packet (see no-em-dashes.test.ts).
  "Where the material gives an exact specific and the specific is what makes the fact worth " +
  "knowing (a quantity, a threshold, a proper name, a date or duration, the order of a sequence, " +
  "a formula, a condition under which something does not hold), carry it across exactly as the " +
  "material wrote it. Never round it, never generalise it into a vague word, and never paraphrase " +
  "a wording that is itself the thing being learned. " +
  // 🔴🔴 THE LABELLED-PARTS EXCEPTION, FOUND ON A LIVE RUN. Asked for cards on a four-stroke
  // engine the model once wrote seven of "The {{c1::piston}} is a labelled part of the cylinder
  // assembly": each tested membership of a list, and the same seven parts were exactly what the
  // occlusion cards cover. Under the list rule the parts of one whole are ONE card; when the
  // whole is a labelled diagram even that card yields to the picture.
  "Never write a card whose whole answer is merely that something belongs to a list or appears " +
  "in a diagram. If the material's list is the labelled parts of a diagram, write NO cards about " +
  "those parts at all, in any form, not a list card and not a cloze that hides one of them or the " +
  "thing they belong to. Name the figure instead and let the picture ask. " +
  // 🔴 THE OPTIONAL OBJECT FORM IS BACKWARDS COMPATIBLE BY CONSTRUCTION: `readCardsJson` unwraps
  // either shape. "WHEN ... REPLY", NOT "YOU MAY": read as permission it was usually declined.
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

/**
 * The learner's ask, handed to the card writer as the scope of the deck.
 *
 * 🔴🔴 THE WRITER NEVER SAW THE SENTENCE. `makeDeliverable(kind, said)` has carried the learner's
 * words since it was written and forwarded them to slides, documents and sheets, and not to cards.
 * So "make me flashcards on the brand names" on a seven-lecture canvas made a deck about lecture
 * one's first pages: `canvasBriefFor` picked passages by the last thing asked, which helped when
 * the index existed and did nothing on a fresh drop, and the writer was told to "cover the
 * material's core ideas" either way. Owner, 2026-09-03: *"throughout the chat, I may ask for like
 * flashcards on certain topics."* The topic is the deck.
 *
 * 🔴 NEVER A REASON TO INVENT. A narrow ask the material does not cover yields the cards it does
 * cover and no more; the floor in `CARDS_SYSTEM` ("write six") already says so, and the note
 * repeats it here because it is the sentence most likely to be read last.
 */
export function cardsAskNote(topic?: string): string {
  const said = (topic ?? "").trim().replace(/\s+/g, " ");
  if (!said) return "";
  return (
    `The learner asked: "${said.slice(0, 300)}". Write cards about what they asked for, and only that, ` +
    "from the material above. If they named a part of the material, every card comes from that part; " +
    "if the material barely covers it, write the few cards it supports rather than filling in from memory."
  );
}

export async function makeFlashcardsDeliverable(
  uid: string,
  canvas: LearningCanvas,
  /** The learner's own sentence, when they asked for cards on something in particular. */
  topic?: string,
): Promise<DeliverableResult | DeliverableFailure> {
  if (!canvasHasMaterial(canvas)) return { error: "There's nothing on the canvas to make cards from yet." };
  const reply = await postChatCompletion(
    uid,
    [
      { content: CARDS_SYSTEM, role: "system" },
      { content: [await canvasBriefFor(canvas, topic), cardsAskNote(topic)].filter(Boolean).join("\n\n"), role: "user" },
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

/**
 * The note writer's instructions.
 *
 * 🔴🔴 THE NOTE WAS A SUMMARY, AND THE OWNER DOES NOT STUDY FROM SUMMARIES. Owner, 2026-09-03:
 * *"for me personally, when I study, I like to make a markdown file of all the points that I
 * should be able to recall from memory myself."* This prompt asked for one thing, a "summary
 * note", whatever the learner said, so "the points I should recall" came back as prose about the
 * material rather than the list of things to close the file and say.
 *
 * 🔴 THE SHAPE IS CHOSEN BY THE ASK, AND THE ASK TRAVELS. `makeNoteDeliverable` appends the
 * learner's own sentence after the material (`noteAskParagraph`), and this rule reads it: points to
 * recall, things to memorise, a checklist, a cheat sheet or revision notes get a RECALL LIST, one
 * line per point; everything else gets the summary note it always got. Two shapes behind one door,
 * because a second deliverable kind would be a second row in every table that lists them, for a
 * difference the model can hear in one sentence.
 *
 * 🔴 STATED BY SHAPE, NEVER BY SUBJECT. "A value, a name, a date, an order of steps, a formula, a
 * condition" is a titration, a filing deadline, a load limit and a conjugation without naming any
 * of them (CLAUDE.md), and it is the same rule the card writer follows two sections up.
 *
 * 🔴 NO EM DASH IN ANY OF THIS, on purpose. The writer's instructions are the only prose it has in
 * front of it, and a prompt that models the punctuation the product bans teaches it (see
 * no-em-dashes.test.ts).
 */
const NOTE_SYSTEM =
  "You write a clean, self-contained note in Markdown for a learner's library. Start with a " +
  "single # title line, then sections under ## headings. Bold the key terms where they are " +
  "defined. Everything in the note comes from the material you are given and nothing is " +
  "invented: a point you cannot find in the material does not belong in the note, however true " +
  "it is. No preamble, no closing remarks. " +
  "THE SHAPE FOLLOWS THE LEARNER'S ASK. When the learner asks for the points to recall, the " +
  "things to memorise, a checklist, a cheat sheet or revision notes, write a RECALL LIST: under " +
  "each ## heading, one line per point, and each line is a single thing the learner should be " +
  "able to say from memory without looking. Carry every exact specific across exactly as the " +
  "material gave it (a value, a name, a date, an order of steps, a formula, a condition under " +
  "which something holds or does not). No paragraphs anywhere in a recall list. " +
  "Otherwise write a summary note: short sections that cover the material faithfully and compactly.";

/** Where canvas-made notes are filed in the library's tree. */
export const CANVAS_NOTE_FOLDER = "Canvas outputs";

/**
 * How much of the learner's own sentence the note writer is shown. A sentence is what decides the
 * shape; a pasted page would push the material out of the writer's attention for no gain.
 */
const NOTE_ASK_LIMIT = 300;

/**
 * The learner's ask, as a paragraph for the writer, or nothing when there was none.
 *
 * 🔴 IN THE USER MESSAGE, AFTER THE MATERIAL, AND QUOTED. The system prompt says what a recall list
 * is; this is what tells the writer that THIS learner asked for one. It goes last because the shape
 * is the thing the writer acts on while writing, and it is quoted so a sentence that happens to
 * contain an instruction reads as something the learner said rather than as a rule.
 *
 * Exported for its test: the cap and the quoting are the two things a regex on the source cannot
 * prove.
 */
export function noteAskParagraph(topic?: string): string {
  const ask = (topic ?? "").trim().replace(/\s+/g, " ").slice(0, NOTE_ASK_LIMIT);
  if (!ask) return "";
  return (
    `The learner asked: "${ask}". Shape the note the way they asked for it: a recall list if they ` +
    "asked for the points to recall, memorise or check off, a summary note otherwise. Cover what " +
    "they named, and the whole material when they named nothing narrower."
  );
}

export async function makeNoteDeliverable(
  uid: string,
  canvas: LearningCanvas,
  topic?: string,
): Promise<DeliverableResult | DeliverableFailure> {
  // 🔴 GENERALIST, LIKE THE DOCUMENT AND FOR THE OWNER'S OWN REASON (2026-08-25: these "are just
  // general things that a general chat AI should be able to do"). Until 2026-09-03 this refused any
  // canvas with no material, topic or no topic, while the document maker one section down wrote
  // from what the model knows plus one web search. "Make me a cheat sheet on X" on a fresh canvas
  // is the same ask as "make me a document on X" and gets the same answer: with material it is
  // grounded in that, with a subject alone it writes from knowledge, and with neither it asks.
  const subject = (topic ?? "").trim() || canvas.title.trim();
  if (!canvasHasMaterial(canvas) && !subject) {
    return { error: "Tell me what the note should be about, and I'll write it." };
  }
  // 🔴 THE TOPIC REACHES RETRIEVAL. `canvasBriefFor(canvas)` embedded the canvas title and the last
  // thing said and nothing else, so "the points to recall about chapter four" pulled passages for
  // whatever the canvas was about in general. Same call the document maker makes.
  const brief = canvasHasMaterial(canvas)
    ? await canvasBriefFor(canvas, topic)
    : [`Write this note about: ${subject}`, await webContextForTopic(uid, subject)].filter(Boolean).join("\n\n");
  const reply = await postChatCompletion(uid, [
    { content: NOTE_SYSTEM, role: "system" },
    { content: [brief, noteAskParagraph(topic)].filter(Boolean).join("\n\n"), role: "user" },
  ]);
  if (!reply.text) return { error: reply.errorText ?? "The model call failed. Nothing was made." };
  const content = reply.text.trim();
  if (content.length < 80) return { error: "The note came back empty, so nothing was saved. Try again." };

  // The canvas's own title first, as before: it is the name the learner knows this work by, and the
  // .md lands in Downloads under it. The model's # title is the fallback for an untitled canvas,
  // because it read the material; then the subject; then a plain word rather than the old "Canvas
  // summary", which a recall list is not.
  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  const title = (canvas.title.trim() || heading || subject || "Note").slice(0, 120);
  let saved: { path: string; title: string };
  try {
    saved = await writeLibraryNote({ content, folder: CANVAS_NOTE_FOLDER, madeBy: "nemesis", title, userId: uid });
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
    ? await canvasBriefFor(canvas, topic)
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
    ? await canvasBriefFor(canvas, topic)
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
      ? await canvasBriefFor(canvas, topic)
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
 *
 * 🔴🔴🔴 "DOCUMENT" WAS MISSING, WHICH IS THE MOST OBVIOUS WORD OF THE LOT. Owner, 2026-09-02:
 * *"I asked it to make a document and it literally did not, it just gave me reasoning out loud and
 * no action, like what the heck."* This list has matched slides, flashcards and study notes since
 * it was written, and `makeDocumentDeliverable` has existed the whole time and is imported one file
 * away. "Make a document on it" simply hit nothing, fell through to an ordinary turn, and got
 * talked about. Three separate prompt fixes chased the model's WORDS before this was read; each
 * improved what it said and none of them could make a file, because the door was here.
 *
 * 🔴 AND IT CARRIES A LOOKAHEAD THE OTHERS DO NOT, BECAUSE "DOCUMENT" IS ALSO AN ADJECTIVE. This
 * product is field-agnostic: "build a document parser" is an ordinary computer-science question and
 * must not silently produce a file. The noun therefore only counts when the phrase ENDS on it or
 * turns to what the document is about — "make a document on it", "create a document about X" — and
 * never when another noun follows. Same rule the leading question-word guard serves: when it is
 * ambiguous, teach.
 *
 * 🔴🔴 THE NOTE ARM WAS TWO PHRASES, AND THE OWNER'S OWN SENTENCE WAS NOT ONE OF THEM. It read
 * `(summary note|study note)`, so "make me a markdown file of the points I should recall from
 * memory" (owner, 2026-09-03, describing how he actually studies) fell through to an ordinary turn
 * and was talked about. The arm now carries the ways a learner names this thing: notes, a markdown
 * or md file, a cheat sheet, a study guide, revision notes, a recall list, key points, points to
 * recall. Every phrasing this list lacks is a feature the learner cannot reach (#1061's lesson).
 *
 * 🔴 PLURAL "notes", NEVER BARE "note". "Make a note of that" is a figure of speech and the most
 * common way the singular reaches a tutor; matching it would steal that turn for a file nobody
 * asked for.
 *
 * 🔴 "MAKE SURE" IS NOT A MAKE. A wider noun list widens the verb list's false matches with it:
 * "make sure your notes cover the appeal" is a request about the learner's own notes and would
 * have become a file. The one idiom is excluded at the verb; any other verb in the sentence still
 * counts, so "make sure to create flashcards" still makes flashcards.
 */
export function readDeliverableAsk(text: string): DeliverableKind | null {
  const said = text.trim();
  if (/^(?:how|why|what|when|where|whether)\b/i.test(said)) return null;
  // 🔴 A COLON AND A DASH COUNT AS "TURNING TO WHAT THE DOCUMENT IS ABOUT". The lookahead admitted
  // `.,;!?` and not `:` or a dash, so "make me a document: a study guide on insulin therapy" fell
  // through to an ordinary turn — measured on production 2026-09-03 with thirty lectures attached.
  // A colon is one of the most natural ways to say this, and #1061 already learned the lesson that
  // this door is a list of phrasings and every phrasing it lacks is a feature the learner cannot
  // reach. It stays a lookahead rather than becoming `.*`, because "build a document parser" must
  // still be an ordinary computer-science question.
  const match =
    /\b(?:make(?!\s+sure\b)|create|build|generate|give|write)\b[^.?!\n]{0,60}?\b(?:(slides?|slide deck|power\s?point|presentation|pptx|ppt)|(flash\s?cards?|study deck)|(summary note|study note|notes|markdown(?: file)?|md file|cheat sheet|study guide|revision notes|recall (?:points|list|sheet)|key points|points to (?:recall|remember|memori[sz]e))|(documents?)(?=\s*(?:$|[.,;:!?—-]|\b(?:on|about|for|from|of|with|covering|summari[sz]ing)\b)))\b/i.exec(
      said,
    );
  if (!match) return null;
  if (match[1]) return "slides";
  if (match[2]) return "flashcards";
  if (match[4]) return "document";
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
    saved = await writeLibraryNote({ content: reportMarkdown(outcome), folder: RESEARCH_FOLDER, madeBy: "nemesis", title, userId: uid });
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
