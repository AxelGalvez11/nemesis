// What a source teaches, as knowledge objects — the first real link in the chain.
//
// 🔴 IT READS `SourceContext` AND NOTHING ELSE. Not a PDF, not a row, not a string. Schedule
// extraction and knowledge extraction are siblings over one boundary, so there is exactly one
// `extractKnowledgeObjects(context)`, and a slide deck, a Word file, a lecture transcript and a
// scanned handout all arrive here as the same thing.
//
// 🔴 AND IT REFUSES RATHER THAN GUESSES. Every refusal below was measured against production, not
// imagined. The first version of this file was going to read "X: Y" out of prose; the structured
// documents in production say that would have produced "Memphis ↔ 102" (a room), "Friday Link ↔
// https://…" (a URL) and a shower of fragments from a grading table that had been flattened into
// a sentence. Confident nonsense is the worst possible output here, because a knowledge object is
// something a student then gets DRILLED on — a wrong one does not merely waste their time, it
// teaches them something false and then tests them on it.
//
// 🔴 THIS IS ONE LANE, NOT THE DEFINITION OF ASSOCIATION KNOWLEDGE. Associations legitimately live
// in glossaries, definition lists, bullet pairs, well-formed prose, structured textbook markup and
// recorded speech. Each needs its own extraction lane with its own evidence standard:
//
//     Association extraction
//     ├── structured-table lane    ← THIS FILE, built now, highest precision
//     ├── structured glossary lane ← later
//     └── semantic prose lane      ← later, conservative
//
// So "no table" means THIS LANE found nothing, and must never be recorded as "this document
// teaches no associations". The refusal reasons below are written to keep that distinction
// legible. Refusing to guess is a feature of the lane; do not weaken it to raise a count.

import {
  readableUnits,
  unitContent,
  type CanonicalSourceAnchor,
  type CanonicalSourceUnit,
  type SourceContext,
} from "@/lib/sources/source-context";

import { knowledgeIdentityKey, normalizeForIdentity, relationKindFromHeader } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

/** Stamped onto every object, so a corpus extracted under older rules can be found and redone
 *  rather than silently mixed in with a newer one. Bump it whenever the rules below change what
 *  comes out of the same document. */
export const EXTRACTION_VERSION = "association/2";

/** A pair whose cell is this long is a paragraph, not one half of an association.
 *
 *  🔴 GENEROUS ON PURPOSE. A real definition column routinely runs to a couple of sentences, and
 *  cutting at a tight limit would drop exactly the well-written glossaries this is for. What it
 *  catches is the other thing a two-column layout is used for — a page of running text set beside
 *  a margin note — where "the pair" would be an essay. */
const MAX_CELL_CHARS = 600;

/** Why an extraction produced less than the document appears to contain.
 *
 *  🔴 THE REFUSALS ARE THE OUTPUT, EVERY BIT AS MUCH AS THE OBJECTS. A caller that gets zero
 *  objects and no reason cannot tell "this document teaches no associations" from "the table was
 *  flattened before I saw it" — and those demand opposite responses. The first is a fact about the
 *  material; the second is a fact about our parser, and it is the one worth fixing. */
export type ExtractionRefusalReason =
  /** The stored parse kept no structure at all, so a grid could not have survived to be read. */
  | "degraded-parse"
  /** Structure survived, but the document contains no grid. */
  | "no-tables"
  /** A grid this lane does not read: three or more columns, where column 1 beside column 2 would
   *  be an arbitrary slice.
   *
   *  🔴 A RULE OF THIS EXTRACTOR, NOT A TRUTH ABOUT KNOWLEDGE. A `Drug | Brand | Class` table holds
   *  two perfectly real relationships, and a later lane that can say WHICH columns pair and why
   *  should extract both. What is refused here is guessing, not the table. */
  | "table-not-pairs"
  /** A grid of pairs, but every row was unusable — empty cells, or cells the length of essays. */
  | "table-rows-unusable";

export interface ExtractionRefusal {
  reason: ExtractionRefusalReason;
  /** One line of plain English, safe to show a person. */
  detail: string;
  /** The unit it concerns, when it concerns one. */
  unitId?: string;
}

/**
 * Whether the extractor did its whole job.
 *
 * 🔴 ZERO OBJECTS IS A SUCCESSFUL RESULT, AND THIS IS WHERE THAT IS SAID. "complete, count 0,
 * because this document has no grid" and "we could not read this document at all" are opposite
 * facts that produce the identical empty array — one is about the material, the other is about our
 * parser, and only the second is a bug to chase. Collapsing them is the same silent-degradation
 * failure this codebase keeps paying for, so the outcome is stated rather than left to be guessed
 * from a length.
 */
export type ExtractionOutcome =
  /** Every lane ran over everything it was given. The count may still be 0. */
  | "complete"
  /** The lane ran, but over less than the document contains — structure did not survive its parse. */
  | "degraded"
  /** Nothing readable at all; no extraction was possible. */
  | "failed";

export interface KnowledgeExtraction {
  outcome: ExtractionOutcome;
  objects: KnowledgeObject[];
  refusals: ExtractionRefusal[];
}

/**
 * Every association this source teaches, and every reason one was not taken.
 *
 * Deterministic and model-free. Not because a model could not help — it could, on prose — but
 * because the first end-to-end proof of this chain has to be one whose output can be checked
 * against the document by eye. A model in the loop here would make every downstream failure
 * ambiguous between "the architecture is wrong" and "the model had a bad day".
 */
export function extractKnowledgeObjects(context: SourceContext): KnowledgeExtraction {
  const objects: KnowledgeObject[] = [];
  const refusals: ExtractionRefusal[] = [];

  if (context.quality === "failed") {
    return {
      objects,
      outcome: "failed",
      refusals: [{
        detail: "Nothing readable survived this document's parse, so nothing could be extracted from it.",
        reason: "degraded-parse",
      }],
    };
  }

  // 🔴 STRUCTURE SURVIVED OR IT DID NOT, AND THAT DECIDES THE OUTCOME, NOT THE COUNT. A document
  // with real structure and no grid was read completely and teaches this lane nothing. A document
  // whose structure was flattened was read INCOMPLETELY, and its grids may well have existed.
  const structured = context.capabilities.semanticUnits;
  const tables = readableUnits(context).filter((unit) => unitContent(unit).kind === "table");
  if (tables.length === 0) {
    return {
      objects,
      outcome: structured ? "complete" : "degraded",
      refusals: [{
        detail: structured
          ? "This document's stored structure contains no table, so this lane found nothing to read pairs from."
          : "Only flat text survived this document's parse, so any table it had was flattened before extraction could see it.",
        reason: structured ? "no-tables" : "degraded-parse",
      }],
    };
  }

  for (const unit of tables) {
    const outcome = pairsFromTable(unit);
    if (outcome.refusal) refusals.push(outcome.refusal);
    objects.push(...outcome.objects);
  }

  // Every grid the document has was examined. A refusal here is a statement about a particular
  // table's shape, not evidence that anything was missed.
  return { objects, outcome: structured ? "complete" : "degraded", refusals };
}

function pairsFromTable(
  unit: CanonicalSourceUnit,
): { objects: KnowledgeObject[]; refusal?: ExtractionRefusal } {
  // 🔴 ASKED, NOT ASSUMED. Reading `unit.table` directly here would be the same shape as the bug
  // that deleted every grid in the corpus; `unitContent` is the one place that answers this.
  const content = unitContent(unit);
  if (content.kind !== "table") return { objects: [] };
  const table = { headerRows: content.headerRows, rows: content.rows };
  const width = Math.max(0, ...table.rows.map((row) => row.length));

  // 🔴 EXACTLY TWO COLUMNS, AND THE STRICTNESS IS THE POINT. A three-column schedule — date,
  // topic, room — would yield "8-17 ↔ Exam 1", which is a calendar entry wearing an association's
  // clothes, and a student would then be drilled on it. When a wider grid genuinely holds pairs,
  // the right answer is a rule that can say WHICH two columns and why, not a default to the first
  // two. Refusing until then costs a missed glossary; guessing costs a false one.
  if (width !== 2) {
    return {
      objects: [],
      refusal: {
        detail: `A ${width}-column table is a matrix rather than a list of pairs, so no association was taken from it.`,
        reason: "table-not-pairs",
        unitId: unit.id,
      },
    };
  }

  // Header rows are skipped when the format actually stated them. When it stated none, every row
  // is data: promoting row 0 to a header on a hunch would silently delete a real pair from every
  // grid that starts with one.
  const dataRows = table.rows.slice(Math.max(0, table.headerRows));
  // What the grid called its own columns, when anything knows. Part of every key below, so two
  // sources that agree on the relationship converge and two that do not stay apart.
  //
  // 🔴 `columns` FIRST, AND IT IS NOT THE SAME AS THE HEADER ROW. A table split across pages prints
  // its header once; every continuation fragment has `headerRows: 0` and would otherwise be
  // `unstated` — unable to converge with the fragment that did print the names, even though they
  // are one table. `columns` carries the names onto those fragments, so reading it first is what
  // makes a long glossary converge with itself.
  // 🔴 THE COLUMN NAMES ARE KEPT SIDE BY SIDE, NOT ONLY SORTED INTO A RELATION KIND. The relation
  // kind is order-independent on purpose, so `brand|generic` cannot say WHICH value is the brand —
  // and a capability built on that could only speak positionally, which is a fact about typesetting
  // rather than about what the learner is asked to produce.
  const columnNames = content.columns?.length ? content.columns : table.headerRows > 0 ? table.rows[0] : undefined;
  const leftRole = columnNames?.[0] ? normalizeForIdentity(columnNames[0]) : null;
  const rightRole = columnNames?.[1] ? normalizeForIdentity(columnNames[1]) : null;
  const relationKind = relationKindFromHeader(columnNames);
  const objects: KnowledgeObject[] = [];

  for (const [index, row] of dataRows.entries()) {
    const left = (row[0] ?? "").trim();
    const right = (row[1] ?? "").trim();
    if (!left || !right) continue;
    if (left.length > MAX_CELL_CHARS || right.length > MAX_CELL_CHARS) continue;
    // A row whose two cells are the same says nothing; it is usually a spanned heading that the
    // grid reader filled across.
    if (left === right) continue;

    const pairId = `${unit.id}:r${index + 1}`;
    const object: KnowledgeObject = {
      derivation: "table-row",
      extractionVersion: EXTRACTION_VERSION,
      id: pairId,
      pair: {
        id: pairId,
        left,
        right,
        ...(leftRole && rightRole ? { leftRole, rightRole } : {}),
        // The section this grid sat in, used ONLY to group items during first encoding — and
        // dropped afterwards, because answering from the heading is not retrieval.
        ...(headingOf(unit) ? { groupLabel: headingOf(unit)! } : {}),
      },
      // 🔴 THE ANCHOR IS BUILT FROM THE CELLS, NOT FROM THE RENDERED GRID. Quoting the whole table
      // would make every row in it resolve to the same place, so "show me where this came from"
      // would highlight the table rather than the row.
      sourceAnchors: [anchorForRow(unit, left, right)],
      statement: `${left} — ${right}`,
      type: "association",
      ...(relationKind ? { relationKind } : {}),
    };
    objects.push({ ...object, identityKey: knowledgeIdentityKey(object) });
  }

  if (objects.length === 0) {
    return {
      objects,
      refusal: {
        detail: "This table has two columns but no row that could be read as a usable pair.",
        reason: "table-rows-unusable",
        unitId: unit.id,
      },
    };
  }

  return { objects };
}

function headingOf(unit: CanonicalSourceUnit): string | null {
  const path = unit.anchor.headingPath;
  return path && path.length > 0 ? path[path.length - 1]! : unit.unitLabel ?? null;
}

/**
 * Where one row sits, in a form that survives the document being reparsed.
 *
 * The quote is the row's own cue rather than the whole grid, so two rows of one table anchor to
 * two different places. `prefix`/`suffix` are left to `quoteAnchor`'s ordinary rules via the
 * rendered text, which is what a reparse will also produce.
 */
function anchorForRow(unit: CanonicalSourceUnit, left: string, right: string): CanonicalSourceAnchor {
  const content = unitContent(unit);
  const rendered = content.kind === "table" ? content.rendered : content.kind === "text" ? content.text : "";
  const at = rendered.indexOf(left);
  return {
    ...unit.anchor,
    quote: {
      exact: left,
      // The other half of the pair is the disambiguator: a term can appear in several rows of a
      // grid, and its own definition is what tells them apart. Kept short so the anchor does not
      // store the table twice.
      ...(at >= 0 ? { suffix: rendered.slice(at + left.length, at + left.length + right.length + 8) } : {}),
    },
  };
}
