// Batch D AI extras: explain-this-card prompts, deck auto-tagging, and the
// leech radar. Pure — the metered deepseek-chat calls happen in components
// (same pattern as study-generate.ts); preview mode uses the deterministic
// helpers here so /dev-preview can exercise both flows without auth.

import { THINKING_STANCE } from "@nemesis/shared";

import type { WireMsg } from "@/lib/workspace/chat-api";

import { jsonSlice } from "./study-artifact-content";

// Same normalization the store applies on save (study-cloud-store's
// normalizeStudyTags) — duplicated here so this module stays node-testable
// without dragging in the client-only store graph.
function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().replace(/^#+/, "").toLowerCase()).filter(Boolean)));
}

/** Anki's default leech threshold: a card failed this many times is a
 *  problem card — rewrite it, split it, or suspend it. */
export const LEECH_LAPSES = 8;

export function isLeechCard(card: { lapses: number }): boolean {
  return card.lapses >= LEECH_LAPSES;
}

/** `{{c1::answer::hint}}` reads terribly in a prompt — keep just the answer. */
export function stripClozeMarkers(text: string): string {
  return text.replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, "$1");
}

// Owner 2026-08-04: "make it be a dynamic answer not hardcoded format" and
// "the explain should be like a mini side chat." The old prompt marched every
// card through the same four numbered moves (meaning → why → analogy → hook),
// which read as a template stamped onto anything. This one keeps the values
// that survived every revision — simple technical English (owner 2026-07-28),
// field-agnostic examples, no invented facts, no emojis — but hands the SHAPE
// of the answer back to the model: a definition card, a tricky multiple-choice
// distractor, and a derivation each need a different kind of explanation. It
// also runs a conversation now, not a one-shot: follow-up turns arrive as
// ordinary chat history after the seeded first exchange.
const EXPLAIN_SYSTEM =
  "You are Nemesis's study coach, in a small side chat pinned next to the flashcard or test question a student is working on. Any subject — law, engineering, medicine, history, anything. " +
  "Explain the item the way THIS item needs explaining: sometimes the mechanism or rule behind the answer, sometimes a worked example, sometimes the precise distinction that separates the right answer from the tempting wrong one. Do not follow a fixed template, and do not force an analogy or mnemonic — use one only when it genuinely earns its place. " +
  "Write in simple technical English: KEEP the technical terms, since those are what the student is tested on, but define each one in plain words the first time it appears. " +
  "Be brief — usually under 150 words, shorter for follow-ups. Plain paragraphs; a list only when it truly helps. Never use emojis. " +
  "Work only from the item shown and well-established textbook knowledge — never invent a fact, a number, or a citation. If the item is too thin to explain properly, say what is missing. " +
  // 🔴 THE STANCE'S "ask what they think once" RULE MUST NOT FIRE HERE, and this sentence stops it.
  // The student reached this chat by pressing a button labelled Explain: they have already asked to
  // be told, so asking them back is the Socratic-tutor failure the owner capped that rule to avoid.
  "Answer follow-up questions directly, like a tutor sitting beside them. The student pressed Explain, so explain rather than asking them what they think first. " +
  // The other half of the stance does apply, and this is where it matters most: a student who says
  // "no, I think it is B" about a card they got wrong is the exact moment not to fold.
  THINKING_STANCE;

/** The seeded opening of an explain chat: system + the item as the first ask.
 *  Follow-up turns are appended after these by the caller. */
export function explainSeedMessages(context: string): WireMsg[] {
  return [
    { content: EXPLAIN_SYSTEM, role: "system" },
    { content: `${context}\n\nExplain this to me.`, role: "user" },
  ];
}

/** What the side chat knows about a flashcard. */
export function explainCardContext(card: { front: string; back: string }): string {
  const front = stripClozeMarkers(card.front).trim();
  const back = stripClozeMarkers(card.back).trim();
  return `Flashcard front: ${front}\nFlashcard back: ${back || "(the answer is inside the front text)"}`;
}

/** What the side chat knows about a test question — including what the
 *  student picked, so a wrong pick gets talked about, not just the right one. */
export function explainQuestionContext(input: {
  q: string;
  options: string[];
  answerIndex: number;
  pickedIndex: number | null;
}): string {
  const lines = input.options.map((option, index) => {
    const letter = String.fromCharCode(65 + index);
    const marks = [index === input.answerIndex ? "correct" : null, input.pickedIndex === index ? "the student's pick" : null]
      .filter(Boolean)
      .join(", ");
    return `${letter}. ${option}${marks ? ` (${marks})` : ""}`;
  });
  const pickedNote =
    input.pickedIndex !== null && input.pickedIndex !== input.answerIndex
      ? "\nThe student picked a wrong option — explain why their pick was tempting but wrong, as well as why the correct one is right."
      : "";
  return `Test question: ${input.q}\n${lines.join("\n")}${pickedNote}`;
}

// Owner 2026-08-04: "the nemesis 'explain' should be able to remake, alter,
// flashcards and test questions." The side chat is where the student says
// WHAT is wrong ("this distractor is a giveaway", "make it harder") — these
// build the structured rewrite call, and the parsers refuse anything that is
// not a complete well-formed replacement: a half-parsed item must never
// overwrite a stored one.

export function explainTranscript(turns: ReadonlyArray<{ role: "assistant" | "user"; text: string }>): string {
  return turns.map((turn) => `${turn.role === "user" ? "Student" : "Coach"}: ${turn.text}`).join("\n\n");
}

const REVISE_SYSTEM =
  "You revise one study item for Nemesis. Any subject — law, engineering, medicine, history, anything. " +
  "Read the side-chat conversation to understand what the student wants changed: fix an error, reword, raise or lower difficulty, replace weak distractors. If the conversation asks for nothing specific, improve the item's accuracy and clarity. " +
  "Stay on the item's own topic and never invent facts. Never use emojis. " +
  "Reply with ONE fenced ```json block and nothing else.";

export function reviseQuestionMessages(input: { q: string; options: string[]; answer: number; why?: string; transcript: string }): WireMsg[] {
  return [
    { content: REVISE_SYSTEM, role: "system" },
    {
      content:
        `The current test question, as JSON:\n${JSON.stringify({ answer: input.answer, options: input.options, q: input.q, why: input.why ?? "" })}\n\n` +
        `The side-chat conversation about it:\n${input.transcript.trim() || "(none — improve accuracy and clarity)"}\n\n` +
        'Return the revised question as ```json {"q": string, "options": string[] (2 to 6 entries), "answer": number (index of the correct option), "why": string} ``` — a complete replacement, not a diff.',
      role: "user",
    },
  ];
}

export function reviseCardMessages(input: { front: string; back: string; transcript: string }): WireMsg[] {
  return [
    { content: REVISE_SYSTEM, role: "system" },
    {
      content:
        `The current flashcard, as JSON:\n${JSON.stringify({ back: input.back, front: input.front })}\n\n` +
        `The side-chat conversation about it:\n${input.transcript.trim() || "(none — improve accuracy and clarity)"}\n\n` +
        'Return the revised card as ```json {"front": string, "back": string} ``` — a complete replacement, not a diff. Keep any {{c1::…}} cloze markers the card style needs.',
      role: "user",
    },
  ];
}

export interface RevisedQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export function parseRevisedQuestion(raw: string): RevisedQuestion | null {
  const parsed = jsonSlice(raw);
  if (!parsed) return null;
  const q = typeof parsed.q === "string" ? parsed.q.trim() : "";
  const options = Array.isArray(parsed.options)
    ? parsed.options.filter((option): option is string => typeof option === "string").map((option) => option.trim()).filter(Boolean)
    : [];
  const answer = typeof parsed.answer === "number" && Number.isInteger(parsed.answer) ? parsed.answer : -1;
  const why = typeof parsed.why === "string" ? parsed.why.trim() : "";
  if (!q || options.length < 2 || options.length > 6 || answer < 0 || answer >= options.length) return null;
  return { answer, options, q, why };
}

export interface RevisedCard {
  front: string;
  back: string;
}

export function parseRevisedCard(raw: string): RevisedCard | null {
  const parsed = jsonSlice(raw);
  if (!parsed) return null;
  const front = typeof parsed.front === "string" ? parsed.front.trim() : "";
  const back = typeof parsed.back === "string" ? parsed.back.trim() : "";
  if (!front) return null;
  return { back, front };
}

const MAX_AUTOTAG_CARDS = 60;
const MAX_TAGS_PER_CARD = 3;

export interface AutoTagCard {
  id: string;
  front: string;
  back: string;
}

/** Cards that auto-tagging would touch: untagged only, capped per pass. */
export function autoTagTargets<T extends { tags: string[] }>(cards: T[]): T[] {
  return cards.filter((card) => card.tags.length === 0).slice(0, MAX_AUTOTAG_CARDS);
}

const AUTOTAG_SYSTEM =
  "You are Nemesis's study organizer. Tag flashcards with short topic labels so students can filter " +
  "them later. Return strict JSON only - no markdown fences, no prose outside the JSON object. Never use emojis.";

export function buildAutoTagMessages(cards: AutoTagCard[]): WireMsg[] {
  const list = cards
    .map((card) => `${card.id}\t${stripClozeMarkers(card.front).slice(0, 200)}\t${stripClozeMarkers(card.back).slice(0, 200)}`)
    .join("\n");
  return [
    { content: AUTOTAG_SYSTEM, role: "system" },
    {
      content:
        // 🔴 NO SUBJECT-MATTER CATEGORIES. This used to ask for "drug class, organ system,
        // mechanism" with medical examples, so the model knew what field it was working in
        // before it had read a single card, and a law deck came back tagged against a taxonomy
        // that does not exist in law. Structure generalises; a category list never does.
        "Tag each flashcard below with 1-3 topic tags: lowercase, hyphenated, and concept-level. " +
        "A tag names the idea, process or category a card is about, in the vocabulary the cards " +
        "themselves use. Do not assume a subject: read the cards and tag what they actually cover. " +
        "Reuse the same tag across related cards so filters stay useful. " +
        'Return JSON shaped {"tags":{"<card id>":["tag1","tag2"]}} covering every card id given.\n\n' +
        `Cards (id, front, back - tab separated, one per line):\n${list}`,
      role: "user",
    },
  ];
}

/** Parse the auto-tag reply into id → tags, keeping only ids we sent and at
 *  most three normalized tags per card. */
export function parseAutoTags(raw: string, validIds: Iterable<string>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const parsed = jsonSlice(raw);
  const bucket = parsed && typeof parsed.tags === "object" && parsed.tags !== null ? (parsed.tags as Record<string, unknown>) : parsed;
  if (!bucket) return result;
  const allowed = new Set(validIds);
  for (const [id, value] of Object.entries(bucket)) {
    if (!allowed.has(id) || !Array.isArray(value)) continue;
    const tags = normalizeTags(value.filter((tag): tag is string => typeof tag === "string")).slice(0, MAX_TAGS_PER_CARD);
    if (tags.length > 0) result.set(id, tags);
  }
  return result;
}

/** Deterministic stand-in for preview mode: tag = the card's first
 *  meaningful front word, so the flow verifies without a network call. */
export function previewAutoTags(cards: AutoTagCard[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const card of cards) {
    const word = stripClozeMarkers(card.front)
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((part) => part.length > 3)[0];
    if (word) result.set(card.id, [word]);
  }
  return result;
}
