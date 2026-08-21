// Marking the words that will stop someone — and almost nothing else.
//
// The failure mode this file is written against is not "we missed a hard word". It is a
// paragraph wearing six dotted underlines, which is visual noise the eye learns to skip in
// about a day, at which point the feature is worse than nothing because it also made the prose
// uglier. Every rule below exists to mark FEWER things.
//
// 🔴 NO KEYWORD LIST, AND THERE MUST NEVER BE ONE. A hardcoded roster of technical terms is the
// obvious implementation and it is wrong for this product: a list built from one field marks
// "myocardial" and walks straight past "promissory estoppel", "shear modulus", "ablative case"
// and "leading question". Nemesis serves a law student and a mechanical engineering student
// with the same code. So candidates are not detected by rule at all — they are named at
// generation time by the model that wrote the lesson, which is the only thing in the system
// that knows what it just introduced and to whom. That mirrors `sourceRefs` and `conceptIds`,
// which are emitted for the same reason: asking afterwards invites invention.
//
// What this file owns is the GATE. The model will happily name six terms per block; the rules
// here decide which two the learner actually sees, and they are learner-relative rather than
// absolute, because "hard word" is not a property of a word.
//
// 🔴 AND THIS IS PRESENTATION, NOT ASSESSMENT. Marking a term does not mean the learner does
// not know it, and clearing a mark does not mean they now do. Nothing here writes to the
// canvas, and nothing here may ever be read by `diagnose()` — see canvas-events.ts for the
// same rule stated about interaction telemetry, and the calibrated test that enforces it.

import type { BlockTerm, CanvasBlock, LearningCanvas } from "./canvas-model";

export type { BlockTerm };

/** At most this many marks in one block, ever. Two is already generous for a paragraph. */
const MAX_PER_BLOCK = 2;

/** …and one, for a learner who has told us they are past the basics. `advanced` and `exam` are
 *  self-reported and therefore weak, so this adjusts how much help is offered — never what the
 *  canvas believes about them. */
const MAX_PER_BLOCK_ADVANCED = 1;

/** One mark per this many words, so density scales with the text rather than with how many
 *  candidates the model felt like naming. A heading gets nothing. A 40-word paragraph gets at
 *  most one. This is the numeric form of "subtle". */
const WORDS_PER_MARK = 25;

/** A term that survived the gate, located in the block's CURRENT text. */
export interface MarkedTerm {
  /** As it appears in the block, not as the model spelled it. */
  term: string;
  start: number;
  end: number;
  conceptId?: string;
}

/** Letters and digits in any script — a boundary test that behaves the same for "estoppel",
 *  "Grenzfläche" and "μ". Deliberately not `\w`, which is ASCII-only and would put a false
 *  boundary inside every accented word. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(character: string): boolean {
  return character.length > 0 && WORD_CHAR.test(character);
}

/** First whole-word occurrence, case-insensitively.
 *
 *  🔴 Whole-word matters more than it looks. Without the boundary test, "ion" marks the middle
 *  of "action", "act" marks the middle of "contract", and the underline lands on a fragment of
 *  a different word — which reads as a rendering bug, not as an annotation. */
function findTerm(content: string, term: string): { start: number; end: number } | null {
  const haystack = content.toLowerCase();
  const needle = term.trim().toLowerCase();
  if (!needle) return null;

  for (let from = 0; from <= haystack.length - needle.length; ) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return null;
    const before = at === 0 ? "" : haystack[at - 1]!;
    const after = haystack[at + needle.length] ?? "";
    if (!isWordChar(before) && !isWordChar(after)) return { start: at, end: at + needle.length };
    from = at + 1;
  }
  return null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Only the parts of a canvas this gate is allowed to see. Narrow on purpose: a function that
 *  cannot reach `weakConceptIds` cannot accidentally start deciding what someone knows. */
export type VocabularyCanvas = Pick<LearningCanvas, "level">;

/** Which terms in this block to mark, in reading order.
 *
 *  Returns [] far more often than not, and that is the intended behaviour. */
export function markedTerms(block: CanvasBlock, canvas: VocabularyCanvas): MarkedTerm[] {
  const candidates = block.terms ?? [];
  if (candidates.length === 0) return [];

  // A folded passage has no visible words to annotate. `known` deliberately does NOT retire the
  // affordance: demonstrated mastery changes proactive teaching, not what the learner may open.
  if (block.collapsed) return [];

  const ceiling =
    canvas.level === "advanced" || canvas.level === "exam" ? MAX_PER_BLOCK_ADVANCED : MAX_PER_BLOCK;
  const budget = Math.min(ceiling, Math.floor(wordCount(block.content) / WORDS_PER_MARK));
  if (budget < 1) return [];

  const picked: MarkedTerm[] = [];

  for (const candidate of candidates) {
    if (picked.length >= budget) break;

    const term = candidate?.term?.trim();
    if (!term) continue;

    // 🔴 Located against the block's text as it stands right now, never against the text the
    // term was named in. "Simpler" rewrites blocks in place, and a term the rewrite removed
    // simply stops being marked — which is the honest outcome. Nothing is stored, so nothing
    // can go stale.
    const at = findTerm(block.content, term);
    if (!at) continue;

    if (picked.some((mark) => at.start < mark.end && mark.start < at.end)) continue;

    picked.push({
      term: block.content.slice(at.start, at.end),
      start: at.start,
      end: at.end,
      ...(candidate.conceptId ? { conceptId: candidate.conceptId } : {}),
    });
  }

  return picked.sort((a, b) => a.start - b.start);
}

/** Split a block's text into runs, so the marked ones can be wrapped without the prose being
 *  rewritten to hold them.
 *
 *  🔴 The annotation layer is computed at render time and never merged into `block.content`.
 *  Baking a marker into the text would make it part of what the model reads back on the next
 *  rewrite, part of what a copy-paste carries, and part of what the learner's own material
 *  appears to say. */
export function splitByTerms(
  content: string,
  marks: readonly MarkedTerm[],
): Array<{ text: string; mark: MarkedTerm | null }> {
  const runs: Array<{ text: string; mark: MarkedTerm | null }> = [];
  let cursor = 0;

  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) runs.push({ text: content.slice(cursor, mark.start), mark: null });
    runs.push({ text: content.slice(mark.start, mark.end), mark });
    cursor = mark.end;
  }

  if (cursor < content.length) runs.push({ text: content.slice(cursor), mark: null });
  return runs;
}

/**
 * Where terms the learner has already looked up appear in an arbitrary piece of text.
 *
 * 🔴 REPORTED 2026-08-20: *"the word that was highlighted to explain should have an dotted
 * underlined like if its a new vocab term."* Everything needed for that existed and none of it was
 * connected. `markedTerms` above reads `block.terms`, which the INGESTION attaches — so a word only
 * ever wore an underline if a parser had nominated it, and a word the learner personally stopped on
 * wore nothing. `learner_lookups` has recorded every one of those stops for weeks and nothing read
 * the table back onto the screen.
 *
 * 🔴 THIS IS A DIFFERENT QUESTION FROM `markedTerms` AND DELIBERATELY NOT FOLDED INTO IT. That one
 * decides which words are WORTH offering, and every rule in it exists to mark FEWER things —
 * budgets, ceilings, one mark per 25 words — because a paragraph wearing six dotted underlines is
 * noise the eye learns to skip. This one marks what the learner has already ASKED about, which is
 * not a guess and needs no budget: they are the evidence.
 *
 * 🔴 WHOLE WORDS ONLY, and the boundary test is the same `WORD_CHAR` the rest of this file uses —
 * without it "ion" underlines the middle of "action" and the mark lands on a fragment.
 *
 * PURE. Offsets into the string exactly as given, for `splitByTerms`.
 */
export function lookedUpMarks(text: string, terms: readonly string[]): MarkedTerm[] {
  if (!text || terms.length === 0) return [];
  const found: MarkedTerm[] = [];
  const haystack = text.toLowerCase();

  for (const term of new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(term, from);
      if (at < 0) break;
      from = at + term.length;
      const before = text[at - 1];
      const after = text[at + term.length];
      if (before && WORD_CHAR.test(before)) continue;
      if (after && WORD_CHAR.test(after)) continue;
      found.push({ end: at + term.length, start: at, term: text.slice(at, at + term.length) });
    }
  }

  // 🔴 SORTED, AND OVERLAPS DROPPED, BECAUSE `splitByTerms` WALKS FORWARD AND SILENTLY SKIPS
  // ANYTHING THAT STARTS BEHIND ITS CURSOR. Two looked-up terms where one contains the other
  // ("mole" inside "molecule") would otherwise lose whichever was found second, at random.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: MarkedTerm[] = [];
  for (const mark of found) if (!kept.length || mark.start >= kept[kept.length - 1]!.end) kept.push(mark);
  return kept;
}
