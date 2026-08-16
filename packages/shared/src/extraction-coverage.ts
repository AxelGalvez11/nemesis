/**
 * What was actually read out of an uploaded document — and what was not.
 *
 * 🔴 WHY THIS TYPE EXISTS. `/api/notebooks/extract/file` has always computed a
 * coverage tally and put it in its JSON response. Nothing ever read it: the
 * client type (`ExtractedFile`) had no such field, so a 40-of-300-page vision
 * pass reached the student, the note generator and the chat model as a complete
 * read of the lecture. The model then answered about pages it had never seen,
 * and nobody — including us — could tell from the outside.
 *
 * A partial read is allowed. Presenting a partial read as a complete one is not.
 *
 * 🔴 THE FOUR UNIT COUNTS ARE DISJOINT AND MUST SUM TO `units`. "Read natively"
 * and "read as pixels" are not exclusive — a page with a heading and a
 * screenshot underneath it is both — so a fifth state (`unitsBoth`) exists
 * rather than forcing such a page into one lane and losing the other fact.
 * `checkCoverage()` enforces the sum, and the builders below are the only
 * supported way to construct one, because a hand-built record that does not add
 * up is a lie with a type annotation on it.
 *
 * 🔴 THIS IS A WIRE AND STORAGE CONTRACT. It crosses the extraction route's
 * JSON, `parsed_documents.coverage` (jsonb), the web client and the phone. It
 * lives in @nemesis/shared for the same reason the upload ceiling does: a number
 * that appears in more than one file eventually disagrees with itself. Add
 * optional fields; never rename or repurpose one.
 *
 * PURE. No imports, no I/O.
 */

/** Bumped when the SHAPE changes. Stored alongside every record so a reader can
 *  tell an old row from a new one instead of guessing from which keys exist. */
export const EXTRACTION_COVERAGE_VERSION = 1;

/**
 * Which extraction produced a record.
 *
 * 🔴 BUMP THIS WHENEVER EXTRACTION CHANGES WHAT IT CAN READ — a new parser, a
 * new vision model ladder, a raised page cap. It is what makes "reprocess
 * everything parsed by version X" an answerable question, and it is the unique
 * key on `parsed_documents` together with the file's content hash, so a bump
 * produces a NEW parse row rather than silently overwriting the old one.
 *
 * Not a package version: extraction quality does not move with the app's
 * release number, and tying them would reparse the world on every deploy.
 */
export const PARSER_VERSION = "extract-2026-08-16";

/** What the document divides into. `document` is the honest answer for a file
 *  with no meaningful subdivision — better than inventing "page 1 of 1". */
export type CoverageUnitKind = "page" | "slide" | "sheet" | "document";

/**
 * How completely the source was read.
 *
 * `partial` is a first-class success: the text is real and worth keeping, and
 * the student gets it. It carries an obligation — every surface that shows or
 * uses this document must say what is missing.
 */
export type ExtractionState = "complete" | "partial" | "failed";

/** Why a picture in a deck was not described. Counted, never dropped in
 *  silence — each of these is a different fix, so one bucket would hide which. */
export type FigureSkipReason =
  /** A bullet, rule, icon or divider. Correctly ignored. */
  | "decorative"
  /** A genuine drawing in a format nothing here can rasterise (vector art). */
  | "unreadable-format"
  /** Real content that lost out to the per-deck ceiling. The one that hurts. */
  | "over-cap"
  /** Vision is not configured or the provider failed. */
  | "vision-unavailable"
  /**
   * Something looked at it and had nothing to report.
   *
   * Still LOST — the figure's content did not reach the document — but it is a
   * disclosed decision rather than a hole. Kept apart from `not-examined` so a
   * vision pass that ran and returned nothing cannot be mistaken for one that
   * never ran, which is the difference between a provider problem and a
   * routing problem.
   */
  | "examined-empty"
  /**
   * Nobody looked, and nobody decided not to.
   *
   * 🔴 THE LARGEST CATEGORY, AND IT WAS INVISIBLE UNTIL 2026-08-06. PDF figures
   * had no representation here at all, so a page carrying an unread diagram was
   * reported as fully read. Measured over 120 real course PDFs / 952 pages:
   * 1,963 figures exist, 239 are running art and 635 are furniture — leaving
   * **1,089 pieces of real content nobody has ever examined**, on pages the
   * routing rule calls text-rich and therefore never sends to vision.
   *
   * It counts as lost, which is what makes those documents `partial` instead of
   * `complete`. That is a large and deliberate change: under "Unknown is not
   * complete", the fix for the noise is to look at the figures, not to stop
   * counting them.
   */
  | "not-examined";

export interface FigureCoverage {
  /** Distinct pictures found on the slides, after content deduplication. */
  found: number;
  /** …of which this many were actually read and described. */
  described: number;
  /** …and this many were not. `skipped === found - described` always. */
  skipped: number;
  /** Why, broken down. Only non-zero reasons appear. */
  reasons: Partial<Record<FigureSkipReason, number>>;
}

/**
 * Where text was cut, and by how much.
 *
 * The stage matters more than the number: a prompt-budget clip is recoverable
 * (ask a narrower question, retrieve a different part) while an extraction clip
 * means the stored source itself is short and nothing downstream can ever get
 * the rest. Two different problems that must not share one flag.
 */
export interface TruncationRecord {
  stage:
    /** Cut before the text was ever returned or stored. */
    | "extract"
    /** Cut on the way into a model prompt. The source is intact. */
    | "prompt"
    /** Cut on the way into study generation. The source is intact. */
    | "study-material";
  /** The ceiling that applied, in characters. */
  limit: number;
  /** Characters kept. */
  kept: number;
  /** Characters dropped. Always > 0 — a record that dropped nothing is not
   *  recorded at all, so the presence of an entry is itself the signal. */
  dropped: number;
}

/**
 * One reason content in a region could not be recovered, and how often it
 * happened — `unreadable-format`, `chart`, `ambiguous-delimiter`, whatever the
 * parser that found it calls it.
 *
 * 🔴 `kind` STAYS A STRING, DELIBERATELY UNNARROWED. `FigureSkipReason` above is
 * a closed union and `readCoverage` filters against a hardcoded list of six —
 * which is exactly why a seventh reason requires editing two files or it dies
 * silently at that boundary. The vocabulary here belongs to whichever parser
 * measured it (grid parsers today; others later) and will grow without this
 * module's involvement, so narrowing it would rebuild that same trap for the
 * next one. Validate only that `count` is a positive integer; preserve `kind`
 * verbatim.
 */
export interface UnreadableKind {
  kind: string;
  count: number;
}

/**
 * WHERE a loss happened, for the losses whose unit the parser knew.
 *
 * 🔴 THIS IS A PARTIAL EXPLANATION OF THE TOTALS, NEVER A REDEFINITION OF THEM.
 * `unitsUnread` and `unreadableRegions` stay authoritative; these entries
 * account for as much of them as the producer could place, and the remainder is
 * loss that happened somewhere nobody can name. `buildCoverage` enforces the
 * `<=` in both directions and deliberately does NOT derive either total from
 * this field — which is the opposite of how `unreadableKinds` works, and the
 * difference is the whole point.
 *
 * Deriving the totals here would make unplaceable loss VANISH: a document with
 * three unreadable regions the parser could not attribute would report an empty
 * `lostUnits`, every unit would look clean, and a per-unit verdict computed from
 * that would call the document intact. That is parser incapacity masquerading as
 * absence of loss — the one failure this whole contract exists to prevent,
 * arriving through the refinement meant to improve it. So the totals are a
 * floor, this is a breakdown, and `unlocatedRegions`/`unlocatedUnreadUnits` are
 * how a consumer asks what is still unaccounted for.
 */
export interface UnitLoss {
  /** 0-based index into the document's units — the same space `units` counts. */
  unit: number;
  /** This whole unit came back with nothing. */
  unread?: boolean;
  /** Regions ON THIS UNIT the parser saw and could not turn into content. */
  unreadableRegions?: number;
}

export interface ExtractionCoverage {
  version: number;
  parserVersion: string;
  unitKind: CoverageUnitKind;
  /** Total pages / slides / sheets the file contains. */
  units: number;
  /** Read ONLY from the file's own text layer. */
  unitsNative: number;
  /** Read ONLY by looking at the pixels (vision/OCR). */
  unitsVision: number;
  /** Read both ways — a page with real text AND content locked in a picture. */
  unitsBoth: number;
  /** Not read at all. The number that must never be hidden. */
  unitsUnread: number;
  figures: FigureCoverage;
  /** Empty when nothing was cut. */
  truncation: TruncationRecord[];
  /**
   * Regions the parser SAW and could not turn into anything — not pictures.
   *
   * 🔴 THIS EXISTS BECAUSE THE ONLY OTHER LOSSY CHANNEL WOULD HAVE LIED. A
   * parser can detect a region, locate it precisely, and still produce no
   * content for it: measured on the Docling path, 27 of 49 detected formulas
   * across 5 real course PDFs arrive with a bounding box and an EMPTY string,
   * because the formula model found an equation it could not transcribe. Those
   * 27 were dropped by a silent `if (text)` gate and counted nowhere, so a
   * lecture whose derivations were all unreadable still reported `complete`.
   *
   * They are not figures. Filing them under `figures.reasons` would make
   * `describeCoverage` say "27 pictures couldn't be read" about a document with
   * no missing pictures — a different false sentence, not a softer one, in the
   * one module that exists to stop those. So this is a separate optional field,
   * which is what the header note above means by "add optional fields".
   *
   * Deliberately NOT named for equations: the next parser will hit this with a
   * different node label (a chart with no data, an unreadable stamp), and a
   * field named for one label would be renamed or repurposed, which is the one
   * thing this contract forbids.
   *
   * Absent on every record written before 2026-08-07, which reads the same as 0.
   */
  unreadableRegions?: number;
  /**
   * WHY `unreadableRegions` is a lost count, broken down.
   *
   * 🔴 THIS EXISTS BECAUSE THE BREAKDOWN WAS BEING COMPUTED AND THEN THROWN
   * AWAY. Both grid parsers (xlsx, csv) already build exactly this shape while
   * reading a file — `ambiguous-delimiter`, `unsupported-number-format`, `chart`
   * — and the caller that turns it into coverage summed it to one integer
   * before it ever reached this type. `unreadableRegions: 1` survived; the
   * reason a student's file could not be fully read did not. Nemesis could say
   * "incomplete" and never why.
   *
   * Additive and optional, same convention as `unreadableRegions`: absent means
   * not observed, never zero, and existing rows must not be backfilled with a
   * guessed kind. Counts here sum to `unreadableRegions` — `buildCoverage`
   * derives one from the other rather than accepting both, because two inputs
   * that must agree eventually disagree.
   */
  unreadableKinds?: UnreadableKind[];
  /**
   * WHERE the losses above happened, for the ones whose unit is knowable.
   *
   * 🔴 THIS EXISTS BECAUSE LOCALITY WAS BEING MEASURED AND THEN SUMMED AWAY, the
   * same way `unreadableKinds`' reasons were. Both producers already know: the
   * PDF lane computes `tablesUnread` per page and reduces it to one integer
   * (`pdf/structure.ts`), and the Docling adapter walks a `formula` node that
   * carries a page and a bounding box, increments a counter, and discards the
   * page. Once summed, no later function can recover where — the information is
   * gone at the point of summing, not merely unexposed.
   *
   * Without it a parse verdict can only ever refuse a whole file. That is the
   * difference between refusing a chart and refusing the chapter it sits in: a
   * lecture PDF with clean prose and one unreadable figure is fully usable for
   * everything but that figure, and a document-level verdict must either
   * over-refuse the prose or under-refuse the figure.
   *
   * Additive and optional, same convention as the two fields above: absent means
   * **not observed**, never "nothing was lost", and existing rows are not
   * backfilled with a guessed unit. See `UnitLoss` for why the totals are not
   * derived from this.
   */
  lostUnits?: UnitLoss[];
  state: ExtractionState;
}

const NO_FIGURES: FigureCoverage = { found: 0, described: 0, skipped: 0, reasons: {} };

/**
 * Build a record and derive its state, refusing anything that does not add up.
 *
 * Returns the record, or a string saying what is inconsistent. A caller that
 * cannot build a coherent record must not fall back to a cheerful one — that is
 * precisely the failure this module exists to prevent — so this is deliberately
 * awkward to ignore.
 */
export function buildCoverage(input: {
  unitKind: CoverageUnitKind;
  units: number;
  unitsNative: number;
  unitsVision?: number;
  unitsBoth?: number;
  unitsUnread?: number;
  figures?: FigureCoverage;
  truncation?: readonly TruncationRecord[];
  /**
   * Regions seen but not readable. See `ExtractionCoverage.unreadableRegions`.
   * Mutually exclusive with `unreadableKinds` — pass the breakdown when you
   * have one and let the count derive; passing both would be two numbers that
   * must agree and eventually don't.
   */
  unreadableRegions?: number;
  /** The breakdown behind `unreadableRegions`. See `ExtractionCoverage.unreadableKinds`. */
  unreadableKinds?: readonly UnreadableKind[];
  /**
   * Where the losses happened, for the ones the producer could place. See
   * `ExtractionCoverage.lostUnits`. NOT mutually exclusive with the counts
   * above — unlike `unreadableKinds`, this never derives a total, it only ever
   * accounts for part of one.
   */
  lostUnits?: readonly UnitLoss[];
  parserVersion?: string;
}): ExtractionCoverage | string {
  const unitsVision = input.unitsVision ?? 0;
  const unitsBoth = input.unitsBoth ?? 0;
  const unitsUnread = input.unitsUnread ?? 0;
  const parts = [input.unitsNative, unitsVision, unitsBoth, unitsUnread];
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return "unit counts must be non-negative integers";
  if (!Number.isInteger(input.units) || input.units < 0) return "units must be a non-negative integer";
  const sum = parts.reduce((total, n) => total + n, 0);
  if (sum !== input.units) return `unit counts sum to ${sum}, but the document has ${input.units} units`;

  const figures = input.figures ?? NO_FIGURES;
  if (figures.described + figures.skipped !== figures.found) {
    return `figures: ${figures.described} described + ${figures.skipped} skipped != ${figures.found} found`;
  }
  const truncation = [...(input.truncation ?? [])].filter((cut) => cut.dropped > 0);

  // An empty `unreadableKinds` is not a breakdown — a caller passing `[]` beside
  // `unreadableRegions` is not stating two disagreeing numbers, just an unused
  // default. Only a non-empty breakdown competes with a direct region count.
  if (input.unreadableRegions !== undefined && (input.unreadableKinds?.length ?? 0) > 0) {
    return "pass unreadableRegions or unreadableKinds, not both — the count is derived from the breakdown";
  }
  const unreadableKinds = [...(input.unreadableKinds ?? [])];
  for (const entry of unreadableKinds) {
    if (!entry.kind) return "unreadableKinds: kind must not be empty";
    if (!Number.isInteger(entry.count) || entry.count <= 0) return `unreadableKinds: count for "${entry.kind}" must be a positive integer`;
  }
  const unreadableRegions = input.unreadableRegions ?? unreadableKinds.reduce((total, entry) => total + entry.count, 0);
  if (!Number.isInteger(unreadableRegions) || unreadableRegions < 0) {
    return "unreadableRegions must be a non-negative integer";
  }

  // 🔴 VALIDATED AGAINST THE TOTALS, NEVER USED TO SET THEM. See `UnitLoss`: a
  // breakdown that could raise a total would let a producer make unplaceable
  // loss disappear by simply not placing it.
  const lostUnits = [...(input.lostUnits ?? [])];
  const seenUnits = new Set<number>();
  let locatedUnread = 0;
  let locatedRegions = 0;
  for (const loss of lostUnits) {
    if (!Number.isInteger(loss.unit) || loss.unit < 0 || loss.unit >= input.units) {
      return `lostUnits: unit ${loss.unit} is not an index into this document's ${input.units} units`;
    }
    if (seenUnits.has(loss.unit)) return `lostUnits: unit ${loss.unit} appears twice`;
    seenUnits.add(loss.unit);
    const regions = loss.unreadableRegions ?? 0;
    if (regions !== 0 && (!Number.isInteger(regions) || regions <= 0)) {
      return `lostUnits: unreadableRegions for unit ${loss.unit} must be a positive integer`;
    }
    // An entry claiming neither kind of loss says nothing, and a record full of
    // those would read as "we looked and these units are fine" — a claim this
    // field is not entitled to make. Omission is how a clean unit is expressed.
    if (!loss.unread && regions === 0) return `lostUnits: unit ${loss.unit} records no loss`;
    if (loss.unread) locatedUnread += 1;
    locatedRegions += regions;
  }
  if (locatedUnread > unitsUnread) {
    return `lostUnits: ${locatedUnread} units marked unread, but unitsUnread is ${unitsUnread}`;
  }
  if (locatedRegions > unreadableRegions) {
    return `lostUnits: ${locatedRegions} regions located, but unreadableRegions is ${unreadableRegions}`;
  }

  const coverage: ExtractionCoverage = {
    version: EXTRACTION_COVERAGE_VERSION,
    parserVersion: input.parserVersion ?? PARSER_VERSION,
    unitKind: input.unitKind,
    units: input.units,
    unitsNative: input.unitsNative,
    unitsVision,
    unitsBoth,
    unitsUnread,
    figures,
    truncation,
    // Omitted entirely when zero, so an old record and a clean new one look the
    // same on the wire and in jsonb.
    ...(unreadableRegions > 0 ? { unreadableRegions } : {}),
    ...(unreadableKinds.length > 0 ? { unreadableKinds } : {}),
    ...(lostUnits.length > 0 ? { lostUnits } : {}),
    state: "complete",
  };
  return { ...coverage, state: deriveState(coverage) };
}

/**
 * Complete, partial or failed — from the numbers alone.
 *
 * 🔴 A SKIPPED DECORATION IS NOT A GAP. Counting icons and rules as missing
 * content would mark almost every real deck partial, the warning would appear
 * everywhere, and a warning that appears everywhere is read nowhere. Only
 * skips that cost real content — an unreadable drawing, a figure over the cap,
 * vision being off — downgrade the state.
 */
export function deriveState(coverage: Omit<ExtractionCoverage, "state">): ExtractionState {
  const read = coverage.unitsNative + coverage.unitsVision + coverage.unitsBoth;
  if (coverage.units > 0 && read === 0) return "failed";
  if (coverage.unitsUnread > 0) return "partial";
  if (lostFigures(coverage.figures) > 0) return "partial";
  if ((coverage.unreadableRegions ?? 0) > 0) return "partial";
  if (coverage.truncation.some((cut) => cut.stage === "extract")) return "partial";
  return "complete";
}

/**
 * Add a cut that was discovered after the record was built, and re-derive the
 * state.
 *
 * 🔴 THE STATE MUST BE RE-DERIVED, NEVER CARRIED OVER. Text caps are applied
 * downstream of extraction — a deck's coverage is known before its assembled
 * markdown is measured against the ceiling — so a record that was `complete`
 * when built can stop being true a few lines later. Appending the cut while
 * keeping the old state is exactly the silent-partial bug in miniature.
 */
export function withTruncation(coverage: ExtractionCoverage, cuts: readonly TruncationRecord[]): ExtractionCoverage {
  const added = cuts.filter((cut) => cut.dropped > 0);
  if (added.length === 0) return coverage;
  const merged = { ...coverage, truncation: [...coverage.truncation, ...added] };
  return { ...merged, state: deriveState(merged) };
}

/**
 * Figures whose absence actually costs the student something.
 *
 * `decorative` is the only reason that is genuinely free — a bullet or a rule
 * carries nothing. Everything else is content the student uploaded and did not
 * get, including `not-examined`, which is the case where no decision was made
 * at all.
 */
export function lostFigures(figures: FigureCoverage): number {
  const reasons = figures.reasons;
  return (
    (reasons["unreadable-format"] ?? 0) +
    (reasons["over-cap"] ?? 0) +
    (reasons["vision-unavailable"] ?? 0) +
    (reasons["not-examined"] ?? 0) +
    (reasons["examined-empty"] ?? 0)
  );
}

/** Pages/slides read by any means. */
export function unitsRead(coverage: ExtractionCoverage): number {
  return coverage.unitsNative + coverage.unitsVision + coverage.unitsBoth;
}

/**
 * Unreadable regions the parser could NOT attribute to a unit.
 *
 * 🔴 THE NUMBER A PER-UNIT VERDICT MUST NOT LOSE. Attributing loss to units is
 * only honest while this is 0. Above 0, some content is missing from somewhere
 * nobody can name, and every unit reading "clean" would be a claim the record
 * does not support — so a per-unit verdict must degrade all of them, or refuse
 * to be per-unit for this document at all. Which of those it does is the
 * verdict's decision; that it cannot ignore this number is not.
 */
export function unlocatedRegions(coverage: ExtractionCoverage): number {
  const located = (coverage.lostUnits ?? []).reduce((total, loss) => total + (loss.unreadableRegions ?? 0), 0);
  return Math.max(0, (coverage.unreadableRegions ?? 0) - located);
}

/** Whole units that came back empty and could not be named. Same rule as above. */
export function unlocatedUnreadUnits(coverage: ExtractionCoverage): number {
  const located = (coverage.lostUnits ?? []).filter((loss) => loss.unread).length;
  return Math.max(0, coverage.unitsUnread - located);
}

/**
 * What was lost on one unit, or null when nothing was recorded against it.
 *
 * 🔴 NULL MEANS "NOTHING RECORDED HERE", NOT "THIS UNIT IS FINE", and the two
 * are only the same document when `unlocatedRegions` and `unlocatedUnreadUnits`
 * are both 0. Ask those first; this answers a narrower question.
 */
export function lossOnUnit(coverage: ExtractionCoverage, unit: number): UnitLoss | null {
  return (coverage.lostUnits ?? []).find((loss) => loss.unit === unit) ?? null;
}

const UNIT_WORDS: Record<CoverageUnitKind, [one: string, many: string]> = {
  page: ["page", "pages"],
  slide: ["slide", "slides"],
  sheet: ["sheet", "sheets"],
  document: ["document", "documents"],
};

function unitWord(kind: CoverageUnitKind, count: number): string {
  const pair = UNIT_WORDS[kind];
  return count === 1 ? pair[0] : pair[1];
}

/**
 * One sentence for the student, or null when there is genuinely nothing to say.
 *
 * Null on a complete read is deliberate: a badge that says "all 40 slides read"
 * on every document trains people to stop reading badges, and then the one that
 * says something real is invisible too.
 */
export function describeCoverage(coverage: ExtractionCoverage): string | null {
  if (coverage.state === "complete") return null;
  const parts: string[] = [];
  if (coverage.unitsUnread > 0) {
    const read = unitsRead(coverage);
    // 🔴 GROUPED, LIKE THE TRUNCATION SENTENCE BESIDE IT. "5000 of 100000
    // pages" is what a capped read of an adversarially large file produces, and
    // an ungrouped six-digit number is read wrong at a glance by everyone.
    parts.push(
      `${read.toLocaleString()} of ${coverage.units.toLocaleString()} ${unitWord(coverage.unitKind, coverage.units)} could be read`,
    );
  }
  const lost = lostFigures(coverage.figures);
  if (lost > 0) parts.push(`${lost} ${lost === 1 ? "picture" : "pictures"} couldn't be read`);
  const unreadable = coverage.unreadableRegions ?? 0;
  // Its own clause, never merged into the picture count: the fix is different
  // (a better formula/region reader, not a vision pass) and so is the sentence.
  if (unreadable > 0) {
    parts.push(`${unreadable} ${unreadable === 1 ? "part of the page" : "parts of the page"} couldn't be turned into text`);
  }
  const cut = coverage.truncation.find((entry) => entry.stage === "extract");
  if (cut) {
    parts.push(`the text was cut at ${cut.limit.toLocaleString()} characters (${cut.dropped.toLocaleString()} more were not kept)`);
  }
  if (parts.length === 0) return coverage.state === "failed" ? "Nothing in this file could be read." : null;
  const sentence = parts.join(", and ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/**
 * The same facts, addressed to the model, with the instruction that makes them
 * useful.
 *
 * 🔴 STATING THE GAP IS NOT ENOUGH — the model has to be told what to DO about
 * it, or it will helpfully answer from the part it has and never mention the
 * part it does not. The wording mirrors the truncation notice already used for
 * prompt-budget clipping in chat-attachments.ts, so the model meets one
 * consistent rule rather than two competing ones.
 */
export function coverageNoticeForModel(coverage: ExtractionCoverage): string | null {
  if (coverage.state === "complete") return null;
  if (coverage.state === "failed") {
    return "[Nothing in this file could be read. Do not answer as though you have its contents; say it could not be read.]";
  }
  const facts: string[] = [];
  if (coverage.unitsUnread > 0) {
    facts.push(
      `${coverage.unitsUnread.toLocaleString()} of ${coverage.units.toLocaleString()} ${unitWord(coverage.unitKind, coverage.units)} could NOT be read and are not below`,
    );
  }
  const lost = lostFigures(coverage.figures);
  if (lost > 0) facts.push(`${lost} ${lost === 1 ? "picture was" : "pictures were"} not read`);
  const unreadable = coverage.unreadableRegions ?? 0;
  if (unreadable > 0) {
    facts.push(`${unreadable} ${unreadable === 1 ? "region" : "regions"} (such as a formula) could not be turned into text`);
  }
  const cut = coverage.truncation.find((entry) => entry.stage === "extract");
  if (cut) facts.push(`${cut.dropped.toLocaleString()} characters were dropped when the file was read`);
  if (facts.length === 0) return null;
  return `[Incomplete source: ${facts.join("; ")}. If the student's question depends on what is missing, say so plainly rather than answering as though you read the whole document.]`;
}

/** Parse a record that came back from storage or the wire, or null if it is not
 *  one. Storage rows predate this type and JSON is not a type system, so every
 *  field is checked rather than asserted. */
export function readCoverage(value: unknown): ExtractionCoverage | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const num = (key: string): number | null => (typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : null);
  const units = num("units");
  const unitsNative = num("unitsNative");
  const unitsVision = num("unitsVision");
  const unitsBoth = num("unitsBoth");
  const unitsUnread = num("unitsUnread");
  if (units === null || unitsNative === null || unitsVision === null || unitsBoth === null || unitsUnread === null) return null;
  const unitKind = raw["unitKind"];
  if (unitKind !== "page" && unitKind !== "slide" && unitKind !== "sheet" && unitKind !== "document") return null;
  const state = raw["state"];
  if (state !== "complete" && state !== "partial" && state !== "failed") return null;

  const figuresRaw = (typeof raw["figures"] === "object" && raw["figures"] !== null ? raw["figures"] : {}) as Record<string, unknown>;
  const figureNum = (key: string): number => (typeof figuresRaw[key] === "number" && Number.isFinite(figuresRaw[key]) ? (figuresRaw[key] as number) : 0);
  const reasonsRaw = (typeof figuresRaw["reasons"] === "object" && figuresRaw["reasons"] !== null ? figuresRaw["reasons"] : {}) as Record<string, unknown>;
  const reasons: Partial<Record<FigureSkipReason, number>> = {};
  // 🔴 ALL SIX, AND THE TWO THAT WERE MISSING WERE THE TWO THAT MATTER MOST.
  // `not-examined` and `examined-empty` were absent from this list, so a stored
  // record saying "12 pictures nobody looked at" read back with `reasons: {}` —
  // `lostFigures` returned 0 and `describeCoverage` returned NULL, i.e. the
  // student's warning sentence vanished the moment the record came out of the
  // database, on the single largest category of missing content. The `state`
  // column still said `partial`, which is what made it invisible: the badge was
  // right and the explanation was gone. Reproduced before fixing.
  //
  // Anything added to `FigureSkipReason` must be added here too, or it dies at
  // this boundary rather than at the one that wrote it.
  for (const reason of [
    "decorative",
    "unreadable-format",
    "over-cap",
    "vision-unavailable",
    "not-examined",
    "examined-empty",
  ] as const) {
    const count = reasonsRaw[reason];
    if (typeof count === "number" && Number.isFinite(count) && count > 0) reasons[reason] = count;
  }

  const truncation: TruncationRecord[] = [];
  if (Array.isArray(raw["truncation"])) {
    for (const entry of raw["truncation"] as unknown[]) {
      if (typeof entry !== "object" || entry === null) continue;
      const cut = entry as Record<string, unknown>;
      const stage = cut["stage"];
      if (stage !== "extract" && stage !== "prompt" && stage !== "study-material") continue;
      const limit = typeof cut["limit"] === "number" ? cut["limit"] : 0;
      const kept = typeof cut["kept"] === "number" ? cut["kept"] : 0;
      const dropped = typeof cut["dropped"] === "number" ? cut["dropped"] : 0;
      if (dropped > 0) truncation.push({ stage, limit, kept, dropped });
    }
  }

  // 🔴 PRESERVED VERBATIM, NOT FILTERED AGAINST A KNOWN LIST — unlike the figure
  // reasons above. That list is closed (six literals); this one is an open,
  // parser-owned vocabulary that grows without this module's involvement, so
  // filtering it here would silently drop every kind added after this was
  // written — the same class of loss the six-of-eight figure-reasons bug was.
  const unreadableKinds: UnreadableKind[] = [];
  if (Array.isArray(raw["unreadableKinds"])) {
    for (const entry of raw["unreadableKinds"] as unknown[]) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const kind = item["kind"];
      const count = item["count"];
      if (typeof kind === "string" && kind.length > 0 && typeof count === "number" && Number.isInteger(count) && count > 0) {
        unreadableKinds.push({ kind, count });
      }
    }
  }

  // 🔴 RE-DERIVED, NOT READ VERBATIM — THE ONE EXCEPTION IN THIS FUNCTION.
  // Every other field here is trusted as stored. This one cannot be: a
  // malformed entry dropped from `unreadableKinds` just above must not leave a
  // STALE, now-too-low `unreadableRegions` sitting next to it — that is
  // `buildCoverage`'s own "two numbers that must agree eventually disagree"
  // problem, reappearing on the read side instead of the write side. Taking
  // the max of what survived filtering and what storage says never LOSES a
  // count filtering could not explain; it only ever raises the floor.
  const storedRegions = typeof raw["unreadableRegions"] === "number" ? raw["unreadableRegions"] : 0;
  const explainedRegions = unreadableKinds.reduce((total, entry) => total + entry.count, 0);
  const unreadableRegions = Math.max(storedRegions, explainedRegions);

  // 🔴 FILTERED, AND FILTERING IS SAFE HERE PRECISELY BECAUSE NO TOTAL DEPENDS
  // ON IT — the opposite of `unreadableKinds` two blocks up, which had to
  // re-derive its total because dropping an entry would have left a stale one
  // beside it. Dropping a malformed entry here only ever REDUCES what is
  // located, which raises `unlocatedRegions`, which is the cautious direction:
  // a record whose locality did not survive storage reports less confidence
  // about where the loss was, never more.
  const lostUnits: UnitLoss[] = [];
  const seenUnits = new Set<number>();
  if (Array.isArray(raw["lostUnits"])) {
    for (const entry of raw["lostUnits"] as unknown[]) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const unit = item["unit"];
      if (typeof unit !== "number" || !Number.isInteger(unit) || unit < 0 || unit >= units) continue;
      if (seenUnits.has(unit)) continue;
      const rawRegions = item["unreadableRegions"];
      const regions = typeof rawRegions === "number" && Number.isInteger(rawRegions) && rawRegions > 0 ? rawRegions : 0;
      const unread = item["unread"] === true;
      if (!unread && regions === 0) continue;
      seenUnits.add(unit);
      lostUnits.push({ unit, ...(unread ? { unread } : {}), ...(regions > 0 ? { unreadableRegions: regions } : {}) });
    }
  }

  return {
    version: typeof raw["version"] === "number" ? raw["version"] : EXTRACTION_COVERAGE_VERSION,
    parserVersion: typeof raw["parserVersion"] === "string" ? raw["parserVersion"] : "unknown",
    unitKind,
    units,
    unitsNative,
    unitsVision,
    unitsBoth,
    unitsUnread,
    figures: { found: figureNum("found"), described: figureNum("described"), skipped: figureNum("skipped"), reasons },
    truncation,
    ...(unreadableRegions > 0 ? { unreadableRegions } : {}),
    ...(unreadableKinds.length > 0 ? { unreadableKinds } : {}),
    ...(lostUnits.length > 0 ? { lostUnits } : {}),
    state,
  };
}
