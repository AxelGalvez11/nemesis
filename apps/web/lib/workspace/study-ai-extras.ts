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

// Owner 2026-07-28: "research skills for ai for better mnemonics, analogies,
// explanations should be in simple technical english."
//
// The old prompt asked for "one memorable hook or contrast" and left the rest to
// the model, which reliably produced a restatement of the card. This one names
// the four moves that make an explanation stick, in the order a learner needs
// them, and each is drawn from what actually works:
//
//   1. Meaning first — you cannot elaborate on something you have not understood.
//   2. The mechanism — elaborative interrogation: answering "why is this true"
//      beats re-reading, because it forces the causal link into memory.
//   3. ONE concrete analogy — a familiar system carries the structure of an
//      unfamiliar one. Concrete beats clever; a vague analogy teaches nothing.
//   4. ONE memory hook — the keyword method: an acronym, a sound-alike, or a
//      vivid image. Deliberately optional. A forced mnemonic is extra to
//      memorise, so the instruction says to skip it rather than invent one.
//
// "Simple technical English" is the owner's phrase and it is not the same as
// "simple English": the technical term is what the exam asks for, so it stays —
// what gets simplified is the language AROUND it.
//
// NOT health-sciences. This app is field-agnostic (a law student and a
// mechanical-engineering student both use it), and the old prompt's
// "health-sciences student" quietly biased every analogy toward medicine.
const EXPLAIN_SYSTEM =
  "You are Nemesis's study coach, explaining one flashcard to the student who is revising it. Any subject — law, engineering, medicine, history, anything. " +
  "Work in this order: (1) say what the answer MEANS in one plain sentence; (2) explain WHY it is true — the mechanism, the reasoning, or the rule behind it, because understanding the cause is what makes it stick; " +
  "(3) give ONE concrete analogy to something the student already knows from everyday life, and make it structural, not decorative — the analogy has to carry the same relationship as the real thing; " +
  "(4) give ONE memory hook only if a genuinely good one exists: an acronym, a sound-alike for a hard term, or a vivid image tied to the answer. A forced mnemonic is one more thing to memorise — if nothing good comes, skip this step entirely and say nothing about it. " +
  "Write in simple technical English: KEEP the technical terms, since those are what the student is being tested on, but define each one in plain words the first time it appears, and keep every sentence around fifteen words. No filler, no throat-clearing, no restating the card back at them. " +
  "Stay under 150 words. Short paragraphs or a short list. Never use emojis. " +
  "Work only from the card and well-established textbook knowledge — never invent a fact, a number, or a citation. If the card is too thin to explain properly, say what is missing rather than padding.";

export function buildExplainMessages(card: { front: string; back: string }): WireMsg[] {
  const front = stripClozeMarkers(card.front).trim();
  const back = stripClozeMarkers(card.back).trim();
  return [
    { content: EXPLAIN_SYSTEM, role: "system" },
    {
      content: `Explain this flashcard to me.\n\nFront: ${front}\n${back ? `Back: ${back}` : "Back: (the answer is inside the front text)"}`,
      role: "user",
    },
  ];
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
