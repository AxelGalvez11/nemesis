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
  type CanvasLevel,
  type CanvasSource,
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

export function testMessages(input: {
  canvasTitle: string;
  blocks: readonly CanvasBlock[];
  concepts: readonly CanvasConcept[];
  count: number;
  /** When set, the test is the retest and covers only these concepts. */
  onlyConceptIds?: readonly string[];
}): WireMsg[] {
  const focus = input.onlyConceptIds?.length
    ? input.concepts.filter((concept) => input.onlyConceptIds?.includes(concept.id))
    : input.concepts;

  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `Write a practice test of ${input.count} multiple-choice questions on "${input.canvasTitle}".\n\n` +
        // Shared with the Study tab's generator and the chat test-craft skill, so improving
        // the craft improves all three at once (see item-writing.ts).
        `Follow these rules:\n${EXAM_ITEM_RULES}\n\n` +
        (input.onlyConceptIds?.length
          ? "This is a RETEST. Ask only about the concepts listed below — the ones the learner got wrong. Do not test anything else.\n\n"
          : "Spread the questions across the concepts below.\n\n") +
        `Concepts to test: ${focus.map((c) => `${c.id}=${c.label}`).join(", ")}\n\n` +
        'Return JSON: {"questions":[{"q":"…","options":["…","…","…","…"],"answer":<index>,"why":"…","conceptId":"k1","sourceRefs":[…]}]} — ' +
        "4 options each, answer is the 0-based index of the correct option, why explains what makes the wrong options wrong, " +
        "and conceptId MUST be one of the ids above. A question with no concept is useless here.\n\n" +
        `Document:\n${documentText(input.blocks)}`,
      role: "user",
    },
  ];
}

// --------------------------------------------------------- targeted relearn

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
  misses: readonly { question: string; picked: string; correct: string; why: string }[];
}): WireMsg[] {
  return [
    { content: CANVAS_SYSTEM, role: "system" },
    {
      content:
        `The learner has been tested on "${input.canvasTitle}" and these ideas did not land:\n` +
        `${input.weak.map((c) => `- ${c.id}: ${c.label}`).join("\n")}\n\n` +
        (input.misses.length
          ? `What they actually got wrong:\n${input.misses
              .map((m) => `- Asked: ${m.question}\n  They chose: ${m.picked}\n  Correct: ${m.correct}\n  Why: ${m.why}`)
              .join("\n")}\n\n`
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
