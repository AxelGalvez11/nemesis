/**
 * The smallest piece of a learner's material that a single teaching turn actually needs.
 *
 * 🔴🔴 THE PROBLEM, MEASURED IN THE CODE RATHER THAN GUESSED AT. `groundingBlock` bounds itself at
 * `MAX_GROUNDING_CHARS = 120_000` — roughly thirty thousand tokens — and nine of the twelve prompt
 * builders in `canvas-prompts.ts` call it. Three of those nine are once-per-document jobs that
 * genuinely need the whole lecture: writing the lesson, extracting the knowledge territory,
 * extracting causal structure. The other six run EVERY TURN. Correcting one wrong answer about one
 * objective shipped the entire lecture, and then shipped it again for the next answer, and again
 * for the one after that.
 *
 * The owner's rule names the fix exactly: *"the normal teaching call should receive the smallest
 * useful context — current cognitive objective, relevant knowledge neighbourhood, prerequisite
 * relationships, relevant learner evidence, minimal source excerpts needed to ground the action."*
 *
 * 🔴 THE SELECTION IS DETERMINISTIC AND COSTS NOTHING. *"Models interpret ambiguity. Code handles
 * certainty."* An embedding call or a model-driven "which excerpts matter" step would spend money on
 * every turn to save money on every turn, and would introduce a second thing that can be wrong. What
 * is used instead is a fact the document already carries:
 *
 *   1. THE CITATIONS THE PAGE ALREADY MADE. Every block on the Canvas declares the excerpt ids it
 *      was built from (`CITATION_RULE`, enforced at generation time). The blocks that teach this
 *      objective therefore NAME the excerpts that ground it. This is not a heuristic — it is the
 *      page telling us where it came from, and it is exact.
 *   2. THE NEIGHBOURS OF THOSE EXCERPTS. Excerpts are minted in reading order, so the piece before
 *      and after a cited one is the sentence that set it up and the sentence that follows from it.
 *      A prerequisite usually sits immediately before the thing it is a prerequisite for.
 *   3. WHAT THE TURN IS ABOUT, BY VOCABULARY. The objective's label, the question asked and the
 *      learner's own words, matched against excerpt text with `contentWords` — the SAME matcher
 *      course filing and retrieval already use, so a third rule cannot drift from the first two.
 *
 * 🔴 STRUCTURAL, NEVER SUBJECT MATTER. There is no topic list and there must never be one. A
 * citation is a citation in a statute and in a stress-strain derivation; reading order is reading
 * order in a nursing handbook and in a Latin grammar; and `contentWords` compares the learner's own
 * words against their own material, which is what makes it work identically for every field.
 *
 * 🔴 AND WHEN IT CANNOT FIND ENOUGH, IT SAYS SO RATHER THAN GUESSING. A turn whose blocks carry no
 * citations at all — topic-first teaching, or a page written before citations were required — gets
 * the vocabulary match and, failing that, falls back to the front of the material. Silence about a
 * truncation is the defect the coverage record exists to prevent, so the omission is stated in the
 * prompt exactly as `groundingBlock` states its own.
 *
 * PURE. No I/O, no model, no environment.
 */

import { contentWords } from "@nemesis/shared";

import type { CanvasBlock, CanvasSource, SourceExcerpt } from "./canvas-model";

/**
 * How much material one ordinary teaching turn may carry.
 *
 * 🔴 SIZED FROM WHAT THE TURN IS FOR, NOT FROM WHAT THE MODEL WOULD ACCEPT. A correction rewrites
 * two or three blocks about one objective. The evidence it needs is the handful of excerpts those
 * blocks were built from plus their immediate neighbourhood; a lecture's worth of unrelated
 * material does not make that correction better, and 30,000 tokens of it is paid for on every
 * answer a learner gives.
 *
 * Twelve thousand characters is roughly three thousand tokens — about fifteen excerpts at the
 * typical size `buildExcerpts` produces, or five at `MAX_EXCERPT_CHARS`. Measured against the real
 * canvases in production by `scripts/focus-material-measure.mts`.
 */
export const TURN_GROUNDING_CHARS = 12_000;

/** Excerpts on either side of a cited one that come along with it. */
export const NEIGHBOUR_RADIUS = 1;

/** What the turn is about, in whatever the caller happens to hold. */
export interface FocusQuery {
  /** The objective, question, learner answer — anything that says what this turn is for. */
  readonly texts: readonly string[];
  /** The blocks the turn may change. Their citations are the strongest signal there is. */
  readonly scope: readonly CanvasBlock[];
  /** Characters of material this turn may carry. */
  readonly budget?: number;
}

/** Why an excerpt was included. Recorded so a selection can be explained, never invented. */
export type FocusReason = "cited" | "neighbour" | "vocabulary" | "opening";

export interface FocusedSource {
  readonly source: CanvasSource;
  readonly excerpts: readonly SourceExcerpt[];
}

export interface FocusedMaterial {
  readonly sources: readonly FocusedSource[];
  /** Excerpts left out. Non-zero means the prompt must say so. */
  readonly omitted: number;
  /** Characters selected, so a caller can measure the saving without re-deriving it. */
  readonly chars: number;
  /** Characters the unfocused path would have sent. */
  readonly wholeChars: number;
  readonly byReason: Readonly<Record<FocusReason, number>>;
}

/** Every excerpt id this set of blocks says it was built from. PURE. */
export function citedExcerptIds(scope: readonly CanvasBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const block of scope) {
    for (const ref of block.sourceRefs ?? []) {
      if (ref?.excerptId) ids.add(ref.excerptId);
    }
  }
  return ids;
}

/**
 * Choose the material for one turn. PURE.
 *
 * 🔴 THE ORDER OF THE RUNGS IS THE ARGUMENT. Citations are what the page itself says grounds this
 * idea, so they are taken first and are never dropped for budget while anything weaker is kept.
 * Neighbours come next because reading order carries prerequisite structure. Vocabulary is last
 * because it is the only rung that is a guess, and it earns its place only by being free.
 *
 * 🔴 READING ORDER IS RESTORED AT THE END. Selection ranks; presentation must not. Handing a model
 * excerpts in relevance order would put the conclusion before its premise and quietly teach it that
 * the document says things in that sequence.
 */
export function focusMaterial(sources: readonly CanvasSource[], query: FocusQuery): FocusedMaterial {
  const budget = query.budget ?? TURN_GROUNDING_CHARS;
  const cited = citedExcerptIds(query.scope);
  const asked = contentWords(query.texts.join(" "));

  const wholeChars = sources.reduce(
    (n, source) => n + source.excerpts.reduce((m, excerpt) => m + excerpt.text.length, 0),
    0,
  );

  // Rank every excerpt once, keeping its position so reading order can be restored.
  interface Ranked {
    sourceIndex: number;
    position: number;
    excerpt: SourceExcerpt;
    reason: FocusReason;
    rank: number;
  }
  const ranked: Ranked[] = [];

  sources.forEach((source, sourceIndex) => {
    const citedPositions = new Set<number>();
    source.excerpts.forEach((excerpt, position) => {
      if (cited.has(excerpt.id)) citedPositions.add(position);
    });

    source.excerpts.forEach((excerpt, position) => {
      if (citedPositions.has(position)) {
        ranked.push({ excerpt, position, rank: 0, reason: "cited", sourceIndex });
        return;
      }
      const nearCited = [...citedPositions].some(
        (cite) => Math.abs(cite - position) <= NEIGHBOUR_RADIUS,
      );
      if (nearCited) {
        ranked.push({ excerpt, position, rank: 1, reason: "neighbour", sourceIndex });
        return;
      }
      // 🔴 THE SHARED MATCHER, NOT A FOURTH COPY OF ONE. `contentWords` already decides what a
      // distinctive word is, with a stopword list written to be field-agnostic; a private rule here
      // would start treating some discipline's filler as meaningful and the two would disagree
      // about the same sentence.
      let shared = 0;
      if (asked.size > 0) {
        for (const word of contentWords(excerpt.text)) {
          if (asked.has(word)) shared += 1;
        }
      }
      if (shared > 0) {
        // Negative so a stronger overlap sorts earlier within the rung.
        ranked.push({ excerpt, position, rank: 2 - Math.min(shared, 99) / 100, reason: "vocabulary", sourceIndex });
      }
    });
  });

  // 🔴 A TURN WITH NOTHING TO GO ON STILL GETS SOMETHING. Topic-first teaching, or a page written
  // before citations were required, can produce no citations and no vocabulary hit at all. Sending
  // no material would make the model write from its own general knowledge while the prompt insists
  // it cite the material — the exact shape that produces an invented citation.
  if (ranked.length === 0) {
    sources.forEach((source, sourceIndex) => {
      source.excerpts.forEach((excerpt, position) => {
        ranked.push({ excerpt, position, rank: 3 + position / 10_000, reason: "opening", sourceIndex });
      });
    });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.sourceIndex - b.sourceIndex || a.position - b.position);

  const chosen = new Set<string>();
  const byReason: Record<FocusReason, number> = { cited: 0, neighbour: 0, opening: 0, vocabulary: 0 };
  let spent = 0;
  let omitted = 0;
  for (const entry of ranked) {
    const cost = entry.excerpt.text.length;
    if (spent + cost > budget && chosen.size > 0) {
      omitted += 1;
      continue;
    }
    chosen.add(entry.excerpt.id);
    byReason[entry.reason] += 1;
    spent += cost;
  }
  // Excerpts that never ranked at all are omissions too — the prompt must not imply it saw them.
  const rankedIds = new Set(ranked.map((entry) => entry.excerpt.id));
  for (const source of sources) {
    for (const excerpt of source.excerpts) {
      if (!rankedIds.has(excerpt.id)) omitted += 1;
    }
  }

  const focused: FocusedSource[] = [];
  for (const source of sources) {
    const kept = source.excerpts.filter((excerpt) => chosen.has(excerpt.id));
    if (kept.length > 0) focused.push({ excerpts: kept, source });
  }

  return { byReason, chars: spent, omitted, sources: focused, wholeChars };
}
