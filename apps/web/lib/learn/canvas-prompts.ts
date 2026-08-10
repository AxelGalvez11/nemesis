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
import {
  LEVEL_INSTRUCTIONS,
  type CanvasBlock,
  type CanvasConcept,
  type CanvasFreeQuestion,
  type CanvasLevel,
  type CanvasSource,
  type RetrievalFormat,
} from "./canvas-model";

/** Field-agnostic by construction. Nemesis serves law, engineering, nursing, history and the
 *  trades alike, so nothing here may assume a discipline — the instructions talk about
 *  structure and evidence, never about subject matter. */
const CANVAS_SYSTEM =
  "You are Nemesis, writing a living study document for one learner in any discipline. " +
  "You are not chatting. Your entire output is the JSON payload requested — no greeting, no commentary, no sign-off. " +
  "Write plainly and concretely. Short sections, meaningful headings, no filler, no walls of prose. " +
  "Never assume the learner's field or level beyond what you are told. " +
  "Ground every claim in the supplied material; if the material does not support something, leave it out rather than filling the gap.";

const CITATION_RULE =
  "Every block you write MUST include sourceRefs listing the excerpt ids it was built from, in the form " +
  '[{"sourceId":"s1","excerptId":"s1:e4"}]. Use ONLY excerpt ids that appear in the material below, exactly as written. ' +
  "Never invent an id, a page number, a slide number, or a timestamp. A block written from your own general knowledge " +
  "rather than the material must have an empty sourceRefs list.";

const BLOCK_SHAPE =
  'A block is {"type":"heading"|"paragraph"|"concept"|"example"|"callout","content":"…","conceptIds":["k1"],"sourceRefs":[…]}. ' +
  "Do not include an id — ids are assigned by the application.";

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
  level: CanvasLevel;
  sources: readonly CanvasSource[];
}): WireMsg[] {
  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `Write a study document that teaches ${input.topic ? `"${input.topic}"` : "the attached material"}.\n\n` +
        `${LEVEL_INSTRUCTIONS[input.level]}\n\n` +
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

/** Read one free-text answer for what it MEANS (§21).
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
export function judgeMessages(input: {
  question: CanvasFreeQuestion;
  conceptLabel: string;
  answer: string;
  via: "typed" | "spoken";
  concepts: readonly CanvasConcept[];
}): WireMsg[] {
  return [
    {
      content:
        "You are Nemesis, judging what a learner's own explanation shows about their understanding. " +
        "Your entire output is the JSON payload requested — no greeting, no commentary. " +
        "You are not marking an exam. You are working out what this person does and does not yet understand, " +
        "so the page can teach the right next thing.",
      role: "system",
    },
    {
      content:
        `They were asked:\n"${input.question.q}"\n\n` +
        `A complete answer makes these points:\n${input.question.expected.map((point) => `- ${point}`).join("\n")}\n\n` +
        `The full model answer, for your reference only:\n${input.question.why}\n\n` +
        `This prompt is about the concept "${input.conceptLabel}".\n\n` +
        `They ${input.via === "spoken" ? "said out loud" : "wrote"}:\n"${input.answer}"\n\n` +
        (input.via === "spoken"
          ? "This was dictated, so it arrives as speech: filler words, false starts, self-corrections and missing " +
            "punctuation are normal and mean nothing about their understanding. Judge what they were getting at. " +
            "Where they corrected themselves, judge the correction, not the first attempt.\n\n"
          : "") +
        "Judge MEANING, not vocabulary. If they express the right idea in everyday language, that is a correct " +
        "answer — do not require the term the material used. Do not reward a confident answer that says nothing.\n\n" +
        "Choose one verdict:\n" +
        '- "understood": every expected point is there, in substance.\n' +
        '- "partial": the reasoning is going the right way but something expected is missing or vague.\n' +
        '- "incorrect": the answer does not get there, or is mostly off the point.\n' +
        '- "misconception": the answer reveals a specific, nameable false belief — not merely a gap. Use this only ' +
        "when you can state the wrong belief in one sentence.\n\n" +
        `Concepts on this page: ${input.concepts.map((c) => `${c.id}=${c.label}`).join(", ")}\n\n` +
        'Return JSON: {"verdict":"partial","got":["…"],"missing":["…"],"misconception":"…","refinement":"…","alsoWeakConceptIds":["k3"]}\n\n' +
        "`got` names what they had right, in your words, so it can be said back to them — do not leave it empty for a " +
        "partial answer. `missing` names only what was actually absent or wrong. `misconception` is present ONLY on a " +
        "misconception verdict. `refinement` is what the page will show them instead of a mark: two or three sentences, " +
        "addressed to them as \"you\", that supply exactly the missing piece and nothing else — not a re-teach of the " +
        "whole topic. `alsoWeakConceptIds` is for OTHER concepts on the page this answer showed to be shaky; use ids " +
        "from the list above and no others, and leave it out if there are none.",
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

/** The canvas as plain text for prompts that read it rather than edit it. Collapsed and
 *  already-known blocks are left out: the learner has told us those are not the work. */
export function documentText(blocks: readonly CanvasBlock[]): string {
  return blocks
    .filter((block) => !block.collapsed && !block.known)
    .map((block) => (block.type === "heading" ? `\n## ${block.content}` : block.content))
    .join("\n\n")
    .trim();
}

/** "Where did this come from?" and friends are answered from data we already hold, not by
 *  asking the model — which would let it invent a source. This is the one-block explainer. */
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
