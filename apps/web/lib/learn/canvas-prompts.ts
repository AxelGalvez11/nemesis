// What we actually ask the model, for each of the canvas's five jobs.
//
// Kept in one file so the shapes we promise the model and the shapes the parsers expect are
// written next to each other and cannot drift.
//
// Two rules run through all of them:
//   1. Every generated block must declare which excerpts it came from. Asked for at generation
//      time, because asking afterwards just invites an invented citation.
//   2. The model never picks block ids. It proposes blocks; we mint the ids.

import { EXAM_ITEM_RULES } from "@/lib/workspace/item-writing";
import type { WireMsg } from "@/lib/workspace/chat-api";

import { focusMaterial, type FocusQuery } from "./canvas-focus-material";
import { groundingBlock } from "./canvas-grounding";
import { CAUSAL_EXTRACTION_PROMPT } from "./causal-extraction-contract";
import { SEMANTIC_EXTRACTION_PROMPT } from "./semantic-grounded";
import type { CognitiveAction } from "./canvas-policy";
import {
  ERROR_TYPES,
  LEVEL_INSTRUCTIONS,
  type CanvasBlock,
  type CanvasConcept,
  type CanvasLevel,
  type CanvasSource,
  type ExpectedEvidence,
  type LearnerResponse,
  type RetrievalFormat,
  type RetrievalTask,
  type SourceRef,
} from "./canvas-model";

/** Field-agnostic by construction. Nemesis serves law, engineering, nursing, history and the
 *  trades alike, so nothing here may assume a discipline — the instructions talk about
 *  structure and evidence, never about subject matter. */
/** 🔴 OWNER RULE: NEMESIS DOES NOT WRITE EM DASHES.
 *
 *  It has to be an INSTRUCTION INSIDE THE PROMPT. A style note in a document cannot hold a surface
 *  that is written by a model at request time — almost everything on the Canvas below the interface
 *  chrome is generated, so a rule the model never sees is not a rule at all.
 *
 *  🔴 AND NOT A POST-PROCESSING STRIP EITHER, which is the obvious alternative and the wrong one: a
 *  regex run over the output would also cut the character out of a learner's own quoted words and
 *  out of quoted source material, silently editing things Nemesis did not write.
 *
 *  Written as an escape rather than the literal character so the rule is greppable and so this
 *  file does not itself become the counter-example. */
const NO_EM_DASH =
  "Never use an em dash. The character — must not appear anywhere in your output. " +
  "Use a comma, a colon, or a new sentence instead.";

const CANVAS_SYSTEM =
  "You are Nemesis, writing a living study document for one learner in any discipline. " +
  "You are not chatting. Your entire output is the JSON payload requested: no greeting, no commentary, no sign-off. " +
  "Write plainly and concretely. Short sections, meaningful headings, no filler, no walls of prose. " +
  "Never assume the learner's field or level beyond what you are told. " +
  "Ground every claim in the supplied material; if the material does not support something, leave it out rather than filling the gap. " +
  NO_EM_DASH;

const CITATION_RULE =
  "Every block you write MUST include sourceRefs listing the excerpt ids it was built from, in the form " +
  '[{"sourceId":"s1","excerptId":"s1:e4"}]. Use ONLY excerpt ids that appear in the material below, exactly as written. ' +
  "Never invent an id, a page number, a slide number, or a timestamp. A block written from your own general knowledge " +
  "rather than the material must have an empty sourceRefs list.";

/** Naming the vocabulary a block introduces.
 *
 *  🔴 Asks for CANDIDATES and says so. The application picks at most two of these to show, by
 *  rules the model cannot see (what the learner has already demonstrated, what they have
 *  already looked up, how long the block is) — so over-naming here is cheap and under-naming
 *  is not recoverable. What it must not do is name ordinary words, which is the one instruction
 *  that keeps the annotation layer from becoming noise.
 *
 *  Written without a single subject-matter example on purpose. "Terms like myocardial or
 *  hypertension" would quietly teach the model that this feature is about medicine, and the
 *  same prompt has to work for a statute, a stress-strain curve and a verb paradigm. */
const TERMS_RULE =
  '"terms" names the vocabulary THIS block introduces that a learner at this level probably has not met yet: ' +
  'each entry is {"term":"…","conceptId":"k1"}. Name at most 3 per block, fewest first, and leave the list empty ' +
  "when the block introduces no new vocabulary — most blocks should. Each term MUST appear in that block's content " +
  "spelled exactly as you write it here. Name a term only if a learner who did not know it would be unable to follow " +
  "the sentence containing it. Do not name ordinary words, words the document has already introduced, or words that " +
  "are merely long.";

/**
 * What "simpler" asks for. Named here rather than only inside `SELECTION_INTENT` because it is
 * also half of `SIMPLIFY_RULE`, and two copies of an instruction are two instructions the moment
 * one is edited.
 */
const SELECTION_INTENT_SIMPLER =
  "Rewrite the passage below so it is easier to follow, keeping every technical term that the learner needs " +
  "and every claim the original made. Same meaning, plainer construction. Do not add new information and do not remove content.";

/** The contract every selection answer follows, identical on every selection. */
const SELECTION_ANSWER_RULE =
  "If the attached material defines this itself, prefer that meaning and set \"fromSource\" to the source title. " +
  "If it does not, answer from established knowledge and leave \"fromSource\" empty — never imply the learner's " +
  "own material said something it did not.\n\n" +
  'Return JSON: {"answer":"…","fromSource":"…"}';

/** "Simpler" — the one selection action that edits the page. Identical on every use. */
const SIMPLIFY_RULE =
  `${SELECTION_INTENT_SIMPLER}\n\n` +
  "You are rewriting one passage and nothing else. Do not write a heading. Do not add a second paragraph. " +
  "Do not comment on the change.\n\n" +
  'Return JSON: {"content":"…"}';

/** Answering a question about one block. Identical on every use. */
const EXPLAIN_BLOCK_RULE =
  "Answer in at most three sentences, plainly. Return JSON: {\"answer\":\"…\"}";

/**
 * The shapes a lesson may ask for.
 *
 * 🔴 THIS LIST IS THE ONLY THING THAT MAKES A RENDERER REACHABLE, AND FOR MONTHS IT NAMED THREE OF
 * NINE. Chemistry, tables, timelines, constructions, vectors and code traces were all built, routed,
 * verified and tested — and no lesson could produce one, because nothing ever told the model they
 * existed. A capability nobody is told about is indistinguishable from one that was never built.
 *
 * 🔴 SHAPES, NEVER SUBJECTS, WHICH IS WHY THERE ARE NINE AND NOT TWENTY. A table serves accounting,
 * finance and statistics; a constructed figure serves geometry and half of physics; a timeline serves
 * history, geology and any process with an order. Naming subjects here would teach the Canvas a
 * discipline, which §41 forbids and which would break the day a law student needed a timeline.
 *
 * 🔴 STATED NUMBERS ARE RECOMPUTED BEFORE ANYTHING IS DRAWN, AND THE MODEL IS TOLD SO. A total that
 * does not sum, an angle the coordinates disagree with, or forces that do not cancel produce NO
 * PICTURE rather than a wrong one. Saying that here is not a threat — it is the information that
 * makes the difference between a model asserting a total and a model computing one.
 *
 * 🔴 AND IT STAYS A SEMANTIC REQUEST. Nothing in this vocabulary accepts geometry, markup, colour,
 * layout or code that runs. `structure` takes a canonical SMILES string and a depiction library draws
 * it; `equation` takes LaTeX and KaTeX draws it. The model says WHAT, never HOW.
 */
const VISUAL_RULE =
  '"visual" is optional and is a SEMANTIC REQUEST, never rendering code. Use it only when a visual makes a relationship materially easier to understand than the prose. ' +
  'Allowed shapes are: {"kind":"equation","latex":"…"}; ' +
  '{"kind":"relationship","nodes":[{"id":"n1","label":"…"}],"edges":[{"from":"n1","to":"n2","label":"…","polarity":"increases"|"decreases"}]} — use polarity when one thing drives or blocks another; ' +
  '{"kind":"quantitative","xLabel":"…","yLabel":"…","series":[{"label":"…","points":[{"x":0,"y":1}]}]}; ' +
  '{"kind":"structure","notation":"smiles"|"reaction-smiles","value":"CC(=O)Oc1ccccc1C(=O)O","highlight":[0,1],"carbons":"skeletal"|"all","conditions":"…"} — a molecule or a reaction, given ONLY as canonical notation; never coordinates, never a drawing; ' +
  '{"kind":"table","columns":[{"key":"c1","label":"…","numeric":true}],"rows":[{"cells":{"c1":100}}],"totals":[{"column":"c1","value":100}],"balance":{"left":"c1","right":"c2"},"hidden":{"column":"c1","row":0}}; ' +
  '{"kind":"timeline","unit":"years","events":[{"at":-49,"atLabel":"49 BCE","label":"…","until":-44,"lane":"…","uncertain":true}],"hidden":0} — "at" is a plain number on any scale you choose and "atLabel" is what a human reads, so eras, geological time and seconds all work without a date format; ' +
  '{"kind":"construction","points":[{"id":"A","x":0,"y":0,"label":"A"}],"segments":[{"from":"A","to":"B","label":"4"}],"circles":[{"centre":"A","through":"B"}],"angles":[{"at":"A","from":"B","to":"C","degrees":90}]}; ' +
  '{"kind":"vectors","bodyLabel":"…","axesDegrees":30,"vectors":[{"label":"Weight","magnitude":98,"degrees":270,"unit":"N"}],"equilibrium":true}; ' +
  'or {"kind":"code","language":"python","source":"…","trace":[{"line":1,"note":"…","variables":[{"name":"total","value":"0"}]}]}. ' +
  'Every shape also takes "learningGoal" and "caption". ' +
  "A stated total, balance, angle or equilibrium is RECOMPUTED from the data you supply, and a claim that does not hold produces no visual at all — so state one only when you have worked it out. " +
  '"hidden" covers one cell or one event so the learner has something to retrieve rather than only read; use it when the visual is being taught rather than merely shown. ' +
  "A code trace is your account of what the code would do — nothing here executes it, and the learner is told so on screen. " +
  "Leave it absent when text is clearer. Never emit HTML, SVG, Mermaid, JavaScript, React, renderer names, styling, or arbitrary code. " +
  "The prose must still explain the idea; the visual is a representation of it, not a replacement for teaching.";

const BLOCK_SHAPE =
  'A block is {"type":"heading"|"paragraph"|"concept"|"example"|"callout","content":"…","conceptIds":["k1"],"sourceRefs":[…],"terms":[…],"visual":{…}}. ' +
  `Do not include an id — ids are assigned by the application.\n\n${TERMS_RULE}\n\n${VISUAL_RULE}`;

/**
 * The system message for one canvas job: the identity, then this job's INVARIANT rules.
 *
 * 🔴🔴 THIS IS A CACHE DECISION AND IT IS WORTH SAYING WHY IT IS SAFE. Every provider Nemesis routes
 * to prices a request by its LONGEST COMMON PREFIX with a recent one — DeepSeek's cache-hit input
 * rate is `0.0028` against `0.14` per million, fifty times cheaper, and `llm-cost.ts` already bills
 * the two shares separately. What decides how much of a turn qualifies is how much STABLE text sits
 * ahead of the first volatile character.
 *
 * Before this, every canvas prompt put a single ~600-character identity in the system message and
 * then opened the user message with the most volatile sentence in the whole request — the learner's
 * name for their canvas, the objective they are on, the words they just typed. Everything after
 * that was uncacheable, including roughly 2,500 characters of block shape, term rules, visual rules
 * and citation rules that are BYTE-IDENTICAL on every single turn of that job.
 *
 * 🔴 NOTHING IS REWORDED TO ACHIEVE THIS, AND NOTHING VOLATILE IS FROZEN. The strings moved are the
 * same strings, in the same order, saying the same thing to the same model; only the role they
 * arrive in changed. The owner's constraint — *"do not contort prompts in ways that reduce teaching
 * quality merely to achieve cache hits"* — is met by that being the whole of the change. Anything
 * that varies per turn (a scope list of block ids, an objective id inside a JSON schema, the
 * learner's level) stays exactly where it was, in the user message, because freezing it would be a
 * teaching change wearing a cost justification.
 *
 * 🔴 AND `CANVAS_SYSTEM` STAYS FIRST FOR EVERY JOB, so the shared identity is a common prefix
 * ACROSS jobs and not merely within one. A learner who reads a block, asks for it simpler, then
 * answers a question shares that much of three different prompts.
 */
function canvasSystem(...invariant: readonly string[]): WireMsg {
  return { content: [CANVAS_SYSTEM, ...invariant.filter(Boolean)].join("\n\n"), role: "system" };
}

function materialSection(sources: readonly CanvasSource[], topic: string): string {
  const grounding = groundingBlock(sources);
  if (grounding) return `MATERIAL (cite these excerpt ids):\n\n${grounding}`;
  // Topic-first learning (§6B). No material means no citations are possible, and saying so
  // is what stops the model producing citation-shaped decoration.
  return `There is no attached material. The learner asked to be taught: "${topic}". Write from established knowledge in the field and leave every sourceRefs list empty.`;
}

/**
 * The material for ONE TURN, rather than the whole lecture.
 *
 * 🔴🔴 THE DIFFERENCE BETWEEN THIS AND `materialSection` IS THE DIFFERENCE BETWEEN A COST THAT
 * SCALES WITH THE DOCUMENT AND ONE THAT SCALES WITH THE QUESTION. `groundingBlock` will send up to
 * 120,000 characters — about thirty thousand tokens — and it was being sent on every correction,
 * every "explain this", every "put it more simply", for the whole life of a canvas. Correcting one
 * wrong answer about one objective does not need the other forty pages.
 *
 * 🔴 THREE BUILDERS STILL CALL `materialSection` AND MUST KEEP DOING SO: the lesson, the knowledge
 * territory and the causal extraction each read the WHOLE document once, to produce something
 * durable that every later turn retrieves instead of regenerating. That is the shape the owner
 * asked for — *"cache what is stable, retrieve instead of regenerate"* — and narrowing those three
 * would not save money, it would make the durable thing wrong.
 *
 * 🔴 AND THE OMISSION IS STATED, EXACTLY AS `groundingBlock` STATES ITS OWN. A model told to cite
 * the material, holding a subset of it, and not told that it is a subset, is a model set up to
 * invent a citation for the part it cannot see.
 */
function focusedMaterialSection(
  sources: readonly CanvasSource[],
  topic: string,
  query: FocusQuery,
): string {
  if (sources.length === 0) return materialSection(sources, topic);
  const focused = focusMaterial(sources, query);
  const narrowed = focused.sources.map((entry) => ({ ...entry.source, excerpts: [...entry.excerpts] }));
  const grounding = groundingBlock(narrowed);
  if (!grounding) return materialSection(sources, topic);
  return (
    `MATERIAL (cite these excerpt ids):\n\n${grounding}` +
    (focused.omitted > 0
      ? `\n\n(This is the part of the material that relates to what you are being asked to do. ` +
        `${focused.omitted} further excerpt${focused.omitted === 1 ? "" : "s"} of the learner's material ` +
        `${focused.omitted === 1 ? "was" : "were"} not included. Do not cite an id you cannot see, and do not ` +
        `claim to have covered material you were not shown.)`
      : "")
  );
}

// -------------------------------------------------------------------- lesson

export function lessonMessages(input: {
  topic: string;
  /**
   * 🔴 NULLABLE, AND NULL IS THE NORMAL CASE NOW. Nemesis no longer asks a learner to classify
   * themselves before it has taught them anything, so most canvases have no level at all — and
   * absent must be read as UNKNOWN, never filled in with a middle value. It used to default to
   * `basics_known` one layer up, which meant every learner who was never asked was silently told
   * to the model as "knows the basics": an invented claim about a person, applied to everyone.
   *
   * It stays on the type because a level a learner actually expressed is real information. What is
   * gone is the requirement to have one, and the pretence of having one when we do not. The three
   * other prompt builders in this file already worked this way; the lesson prompt now matches.
   */
  level: CanvasLevel | null;
  sources: readonly CanvasSource[];
}): WireMsg[] {
  return [
    canvasSystem(BLOCK_SHAPE, CITATION_RULE),
    {
      content:
        `Write a study document that teaches ${input.topic ? `"${input.topic}"` : "the attached material"}.\n\n` +
        (input.level
          ? `${LEVEL_INSTRUCTIONS[input.level]}\n\n`
          : "You have not been told how much this learner already knows, and you must not guess a " +
            "level from the subject. Teach what the material actually says, define a term the first " +
            "time it is used, and do not pad with background nobody asked for. What they know will " +
            "be established by what they demonstrate, not by an assumption made before they " +
            "answered anything.\n\n") +
        "First decide the 5-12 CONCEPTS this material actually turns on — the ideas a learner must hold to understand it. " +
        'Give each an id ("k1", "k2", …) and a short plain label naming the idea, not the section.\n\n' +
        "Then write 8-25 blocks. Open with a heading, then the single idea everything else depends on, then the substance, " +
        "then why it matters. Each block covers one thing. Use conceptIds to say which concepts a block teaches; every " +
        "concept you declare must be taught by at least one block.\n\n" +
        'Return JSON: {"title":"…","concepts":[{"id":"k1","label":"…"}],"blocks":[…]}\n\n' +
        materialSection(input.sources, input.topic),
      role: "user",
    },
  ];
}

// ------------------------------------------------------- selection commands

/** A command the learner typed, optionally aimed at blocks they highlighted.
 *
 *  🔴 The scoping matters more than it looks. Given a free choice the model rewrites the whole
 *  page every time, which fails §20 and §21 both. So a scoped command is told the exact ids it
 *  may name, and the validator refuses anything else even if the model ignores this. */
export function commandMessages(input: {
  command: string;
  canvasTitle: string;
  blocks: readonly CanvasBlock[];
  selected: readonly CanvasBlock[];
  concepts: readonly CanvasConcept[];
  sources: readonly CanvasSource[];
  level: CanvasLevel | null;
}): WireMsg[] {
  const scoped = input.selected.length > 0;
  const outline = input.blocks
    .map((block) => `${block.id} [${block.type}] ${block.content.slice(0, 160)}`)
    .join("\n");
  const selection = input.selected
    .map((block) => `${block.id} [${block.type}] ${block.content}`)
    .join("\n\n");

  // 🔴 AN EMPTY CANVAS IS ITS OWN CASE NOW, AND §24 IS THE REASON. Opening a document no longer
  // writes anything to read, so a learner who asks for something to read is asking for the FIRST
  // blocks rather than an edit to existing ones — and every other operation names a block that does
  // not exist. This is the path "Summarize this" travels, which §24 keeps explicitly.
  const empty = !scoped && input.blocks.length === 0;

  const allowed = scoped
    ? `You may ONLY change these blocks: ${input.selected.map((block) => block.id).join(", ")}. ` +
      "Permitted operations: replace_block, insert_before, insert_after, delete_block, annotate_block, collapse_block. " +
      "You may insert new blocks next to the selected ones. Any operation naming another block will be discarded."
    : empty
      ? "This canvas has no content yet, so write what they asked for as a new page. " +
        'Permitted operation: replace_canvas ({"operation":"replace_canvas","blocks":[…]}). ' +
        "Write only what was asked for, at the length it deserves, and nothing else."
      : "Permitted operations: replace_block, insert_before, insert_after, delete_block, annotate_block, collapse_block. " +
        "Change as little as possible — edit the blocks the request is about and leave the rest alone.";

  return [
    canvasSystem(BLOCK_SHAPE, CITATION_RULE),
    {
      content:
        `The learner is reading "${input.canvasTitle}"${input.level ? ` at the "${input.level}" level` : ""} and said:\n\n"${input.command}"\n\n` +
        (scoped ? `They have highlighted this:\n\n${selection}\n\n` : "") +
        (empty ? "" : `Document outline (id, type, opening):\n${outline}\n\n`) +
        `Concepts: ${input.concepts.map((c) => `${c.id}=${c.label}`).join(", ") || "none"}\n\n` +
        // 🔴 `allowed` STAYS IN THE USER MESSAGE. It names the block ids this turn may touch, which
        // is the most volatile string in the request and the one thing that must never be frozen
        // into a shared prefix: a scope from the previous turn is a licence to rewrite the wrong
        // paragraph.
        `${allowed}\n\n` +
        (empty
          ? 'Return JSON: {"operations":[{"operation":"replace_canvas","blocks":[{"type":"heading","content":"…","sourceRefs":[…]}]}]}\n\n'
          : 'Return JSON: {"operations":[{"operation":"replace_block","blockId":"…","content":"…","conceptIds":[…],"sourceRefs":[…]}]}\n' +
            'Use annotate_block ({"operation":"annotate_block","blockId":"…","note":"…"}) when the learner wants a clarification ' +
            "beside the text rather than a rewrite of it.\n\n") +
        // 🔴 AN EMPTY CANVAS IS A LESSON BUILD AND KEEPS THE WHOLE DOCUMENT. Everything else is an
        // EDIT — "add a section on X", "make this shorter" — and an edit is about the part of the
        // material the request and the selection are about. Getting this backwards would either
        // build a first page from a tenth of the lecture or ship the lecture on every keystroke.
        (empty
          ? materialSection(input.sources, input.canvasTitle)
          : focusedMaterialSection(input.sources, input.canvasTitle, {
              scope: input.selected,
              texts: [input.command, ...input.selected.map((block) => block.content)],
            })),
      role: "user",
    },
  ];
}

// -------------------------------------------------------------------- recall

export function recallMessages(input: {
  canvasTitle: string;
  blocks: readonly CanvasBlock[];
  concepts: readonly CanvasConcept[];
  count: number;
}): WireMsg[] {
  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `Write ${input.count} retrieval prompts from the study document below, on "${input.canvasTitle}".\n\n` +
        "These are flashcards, not exam questions. Keep them SHORT. The front asks one specific thing; the back is the " +
        "answer in a few words, then at most one sentence of why. Do not write a miniature lesson on the back.\n\n" +
        "Cover the concepts evenly — one card per concept before any concept gets a second. Each card names the concept " +
        "it tests, and carries the sourceRefs of the block it came from.\n\n" +
        'Return JSON: {"cards":[{"front":"…","back":"…","conceptId":"k1","sourceRefs":[…]}]}\n\n' +
        `Concepts: ${input.concepts.map((c) => `${c.id}=${c.label}`).join(", ")}\n\n` +
        `Document:\n${documentText(input.blocks)}`,
      role: "user",
    },
  ];
}

// ------------------------------------------------------------------ territory

/**
 * A topic, turned into the knowledge Nemesis can teach from.
 *
 * 🔴 THIS ASKS FOR KNOWLEDGE, NOT FOR A LESSON, AND THAT IS THE ENTIRE POINT. Typing a topic used to
 * produce a mini-textbook the policy could not own, so the learner got 64 paragraphs and nothing to
 * do. Asking a model to write prose and then extracting facts back out of that prose would launder
 * generated text into something that looks like source material, which §M forbids outright.
 *
 * 🔴 FIELD-AGNOSTIC BY CONSTRUCTION, AND CHECKED AGAINST THE HOUSE TEST: would this work for a law
 * student and a mechanical engineering student? There is not one subject-matter example in the
 * prompt. Naming drugs here would quietly teach the model that Nemesis is a pharmacy product, and
 * the same instruction has to serve case-and-holding, part-and-tolerance, and verb-and-conjugation.
 * The roles are asked for in the subject's own vocabulary rather than chosen from a fixed list.
 */
export function territoryMessages(input: {
  topic: string;
  count: number;
  /**
   * The learner's own material, when they attached any.
   *
   * 🔴 THE SAME CONSTRUCTOR FOR BOTH WAYS IN, WHICH IS §18 EXECUTED RATHER THAN RESTATED. A typed
   * topic and an uploaded lecture converge on ONE runtime: the only difference is whether there is
   * material to read the pairs OUT of, or only the subject to draw them from. A second, nearly
   * identical prompt for documents is how the two would drift apart into two products.
   *
   * 🔴 AND IT IS STILL NOT A LESSON. The instruction below is the same one that stops the topic
   * lane writing prose. Reading knowledge out of the learner's document is the opposite of writing
   * a document about it, and §24 turns on that distinction: ingestion is not summarization.
   */
  sources?: readonly CanvasSource[];
}): WireMsg[] {
  const grounded = (input.sources?.length ?? 0) > 0;
  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        (grounded
          ? "Read the material below and name the specific, checkable facts IT teaches, as PAIRS. " +
            "Take only what the material actually states. Do not add facts from your own knowledge of the " +
            "subject, however certain you are of them: this is a reading of one learner's own document, and " +
            "a fact it does not contain would be asked of them as though their lecture had said it.\n\n"
          : `Someone wants to learn: "${input.topic}".\n\n` +
            "Name the specific, checkable facts that topic turns on, as PAIRS. ") +
        "Do not write a lesson, an introduction, an explanation, or any prose. Return only the pairs.\n\n" +
        "Each pair is two things standing in a stated relationship, where someone who knows the subject " +
        "could be shown one side and asked to produce the other. Say what each side IS, using the words " +
        "that subject uses for them, and say how the two are related.\n\n" +
        (grounded
          ? '"excerptId" MUST be the id of the excerpt the pair was read from, exactly as it is bracketed in ' +
            "the material below. Use only ids that appear there. If you cannot point at the excerpt a pair " +
            "came from, leave the pair out.\n\n" +
            'Return JSON: {"pairs":[{"left":"…","leftRole":"…","right":"…","rightRole":"…","relationKind":"…","excerptId":"…"}]}\n\n'
          : 'Return JSON: {"pairs":[{"left":"…","leftRole":"…","right":"…","rightRole":"…","relationKind":"…"}]}\n\n') +
        `Aim for about ${input.count}, but fewer is better than padded. ` +
        "OMIT ANYTHING YOU ARE NOT SURE OF. A short list you are confident in is worth more than a long " +
        "one containing guesses: everything here becomes a question a real learner is asked and graded on, " +
        "so an invented pair is recorded as that person's own gap. Leave it out instead.\n\n" +
        "Omit anything that is not a pair, such as narrative, history, or advice that cannot be checked. " +
        (grounded
          ? "Ignore anything that is about the course rather than the subject, such as room numbers, dates, " +
            "office hours, grading bands and links. "
          : "Do not restate the topic itself as a fact. ") +
        "Keep each side to a term or a short phrase, never a sentence." +
        (grounded ? `\n\n${materialSection(input.sources ?? [], input.topic)}` : ""),
      role: "user",
    },
  ];
}

// -------------------------------------------------------------------- causal

/**
 * Ask a model to read the MECHANISMS out of the learner's material.
 *
 * 🔴 THE INSTRUCTION IS THE CONTRACT'S, NOT A SECOND ONE WRITTEN HERE. `CAUSAL_EXTRACTION_PROMPT`
 * already states every rule — the seven relations, negation and modality as independent fields, the
 * verbatim quote, and the long list of things to abstain on — and it is the text the validator was
 * built against and tested with. Paraphrasing it into a prompt builder would create a second,
 * drifting statement of the same rules, and the validator would go on enforcing the first one.
 *
 * 🔴 WHAT THIS ADDS IS GROUNDING, WHICH IS THE ONE THING THE CONTRACT CANNOT KNOW. The contract
 * describes reading ONE passage. Here there are many, so every edge has to say which excerpt it came
 * from — the same requirement, in the same words, that `territoryMessages` puts on a pair. Without
 * it `parseCausalTerritory` cannot check the quote against the right passage, and the fabrication
 * guard degrades into "this sentence appears SOMEWHERE in the document".
 */
export function causalMessages(input: { sources: readonly CanvasSource[]; topic: string }): WireMsg[] {
  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `${CAUSAL_EXTRACTION_PROMPT}\n\n${SEMANTIC_EXTRACTION_PROMPT}\n\n` +
        "The material below is split into excerpts, each with a bracketed id. Read every excerpt.\n\n" +
        '"excerptId" MUST be the id of the excerpt the relationship was read from, exactly as it is ' +
        "bracketed below, and \"quote\" must be copied from THAT excerpt character for character. Use only " +
        "ids that appear below. If you cannot point at the excerpt a relationship came from, leave it out.\n\n" +
        // 🔴 THE SAME KEY THE CONTRACT'S OWN LAST LINE ASKS FOR. It ends with `{"relations": [...]}`,
        // and a second, different envelope named here would be a prompt contradicting itself in one
        // message — the model picks one, and whichever it picks the parser reads the other.
        'Every causal relation additionally carries "excerptId". Respond with JSON only using this combined envelope:\n' +
        '{"relations":[{"cause":"…","effect":"…","relation":"…","negated":false,"qualifier":null,' +
        '"qualifierKind":null,"verb":"…","quote":"…","excerptId":"…"}],' +
        '"structures":[{"relationshipType":"…","family":"…","roles":[{"role":"…","text":"…","order":1}],' +
        '"qualifiers":[{"kind":"…","value":"…"}],"evidence":[{"excerptId":"…","assertion":"…"}]}]}\n\n' +
        "Return an empty list rather than a weak one. Everything kept becomes a question a real learner is " +
        "asked and graded on, so a relationship the material does not assert is recorded as that person's " +
        "own gap.\n\n" +
        materialSection(input.sources, input.topic),
      role: "user",
    },
  ];
}

// ---------------------------------------------------------------------- test

/** The free-response formats, described by what they ask the learner to DO.
 *
 *  🔴 Structural, never subject-matter. Every line below has to read sensibly for a nursing
 *  student, a first-year law student and someone learning to weld — that is the test, and it is
 *  why there is no format here for naming a thing from a list of things. */
const FREE_KIND_RULES =
  '- "define": ask what a term means, in the learner\'s own words.\n' +
  '- "explain": ask WHY something is the case, not whether it is.\n' +
  '- "mechanism": ask them to walk through how something happens, step by step, in order.\n' +
  '- "compare": ask how two things differ, and require both sides.\n' +
  '- "apply": give a short concrete situation and ask what follows and why.\n' +
  '- "recall": ask them to reproduce something from memory without prompting.';

export function testMessages(input: {
  canvasTitle: string;
  blocks: readonly CanvasBlock[];
  concepts: readonly CanvasConcept[];
  count: number;
  /** Free response unless something specifically needs recognition (§18). */
  format: RetrievalFormat;
  /** When set, the test is the retest and covers only these concepts. */
  onlyConceptIds?: readonly string[];
}): WireMsg[] {
  const focus = input.onlyConceptIds?.length
    ? input.concepts.filter((concept) => input.onlyConceptIds?.includes(concept.id))
    : input.concepts;

  const scope = input.onlyConceptIds?.length
    ? "This is a RETEST. Ask only about the concepts listed below — the ones the learner got wrong. Do not test anything else.\n\n"
    : "Spread the questions across the concepts below.\n\n";
  const conceptList = `Concepts to test: ${focus.map((c) => `${c.id}=${c.label}`).join(", ")}\n\n`;

  if (input.format === "free") {
    return [
      { content: CANVAS_SYSTEM, role: "system" },
      {
        content:
          `Write ${input.count} retrieval prompts on "${input.canvasTitle}" that the learner answers IN THEIR OWN WORDS.\n\n` +
          "These are not multiple choice and must not be answerable with yes/no or a single word. Each one asks the " +
          "learner to say something back: an explanation, a comparison, a sequence, or an application. Ask about one " +
          "thing at a time — a prompt with three questions in it produces an answer that cannot be judged.\n\n" +
          `Choose a kind for each prompt:\n${FREE_KIND_RULES}\n\n` +
          `${scope}${conceptList}` +
          'Return JSON: {"questions":[{"kind":"explain","q":"…","expected":["…","…"],"why":"…","conceptId":"k1","sourceRefs":[…]}]}\n\n' +
          "`expected` is the list of points a complete answer has to make — 2 to 4 short, checkable statements, each " +
          "one thing. These are what a judge will check the learner's answer against, so write them as claims, not as " +
          "topics: \"says the pressure drops before the valve opens\", not \"pressure\". `why` is the full model answer, " +
          "shown only after they have committed to their own. `conceptId` MUST be one of the ids above.\n\n" +
          `Document:\n${documentText(input.blocks)}`,
        role: "user",
      },
    ];
  }

  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `Write a practice test of ${input.count} multiple-choice questions on "${input.canvasTitle}".\n\n` +
        // Shared with the Study tab's generator and the chat test-craft skill, so improving
        // the craft improves all three at once (see item-writing.ts).
        `Follow these rules:\n${EXAM_ITEM_RULES}\n\n` +
        `${scope}${conceptList}` +
        'Return JSON: {"questions":[{"q":"…","options":["…","…","…","…"],"answer":<index>,"why":"…","conceptId":"k1","sourceRefs":[…]}]} — ' +
        "4 options each, answer is the 0-based index of the correct option, why explains what makes the wrong options wrong, " +
        "and conceptId MUST be one of the ids above. A question with no concept is useless here.\n\n" +
        `Document:\n${documentText(input.blocks)}`,
      role: "user",
    },
  ];
}

// ------------------------------------------------------------------- judging

/** Everything one evaluation needs, in the shape the whole product can use.
 *
 *  🔴 DELIBERATELY NOT front/back. A flashcard is one narrow case of "here is a task, here is
 *  what a good performance contains" — an existing card converts by putting its back into
 *  `referenceAnswer` and nothing else changes. Shaping the evaluator around cards instead would
 *  have made every later caller — a derivation with required steps, a comparison needing both
 *  sides, a spoken answer in a second language, a diagram reconstructed from memory — either
 *  pretend to be a card or need a second evaluator. */
export interface EvaluationInput {
  prompt: string;
  task: RetrievalTask;
  objective: { conceptId: string | null; label: string };
  expectedEvidence: ExpectedEvidence;
  response: LearnerResponse;
  concepts: readonly CanvasConcept[];
  context?: {
    sourceRefs?: readonly SourceRef[];
    hintsUsed?: number;
    priorAttempts?: number;
  };
}

/** What each task is actually asking the learner to do, told to the judge so it checks the right
 *  thing: a "solve" answer is judged on the working, a "name" answer on the term produced. */
const TASK_INTENT: Record<RetrievalTask, string> = {
  name: "produce the correct term",
  define: "give the meaning in their own words",
  explain: "say why something is the case",
  mechanism: "walk through how something happens, in order",
  reconstruct: "rebuild the structure from memory",
  compare: "set two things against each other, covering both",
  locate: "identify the named part hidden at a specific place in the supplied figure",
  predict: "say what follows, and why",
  apply: "use the idea on a concrete situation",
  solve: "work it through and show the reasoning",
};

/**
 * What a `written` response IS, and the four things a judge must never do with one.
 *
 * 🔴 IT REPLACED A BLANKET "MAY CONTAIN OCR ERRORS, JUDGE THE INTENDED REASONING". That sentence
 * was right when handwriting arrived as one flat transcription that nobody had checked, and it is
 * wrong now for two reasons at once. Written work only reaches this judge after
 * `writtenSubmissionGate` (written-response.ts) has either found the reading confident throughout
 * or made the learner read it back and fix it, so an uncertain transcription cannot get here any
 * more. And told to forgive transcription artifacts, a judge reads a genuine slipped digit as a
 * misread character and returns `understood` — which erases exactly the distinction between a
 * careless error and a correct answer that this whole path exists to make.
 *
 * 🔴 THE UNREAD-PARTS RULE IS THE ONE THAT PROTECTS THE LEARNER. A page we could only partly read
 * looks, to anything reading the rendering, exactly like a page with steps missing. Without this
 * instruction the honest verdict on our own reading failure is `partial`, and that lands in
 * `learner_evidence` as a durable claim that someone does not fully understand something they
 * demonstrated completely in ink.
 *
 * 🔴 FIELD-AGNOSTIC. Nothing here mentions a subject, a notation or a kind of problem. "Steps in
 * order, a retraction, a conclusion, a gap in our reading" describe a chemistry mechanism, a
 * free-body diagram, a statutory argument and a wiring fault trace equally.
 */
const WRITTEN_WORK_GUIDANCE =
  // 🔴 THE SECTION NAMES BELOW ARE THE RENDERER'S OWN LABELS, VERBATIM. They are neutral rather
  // than third-person because the same text is shown back to the learner as their own words, and a
  // heading written for a judge reads as Nemesis narrating them to themselves. See
  // `written-response.ts`, which owns them and is pinned against this prompt by its own tests.
  "This is a page of work they did by hand, written out for you rather than typed. Read it as follows.\n" +
  "- Under \"Working, in order:\" the numbered lines are their working in the order they wrote it. The order is "
  + "evidence: a right method with a slip in it and a wrong method are the same lines in a different sequence.\n" +
  "- A line marked [crossed out] is one THEY rejected. It shows how they reasoned and it is NOT something they "
  + "are claiming. Never judge them on it.\n" +
  "- \"Final answer as marked:\" is quoted separately when the page marked one, and \"No final answer marked\" "
  + "means the page stopped short. Judge the working and the final answer as two things: working that does not "
  + "support a correct final answer, and correct working with a slip at the end, are different and need "
  + "opposite teaching.\n" +
  "- \"Not read by Nemesis\" is OUR failure to read their page, never their omission and never their error. "
  + "Judge only what is there. If what could be read is not enough to settle the question, say so with a low "
  + "confidence rather than marking them down for the part we could not see.\n" +
  "If the page says the reading was read back and confirmed by the writer, the text is exactly what they wrote, "
  + "so a mistake in it is theirs. If it does not say so, the reading was confident. Either way, do not excuse "
  + "an error as a misreading.\n"
  // 🔴 NAMED AGAINST THE EXISTING `ErrorType` VOCABULARY RATHER THAN A NEW ONE. Working reveals
  // failures a sentence cannot: the method can be right and the execution wrong, a step can rest on
  // something never established, the page can simply stop. Those want a cue and another go, a
  // prerequisite taught first, and more time respectively — opposite teaching from the same
  // `incorrect`. The mapping is stated because a judge given only a six-word list reaches for
  // `conceptual` for everything that is not obviously a forgotten term.
  + "Say which kind of failure it was in errorType: a right method executed wrongly is `careless`, a wrong "
  + "method is `procedural`, a step that rests on something they never established is "
  + "`missing_prerequisite`, and a wrong idea underneath the working is `conceptual`. Working that simply "
  + "stops before the end is an incomplete performance, not a wrong one.\n\n";

/** Read one performance for what it MEANS (§21).
 *
 *  Two instructions here are load-bearing and easy to lose in a later edit:
 *
 *  1. **Judge meaning, not wording.** "It blocks the thing that makes vessels tighten" and the
 *     textbook sentence are the same answer. A judge that rewards vocabulary turns the canvas
 *     back into a recognition test wearing a text box.
 *  2. **Do not punish speech.** A spoken answer arrives with false starts, filler and repair
 *     ("it, uh, it goes up — no, down"). §7 wants speaking to be first-class precisely because it
 *     exposes the mental model; marking someone down for sounding like a person would defeat
 *     the point and quietly push everyone back to typing. */
export function evaluationMessages(input: EvaluationInput): WireMsg[] {
  const expected = input.expectedEvidence;
  const standard = [
    expected.acceptableClaims?.length
      ? `A complete performance makes these points:\n${expected.acceptableClaims.map((c) => `- ${c}`).join("\n")}`
      : "",
    expected.requiredSteps?.length
      ? `It has to include these steps, in order:\n${expected.requiredSteps.map((s) => `- ${s}`).join("\n")}`
      : "",
    expected.requiredConcepts?.length
      ? `It has to show a grasp of: ${expected.requiredConcepts.join(", ")}`
      : "",
    expected.commonMisconceptions?.length
      ? `Watch for these specific wrong beliefs:\n${expected.commonMisconceptions.map((m) => `- ${m}`).join("\n")}`
      : "",
    expected.referenceAnswer
      ? `A reference answer, for your judgement only — do NOT require its wording or its level of detail:\n${expected.referenceAnswer}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      content:
        // 🔴 THE JUDGE NEEDS THE EM DASH RULE TOO, AND IT IS THE ONE BUILDER THAT WOULD HAVE BEEN
        // MISSED: it is the only system prompt in this file that is not `CANVAS_SYSTEM`, and it
        // writes the FEEDBACK a learner reads — the exact surface the owner was looking at.
        "You are Nemesis, judging what a learner's own explanation shows about their understanding. " +
        "Your entire output is the JSON payload requested: no greeting, no commentary. " +
        "You are not marking an exam. You are working out what this person does and does not yet understand, " +
        "so the page can teach the right next thing. " +
        NO_EM_DASH,
      role: "system",
    },
    {
      content:
        `The task they were set (${TASK_INTENT[input.task]}):\n"${input.prompt}"\n\n` +
        (standard ? `${standard}\n\n` : "") +
        `It is about the concept "${input.objective.label}".\n\n` +
        `They ${input.response.via === "spoken" ? "said out loud" : input.response.via === "written" ? "wrote by hand" : "typed"}:\n"${input.response.text}"\n\n` +
        (input.response.via === "spoken"
          ? "This was dictated, so it arrives as speech: filler words, false starts, self-corrections and missing " +
            "punctuation are normal and mean nothing about their understanding. Judge what they were getting at. " +
            "Where they corrected themselves, judge the correction, not the first attempt.\n\n"
          : input.response.via === "written"
            ? WRITTEN_WORK_GUIDANCE
            : "") +
        ((input.context?.hintsUsed ?? 0) > 0
          ? `They used ${input.context?.hintsUsed} hint(s) before answering, so this is assisted rather than unaided recall.\n\n`
          : "") +
        "Judge MEANING, not vocabulary. If they express the right idea in everyday language, that is a correct " +
        "answer — do not require the term the material used. Do not reward a confident answer that says nothing.\n\n" +
        "Choose one verdict:\n" +
        '- "strong": everything expected is there, and expressed with room to spare — they could clearly go further.\n' +
        '- "understood": everything expected is there, in substance.\n' +
        '- "partial": going the right way, but something expected is missing or vague.\n' +
        '- "incorrect": does not get there, or is mostly off the point.\n' +
        '- "misconception": reveals a specific, nameable false belief — not merely a gap. Use this only when you can ' +
        "state the wrong belief in one sentence.\n" +
        // 🔴🔴 THE ONLY VERDICT THAT IS NOT A GRADE, AND THE REASON IT EXISTS. The composer is the
        // one input, so while a question is up EVERY sentence arrives here — including sentences
        // that were never aimed at it. "what is on the news today?" was graded `incorrect` with
        // confidence 0.95 and written to the learner's durable record as evidence they
        // misunderstood sulfur bonding; "what?" — someone saying they did not follow — twice more.
        // This is how the judge says "not mine to grade" instead of grading it anyway.
        //
        // 🔴 WORDED AROUND WHAT THE SENTENCE IS DOING, NOT AROUND ITS PUNCTUATION. "Ends with a
        // question mark" cannot separate "what is on the news today?" from "what is the structural
        // feature for alcohol?" — the same shape, opposite meanings — and a rule like that in front
        // of the model is exactly what was deleted in #689.
        //
        // 🔴 AND THE BAR IS DELIBERATELY HIGH. A wrong `not_an_attempt` silently discards a real
        // performance, which is worse than a harsh grade: the learner answered and nothing was
        // recorded. When it is arguable, grade it.
        '- "not_an_attempt": they were not trying to answer THIS question at all. A question of their own, an aside, ' +
        "a remark about how it is going, or a request to do something else. This is not a grade and nothing is " +
        "recorded: their words are answered as conversation and the question stays on screen. A confused, partial or " +
        "plainly wrong attempt at the question is NOT this — it is an attempt, and it gets one of the verdicts above. " +
        "If you can read it as an attempt at all, it is an attempt.\n\n" +
        `If the performance fell short, say WHY with errorType, one of: ${ERROR_TYPES.join(", ")}. ` +
        "This matters more than the verdict: a forgotten term and a backwards causal model both look wrong, and " +
        "they need opposite teaching.\n\n" +
        `Concepts on this page: ${input.concepts.map((c) => `${c.id}=${c.label}`).join(", ")}\n\n` +
        'Return JSON: {"verdict":"partial","confidence":0.7,"demonstrated":["…"],"missing":["…"],' +
        '"misconceptions":["…"],"errorType":"conceptual","feedback":"…","alsoWeakConceptIds":["k3"]}\n\n' +
        "`confidence` is 0 to 1: how much this performance actually settled. A short answer to a broad task can be " +
        "right and still tell you little — say so with a low number rather than a confident verdict. " +
        "`demonstrated` and `missing` are for the teaching engine, not for the learner to read. " +
        "`misconceptions` is a list, empty unless a specific false belief is visible. " +
        "`feedback` is the ONE thing the page shows them: at most two sentences, addressed to them as \"you\", " +
        "supplying exactly what was missing and nothing else. Do not restate their answer back to them, do not list " +
        "what they got right, and do not re-teach the topic. " +
        // 🔴 SAID OUT LOUD BECAUSE THE OBEDIENT ANSWER IS THE EMPTY ONE. "Supply exactly what was
        // missing" has no content when nothing was missing, so a well-behaved judge returns "" for a
        // correct answer — and the validator used to discard the whole evaluation over it, losing a
        // demonstration the learner had genuinely given. Both ends now agree that empty is RIGHT for
        // a pass, and the page prints its own confirmation.
        "If nothing was missing, leave `feedback` as an empty string — the page confirms a correct answer itself. " +
        "`alsoWeakConceptIds` is for OTHER concepts on the page this performance showed to be shaky; use ids from " +
        "the list above and no others, and leave it out if there are none.",
      role: "user",
    },
  ];
}

// ------------------------------------------------------------ teaching loop

/** How the page should change in response to one performance.
 *
 *  🔴 THE SCOPE IS THE FEATURE. The caller passes the ids of the blocks that teach this
 *  objective and `validateOps` refuses anything else, so a clarification cannot quietly become a
 *  page rewrite. That protection has to hold here more than anywhere: given a free hand the model
 *  reaches for `replace_canvas` on every turn, which would undo the two behaviours the canvas is
 *  actually judged on — fixing one paragraph fixes one paragraph, and the page is never
 *  regenerated wholesale.
 *
 *  🔴 AND IT MUST NOT RE-TEACH WHAT THEY ALREADY SHOWED. Someone who demonstrated A and B and
 *  missed C should not be handed A + B + C again. That is the difference between a canvas that
 *  adapts and a canvas that repeats itself more loudly. */
export function teachingMessages(input: {
  action: CognitiveAction;
  canvasTitle: string;
  objectiveLabel: string;
  objectiveId: string;
  /** What they were asked, and what they said — so the correction is about THEIR answer. */
  prompt: string;
  said: string;
  demonstrated: readonly string[];
  /** The blocks that currently teach this objective. The only ones that may change. */
  scope: readonly CanvasBlock[];
  sources: readonly CanvasSource[];
  level: CanvasLevel | null;
}): WireMsg[] {
  const scopeText = input.scope
    .map((block) => `${block.id} [${block.type}] ${block.content}`)
    .join("\n\n");

  const instruction = (() => {
    switch (input.action.type) {
      case "clarify_missing":
        return (
          `They already demonstrated: ${input.demonstrated.join("; ") || "part of this"}.\n` +
          `What was missing: ${input.action.missing.join("; ")}\n\n` +
          "Teach ONLY the missing piece. Do not restate what they already showed — they have it, and " +
          "repeating it back is how a page stops feeling adaptive. Write one short block that supplies the " +
          "gap and connects it to what they already had, and put it next to the block that covers this idea. " +
          "Then ask them to explain how the missing piece relates to the part they got right."
        );
      case "correct":
        return (
          `What went wrong: ${input.action.missing.join("; ")}\n\n` +
          "Write the smallest correction that fixes this specific thing — two or three sentences, not a " +
          "re-teach of the topic. Replace the block that misled them if there is one, otherwise insert the " +
          "correction beside it. Then ask them the same idea again, in a different way than it was asked " +
          "the first time."
        );
      case "repair_misconception":
        return (
          `They hold a specific false belief: ${input.action.misconceptions.join("; ")}\n\n` +
          "🔴 This is not a gap, it is a wrong model, so filling in more detail will not help — the belief " +
          "itself has to be replaced. Rewrite the block that teaches this idea so it names the false " +
          "relationship explicitly, says plainly that it does not hold, and puts the correct relationship " +
          "in its place. Be concrete about what causes what. Then ask them to reconstruct the corrected " +
          "relationship in their own words, because saying it back is what replaces the old model."
        );
      case "retry":
      default:
        return (
          "Their answer did not get there, and the reading is not precise enough to correct a specific point. " +
          "Re-teach this idea slightly more completely than the page does now — a different angle, or a " +
          "concrete example, rather than the same sentences again. Then ask for it once more."
        );
    }
  })();

  return [
    canvasSystem(BLOCK_SHAPE, CITATION_RULE),
    {
      content:
        `The learner is working on "${input.objectiveLabel}" in "${input.canvasTitle}".\n\n` +
        `They were asked:\n"${input.prompt}"\n\n` +
        `They answered:\n"${input.said}"\n\n` +
        `${instruction}\n\n` +
        (input.level ? `${LEVEL_INSTRUCTIONS[input.level]}\n\n` : "") +
        `You may ONLY change these blocks: ${input.scope.map((b) => b.id).join(", ") || "(none — insert only)"}. ` +
        "Permitted operations: replace_block, insert_before, insert_after, annotate_block. " +
        "Any operation naming another block, or attempting to rewrite the whole page, will be discarded.\n\n" +
        'Return JSON: {"operations":[…],"followUp":{"task":"explain","q":"…","expected":["…","…"],"why":"…","conceptId":"' +
        `${input.objectiveId}"}}\n\n` +
        "`followUp` is the next thing you ask them, and it must be answerable in their own words. `expected` " +
        "is 2-3 short checkable claims a complete answer makes — this is what the answer will be judged " +
        `against, so write claims and not topics. conceptId MUST be "${input.objectiveId}".\n\n` +
        `The blocks that currently teach this idea:\n${scopeText || "(none — the page has no block for it yet)"}\n\n` +
        // 🔴 THE MATERIAL FOR THIS OBJECTIVE, NOT FOR THE LECTURE. The scope blocks already declare
        // which excerpts they were built from, so the evidence that grounds this correction is
        // named by the page itself; the objective, the question and the learner's own answer add
        // the vocabulary. Sending the other forty pages would not make the correction better.
        focusedMaterialSection(input.sources, input.canvasTitle, {
          scope: input.scope,
          texts: [input.objectiveLabel, input.prompt, input.said, ...input.demonstrated],
        }),
      role: "user",
    },
  ];
}

// --------------------------------------------------------- targeted relearn

/** One thing that did not land, in enough detail for the rewrite to aim at it.
 *
 *  A free-response miss carries far more than a choice miss can: "they wrote X, and what was
 *  missing was Y" tells the rewrite what to say, where "they picked B" only tells it what to
 *  avoid. This is the payoff for asking people to explain rather than to recognise. */
export type RelearnMiss =
  | { kind: "choice"; question: string; picked: string; correct: string; why: string }
  | { kind: "free"; question: string; said: string; missing: string[]; misconception?: string };

function describeMiss(miss: RelearnMiss): string {
  if (miss.kind === "choice") {
    return `- Asked: ${miss.question}\n  They chose: ${miss.picked}\n  Correct: ${miss.correct}\n  Why: ${miss.why}`;
  }
  return (
    `- Asked: ${miss.question}\n  They answered: ${miss.said}\n` +
    (miss.missing.length ? `  What was missing: ${miss.missing.join("; ")}\n` : "") +
    (miss.misconception ? `  The belief behind it: ${miss.misconception}\n` : "")
  ).trimEnd();
}

/** §14's core hypothesis, as a prompt: 2,200 words becomes 400 because we only send the
 *  blocks that cover what went wrong, and say so out loud. */
export function relearnMessages(input: {
  canvasTitle: string;
  weak: readonly CanvasConcept[];
  relevantBlocks: readonly CanvasBlock[];
  sources: readonly CanvasSource[];
  level: CanvasLevel | null;
  /** What the learner actually got wrong, so the rewrite addresses the misunderstanding
   *  rather than repeating the original explanation more loudly. */
  misses: readonly RelearnMiss[];
}): WireMsg[] {
  return [
    canvasSystem(BLOCK_SHAPE, CITATION_RULE),
    {
      content:
        `The learner has been tested on "${input.canvasTitle}" and these ideas did not land:\n` +
        `${input.weak.map((c) => `- ${c.id}: ${c.label}`).join("\n")}\n\n` +
        (input.misses.length
          ? `What they actually got wrong:\n${input.misses.map(describeMiss).join("\n")}\n\n`
          : "") +
        "Rewrite the document so it teaches ONLY these ideas. This is a short, targeted correction — aim for a fifth of " +
        "the original length. Do not re-explain anything they already understood. Address the specific misunderstanding " +
        "each wrong answer reveals, rather than restating the original explanation.\n\n" +
        (input.level ? `${LEVEL_INSTRUCTIONS[input.level]}\n\n` : "") +
        'Return JSON: {"operations":[{"operation":"replace_canvas","blocks":[…]}]} — one replace_canvas holding the ' +
        "short focused document. Use only the concept ids listed above.\n\n" +
        `The parts of the original document that covered these ideas:\n${documentText(input.relevantBlocks)}\n\n` +
        // §14's hypothesis applied to the material as well as to the document: the relearn already
        // sends only the blocks that covered what went wrong, and those blocks name the excerpts
        // behind them.
        focusedMaterialSection(input.sources, input.canvasTitle, {
          scope: input.relevantBlocks,
          texts: [
            ...input.weak.map((concept) => concept.label),
            ...input.misses.map((miss) => (miss.kind === "choice" ? `${miss.question} ${miss.correct}` : `${miss.question} ${miss.said}`)),
          ],
        }),
      role: "user",
    },
  ];
}

// ------------------------------------------------------------ small helpers

/**
 * The canvas as plain text for prompts that read it rather than edit it.
 *
 * 🔴 EVERY BLOCK, BECAUSE NEITHER FLAG IS TRACEABLE TO LEARNER EVIDENCE. This used to read
 * `.filter((block) => !block.collapsed && !block.known)`, under the comment *"the learner has told
 * us those are not the work."* That sentence was doing a lot of work, and both halves of it were
 * wrong in different ways.
 *
 * 🔴 `collapsed` HAS TWO AUTHORS AND ONE OF THEM IS A MODEL. `collapse_block` is an operation the
 * model may use on any chat command (`canvas-ops.ts`, and the permitted-operations list above), so
 * a model-collapsed block and a learner-folded one are the SAME BOOLEAN and indistinguishable from
 * here. Filtering on it while claiming the learner said so attributed to a person a decision a model
 * may have made — the global invariant violated with no learner involved at all.
 *
 * And even when a learner does fold a block, folding is a READING-FLOW act: "get this out of my
 * way right now" is not "never ask me about this". Presentation state must not decide curriculum.
 * If a model's collapse should ever influence generation, that needs its own field naming its
 * author, never this one boolean.
 *
 * 🔴 `known` IS A SELF-REPORT WITH NO DEMONSTRATION BEHIND IT. It is set by an "I already know this"
 * control and nothing else — no judge, no evidence row. Because this text feeds recall and both
 * test-generation branches, and those cards are written through to `study_decks`/`study_cards`, one
 * click was permanently removing material from spaced repetition on the learner's own say-so. That
 * is durable curriculum suppression, and it is exactly what "every claim about the learner must be
 * traceable to learner evidence" forbids.
 *
 * Measured before changing it: **73 blocks across all live canvases, zero carrying either flag.**
 * So this is prevention rather than remediation — no learner's material changes today, and the
 * mechanism stops being available. Visibility driven by cognitive state rather than self-report is
 * the replacement, and it is Brain's to design.
 *
 * Folding still folds in the reading view. That belongs to the surface and is untouched here.
 */
export function documentText(blocks: readonly CanvasBlock[]): string {
  return blocks
    .map((block) => (block.type === "heading" ? `\n## ${block.content}` : block.content))
    .join("\n\n")
    .trim();
}

/** "Where did this come from?" and friends are answered from data we already hold, not by
 *  asking the model — which would let it invent a source. This is the one-block explainer. */
// ----------------------------------------------------------------- selection

/** What each selection action is actually asking for.
 *
 *  🔴 A definition must be SHORTER AND SIMPLER than the sentence that caused the confusion.
 *  "Homeostasis is the dynamic self-regulatory process by which biological systems maintain
 *  internal physicochemical equilibrium" replaces one hard sentence with another, and the
 *  learner is no further forward.
 *
 *  🔴 And it must not simplify the terminology away. If a term is part of what is being learned,
 *  the learner eventually needs the term itself, not a paraphrase of it — so the formal word is
 *  kept and glossed, never replaced. */
const SELECTION_INTENT: Record<string, string> = {
  define:
    "Say what this term means HERE, in this context, in one or two short sentences. " +
    "Use plainer words than the sentence it came from. Keep the technical term itself — the learner needs the word, " +
    "not a replacement for it — and explain it rather than swapping it out.",
  explain:
    "Explain what this means in this context, in at most three short sentences. " +
    "Explain the idea, not the wording. Assume they have read the surrounding passage.",
  simpler: SELECTION_INTENT_SIMPLER,
  example:
    "Give one concrete example that makes this clear, in at most three short sentences. " +
    "A specific case, not a restatement of the definition.",
  why: "Explain WHY this is so — the reason or mechanism behind it — in at most three short sentences.",
};

/** A definition, an explanation, an example or a reason, about an exact selected range. */
export function selectionMessages(input: {
  action: string;
  selectedText: string;
  /** The sentence it sits in. Without this a word gets a dictionary answer, and "power" means
   *  four different things depending on the field and the paragraph. */
  surroundingText: string;
  /** The wider block, where the selection came from one. */
  passage?: string;
  canvasTitle: string;
  objective?: string;
  sources: readonly CanvasSource[];
}): WireMsg[] {
  const intent = SELECTION_INTENT[input.action] ?? SELECTION_INTENT.explain;
  return [
    canvasSystem(SELECTION_ANSWER_RULE),
    {
      content:
        `The learner is studying "${input.canvasTitle}"` +
        (input.objective ? ` and is currently working on: ${input.objective}` : "") +
        ".\n\n" +
        `They highlighted this exact text: "${input.selectedText}"\n\n` +
        `It appears in this sentence: "${input.surroundingText}"\n\n` +
        (input.passage ? `Which sits in this passage:\n${input.passage}\n\n` : "") +
        `${intent}\n\n` +
        // 🔴 THE SELECTED WORDS ARE THE QUERY. A learner highlighting a term wants what THEIR
        // material says about it, and their material says it in the excerpts that share its
        // vocabulary. `scope` is empty here because a selection names no block — the surrounding
        // sentence and the passage carry the whole of the signal.
        focusedMaterialSection(input.sources, input.canvasTitle, {
          scope: [],
          texts: [input.selectedText, input.surroundingText, input.passage ?? "", input.objective ?? ""],
        }),
      role: "user",
    },
  ];
}

/** "Simpler" — the one selection action that edits the page. Scoped to a single block. */
export function simplifyMessages(input: {
  selectedText: string;
  block: CanvasBlock;
  canvasTitle: string;
  sources: readonly CanvasSource[];
}): WireMsg[] {
  return [
    canvasSystem(SIMPLIFY_RULE),
    {
      content:
        `The learner is reading "${input.canvasTitle}" and highlighted: "${input.selectedText}"\n\n` +
        `They asked for it to be put more simply. Rewrite THIS ONE passage:\n${input.block.content}\n\n` +
        // Scope stated twice on purpose — see `SIMPLIFY_RULE`, which carries both statements: the
        // model reaches for a full-page rewrite whenever the instruction is ambiguous, and a
        // rewrite of everything would silently undo the teaching loop's earlier local corrections.
        "" +
        focusedMaterialSection(input.sources, input.canvasTitle, {
          scope: [input.block],
          texts: [input.selectedText, input.block.content],
        }),
      role: "user",
    },
  ];
}

export function explainBlockMessages(input: {
  block: CanvasBlock;
  canvasTitle: string;
  command: string;
  sources: readonly CanvasSource[];
}): WireMsg[] {
  return [
    canvasSystem(EXPLAIN_BLOCK_RULE),
    {
      content:
        `The learner is reading "${input.canvasTitle}" and asked: "${input.command}"\n\n` +
        `About this passage:\n${input.block.content}\n\n` +
        "" +
        focusedMaterialSection(input.sources, input.canvasTitle, {
          scope: [input.block],
          texts: [input.command, input.block.content],
        }),
      role: "user",
    },
  ];
}
