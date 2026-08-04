// Batch D AI extras: explain-this-card prompts, deck auto-tagging, and the
// leech radar. Pure — the metered deepseek-chat calls happen in components
// (same pattern as study-generate.ts); preview mode uses the deterministic
// helpers here so /dev-preview can exercise both flows without auth.

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
  "Answer follow-up questions directly, like a tutor sitting beside them.";

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
        "Tag each flashcard below with 1-3 topic tags: lowercase, hyphenated, concept-level " +
        '(drug class, organ system, mechanism, exam topic - e.g. "beta-blockers", "renal", "adverse-effects"). ' +
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
