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

import { groundingBlock } from "./canvas-grounding";
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

const BLOCK_SHAPE =
  'A block is {"type":"heading"|"paragraph"|"concept"|"example"|"callout","content":"…","conceptIds":["k1"],"sourceRefs":[…],"terms":[…]}. ' +
  `Do not include an id — ids are assigned by the application.\n\n${TERMS_RULE}`;

function materialSection(sources: readonly CanvasSource[], topic: string): string {
  const grounding = groundingBlock(sources);
  if (grounding) return `MATERIAL (cite these excerpt ids):\n\n${grounding}`;
  // Topic-first learning (§6B). No material means no citations are possible, and saying so
  // is what stops the model producing citation-shaped decoration.
  return `There is no attached material. The learner asked to be taught: "${topic}". Write from established knowledge in the field and leave every sourceRefs list empty.`;
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
    { content: CANVAS_SYSTEM, role: "system" },
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
        `${BLOCK_SHAPE}\n\n${CITATION_RULE}\n\n` +
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

  const allowed = scoped
    ? `You may ONLY change these blocks: ${input.selected.map((block) => block.id).join(", ")}. ` +
      "Permitted operations: replace_block, insert_before, insert_after, delete_block, annotate_block, collapse_block. " +
      "You may insert new blocks next to the selected ones. Any operation naming another block will be discarded."
    : "Permitted operations: replace_block, insert_before, insert_after, delete_block, annotate_block, collapse_block. " +
      "Change as little as possible — edit the blocks the request is about and leave the rest alone.";

  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `The learner is reading "${input.canvasTitle}"${input.level ? ` at the "${input.level}" level` : ""} and said:\n\n"${input.command}"\n\n` +
        (scoped ? `They have highlighted this:\n\n${selection}\n\n` : "") +
        `Document outline (id, type, opening):\n${outline}\n\n` +
        `Concepts: ${input.concepts.map((c) => `${c.id}=${c.label}`).join(", ") || "none"}\n\n` +
        `${allowed}\n\n${BLOCK_SHAPE}\n\n${CITATION_RULE}\n\n` +
        'Return JSON: {"operations":[{"operation":"replace_block","blockId":"…","content":"…","conceptIds":[…],"sourceRefs":[…]}]}\n' +
        'Use annotate_block ({"operation":"annotate_block","blockId":"…","note":"…"}) when the learner wants a clarification ' +
        "beside the text rather than a rewrite of it.\n\n" +
        materialSection(input.sources, input.canvasTitle),
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
  predict: "say what follows, and why",
  apply: "use the idea on a concrete situation",
  solve: "work it through and show the reasoning",
};

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
        `They ${input.response.via === "spoken" ? "said out loud" : "wrote"}:\n"${input.response.text}"\n\n` +
        (input.response.via === "spoken"
          ? "This was dictated, so it arrives as speech: filler words, false starts, self-corrections and missing " +
            "punctuation are normal and mean nothing about their understanding. Judge what they were getting at. " +
            "Where they corrected themselves, judge the correction, not the first attempt.\n\n"
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
        "state the wrong belief in one sentence.\n\n" +
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
    { content: CANVAS_SYSTEM, role: "system" },
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
        `${BLOCK_SHAPE}\n\n${CITATION_RULE}\n\n` +
        'Return JSON: {"operations":[…],"followUp":{"task":"explain","q":"…","expected":["…","…"],"why":"…","conceptId":"' +
        `${input.objectiveId}"}}\n\n` +
        "`followUp` is the next thing you ask them, and it must be answerable in their own words. `expected` " +
        "is 2-3 short checkable claims a complete answer makes — this is what the answer will be judged " +
        `against, so write claims and not topics. conceptId MUST be "${input.objectiveId}".\n\n` +
        `The blocks that currently teach this idea:\n${scopeText || "(none — the page has no block for it yet)"}\n\n` +
        materialSection(input.sources, input.canvasTitle),
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
    { content: CANVAS_SYSTEM, role: "system" },
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
        `${BLOCK_SHAPE}\n\n${CITATION_RULE}\n\n` +
        'Return JSON: {"operations":[{"operation":"replace_canvas","blocks":[…]}]} — one replace_canvas holding the ' +
        "short focused document. Use only the concept ids listed above.\n\n" +
        `The parts of the original document that covered these ideas:\n${documentText(input.relevantBlocks)}\n\n` +
        materialSection(input.sources, input.canvasTitle),
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
  simpler:
    "Rewrite the passage below so it is easier to follow, keeping every technical term that the learner needs " +
    "and every claim the original made. Same meaning, plainer construction. Do not add new information and do not remove content.",
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
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `The learner is studying "${input.canvasTitle}"` +
        (input.objective ? ` and is currently working on: ${input.objective}` : "") +
        ".\n\n" +
        `They highlighted this exact text: "${input.selectedText}"\n\n` +
        `It appears in this sentence: "${input.surroundingText}"\n\n` +
        (input.passage ? `Which sits in this passage:\n${input.passage}\n\n` : "") +
        `${intent}\n\n` +
        "If the attached material defines this itself, prefer that meaning and set \"fromSource\" to the source title. " +
        "If it does not, answer from established knowledge and leave \"fromSource\" empty — never imply the learner's " +
        "own material said something it did not.\n\n" +
        'Return JSON: {"answer":"…","fromSource":"…"}\n\n' +
        materialSection(input.sources, input.canvasTitle),
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
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `The learner is reading "${input.canvasTitle}" and highlighted: "${input.selectedText}"\n\n` +
        `They asked for it to be put more simply. Rewrite THIS ONE passage:\n${input.block.content}\n\n` +
        `${SELECTION_INTENT.simpler}\n\n` +
        // Scope stated twice on purpose: the model reaches for a full-page rewrite whenever the
        // instruction is ambiguous, and a rewrite of everything would silently undo the
        // teaching loop's earlier local corrections.
        "You are rewriting one passage and nothing else. Do not write a heading. Do not add a second paragraph. " +
        "Do not comment on the change.\n\n" +
        'Return JSON: {"content":"…"}\n\n' +
        materialSection(input.sources, input.canvasTitle),
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
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `The learner is reading "${input.canvasTitle}" and asked: "${input.command}"\n\n` +
        `About this passage:\n${input.block.content}\n\n` +
        "Answer in at most three sentences, plainly. Return JSON: {\"answer\":\"…\"}\n\n" +
        materialSection(input.sources, input.canvasTitle),
      role: "user",
    },
  ];
}
