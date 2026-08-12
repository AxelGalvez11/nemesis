// Whether the policy runtime may own a canvas — a capability boundary, and nothing else.
//
// 🔴 THIS IS NOT THE POLICY, AND IT MUST NEVER BECOME PART OF IT. `chooseNextTeachingAction`
// decides what to do about one objective from what a learner has demonstrated. This decides
// something categorically different and prior: whether this runtime is entitled to the surface at
// all. Nothing here reads evidence, nothing here is a judgement about a person, and nothing here
// may ever be given a reason to.
//
// 🔴 AND IT ROUTES ON WHAT THE SOURCE ACTUALLY CONTAINS, NEVER ON WHAT IT LOOKS LIKE. No file
// types, no titles, no "this smells like flashcards". The question asked of every canvas is the
// same one: of the units this document is made of, how many did supported knowledge actually come
// out of — and were there any it did not.
//
// ── Why the rule is all-or-nothing ──────────────────────────────────────────────────────────────
//
// Ownership today is whole-page: an owned canvas shows the policy's question and nothing else. So
// owning a canvas whose material this runtime only partly covers does not degrade the lesson, it
// DELETES the rest of the document from the learner's reach — silently, with no error and no
// visible gap. A forty-page lecture containing one glossary table would become a single flashcard.
//
// That asymmetry decides the threshold. Refusing a canvas we could have taught costs a learner the
// new runtime for a while, and is visible in these numbers. Taking one we cannot fully teach costs
// them material they attached and never sees again, and is visible nowhere. So:
//
//     unrepresentedSubstantiveUnits === 0
//
// with no percentage anywhere, and every uncertainty resolved toward refusing.
//
// 🔴 THE RIGHT FIX FOR MIXED MATERIAL IS NOT A LOOSER THRESHOLD. It is for the canvas to present
// policy-generated tasks ALONGSIDE its document instead of being replaced by them. Until that
// exists, widening this is how a lecture disappears.

import {
  readableUnits,
  unitContent,
  type CanonicalSourceUnit,
  type SourceContext,
} from "@/lib/sources/source-context";

import type { ExtractionOutcome } from "./knowledge-extraction";
import type { KnowledgeObject } from "./knowledge-types";
import { objectivesForKnowledge } from "./learning-objective";

/**
 * The knowledge this runtime can actually teach.
 *
 * 🔴 THE SUPPORTED SLICE IS AN ASSOCIATION WITH A RECALL OBJECTIVE, AND WIDENING IT IS WHAT
 * SHIPPING THE NEXT KNOWLEDGE TYPE MEANS — not a flag flip. A causal or procedural object has
 * nothing here, and the canvas holding it must keep the runtime it already had.
 *
 * Asked at the KNOWLEDGE level rather than of stored objectives, because ownership has to be
 * decided before anything is written: a canvas the policy will not own should not leave rows
 * behind in the learner's knowledge tables.
 */
export function supportedKnowledge(objects: readonly KnowledgeObject[]): KnowledgeObject[] {
  return objects.filter(
    (object) =>
      object.type === "association" && objectivesForKnowledge(object).some((o) => o.capability === "recall"),
  );
}

/** What one source is made of, and how much of it supported knowledge accounts for. */
export interface UnitCoverage {
  /** Readable units carrying teachable content. Headings are excluded — see `isStructural`. */
  substantive: number;
  /** Of those, the ones supported knowledge was taken from IN FULL. */
  represented: number;
  /** Of those, the ones it was not. 🔴 THE OWNERSHIP NUMBER. */
  unrepresented: number;
}

export interface CanvasCoverage extends UnitCoverage {
  /** Every source the canvas holds, durable or not. */
  sourcesTotal: number;
  /**
   * How many were read all the way to a coverage count.
   *
   * 🔴 A SOURCE THAT WAS NEVER READ IS THE DANGEROUS CASE, BECAUSE IT CONTRIBUTES NOTHING TO THE
   * COUNTS ABOVE. An ephemeral attachment has no library row, so it never enters extraction at all
   * — and a canvas holding a durable glossary beside an ephemeral lecture would otherwise report
   * `unrepresented: 0` and be owned, hiding the lecture. Ownership requires this to equal
   * `sourcesTotal`; the unit counts alone cannot see the difference.
   */
  sourcesAccounted: number;
}

export function emptyCoverage(sourcesTotal: number): CanvasCoverage {
  return { represented: 0, sourcesAccounted: 0, sourcesTotal, substantive: 0, unrepresented: 0 };
}

/** One source's counts folded into the canvas's. Immutable — a new total, never a mutation. */
export function withSourceCoverage(total: CanvasCoverage, source: UnitCoverage): CanvasCoverage {
  return {
    represented: total.represented + source.represented,
    sourcesAccounted: total.sourcesAccounted + 1,
    sourcesTotal: total.sourcesTotal,
    substantive: total.substantive + source.substantive,
    unrepresented: total.unrepresented + source.unrepresented,
  };
}

/**
 * Structure, as opposed to content.
 *
 * 🔴 DELIBERATELY THE SHORTEST LIST THAT CAN BE RIGHT. A heading names a section; it is navigation,
 * and a document is not unteachable because it has section titles. Everything else that survived
 * `readableUnits` is treated as material a learner could be taught from — including figures with
 * captions, equations and list items, none of which this runtime can teach today, all of which
 * therefore block ownership.
 *
 * That is the intended direction of error. Every additional "this doesn't really count" rule is
 * another place to be wrong in the direction that hides someone's material, so there is one.
 */
function isStructural(unit: CanonicalSourceUnit): boolean {
  return unit.type === "heading";
}

/**
 * How many supported knowledge objects a unit would yield if it were covered completely.
 *
 * 🔴 THE POINT IS "COMPLETELY", NOT "AT ALL". A grid whose rows hold essay-length cells, or whose
 * third column makes its pairs ambiguous, yields fewer objects than it has rows — and the rows it
 * skipped are real content a learner attached and would never be shown. Counting a table as
 * covered because SOMETHING came out of it is how a two-hundred-row glossary becomes four cards.
 *
 * `null` means "no way to say", which is not zero: a paragraph has no row count, and a paragraph
 * this lane cannot read is exactly the material ownership must refuse. Only a grid can answer.
 */
function expectedFrom(unit: CanonicalSourceUnit): number | null {
  const content = unitContent(unit);
  if (content.kind !== "table") return null;
  // The same slice `pairsFromTable` takes: header rows are not data, and a format that stated none
  // has data in every row.
  return Math.max(0, content.rows.length - Math.max(0, content.headerRows));
}

/** Which unit a knowledge object came out of, counted per unit. */
function takenByUnit(objects: readonly KnowledgeObject[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const unitId = object.sourceAnchors?.[0]?.unitId;
    if (!unitId) continue;
    counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
  }
  return counts;
}

/**
 * What one source contains, and how much of it supported knowledge accounts for.
 *
 * Pure: it reads the extraction boundary and the objects that came out of it, and touches nothing
 * else. `objects` is filtered to the supported slice here rather than by the caller, so a future
 * knowledge type cannot start counting as coverage before the runtime can teach it.
 */
export function coverageOfSource(input: {
  context: SourceContext;
  objects: readonly KnowledgeObject[];
}): UnitCoverage {
  const taken = takenByUnit(supportedKnowledge(input.objects));
  let substantive = 0;
  let represented = 0;

  for (const unit of readableUnits(input.context)) {
    if (isStructural(unit)) continue;
    substantive += 1;
    const expected = expectedFrom(unit);
    if (expected !== null && expected > 0 && (taken.get(unit.id) ?? 0) === expected) represented += 1;
  }

  return { represented, substantive, unrepresented: substantive - represented };
}

/**
 * Why a canvas is not owned. Stated rather than left to be guessed from a `false`, because these
 * are five different situations and only some of them are ours to fix.
 */
export type OwnershipRefusal =
  /** A source was never read to a coverage count — no library row, or the parse could not be
   *  loaded. What it contains is unknown, and unknown is not empty. */
  | "source-not-read"
  /** Extraction ran over less than the document holds: structure did not survive its parse, so a
   *  grid may have been flattened out of sight before this could count it. */
  | "extraction-incomplete"
  /** Nothing teachable was readable anywhere. There is no material to own. */
  | "nothing-teachable"
  /** The canvas holds material no supported knowledge type covers. THE ordinary refusal, and the
   *  one that keeps a lecture reachable. */
  | "unsupported-content";

export interface OwnershipDecision {
  owns: boolean;
  refusal: OwnershipRefusal | null;
  coverage: CanvasCoverage;
}

/**
 * May the policy runtime own this whole canvas?
 *
 * Every clause is a separate way of not knowing enough to take the page, checked in the order that
 * makes the reason most specific. There is no threshold and no proportion anywhere: the last
 * clause is an equality with zero.
 */
export function policyOwnsCanvas(input: {
  coverage: CanvasCoverage;
  outcome: ExtractionOutcome | "no-durable-source";
}): OwnershipDecision {
  const { coverage } = input;
  const refuse = (refusal: OwnershipRefusal): OwnershipDecision => ({ coverage, owns: false, refusal });

  // 🔴 FIRST, BECAUSE IT IS THE ONE THE UNIT COUNTS CANNOT SEE. Everything below reasons about
  // units that were read; a source that was never read has none, and would otherwise pass silently.
  if (coverage.sourcesTotal === 0 || coverage.sourcesAccounted !== coverage.sourcesTotal) {
    return refuse("source-not-read");
  }
  if (input.outcome !== "complete") return refuse("extraction-incomplete");
  if (coverage.substantive === 0) return refuse("nothing-teachable");
  if (coverage.unrepresented > 0) return refuse("unsupported-content");

  // `represented === substantive > 0` follows, so a canvas can never be owned with nothing to ask.
  return { coverage, owns: true, refusal: null };
}
