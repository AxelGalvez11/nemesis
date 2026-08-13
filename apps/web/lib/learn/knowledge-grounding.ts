// Whether material the learner attached actually SUPPORTS a claim Nemesis already holds.
//
// 🔴 THIS IS A THIRD QUESTION, AND KEEPING IT APART FROM THE OTHER TWO IS THE WHOLE POINT.
// `canvas-knowledge.ts` already distinguishes two:
//
//     groundedReuse      "may I skip building?"        a SPEND question about MATERIAL
//     carriedTerritory   "what did this canvas know?"  a CONTINUITY question about the LEARNER
//     groundClaims       "does this source say it?"    a PROVENANCE question about a CLAIM   <- here
//
// Fusing the third into the first two is what produced N11. A canvas holding 24 model-written facts
// was given a spreadsheet stating five of them verbatim; because the canvas already had a territory,
// nothing ever read the document against those claims. Payload checksums were byte-identical,
// `updated_at` unmoved, provenance still `["model"]`. Enrichment ran and accrued nothing — the whole
// machinery for accrual (`mergedKnowledgePayload`) was correct and simply never reached.
//
// 🔴 IT IS DELIBERATELY MODEL-FREE, AND THAT IS THE ANTI-LAUNDERING PROPERTY RATHER THAN A COST
// SAVING. The obvious fix is to re-run `constructTerritory` with the new source and let identity
// convergence do the accrual. It does not work, and the measurement is already in this repo:
// `canvas-territory.ts` records one topic sampled twice producing 2 → 26 → 50 objects with ALL 48
// identity keys distinct. A model re-derives a given claim essentially never, so convergence would
// be incidental — the same upload would accrue provenance on one run and not the next, and the
// dominant output would be 24 fresh unanchored objects on a growth path nothing bounds.
//
// Worse, it would ask a model "does this document support this claim?", which is the laundering the
// owner named: a model that says yes has produced a citation nobody checked. Here the quote is
// COPIED OUT OF THE SOURCE. An anchor exists only where the source's own characters contain both
// halves of the claim, so a fabricated citation is unrepresentable rather than merely discouraged.
//
// 🔴 IT ADDS PROVENANCE AND NOTHING ELSE. It mints no knowledge, moves no identity, writes no
// evidence and never removes a way of knowing. `identityBasis` accepts only type, statement, pair,
// relation and relationKind — it cannot read an anchor — so no output of this file can move a
// knowledge key, orphan a demonstration, or change which objectives exist. That invariant is what
// makes running it on every open safe.

import {
  anchorInUnit,
  readableUnits,
  type CanonicalSourceAnchor,
  type CanonicalSourceUnit,
  type SourceContext,
} from "@/lib/sources/source-context";

import type { KnowledgeObject } from "./knowledge-types";

/**
 * How far apart the halves of a claim may sit and still count as the source STATING it.
 *
 * 🔴 THE PRECISION OF THE WHOLE LANE IS THIS NUMBER, SO IT IS NOT A TUNING KNOB. Co-occurrence
 * anywhere in a document is nearly meaningless — a lecture naming fifty terms would "support" every
 * pairing of them. Co-occurrence inside one sentence or one table row is what a source stating a
 * relationship actually looks like, in any field: `losartan (Cozaar)`, `chainring size → gear
 * ratio`, `mens rea — guilty mind`, a row of a parts table.
 *
 * 160 characters is about one sentence or one row. Structural, not subject-matter: it holds for a
 * law student's statute table and a mechanical engineer's tolerance chart alike.
 */
const MAX_CLAIM_SPAN = 160;

/** A letter or a digit in any script — so the boundary test works outside ASCII. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * The two things a claim relates, when it relates two nameable things.
 *
 * 🔴 NULL IS A REFUSAL, NOT AN EMPTY RESULT. A claim whose halves cannot be named cannot be located
 * in a document by this method, and guessing at one would put a citation on a claim the source may
 * never have made. Types this cannot read are simply not grounded, and stay honestly `["model"]`.
 */
function claimTerms(knowledge: KnowledgeObject): [string, string] | null {
  if (knowledge.type === "association" && knowledge.pair) {
    const { left, right } = knowledge.pair;
    return left.trim() && right.trim() ? [left.trim(), right.trim()] : null;
  }
  // A causal edge names its two ends in the author's own words, which is exactly what a document
  // stating that edge contains. Included because it costs nothing and the contract's §6 names
  // causal knowledge as one of the six kinds; it is not a claim that causal objects are minted yet.
  if (knowledge.type === "causal" && knowledge.relation) {
    const cause = knowledge.relation.cause.text.trim();
    const effect = knowledge.relation.effect.text.trim();
    return cause && effect ? [cause, effect] : null;
  }
  return null;
}

/** Is this occurrence a whole term rather than a fragment of a longer word? */
function isWholeTerm(haystack: string, at: number, length: number): boolean {
  const before = at > 0 ? haystack[at - 1]! : "";
  const after = at + length < haystack.length ? haystack[at + length]! : "";
  return !WORD_CHAR.test(before) && !WORD_CHAR.test(after);
}

/**
 * Every position at which `term` appears as a whole term.
 *
 * 🔴 WHOLE-TERM, BECAUSE SUBSTRING MATCHING FABRICATES CITATIONS. `ACE` occurs inside `spacer`,
 * `pH` inside `graph`, `ion` inside `station`. A plain `indexOf` would anchor a claim about ACE
 * inhibitors to a sentence about spacers and present it to the learner as their own lecture saying
 * so — a broken locator that passes every check, which this codebase already names as worse than no
 * locator at all.
 */
function occurrences(haystack: string, term: string): number[] {
  const found: number[] = [];
  let at = haystack.indexOf(term);
  while (at >= 0) {
    if (isWholeTerm(haystack, at, term.length)) found.push(at);
    at = haystack.indexOf(term, at + 1);
  }
  return found;
}

/**
 * The tightest span of `text` containing both terms, or null when they are never close enough.
 *
 * Returns the span's own bounds so the caller can copy the quote out of the source rather than
 * compose one.
 */
function closestSpan(text: string, first: string, second: string): { start: number; end: number } | null {
  const lower = text.toLowerCase();
  const firstAt = occurrences(lower, first.toLowerCase());
  const secondAt = occurrences(lower, second.toLowerCase());
  if (firstAt.length === 0 || secondAt.length === 0) return null;

  let best: { start: number; end: number } | null = null;
  for (const a of firstAt) {
    for (const b of secondAt) {
      const start = Math.min(a, b);
      const end = Math.max(a + first.length, b + second.length);
      if (end - start > MAX_CLAIM_SPAN) continue;
      if (!best || end - start < best.end - best.start) best = { end, start };
    }
  }
  return best;
}

/**
 * Where this source states this claim, or null.
 *
 * 🔴 THE QUOTE IS SLICED OUT OF THE UNIT'S OWN TEXT, WHICH IS WHAT MAKES IT CITABLE. `anchorInUnit`
 * then re-finds that slice to build the durable prefix/suffix context, so the anchor resolves after
 * a reparse — and, crucially, so a quote this function could not actually locate cannot be stored.
 *
 * 🔴 SEARCHED AGAINST `unit.text`, WHICH IS THE SAME STRING THE CITATION MACHINERY RESOLVES AGAINST.
 * `excerptsFromSourceContext` builds a canvas excerpt from exactly this text, and `resolveQuote`
 * searches exactly this text. Matching anywhere else — a table's cell array, a figure's caption
 * stored beside the text — would mint anchors that resolve to nothing on the surface that has to
 * render them. The honest consequence is stated rather than hidden: material whose text did not
 * survive parsing cannot be grounded here, because a citation to it could not be shown either.
 */
export function anchorForClaimInUnit(
  knowledge: KnowledgeObject,
  unit: CanonicalSourceUnit,
): CanonicalSourceAnchor | null {
  const terms = claimTerms(knowledge);
  if (!terms) return null;

  const text = unit.text ?? "";
  if (!text) return null;

  const span = closestSpan(text, terms[0], terms[1]);
  if (!span) return null;

  return anchorInUnit(unit, text.slice(span.start, span.end), span.start);
}

/**
 * The same claim, plus wherever these sources state it.
 *
 * 🔴 ACCUMULATING AND ORDER-STABLE. Existing anchors are kept and new ones appended, because a claim
 * met in two documents is known two ways and `waysOfKnowing` is explicit that provenance is never
 * exclusive. Duplicates are left to `mergedKnowledgePayload`, which already deduplicates by whole
 * anchor and is the one place that rule should live.
 *
 * 🔴 THE OBJECT IS COPIED, NEVER MUTATED. The caller holds these objects inside a stored territory
 * that is replayed on every open; mutating one would edit the cache in place and make "what did the
 * marker say?" depend on how many times it had been read.
 */
export function groundClaim(
  knowledge: KnowledgeObject,
  contexts: readonly SourceContext[],
): KnowledgeObject {
  const found: CanonicalSourceAnchor[] = [];
  for (const context of contexts) {
    for (const unit of readableUnits(context)) {
      // 🔴 A HEADING IS NOT A CITABLE CLAIM, AND SKIPPING IT HERE IS NOT COSMETIC — AN ANCHOR TO ONE
      // WOULD BE A DEAD LOCATOR. `readableUnits` admits headings (they have text); the canvas
      // excerpt builder deliberately does not, because a heading names what follows rather than
      // asserting it. So an anchor pointing at a heading unit resolves to no excerpt,
      // `groundCanonicalAnchor` returns null, and the learner gets a claim that says it has a
      // source and can never show it. The two lists have to agree about what is quotable.
      if (unit.type === "heading") continue;
      const anchor = anchorForClaimInUnit(knowledge, unit);
      // One unit stating a claim is enough to cite that unit. Continuing would add near-identical
      // anchors from the same block and tell the learner nothing more about where it came from.
      if (anchor) {
        found.push(anchor);
        break;
      }
    }
  }
  if (found.length === 0) return knowledge;
  return { ...knowledge, sourceAnchors: [...(knowledge.sourceAnchors ?? []), ...found] };
}

/**
 * Every claim, grounded in whatever the canvas's sources actually support.
 *
 * Same length and same order as the input: a claim no source mentions comes back untouched and
 * stays honestly model-known. This is the function the runtime calls, and it is pure, so the N11
 * reproduction is a repeatable check rather than a coin flip.
 */
export function groundClaims(
  claims: readonly KnowledgeObject[],
  contexts: readonly SourceContext[],
): KnowledgeObject[] {
  if (contexts.length === 0) return [...claims];
  return claims.map((claim) => groundClaim(claim, contexts));
}
