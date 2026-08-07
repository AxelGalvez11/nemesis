/**
 * Pulling facts out of a document without ever asking what subject it is.
 *
 * 🔴 THE RULE THAT DECIDES EVERY LINE OF THIS FILE:
 * **WE DO NOT CLASSIFY WHAT A THING IS. WE REPORT ITS SHAPE, AND THE WORDS THE
 * DOCUMENT ITSELF USED TO LABEL IT.**
 *
 * The roadmap asks for "grading rules, assignments, readings and exam info". The
 * tempting implementation is a list of words — *exam*, *quiz*, *midterm*,
 * *rubric* — and it would pass every test written beside it, then fail silently
 * on a law syllabus, a machine-shop safety manual, an art-history reading list,
 * or anything not written in English. A keyword list is a hidden claim about who
 * the student is.
 *
 * So there is no vocabulary here. What there is:
 *
 *   a heading and its depth                     → an outline entry
 *   a short label, a separator, a longer gloss   → a definition
 *   a run of numbered items at one depth        → a procedure
 *   a date, in a format that is a format         → a dated item
 *   a table column of percentages summing to 100 → a weighting scheme
 *
 * That last one is how "grading rules" are found without the word *grading*: a
 * table whose numbers add up to a whole is a weighting, whether it divides an
 * exam, a lab report, a construction bid or a moot court score. The shape is the
 * signal. **And the heading path travels with every fact**, so the document gets
 * to say what it called the thing — "Assessment", "Évaluation", "Grading" — and
 * we never have to guess.
 *
 * 🔴 EVERY FACT CARRIES A LOCATOR. A fact without provenance is an assertion,
 * and an assertion is what this whole roadmap exists to stop producing. The
 * locator is derived by the same code citations use, so a fact can be reopened
 * and checked exactly like a quotation.
 *
 * PURE. No model, no network, no storage.
 */

import {
  blockToText,
  locate,
  type DocBlock,
  type DocLocator,
  type DocumentModel,
} from "./document-model.ts";

export type DocFactKind =
  | "outline"
  | "definition"
  | "procedure"
  | "date"
  | "weighting"
  | "figure"
  | "table"
  | "equation";

export interface DocFact {
  kind: DocFactKind;
  /**
   * What the DOCUMENT called this place, outermost first.
   *
   * 🔴 NOT OUR CLASSIFICATION. This is the only labelling in the system that is
   * guaranteed to be in the student's own field and language, because they did
   * not write it and neither did we — the author did.
   */
  headingPath: string[];
  /** The blocks this was read from. Provenance, checkable. */
  blockIds: string[];
  locator: DocLocator;
  /** A plain rendering, for display and for search. */
  text: string;

  // ── kind-specific, all optional so one shape carries every fact ──────────
  /** outline: 1–6. */
  level?: number;
  /** definition: the label and its gloss, kept apart. */
  term?: string;
  meaning?: string;
  /** procedure: the steps, in order, with their markers stripped. */
  steps?: string[];
  /** date: ISO where the format was unambiguous, plus the text as written. */
  iso?: string;
  asWritten?: string;
  /** weighting: the parts and their shares, and what they sum to. */
  weights?: { label: string; percent: number }[];
  total?: number;
  /** table: the header row, when the format actually marked one. */
  headers?: string[];
  /** figure: whether anything has looked at it. */
  examined?: boolean;
}

// ── Outline ────────────────────────────────────────────────────────────────

/** Every heading, with its depth. The one extractor every format supports. */
export function outlineFacts(doc: DocumentModel): DocFact[] {
  return doc.blocks
    .filter((b) => b.kind === "heading" && b.text.trim())
    .map((b) => fact(doc, b, { kind: "outline", level: b.level ?? 1, text: b.text.trim() }));
}

// ── Definitions ────────────────────────────────────────────────────────────

/**
 * Separators a definition can hang on.
 *
 * 🔴 PUNCTUATION, NOT VOCABULARY. A dash means "what follows explains what
 * precedes" in every discipline and in most languages using Latin punctuation.
 * "is defined as" would not survive translation, and would not survive a
 * document that simply does not phrase it that way.
 *
 * 🔴 THE COLON WAS HERE AND WAS REMOVED, ON EVIDENCE. Across 124 real course
 * documents it produced **925 "definitions" of which roughly four in five were
 * not definitions at all** — form fields (`LinkedIn: …`, `Company Name: ____`),
 * worksheet prompts (`Question #1: What are…`), and case-study labels
 * (`Physical exam: BP today…`). A colon marks a labelled FIELD far more often
 * than it marks a meaning, and a false definition is worse than a missing one:
 * it becomes a flashcard that teaches something untrue.
 */
const DEFINITION_SEPARATOR = /\s+[—–]\s+|\s+-\s+/;

/** Longest a label can be before it stops being a label and becomes a sentence. */
const MAX_TERM_CHARS = 60;
/** Shortest a gloss can be before it is an abbreviation rather than a meaning. */
const MIN_MEANING_CHARS = 16;
/** Consecutive siblings a prose glossary needs before it is a glossary. */
const MIN_GLOSSARY_RUN = 3;

/**
 * Terms that are item labels rather than terms.
 *
 * 🔴 ENUMERATORS ARE NUMBERS, NOT VOCABULARY, so this generalises. `Answer D`,
 * `Question #3`, `Step 1.` and `5) RELIEF OF ITCH` all came out of real course
 * files as "definitions"; every one is a position in a list wearing a term's
 * shape. What they share is an ordinal or an enumerator, not a subject.
 */
const ENUMERATED_TERM = /(?:^|\s)(?:#\s*\d|\d+\s*[.)]|\(\d+\)|\b[A-Z]\)|\b\d+$)/;

export function definitionFacts(doc: DocumentModel): DocFact[] {
  const out: DocFact[] = [];
  // 🔴 A GLOSSARY IS A LIST, AND THAT IS THE DISCRIMINATOR THAT SURVIVED REAL
  // FILES. One line with a dash is prose, an aside, or a labelled field; three
  // consecutive siblings sharing the shape, under one heading, is a glossary.
  // Measured: dash-only on single lines still ran about three false positives
  // for every true one, and requiring the run is what separated them. Precision
  // is chosen over recall deliberately — a definition nobody extracted costs a
  // student nothing, and a wrong one costs them a wrong answer.
  let run: { block: DocBlock; pair: { term: string; meaning: string } }[] = [];

  const flushRun = () => {
    if (run.length >= MIN_GLOSSARY_RUN) {
      for (const entry of run) {
        out.push(
          fact(doc, entry.block, { kind: "definition", text: entry.block.text.trim(), ...entry.pair }),
        );
      }
    }
    run = [];
  };

  for (const block of doc.blocks) {
    if (block.kind === "table" && block.table) {
      flushRun();
      out.push(...tableDefinitions(doc, block));
      continue;
    }
    if (block.kind !== "paragraph" && block.kind !== "listItem") {
      flushRun();
      continue;
    }
    const pair = splitDefinition(block.text);
    // A run is broken by anything that is not the next entry of the same shape,
    // including a move to a different section.
    if (!pair || (run.length > 0 && !samePath(run[0]!.block, block))) flushRun();
    if (pair) run.push({ block, pair });
  }
  flushRun();
  // Table glossaries are appended as they are found, so restore document order.
  const position = new Map(doc.blocks.map((b, i) => [b.id, i]));
  return out.sort((a, b) => (position.get(a.blockIds[0]!) ?? 0) - (position.get(b.blockIds[0]!) ?? 0));
}

function samePath(a: DocBlock, b: DocBlock): boolean {
  return a.headingPath.length === b.headingPath.length &&
    a.headingPath.every((part, i) => part === b.headingPath[i]);
}

/** `Term — meaning`, or null when the line is just a line. */
export function splitDefinition(line: string): { term: string; meaning: string } | null {
  const text = line.trim();
  const match = DEFINITION_SEPARATOR.exec(text);
  if (!match || match.index === 0) return null;
  const term = text.slice(0, match.index).trim();
  const meaning = text.slice(match.index + match[0].length).trim();
  if (term.length === 0 || term.length > MAX_TERM_CHARS) return null;
  if (meaning.length < MIN_MEANING_CHARS) return null;
  // A label does not end a sentence, and it does not contain one. Both checks
  // are about shape: "The dose was 10 mg. It fell — sharply — overnight" has a
  // dash and is prose, not a definition.
  if (/[.!?]\s/.test(term)) return null;
  if (ENUMERATED_TERM.test(term)) return null;
  // 🔴 A QUESTION IS A PROMPT, NOT A MEANING. `Question — What counselling
  // points…` is a worksheet, and turning it into a definition would answer it
  // with itself.
  if (meaning.endsWith("?")) return null;
  return { meaning, term };
}

/**
 * A two-column table read as a glossary.
 *
 * 🔴 THE TEST IS THE COLUMN WIDTHS, NOT THE HEADER TEXT. A table whose left
 * column is consistently short and whose right column is consistently long is a
 * term-and-meaning table in any subject. Reading the header for the word "Term"
 * would work on the documents it was written against and nowhere else.
 */
function tableDefinitions(doc: DocumentModel, block: DocBlock): DocFact[] {
  const table = block.table;
  if (!table || table.rows.length < 3) return [];
  const body = table.rows.slice(table.headerRows);
  if (body.length < 3) return [];
  if (!body.every((row) => row.length === 2)) return [];

  // 🔴 THE SAME GUARDS AS THE PROSE PATH, BECAUSE THE SAME THINGS FOOL IT.
  // Real course files put worksheets in tables: `Step 3. Assess understanding |
  // What did your doctor tell you…` is short-left and long-right and is a rubric,
  // not a glossary. Checking the row shape rather than only the column widths is
  // what separates them, and it is the same check either way.
  const usable = body.filter((row) => {
    const term = (row[0] ?? "").trim();
    const meaning = (row[1] ?? "").trim();
    if (!term || !meaning) return false;
    if (term.length > MAX_TERM_CHARS || meaning.length < MIN_MEANING_CHARS) return false;
    if (ENUMERATED_TERM.test(term) || /[.!?]\s/.test(term)) return false;
    return !meaning.endsWith("?");
  });
  // Most rows, not all: a real glossary usually has one awkward entry.
  if (usable.length < body.length * 0.8 || usable.length < 3) return [];
  // 🔴 A GLOSSARY'S TERMS ARE DISTINCT. A column that repeats a label is a form
  // or a log, where the left cell names a field rather than a thing.
  if (new Set(usable.map((row) => row[0]!.trim().toLowerCase())).size < usable.length) return [];

  return usable
    .map((row) =>
      fact(doc, block, {
        kind: "definition",
        meaning: row[1]!.trim(),
        term: row[0]!.trim(),
        text: `${row[0]!.trim()} — ${row[1]!.trim()}`,
      }),
    );
}

// ── Procedures ─────────────────────────────────────────────────────────────

/** Steps a run needs before it is a procedure rather than two stray items. */
const MIN_PROCEDURE_STEPS = 3;

/**
 * Runs of numbered items, in order.
 *
 * 🔴 THE MARKER'S FORMAT IS THE SIGNAL. An author who numbered something meant
 * the order to matter — that is what numbering is for, in a lab protocol, a
 * court filing, a recipe or an assembly manual. A bulleted list of the same
 * words is a set, not a sequence, and reporting it as steps would invent an
 * order the document did not claim.
 */
export function procedureFacts(doc: DocumentModel): DocFact[] {
  const out: DocFact[] = [];
  let run: DocBlock[] = [];

  const flush = () => {
    if (run.length >= MIN_PROCEDURE_STEPS) {
      const steps = run.map((b) => b.text.trim());
      out.push(
        fact(doc, run[0]!, {
          blockIds: run.map((b) => b.id),
          kind: "procedure",
          steps,
          text: run.map((b) => `${b.marker ?? ""} ${b.text}`.trim()).join("\n"),
        }),
      );
    }
    run = [];
  };

  for (const block of doc.blocks) {
    const ordered =
      block.kind === "listItem" && /^\(?\d+[.)]?$/.test((block.marker ?? "").trim());
    // A run breaks on anything that is not the next ordered item at the same
    // depth — including a heading, which starts a different procedure.
    if (!ordered || (run.length > 0 && (run[0]!.depth ?? 0) !== (block.depth ?? 0))) {
      flush();
      if (!ordered) continue;
    }
    run.push(block);
  }
  flush();
  return out;
}

// ── Dates ──────────────────────────────────────────────────────────────────

/**
 * Month names.
 *
 * 🔴 THIS IS THE ONE WORD LIST IN THIS FILE, AND IT IS A LANGUAGE LIST, NOT A
 * SUBJECT LIST. Months are the same for a law student and a welding student;
 * a drug name or a statute name is not. The distinction is the whole point of
 * the rule, so it is stated rather than assumed.
 *
 * The honest limitation: this recognises English month names only. Numeric and
 * ISO forms below are language-independent and cover the rest. Recorded in
 * `docs/document-benchmark.md` as a gap rather than left implicit.
 */
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_PATTERN = MONTHS.map((m) => `${m.slice(0, 3)}(?:${m.slice(3)})?`).join("|");

const DATE_PATTERNS: readonly RegExp[] = [
  // 2026-08-14 — unambiguous everywhere.
  /\b(\d{4})-(\d{2})-(\d{2})\b/gi,
  // 14 August 2026 / 14 Aug 2026
  new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\.?,?\\s+(\\d{4})\\b`, "gi"),
  // August 14, 2026 / Aug 14 2026
  new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"),
];

/**
 * Dates, with the section they sit in.
 *
 * The section is what makes a date useful without classifying it: a date under
 * "Assessment › Final" and a date under "Reading Schedule" are different things,
 * and the document already said which is which.
 */
export function dateFacts(doc: DocumentModel): DocFact[] {
  const out: DocFact[] = [];
  for (const block of doc.blocks) {
    const text = blockToText(block);
    if (!text.trim()) continue;
    const seen = new Set<string>();
    for (const pattern of DATE_PATTERNS) {
      pattern.lastIndex = 0;
      for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
        const asWritten = m[0];
        if (seen.has(asWritten.toLowerCase())) continue;
        seen.add(asWritten.toLowerCase());
        const iso = toIso(m);
        // 🔴 A STRING SHAPED LIKE A DATE IS NOT A DATE. `2026-13-45` matches the
        // pattern and is not a day, and emitting it as a dated item would put
        // something on a schedule that can never arrive. No fact is the honest
        // outcome; the text is still in the document for anyone reading it.
        if (!iso) continue;
        out.push(fact(doc, block, { asWritten, iso, kind: "date", text: asWritten }));
      }
    }
  }
  return out;
}

/**
 * An ISO date, or nothing.
 *
 * 🔴 NOTHING IS A REAL ANSWER HERE. `03/04/2026` is March 4th in one country and
 * April 3rd in another, and the document does not say which. Guessing produces a
 * calendar entry that is confidently a month wrong — so an ambiguous numeric
 * form is deliberately not matched at all, and a date whose parts do not make a
 * real day returns the text without an ISO value.
 */
function toIso(match: RegExpExecArray): string | null {
  const parts = match.slice(1).filter((p): p is string => typeof p === "string");
  let year: number, month: number, day: number;
  if (/^\d{4}$/.test(parts[0] ?? "")) {
    [year, month, day] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  } else if (/^\d{1,2}$/.test(parts[0] ?? "")) {
    [day, year] = [Number(parts[0]), Number(parts[2])];
    month = monthNumber(parts[1] ?? "");
  } else {
    month = monthNumber(parts[0] ?? "");
    [day, year] = [Number(parts[1]), Number(parts[2])];
  }
  if (!month || !day || !year) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNumber(name: string): number {
  const lower = name.toLowerCase().replace(".", "");
  return MONTHS.findIndex((m) => m.startsWith(lower.slice(0, 3))) + 1;
}

// ── Weightings ─────────────────────────────────────────────────────────────

/** How far from a whole a set of shares may fall and still be a scheme. */
const WEIGHTING_TOLERANCE = 10;

/**
 * A table whose numbers add up to a whole.
 *
 * 🔴 THIS IS HOW A GRADING SCHEME IS FOUND WITHOUT THE WORD "GRADING".
 * A weighting is a shape: labels beside percentages that sum to about 100. It is
 * the same shape whether it divides a pharmacology exam, a dissertation rubric,
 * a construction tender or a figure-skating score. The heading path carries
 * whatever the document called it, in whatever language, so nothing here has to
 * know the subject — or claim to.
 */
export function weightingFacts(doc: DocumentModel): DocFact[] {
  const out: DocFact[] = [];
  for (const block of doc.blocks) {
    const table = block.table;
    if (block.kind !== "table" || !table || table.rows.length < 2) continue;
    const body = table.rows.slice(table.headerRows);
    if (body.length < 2) continue;
    const width = Math.max(...body.map((r) => r.length));

    for (let column = 1; column < width; column += 1) {
      const weights: { label: string; percent: number }[] = [];
      for (const row of body) {
        const percent = percentIn(row[column] ?? "");
        const label = (row[0] ?? "").trim();
        if (percent === null || !label) continue;
        weights.push({ label, percent });
      }
      if (weights.length < 2) continue;
      const total = weights.reduce((sum, w) => sum + w.percent, 0);
      if (Math.abs(total - 100) > WEIGHTING_TOLERANCE) continue;
      out.push(
        fact(doc, block, {
          kind: "weighting",
          text: weights.map((w) => `${w.label}: ${w.percent}%`).join(", "),
          total,
          weights,
        }),
      );
      break; // one scheme per table; the first column that sums is the one
    }
  }
  return out;
}

/** A percentage in a cell, or null. `%` is required — a bare 40 is not a share. */
function percentIn(cell: string): number | null {
  const match = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(cell);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

// ── Inventory: figures, tables, equations ──────────────────────────────────

/**
 * What visual and structural material the document holds.
 *
 * A figure fact carries `examined`, so a study aid built from these facts can
 * say "there are four diagrams in this section and nobody has read them" rather
 * than quietly omitting them — which is the same disclosure rule the coverage
 * layer follows, applied one level up.
 */
export function inventoryFacts(doc: DocumentModel): DocFact[] {
  const out: DocFact[] = [];
  for (const block of doc.blocks) {
    if (block.kind === "figure") {
      out.push(
        fact(doc, block, {
          examined: Boolean(block.figure?.description),
          kind: "figure",
          text: block.text.trim() || block.figure?.description?.trim() || "[Figure — not examined]",
        }),
      );
    } else if (block.kind === "table" && block.table) {
      const headers = block.table.headerRows > 0 ? block.table.rows[0] : undefined;
      out.push(
        fact(doc, block, {
          kind: "table",
          text: blockToText(block),
          ...(headers ? { headers: [...headers] } : {}),
        }),
      );
    } else if (block.kind === "equation") {
      out.push(fact(doc, block, { kind: "equation", text: block.text.trim() }));
    }
  }
  return out;
}

// ── The whole set ──────────────────────────────────────────────────────────

/**
 * Every extractor, in document order.
 *
 * A block may produce more than one fact — a table can be both an inventory
 * entry and a weighting scheme, and a dated line inside a procedure is both a
 * step and a date. That is deliberate: these are different questions about the
 * same place, and collapsing them would mean choosing which question the student
 * is allowed to ask.
 */
export function extractFacts(doc: DocumentModel): DocFact[] {
  const order = new Map(doc.blocks.map((block, index) => [block.id, index]));
  return [
    ...outlineFacts(doc),
    ...definitionFacts(doc),
    ...procedureFacts(doc),
    ...dateFacts(doc),
    ...weightingFacts(doc),
    ...inventoryFacts(doc),
  ].sort((a, b) => (order.get(a.blockIds[0]!) ?? 0) - (order.get(b.blockIds[0]!) ?? 0));
}

/** Assemble a fact, attaching provenance the same way a citation does. */
function fact(
  doc: DocumentModel,
  block: DocBlock,
  rest: Omit<DocFact, "blockIds" | "headingPath" | "locator"> & { blockIds?: string[] },
): DocFact {
  const { blockIds, ...fields } = rest;
  return {
    blockIds: blockIds ?? [block.id],
    headingPath: [...block.headingPath],
    locator: locate(doc, block),
    ...fields,
  };
}
