// Turning model replies into canvas content, defensively.
//
// The house convention on this lane is prompt-for-JSON then parse carefully — there is no JSON
// mode through the nemesis-llm valve and no caller has ever sent `response_format`. Four other
// places in the repo already do this by hand; this is the canvas's one copy, and unlike the
// others it VALIDATES rather than coerces.
//
// The rule throughout: a malformed part is dropped, not patched. A citation that does not
// resolve is removed rather than kept as decoration, because a citation the learner can click
// and find nothing behind is worse than none.

import { balanceAnswerPositions } from "@/lib/workspace/test-answer-balance";

import { mintBlockId } from "./canvas-ops";
import {
  CANVAS_BLOCK_TYPES,
  type CanvasBlock,
  type CanvasBlockType,
  type CanvasConcept,
  RETRIEVAL_TASKS,
  type CanvasChoiceQuestion,
  type CanvasFreeQuestion,
  type CanvasQuestion,
  type RetrievalTask,
  type CanvasSource,
  type RecallCard,
  type SourceRef,
} from "./canvas-model";

export interface ParsedLesson {
  title: string;
  concepts: CanvasConcept[];
  blocks: CanvasBlock[];
}

// ------------------------------------------------------------- JSON recovery

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Same recovery ladder the ops parser uses: fenced block, then whole text, then the widest
 *  balanced object. Never throws; an unparseable reply yields null and the caller says so.
 *
 *  Exported for the judge, which faces the same problem — a third copy of this ladder would be
 *  a third place for the recovery behaviour to drift. */
export function extractJson(raw: string): Record<string, unknown> | null {
  const candidates: string[] = [];
  for (const match of raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)) {
    const body = match[1]?.trim();
    if (body) candidates.push(body);
  }
  const trimmed = raw.trim();
  if (trimmed) candidates.push(trimmed);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Next candidate.
    }
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Keep only citations that resolve to a real excerpt. */
function usableRefs(value: unknown, sources: readonly CanvasSource[]): SourceRef[] {
  if (!Array.isArray(value)) return [];
  const out: SourceRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const sourceId = text(entry.sourceId);
    const excerptId = text(entry.excerptId);
    if (!sourceId || !excerptId) continue;
    const source = sources.find((candidate) => candidate.id === sourceId);
    if (!source?.excerpts.some((excerpt) => excerpt.id === excerptId)) continue;
    out.push({ sourceId, excerptId });
  }
  return out;
}

/** Keep only concept claims the canvas actually declared. */
function usableConcepts(value: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && known.has(id));
}

function blockType(value: unknown): CanvasBlockType {
  // An unrecognised type is a formatting slip, not a reason to throw away the writing.
  return typeof value === "string" && (CANVAS_BLOCK_TYPES as readonly string[]).includes(value)
    ? (value as CanvasBlockType)
    : "paragraph";
}

function toBlock(raw: unknown, known: ReadonlySet<string>, sources: readonly CanvasSource[]): CanvasBlock | null {
  if (!isRecord(raw)) return null;
  const content = text(raw.content);
  if (!content) return null;
  const refs = usableRefs(raw.sourceRefs, sources);
  const conceptIds = usableConcepts(raw.conceptIds, known);
  return {
    id: mintBlockId(),
    type: blockType(raw.type),
    content,
    ...(refs.length ? { sourceRefs: refs } : {}),
    ...(conceptIds.length ? { conceptIds } : {}),
  };
}

// -------------------------------------------------------------------- lesson

export function parseLesson(raw: string, sources: readonly CanvasSource[]): ParsedLesson | null {
  const payload = extractJson(raw);
  if (!payload) return null;

  const concepts: CanvasConcept[] = [];
  if (Array.isArray(payload.concepts)) {
    for (const entry of payload.concepts) {
      if (!isRecord(entry)) continue;
      const id = text(entry.id);
      const label = text(entry.label);
      // A concept with no label cannot be shown to the learner in a diagnosis, so it is not
      // a concept — dropping it here stops blocks referencing something unnameable.
      if (!id || !label || concepts.some((existing) => existing.id === id)) continue;
      concepts.push({ id, label });
    }
  }
  const known = new Set(concepts.map((concept) => concept.id));

  const blocks: CanvasBlock[] = [];
  if (Array.isArray(payload.blocks)) {
    for (const entry of payload.blocks) {
      const block = toBlock(entry, known, sources);
      if (block) blocks.push(block);
    }
  }
  // A lesson with nothing in it is a failed generation, not an empty page to render.
  if (blocks.length === 0) return null;

  const title =
    text(payload.title) || blocks.find((block) => block.type === "heading")?.content || "Untitled canvas";

  return { title, concepts, blocks };
}

// -------------------------------------------------------------------- recall

export function parseRecallCards(
  raw: string,
  conceptIds: readonly string[],
  sources: readonly CanvasSource[],
): RecallCard[] {
  const payload = extractJson(raw);
  const list = payload && Array.isArray(payload.cards) ? payload.cards : null;
  if (!list) return [];

  const known = new Set(conceptIds);
  const cards: RecallCard[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const front = text(entry.front);
    const back = text(entry.back);
    // Both halves are load-bearing: a card with no back has nothing to reveal.
    if (!front || !back) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const refs = usableRefs(entry.sourceRefs, sources);
    const conceptId = text(entry.conceptId);
    cards.push({
      id: `r_${cards.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
      front,
      back,
      // A card is still worth asking without a concept; it just cannot feed the diagnosis.
      conceptId: conceptId && known.has(conceptId) ? conceptId : null,
      ...(refs.length ? { sourceRefs: refs } : {}),
    });
  }
  return cards;
}

// ---------------------------------------------------------------------- test

export function parseTestQuestions(
  raw: string,
  conceptIds: readonly string[],
  sources: readonly CanvasSource[],
): CanvasChoiceQuestion[] {
  const payload = extractJson(raw);
  const list = payload && Array.isArray(payload.questions) ? payload.questions : null;
  if (!list) return [];

  const known = new Set(conceptIds);
  // Narrowed to the choice shape on purpose: the answer-position balancer below only makes
  // sense for questions that HAVE positions, so the type says so rather than a cast saying it.
  const staged: { question: CanvasChoiceQuestion; correctText: string }[] = [];

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const q = text(entry.q);
    const options = Array.isArray(entry.options) ? entry.options.map(text).filter(Boolean) : [];
    const answer = typeof entry.answer === "number" ? entry.answer : -1;
    if (!q || options.length < 2) continue;
    // An answer index outside the options makes the whole question unscoreable.
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;

    const conceptId = text(entry.conceptId);
    // 🔴 Unlike a recall card, a question with no concept is dropped. A miss nobody can
    // attribute is exactly the defect this canvas exists to fix — it would score against the
    // learner while teaching us nothing about what to re-teach.
    if (!conceptId || !known.has(conceptId)) continue;

    const refs = usableRefs(entry.sourceRefs, sources);
    staged.push({
      correctText: options[answer] ?? "",
      question: {
        id: `q_${staged.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
        format: "choice",
        q,
        options,
        answer,
        why: text(entry.why),
        conceptId,
        ...(refs.length ? { sourceRefs: refs } : {}),
      },
    });
  }

  // Reuse the Study tab's answer-position balancer: models put the correct answer first far
  // more often than chance. Only the four fields it understands are handed over; the canvas's
  // own fields (id, conceptId, sourceRefs) are re-attached below rather than relying on the
  // balancer to carry them.
  const balanced = balanceAnswerPositions(
    staged.map(({ question }) => ({ q: question.q, options: question.options, answer: question.answer, why: question.why })),
  );

  return staged.map((item, index) => {
    const shuffled = balanced[index];
    if (!shuffled) return item.question;
    // Re-find the correct option by its TEXT. Trusting the index across a reshuffle would
    // silently invert every question on the paper.
    const found = shuffled.options.indexOf(item.correctText);
    return {
      ...item.question,
      options: shuffled.options,
      answer: found >= 0 ? found : shuffled.answer,
    };
  });
}

// ----------------------------------------------------------- free-response test

/** One free-response prompt, checked.
 *
 *  Extracted so the teaching loop's follow-up questions go through exactly the same discipline as
 *  a generated test. A follow-up minted inline with a looser shape would be unjudgeable, and the
 *  loop would degrade into asking questions nobody can read the answers to after one turn. */
export function toFreeQuestion(
  entry: unknown,
  known: ReadonlySet<string>,
  sources: readonly CanvasSource[],
  index = 0,
): CanvasFreeQuestion | null {
  if (!isRecord(entry)) return null;
  const q = text(entry.q);
  if (!q) return null;

  const conceptId = text(entry.conceptId);
  // 🔴 A prompt with no concept is dropped: a miss nobody can attribute is the defect this
  // canvas exists to fix.
  if (!conceptId || !known.has(conceptId)) return null;

  const claims = Array.isArray(entry.expected) ? entry.expected.map(text).filter(Boolean) : [];
  // Nothing expected of it means nothing to judge it against, so the learner would answer at
  // length for no benefit.
  if (claims.length === 0) return null;

  // An unrecognised task is not fatal — it only decides how the prompt is introduced on screen.
  // "explain" is the honest default because it is the least specific of the nine.
  const rawTask = text(entry.kind || entry.task) as RetrievalTask;
  const task = (RETRIEVAL_TASKS as readonly string[]).includes(rawTask) ? rawTask : "explain";

  const refs = usableRefs(entry.sourceRefs, sources);
  return {
    id: `q_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
    format: "free",
    task,
    q,
    expectedEvidence: { acceptableClaims: claims },
    why: text(entry.why),
    conceptId,
    ...(refs.length ? { sourceRefs: refs } : {}),
  };
}

export function parseFreeQuestions(
  raw: string,
  conceptIds: readonly string[],
  sources: readonly CanvasSource[],
): CanvasFreeQuestion[] {
  const payload = extractJson(raw);
  const list = payload && Array.isArray(payload.questions) ? payload.questions : null;
  if (!list) return [];

  const known = new Set(conceptIds);
  const out: CanvasFreeQuestion[] = [];
  for (const entry of list) {
    const question = toFreeQuestion(entry, known, sources, out.length);
    if (question) out.push(question);
  }
  return out;
}

/** The teaching loop's reply: how the page should change, and what to ask next.
 *
 *  Both halves are validated by their existing owners — operations by `validateOps` in the
 *  caller (which is where the block scope lives), the follow-up by `toFreeQuestion`. A missing
 *  or unusable follow-up is not fatal: the page still gets its correction, and the learner is
 *  simply not asked again about it. */
export function parseTeachingReply(
  raw: string,
  conceptIds: readonly string[],
  sources: readonly CanvasSource[],
): { followUp: CanvasFreeQuestion | null } {
  const payload = extractJson(raw);
  if (!payload) return { followUp: null };
  return { followUp: toFreeQuestion(payload.followUp, new Set(conceptIds), sources) };
}

// -------------------------------------------------------------- short answer

/** For the one-off explanations ("why was my answer wrong?"). Falls back to the raw prose,
 *  because a missing envelope should cost formatting, not the answer. */
export function parseShortAnswer(raw: string): string | null {
  const payload = extractJson(raw);
  const answer = payload ? text(payload.answer) : "";
  if (answer) return answer;
  const trimmed = raw.trim();
  return trimmed || null;
}
