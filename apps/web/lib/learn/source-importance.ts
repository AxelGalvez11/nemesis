// How prominently the SOURCE treats one piece of knowledge — and, just as often, that we cannot say.
//
// 🔴 PROMINENCE IN THE SOURCE, NEVER WORTH LEARNING. This is the distinction the whole file turns
// on. `central` here means *the document foregrounds this*: it returns to it, or it gave it a
// heading, or it emphasised it. It does NOT mean a learner should spend a minute on it, and nothing
// downstream may read it that way. Measured on the owner's own PHCY-2114 syllabus (2026-08-15): the
// material that document foregrounds most is its course schedule — `Mycobacteria — Instructor: Dr.
// Morton`, `Memphis`, `Dr. Peters`, `Quiz`. Those readings are CORRECT. That syllabus really does
// return to its campuses and its instructors more than to anything else it contains. Whether any of
// it is worth teaching is a question about knowledge TYPE and about what the learner needs, and both
// live downstream of perception. Perception's job is to say what the document did.
//
// 🔴 STRUCTURAL ONLY, NEVER SUBJECT MATTER — the standing rule. Nothing here knows what a drug, a
// statute or an alloy is. Every observation below is a fact about the document's own shape: did the
// text come back to this term, did the author promote it to a heading, did the recovered runs mark it
// emphasised. The same three questions read a pharmacology deck, a contracts casebook and a
// machine-design chapter, because none of them is about the subject.
//
// 🔴 ABSENT MEANS NOT OBSERVED, AND NEVER A MIDDLE VALUE. A reading is refused with a named reason
// far more often than it is given, and that is the correct behaviour rather than a coverage problem.
// Six structural fields have already died in this codebase by being optional and quietly absent; the
// failure available HERE is worse and quieter — a knowledge object marked `peripheral` because the
// parser could not trace its cue would be taught less, and the learner would never be told that the
// reason was us.
//
// 🔴 AND THE BLIND SPOTS TRAVEL WITH EVERY READING FROM A DOCUMENT. The floor rule: only LOCATED
// loss attributes to one unit; unlocated loss degrades all of them. Emphasis is the live case —
// measured across production on 2026-08-15, bold survived in 451 of 999 units of a .pptx and in
// 0 of 149 and 0 of 275 units of the two PDFs. So on a PDF, "not emphasised" is unsayable, and every
// reading from it carries `emphasis-not-recovered` rather than quietly scoring one signal fewer.

import type { CanonicalSourceUnit, SourceContext } from "@/lib/sources/source-context";
import { unitContent } from "@/lib/sources/source-context";

import type { KnowledgeObject } from "./knowledge-types";

/**
 * One structural question asked of the document about one piece of knowledge.
 *
 * 🔴 THREE, AND THE LIST IS SHORT BECAUSE THE OTHERS WERE MEASURED AND REFUSED. See
 * `REFUSED_SIGNALS` at the foot of this file: heading depth, section length and figure
 * cross-reference were each tried against the two production documents and each either failed to
 * separate anything or actively pointed the wrong way. A signal that cannot discriminate is not
 * neutral — it manufactures agreement between the ones that can.
 */
export type ImportanceSignal =
  /**
   * The source comes back to this term in another unit of running text.
   *
   * 🔴 NON-HEADING UNITS ONLY, WHICH IS WHAT MAKES THIS INDEPENDENT OF THE NEXT ONE. A term named in
   * a heading is trivially also "found in another unit", so counting headings here would let one
   * piece of evidence fire two signals and call the result corroborated. Disjoint by construction,
   * not by anyone remembering.
   */
  | "returned-to"
  /**
   * The term appears in a heading.
   *
   * 🔴 APPEARS IN, WHICH IS DELIBERATELY WEAKER THAN "A HEADING NAMES IT", and the difference is
   * visible in the production evidence: `A1C` scores two heading hits off `Glycosylated Hemoglobin
   * (A1C)` and `A1C Goals in Diabetes`, where it is a parenthetical in one and a modifier in the
   * other. Deciding a heading is ABOUT a term rather than merely containing it needs to know which
   * word of a title carries the topic, and that is subject-matter reading — the thing this file
   * refuses everywhere else. Containment is the honest weaker question, which is part of why two
   * observations have to agree before anything is called central.
   */
  | "named-as-a-heading"
  /** The recovered text marks this term emphasised where it sits. */
  | "carries-emphasis";

/** What one signal saw. */
export interface ImportanceObservation {
  signal: ImportanceSignal;
  /** Whether this observation found the source foregrounding the term. */
  foregrounded: boolean;
  /** The count behind a counting signal — how many other units, how many headings. */
  count?: number;
}

/** Why a signal could not be asked of this document at all. */
export type ImportanceBlindSpotReason =
  /**
   * No unit anywhere in this document carries a recovered emphasis run.
   *
   * 🔴 THIS IS A FACT ABOUT THE PARSE, NOT ABOUT THE AUTHOR. PDF text extraction recovers no bold at
   * all in production today; .pptx does. "Nothing is emphasised here" and "we cannot see emphasis
   * here" are opposite claims, and only the second one is true of a PDF.
   */
  | "emphasis-not-recovered"
  /** The document has no heading units, so nothing could have been promoted to one. */
  | "no-headings-in-document";

export interface ImportanceBlindSpot {
  signal: ImportanceSignal;
  reason: ImportanceBlindSpotReason;
  /** One line of plain English, safe to show a person. */
  detail: string;
}

/**
 * How prominently the source treats this, on the evidence that was available.
 *
 * 🔴 THE ORDINAL IS DERIVED FROM THE OBSERVATIONS AND CARRIES THEM. A single opaque grade is a grade
 * nobody can debug and nobody can correct — the same reasoning `next-action-value.ts` gives for
 * carrying `SelectionReason` out with a score. "Why is this central?" must be answerable from the
 * value itself, not from re-running the function.
 */
export interface SourceImportance {
  /**
   * How much the DOCUMENT foregrounds this. Never how much it is worth learning.
   *
   *   central     two or more independent observations found the source foregrounding it
   *   supporting  exactly one did
   *   peripheral  every available observation looked and found none
   *
   * 🔴 `central` NEEDS CORROBORATION, AND THAT IS NOT SYMMETRY FOR ITS OWN SAKE. Measured on the
   * production syllabus: ranked on recurrence alone, the top terms are `Quiz`, `Instructor`,
   * `Campus`, `Memphis` and `Dr. Peters`. Every one of them genuinely recurs, so the count is not
   * wrong — but a standing built on one count would promote a campus name above a diagnostic
   * threshold, and a controller reading it would reorder a learner's time accordingly. One
   * observation is an observation; two agreeing is a reading.
   */
  standing: "central" | "supporting" | "peripheral";
  /** Every observation that could be made, and what it saw. The trace. */
  observations: readonly ImportanceObservation[];
  /**
   * What could NOT be observed in this document, and why.
   *
   * 🔴 CARRIED ON EVERY READING FROM A DOCUMENT THAT HAS ONE, INCLUDING THE CONFIDENT ONES. The
   * floor rule: unlocated loss degrades every unit rather than disappearing when a reading happens to
   * come out well. A `peripheral` on a PDF is `peripheral` on evidence that could never include
   * emphasis, and whoever acts on it is entitled to know that before deciding to teach it less.
   */
  blindSpots: readonly ImportanceBlindSpot[];
}

/** Why no reading was given. */
export type ImportanceRefusalReason =
  /** The object names no unit, so there is nothing to locate it against in the document. */
  | "no-anchor"
  /** The anchor names a unit this document does not contain — a reading would be about nothing. */
  | "unit-not-in-document"
  /**
   * The cue is too short, or has no letters in it, to be traced through the document.
   *
   * 🔴 REFUSED RATHER THAN COUNTED AS ZERO, AND THE COVERAGE COST IS THE POINT. Measured: 25 of the
   * 46 objects from the production diabetes deck have a bare number as their cue — `5`, `6`, `7`
   * from an A1C conversion table. Searching a document for `5` finds page numbers and other tables,
   * so a count over it is noise wearing evidence's clothes; and scoring it zero would mark a real
   * clinical threshold `peripheral` for a reason that is about our matching rule.
   *
   * 🔴 KNOWN COST, STATED RATHER THAN HIDDEN: a cue written entirely in punctuation and digits lands
   * here even when it is perfectly distinctive. `*1/*1` is a real star-allele name, and `normalise`
   * removes its asterisks as emphasis markers before the letter test sees it. The trade was taken
   * deliberately — stripping emphasis is what lets an italicised species name match its plain
   * occurrences elsewhere in the same document, which is the far commoner case — and both halves of
   * it fail towards *no reading* rather than towards a confident wrong one.
   */
  | "cue-not-traceable"
  /**
   * The cue is a name this document gives to a COLUMN, so it is a header cell being read as data.
   *
   * 🔴 A STATEMENT ABOUT THE PARSE, NOT ABOUT THE MATERIAL. A table split across pages prints its
   * header once, so every continuation fragment has `headerRows: 0` and its first row — the header —
   * is read as a row. `Due Date — Assignments` and `Score Range — Letter Grade` are that, and asking
   * how prominent `Due Date` is in the document answers a question about typesetting.
   *
   * 🔴 THE NAMES ARE COLLECTED DOCUMENT-WIDE, NOT FROM THE ANCHORING GRID, AND THE FIRST VERSION OF
   * THIS GUARD WAS DEAD CODE FOR EXACTLY THAT REASON. It asked the anchoring unit for its own column
   * names and got none — a fragment that prints no header knows none, which is the whole situation
   * this refusal is about. The header lives on the fragment that DID print it, one unit away.
   * Measured on the syllabus parse serving that morning: the anchor-local test refused 0 of 229
   * objects and let `Instructor` through as the document's single most prominent term; the
   * document-wide test refused 11 of them, `Instructor` included.
   *
   * 🔴 AND IT FIRES ON NOTHING IN PRODUCTION TODAY, WHICH IS SAID HERE RATHER THAN LEFT TO BE
   * DISCOVERED. That syllabus was reparsed the same afternoon (229 objects → 83), and the new parse
   * resolves its column names, so no header row is read as data any more. Across all three parses
   * serving on 2026-08-15 this refusal fires 0 times — the same standing `figure-referenced-from-
   * prose` is given below. It is kept rather than deleted because the shape is not rare: any grid
   * whose continuation fragment prints no header reproduces it, and the guard is calibrated against
   * that shape rather than against one document.
   */
  | "cue-is-a-column-name"
  /** Every signal was a blind spot in this document, so nothing was actually looked at. */
  | "nothing-observable";

export interface ImportanceRefusal {
  reason: ImportanceRefusalReason;
  /** One line of plain English, safe to show a person. */
  detail: string;
}

/**
 * Either a reading or a stated refusal — never both, and never neither.
 *
 * 🔴 THE REFUSAL IS AN OUTPUT, NOT AN ABSENCE. A caller handed nothing cannot tell "this document
 * does not foreground it" from "we could not trace its cue", and those demand opposite responses:
 * the first is a fact about the material, the second is a fact about us and it is the one worth
 * fixing.
 */
export interface ImportanceReading {
  importance?: SourceImportance;
  refusal?: ImportanceRefusal;
}

/** A cue shorter than this cannot be traced; any hit would be a coincidence. */
const MIN_CUE_CHARS = 3;

/**
 * The document-wide facts every reading is measured against, computed once.
 *
 * 🔴 BUILT ONCE PER DOCUMENT BECAUSE THE ANSWERS ARE PROPERTIES OF THE DOCUMENT. Whether emphasis
 * survived, what the headings say, what the running text contains — none of it varies by object, and
 * recomputing it per object would make a 229-object extraction re-read the whole source 229 times.
 */
export interface ImportanceIndex {
  /** Normalised text of every non-heading unit, with the unit it came from. */
  readonly prose: readonly { readonly unit: CanonicalSourceUnit; readonly text: string }[];
  /** Normalised text of every heading unit. */
  readonly headings: readonly string[];
  /** Every unit, by id — for locating an object's anchor. */
  readonly units: ReadonlyMap<string, CanonicalSourceUnit>;
  /** Normalised emphasised runs, by unit id. Empty for a document whose parse recovered none. */
  readonly emphasis: ReadonlyMap<string, readonly string[]>;
  /** Every name this document gives to a column, anywhere — see `cue-is-a-column-name`. */
  readonly columnNames: ReadonlySet<string>;
  /** What could not be asked of this document at all. */
  readonly blindSpots: readonly ImportanceBlindSpot[];
}

/**
 * Collapse a term to its comparable form.
 *
 * 🔴 EMPHASIS MARKERS ARE STRIPPED, WHICH IS NOT COSMETIC. A .pptx cell arrives as
 * `**Genotype CYP2D6** **(Allele Combination)**`, and a term carrying its own typesetting matches
 * nothing anywhere else in the document — the strongest signal available would report zero on the
 * material a lecturer took the trouble to bold.
 */
function normalise(value: string): string {
  return value
    .replace(/\*+/g, " ")
    .replace(/_+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does `haystack` contain `term` as a term rather than as a fragment of a longer one?
 *
 * 🔴 BOUNDARY-AWARE, BECAUSE PLAIN CONTAINMENT WAS MEASURABLY WRONG. `*1/*1` is contained in
 * `*1/*10` and in `*1/*1xN`, and a first measurement over production inflated 45 of 225 syllabus
 * counts and 20 of 69 .pptx counts that way. Word characters are matched by Unicode class rather
 * than by `\w`, so this reads a French statute and a German engineering text as well as an English
 * lecture.
 */
function containsTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const extendsTerm = (char: string): boolean => char !== "" && /[\p{L}\p{N}]/u.test(char);
  for (let from = 0; from <= haystack.length; ) {
    const at = haystack.indexOf(term, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : haystack[at - 1]!;
    const after = haystack[at + term.length] ?? "";
    if (!extendsTerm(before) && !extendsTerm(after)) return true;
    from = at + 1;
  }
  return false;
}

/** What one unit offers to a text search — cells for a grid, prose for a paragraph. */
function searchableText(unit: CanonicalSourceUnit): string {
  const content = unitContent(unit);
  switch (content.kind) {
    case "text":
      return content.text;
    case "table":
      return content.rendered || content.rows.flat().join(" ");
    case "figure":
      return [content.caption, content.description].filter(Boolean).join(" ");
    case "empty":
      return "";
  }
}

/** The emphasised runs the parse recovered from one unit's text, normalised. */
function emphasisRuns(unit: CanonicalSourceUnit): string[] {
  if (unit.emphasis?.length) {
    return unit.emphasis.map((run) => normalise(run.text)).filter(Boolean);
  }
  // Compatibility for parses stored before emphasis became a first-class block field. Some
  // producers left Markdown delimiters in `text`; keep reading those rows until reprocessing has
  // replaced them rather than making a schema improvement erase the only evidence they retained.
  const raw = unit.text ?? "";
  const runs: string[] = [];
  for (const match of raw.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    const inner = normalise(match[1] ?? "");
    if (inner) runs.push(inner);
  }
  return runs;
}

/**
 * Read a document once, so every object can be asked about cheaply.
 *
 * PURE. Takes the parse, returns the facts; touches nothing.
 */
export function importanceIndex(context: SourceContext): ImportanceIndex {
  const prose: { unit: CanonicalSourceUnit; text: string }[] = [];
  const headings: string[] = [];
  const units = new Map<string, CanonicalSourceUnit>();
  const emphasis = new Map<string, readonly string[]>();
  const columnNames = new Set<string>();

  for (const unit of context.units) {
    units.set(unit.id, unit);
    const text = normalise(searchableText(unit));
    if (unit.type === "heading") headings.push(text);
    else if (text) prose.push({ text, unit });
    const runs = emphasisRuns(unit);
    if (runs.length > 0) emphasis.set(unit.id, runs);
    for (const name of columnNamesOf(unit)) columnNames.add(name);
  }

  const blindSpots: ImportanceBlindSpot[] = [];
  if (emphasis.size === 0) {
    blindSpots.push({
      detail:
        "This document's parse recovered no bold or italic anywhere, so nothing here can tell an unemphasised passage from emphasis that did not survive.",
      reason: "emphasis-not-recovered",
      signal: "carries-emphasis",
    });
  }
  if (headings.length === 0) {
    blindSpots.push({
      detail: "This document's parse recovered no headings, so nothing could have been promoted to one.",
      reason: "no-headings-in-document",
      signal: "named-as-a-heading",
    });
  }

  return { blindSpots, columnNames, emphasis, headings, prose, units };
}

/**
 * The term a knowledge object is ABOUT — its cue, never its answer.
 *
 * 🔴 THE CUE SIDE ONLY. `lisinopril — cough` is asked as "what does lisinopril do", so the document's
 * treatment of *lisinopril* is what says how prominent the fact is. Tracing the answer instead would
 * measure how often the document repeats an answer, which is a different question and mostly a
 * property of how many rows a grid has.
 */
function cueOf(object: KnowledgeObject): string | null {
  if (object.pair) return object.pair.left;
  if (object.contrast) return object.contrast.label;
  if (object.relation) return object.relation.cause.text;
  if (object.figure) return object.figure.caption ?? null;
  if (object.steps?.length) return object.statement;
  return object.statement;
}

/** A cue with no letters in it, or too short, cannot be traced through a document. */
function traceable(cue: string): boolean {
  return cue.length >= MIN_CUE_CHARS && /\p{L}/u.test(cue);
}

/** The column names the grid this unit holds knows about, normalised. */
function columnNamesOf(unit: CanonicalSourceUnit | undefined): string[] {
  if (!unit) return [];
  const content = unitContent(unit);
  if (content.kind !== "table") return [];
  const stated = content.columns ?? [];
  const header = content.headerRows > 0 ? (content.rows[0] ?? []) : [];
  return [...stated, ...header].map(normalise).filter(Boolean);
}

/**
 * Two units are fragments of ONE grid when both are tables under the identical heading path.
 *
 * 🔴 A CONTINUATION FRAGMENT IS NOT THE SOURCE RETURNING TO AN IDEA. The production syllabus prints
 * its course schedule across three units under one heading; a subject appearing in the second
 * fragment is the same table being long, not the document coming back to the topic. Counting it
 * would make every wide grid corroborate itself.
 */
function sameGrid(a: CanonicalSourceUnit, b: CanonicalSourceUnit): boolean {
  if (a.type !== "table" || b.type !== "table") return false;
  return JSON.stringify(a.anchor.headingPath ?? []) === JSON.stringify(b.anchor.headingPath ?? []);
}

/**
 * How prominently this document treats this one piece of knowledge — or why we cannot say.
 *
 * PURE. Reads the index and the object; writes nothing, stores nothing, and knows nothing about the
 * learner.
 */
export function sourceImportance(index: ImportanceIndex, object: KnowledgeObject): ImportanceReading {
  const unitId = object.sourceAnchors?.find((anchor) => anchor.unitId)?.unitId;
  if (!unitId) {
    return {
      refusal: {
        detail: "This knowledge names no unit of the document, so there is nothing to measure its prominence against.",
        reason: "no-anchor",
      },
    };
  }
  const anchor = index.units.get(unitId);
  if (!anchor) {
    return {
      refusal: {
        detail: `This knowledge is anchored to unit ${unitId}, which this document does not contain.`,
        reason: "unit-not-in-document",
      },
    };
  }

  const raw = cueOf(object);
  const cue = raw ? normalise(raw) : "";
  if (!cue || !traceable(cue)) {
    return {
      refusal: {
        detail: "This knowledge's cue is a bare number or too short to trace, so any recurrence found would be a coincidence.",
        reason: "cue-not-traceable",
      },
    };
  }
  if (index.columnNames.has(cue)) {
    return {
      refusal: {
        detail: `"${raw?.trim()}" is a name this document gives to a column, so this row is a header being read as data rather than something the document teaches.`,
        reason: "cue-is-a-column-name",
      },
    };
  }

  const observations: ImportanceObservation[] = [];
  const blinded = new Set(index.blindSpots.map((spot) => spot.signal));

  // ── returned to, in running text that is not this unit and not this grid ──
  const returnedTo = index.prose.filter(
    (entry) => entry.unit.id !== anchor.id && !sameGrid(anchor, entry.unit) && containsTerm(entry.text, cue),
  ).length;
  observations.push({ count: returnedTo, foregrounded: returnedTo > 0, signal: "returned-to" });

  // ── promoted to a heading ──
  if (!blinded.has("named-as-a-heading")) {
    const named = index.headings.filter((heading) => containsTerm(heading, cue)).length;
    observations.push({ count: named, foregrounded: named > 0, signal: "named-as-a-heading" });
  }

  // ── emphasised where it sits ──
  if (!blinded.has("carries-emphasis")) {
    const runs = index.emphasis.get(anchor.id) ?? [];
    const emphasised = runs.some((run) => containsTerm(run, cue) || containsTerm(cue, run));
    observations.push({ foregrounded: emphasised, signal: "carries-emphasis" });
  }

  if (observations.length === 0) {
    return {
      refusal: {
        detail: "Every structural signal was unavailable in this document, so nothing was actually looked at.",
        reason: "nothing-observable",
      },
    };
  }

  const foregrounding = observations.filter((observation) => observation.foregrounded).length;
  return {
    importance: {
      blindSpots: index.blindSpots,
      observations,
      standing: foregrounding >= 2 ? "central" : foregrounding === 1 ? "supporting" : "peripheral",
    },
  };
}

/**
 * Structural signals that were tried against production and NOT shipped, with what they measured.
 *
 * 🔴 WRITTEN DOWN BECAUSE THE NEXT PERSON WILL PROPOSE THEM. Each of these is a reasonable idea, each
 * is named in the brief this file answers, and each was refused on a measurement rather than on
 * taste. Re-adding one needs a new measurement, not a new argument.
 *
 * `heading-depth` — how deep in the heading tree the knowledge sits.
 *   REFUSED, and re-measured after the syllabus was reparsed mid-day: all 83 objects of the current
 *   parse sit at heading depth 1, exactly as all 229 of the previous one did. The signal is constant
 *   and separates nothing. On the diabetes deck it varies (28 at depth 1, 10 at 2, 8 at 3), but the
 *   levels are consecutive SLIDE TITLES that the PDF reader nested by font size — a depth-3 path
 *   there reads `SCREENING AND DIAGNOSIS → GLYCEMIC GOALS → Treatment Goals`, which is three slides
 *   in a row rather than a subsection of a subsection. And a heading path is not reliably a depth at
 *   all: the sibling lecture `1. Physiology and Pathophysiology of Diabetes Mellitus 1 2026.pdf`
 *   carries literal `null` entries in its paths, so its length counts holes.
 *
 * `section-share` — how much of the document's text sits under the same heading.
 *   REFUSED, and this one points the WRONG WAY. The largest section of the syllabus is its Course
 *   Schedule at 20.1% of the document's characters — the least learnable content in the file. Length
 *   rewards whichever table is longest.
 *
 * `figure-referenced-from-prose` — a figure the document captioned and then referred back to.
 *   REFUSED for want of anything to read. Across the three production documents examined, 41 figures
 *   carry between them 8 captions, 0 model descriptions and 0 captions echoed anywhere else in the
 *   text. The signal is sound and there is currently no document in production it can fire on.
 *
 * `announced-in-a-learning-objectives-block` — the cue appears in the list a lecture opens with.
 *   REFUSED as a guess. The diabetes deck does open with an `Objectives` heading over four list
 *   items, so the block is detectable — but its items are whole task descriptions ("Given a patient
 *   case, categorize a patient according to the ADA diagnostic criteria"), and no cue any extractor
 *   mints from that deck appears in one. Detecting the block would have meant matching the word
 *   "Objectives", which is a keyword list, or calling a list "imperative", which is a fact about
 *   English rather than about structure.
 */
export const REFUSED_SIGNALS = [
  "heading-depth",
  "section-share",
  "figure-referenced-from-prose",
  "announced-in-a-learning-objectives-block",
] as const;
