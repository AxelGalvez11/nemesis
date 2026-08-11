// Dates out of the CANONICAL document model — the producer `schedule-candidates.ts` never had.
//
// 🔴 WHAT THIS REPLACES, AND WHY IT IS NOT A SECOND PIPELINE. `readSyllabus` re-uploads the file,
// takes `.text`, and rebuilds an understanding of the document with a regular expression and
// 400-character windows around each date. Every one of those windows is an attempt to recover
// something the parser already knew: which heading this row sits under, which page it is on,
// whether these three lines are one table row or three unrelated sentences. Nemesis now persists
// that as `units-blocks`, so this reads it instead of inferring it again.
//
// 🔴 IT IS DELIBERATELY DETERMINISTIC. No model is called here. A date is found by the same
// arithmetic the old path used, but the ANCHORING — what the date belongs to, what section it
// came from, what page to open — comes from structure rather than from a model's reading of a
// character window. That keeps the whole producer testable, and it means every candidate carries
// a locator that can be checked against the stored parse rather than believed.
//
// Model labelling is NOT part of this file and is not implied by it. Deciding that "Exam 1" in a
// grading table is an assessment and not an example is a judgement, and the existing
// `syllabus-dates.ts` census prompt already does it. What changes is that a model asked to label
// these gets a section and a table row instead of a window of characters — the narrowing the
// owner asked for. Wiring that is the next slice.

import {
  blockToText,
  cellText,
  type DocBlock,
  type DocumentModel,
} from "@nemesis/shared";

import { findDateMentions, resolveYear } from "@/lib/workspace/syllabus-dates";

import type { SourceRef } from "./canvas-model";
import { hasHedging, type ScheduleCandidate, type ScheduleKind } from "./schedule-candidates";

/**
 * What a parsed source can actually support.
 *
 * 🔴 DERIVED FROM THE MODEL, NEVER FROM A COUNT. `parsed_documents.unit_count` is set for a
 * text-only parse too — it counts PAGES READ, not structure recovered — so a capability inferred
 * from it would report that every legacy flat-text row can do everything this file needs. Six such
 * rows exist in production right now. The only honest signal is whether a `units-blocks` model is
 * present and what is in it.
 */
export interface ParseCapabilities {
  /** A units→blocks model exists at all. */
  structuredText: boolean;
  /** Blocks carry ids and belong to units, so a locator can be resolved back to a page. */
  locators: boolean;
  /** Enough structure to group by section and table rather than by character window. */
  scheduleExtraction: boolean;
  figures: boolean;
  /**
   * Validated table structure a consumer can reason over ROW BY ROW and CELL BY CELL.
   *
   * 🔴 DELIBERATELY NOT `tables`, AND NOT "A TABLE WAS DETECTED SOMEWHERE". The detecting and the
   * recovering are different achievements with different consequences: a region the parser has
   * merely spotted gives a consumer nothing to read, while a validated grid gives it addressable
   * cells. One boolean covering both would let a page whose table was found and refused report the
   * same capability as one whose table was reconstructed — which is precisely the "reported
   * healthy over content it could not deliver" failure this codebase keeps paying for.
   *
   * 🔴 AND IT STILL CANNOT MEAN "EVERY TABLE IN THIS DOCUMENT IS UNDERSTOOD". Nemesis cannot know
   * about an UNRULED table, because nothing detects one — geometry has no lines to read and the
   * layout model is off. So `true` means "at least one table was recovered and validated", never
   * "nothing was missed", and no honest signal available today can mean the latter. See
   * `docs/table-lattice-decision.md` §6.
   */
  tableStructure: boolean;
}

export const NO_CAPABILITIES: ParseCapabilities = {
  figures: false,
  locators: false,
  scheduleExtraction: false,
  structuredText: false,
  tableStructure: false,
};

/**
 * Read a source's capabilities off its model.
 *
 * `null` — an image, or a PDF whose structural read failed and fell back to flat text — reports
 * nothing rather than a cheerful default. A caller that wants to degrade to the text path must
 * say so explicitly; it cannot happen by a field quietly reading as true.
 */
export function parseCapabilities(model: DocumentModel | null | undefined): ParseCapabilities {
  if (!model || model.units.length === 0 || model.blocks.length === 0) return NO_CAPABILITIES;
  const kinds = new Set(model.blocks.map((block) => block.kind));
  const locators = model.blocks.every((block) => block.id && block.unit >= 0 && block.unit < model.units.length);
  return {
    figures: kinds.has("figure"),
    locators,
    // Grouping needs somewhere to group BY. A model that is one undifferentiated run of
    // paragraphs is structurally a string, and saying otherwise is the misreport this type exists
    // to prevent.
    scheduleExtraction: locators && (kinds.has("heading") || kinds.has("table")),
    structuredText: true,
    // A `table` block only exists once a reconstruction has passed validation — the parser
    // discards the ones it cannot trust rather than emitting them — so its presence IS the
    // recovered-structure fact rather than a detection count.
    tableStructure: model.blocks.some((block) => block.kind === "table" && (block.table?.rows.length ?? 0) > 0),
  };
}

/** One cell of a recovered row, with the name of the column it sat under. */
export interface ScheduleCell {
  /**
   * The column's name, when the parser knows it.
   *
   * Null when the table printed no header this reader could corroborate. Absent means UNKNOWN —
   * never a positional stand-in like "column 3", which would read like a name and be a fiction.
   */
  column: string | null;
  value: string;
}

/** One addressable piece of the document a date can be attached to. */
export interface ScheduleSegment {
  /** The text a human would read for this row/paragraph. Verbatim; evidence, not input. */
  text: string;
  /**
   * The row's cells, when it came from a recovered grid.
   *
   * 🔴 THIS FIELD IS THE ENTIRE POINT OF THE SLICE. The previous version joined a row back into
   * `"8-17 | - | Exam 1 (…) | - | - | - | -"` and handed that to a date reader, which put `8-17`
   * (a DATE, in the Date column) and `8:-9:50 CST/ 9-10:50 EST` (a TIME, in the Time column) back
   * into one string as neighbouring tokens — reinstating the exact ambiguity the grid had just
   * removed. Measured: the parser recovered all four exams and all six iRATs as clean rows and the
   * extractor still produced two candidates, neither of them an assessment.
   *
   * Empty for a paragraph, which genuinely has no columns.
   */
  cells: ScheduleCell[];
  headingPath: string[];
  unit: number;
  blockIds: string[];
  /** True when this came from one row of a real grid rather than a run of prose. */
  fromTable: boolean;
}

/**
 * The cell under a column whose name means what `match` describes.
 *
 * 🔴 STRUCTURAL NOUNS, NOT SUBJECT MATTER. "date", "topic" and "time" describe the SHAPE of any
 * schedule — a law seminar and a machine-shop lab both have a date column — which is the standing
 * design test. Nothing here knows what the course is about.
 *
 * PURE.
 */
export function cellUnder(cells: readonly ScheduleCell[], match: RegExp): ScheduleCell | null {
  return cells.find((cell) => cell.column && match.test(cell.column)) ?? null;
}

/** Column names that introduce a date. */
export const DATE_COLUMN = /^\s*(date|day|due|when|deadline|week)\b/i;

/**
 * A bare numeric date, read ONLY from a cell the table itself calls a date.
 *
 * 🔴 THIS IS NOT A LOOSENED GLOBAL PATTERN, AND THE DIFFERENCE IS THE WHOLE SAFETY ARGUMENT.
 * `8-17` is unreadable in running text: one real syllabus contains 89 such tokens and most are
 * fragments of `8:-9:50 CST/ 9-10:50 EST` — times, not dates. Teaching the document-wide reader to
 * accept them would turn every one of those into a calendar entry. Inside the cell under a column
 * the author labelled "Date", there is no competing reading: the author already said what it is.
 *
 * So the scoping is what makes this legal, and the caller must not use it anywhere else.
 *
 * 🔴 THE WHITESPACE STRIP IS FOR CELL WRAPPING, NOT TIDINESS. A 20pt-wide column word-wraps `9-28`
 * onto two lines, which `fillGrid` joins as `"9-2 8"`. Dropping the space inside one date cell is
 * the only available reading; doing it over prose would join unrelated numbers.
 *
 * PURE.
 */
export function bareDateInCell(value: string): { month: number; day: number; year?: number } | null {
  const compact = value.replace(/\s+/g, "");
  const m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/.exec(compact);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!m[3]) return { day, month };
  const raw = Number(m[3]);
  return { day, month, year: raw < 100 ? 2000 + raw : raw };
}
/** Column names that introduce what happens. */
export const TOPIC_COLUMN = /^\s*(topic|session|activity|title|subject|assessment|event|description)\b/i;

/**
 * Cut the document into the units a schedule actually lives in.
 *
 * 🔴 A TABLE ROW IS A SEGMENT, AND THAT IS THE WHOLE POINT. `blockToText` renders a grid to
 * markdown, so a 12-row exam table flattened into one string puts twelve dates in one blob and
 * forces whatever reads it to guess which time belongs to which exam. Splitting on rows keeps
 * "Exam 2 | Oct 22 | 1:00–2:30 PM" together and apart from its neighbours, which is exactly the
 * relationship the parser recovered and the old character-window path destroyed.
 *
 * Headings are not segments — they are the ADDRESS of the segments beneath them, and they travel
 * on every one via `headingPath`.
 */
export function segmentsOf(model: DocumentModel): ScheduleSegment[] {
  const out: ScheduleSegment[] = [];
  for (const block of model.blocks) {
    if (block.kind === "heading") continue;
    if (block.kind === "table" && block.table) {
      // 🔴 `columns` RATHER THAN `rows[0]`, BECAUSE A CONTINUATION PAGE HAS NO HEADER OF ITS OWN.
      // The parser resolved effective names across the whole document — including names inherited
      // from the fragment this one continues — and re-deriving them here from this fragment alone
      // would give anonymous columns to every page of a schedule after the first. Structure is the
      // parser's job; this file only consumes it.
      const columns = block.table.columns ?? null;
      const headerLine = columns ? columns.join(" | ") : "";
      // 🔴 EVERY ROW IS READ THROUGH `cellText`, WHICH FOLLOWS MERGED CELLS. A
      // syllabus that draws one Instructor box beside three sessions states the
      // instructor for all three; reading `rows` directly gives that row's own
      // slot, which is empty for two of them, and an empty cell reads as "the
      // document does not say". Measured on the corpus: 150 positions across 36
      // tables carry a value only reachable this way. Where nothing spans, this
      // returns exactly what the row already held.
      const table = block.table;
      for (const [r, row] of table.rows.entries()) {
        if (r < table.headerRows) continue;
        const values = row.map((_, c) => cellText(table, r, c));
        const text = values.join(" | ").trim();
        if (!text) continue;
        out.push({
          blockIds: [block.id],
          cells: values.map((value, i) => ({ column: columns?.[i] ?? null, value })),
          fromTable: true,
          // The header travels with the row so a reader (human or model) can tell which column
          // the date was in. Kept OUT of `text` so evidence stays verbatim.
          headingPath: headerLine ? [...block.headingPath, headerLine] : [...block.headingPath],
          text,
          unit: block.unit,
        });
      }
      continue;
    }
    const text = blockToText(block).trim();
    if (!text) continue;
    out.push({
      blockIds: [block.id],
      cells: [],
      fromTable: false,
      headingPath: [...block.headingPath],
      text,
      unit: block.unit,
    });
  }
  return out;
}

// ── Kind, from structure rather than subject matter ──────────────────────────

/**
 * 🔴 STRUCTURAL ACADEMIC NOUNS, NOT A SUBJECT-MATTER KEYWORD LIST. "exam", "assignment" and
 * "lecture" describe the SHAPE of a course in any discipline — a law student and a mechanical
 * engineering student both sit exams. That is the standing design test, and it is why there is
 * nothing here about drugs, cases or circuits.
 *
 * The heading is consulted before the row, because a section called EXAMINATIONS tells you more
 * about what its rows are than any single row does.
 */
// 🔴 PLURALS MATTER, AND MISSING THEM IS SILENT. Real section headings are "Examinations",
// "Assignments", "Course Meetings" — the plural is the NORMAL form for a heading. A pattern that
// only matched the singular returned `other` for every one of them, and `other` is a perfectly
// respectable-looking answer, so nothing looked broken.
const KIND_WORDS: ReadonlyArray<readonly [ScheduleKind, RegExp]> = [
  ["exam", /\b(exams?|examinations?|midterms?|finals?)\b/i],
  ["quiz", /\b(quiz(zes)?|irat|trat|readiness assurance)\b/i],
  ["assignment", /\b(assignments?|homework|problem sets?|worksheets?|submissions?|due)\b/i],
  ["project", /\b(projects?|presentations?|capstone|portfolios?)\b/i],
  ["class", /\b(lectures?|class(es)?|sessions?|seminars?|labs?|laborator(y|ies)|recitations?|meetings?)\b/i],
  ["deadline", /\b(deadlines?|last day|closes|withdrawal)\b/i],
];

/** The kind a segment most likely describes, from its heading first and its own text second. */
export function kindFor(segment: ScheduleSegment): ScheduleKind {
  const heading = segment.headingPath.join(" ");
  for (const [kind, pattern] of KIND_WORDS) if (pattern.test(heading)) return kind;
  // 🔴 THE TOPIC CELL BEFORE THE WHOLE ROW. A row's other columns carry instructor names, campuses
  // and outcome codes, and matching against all of them lets a lecturer called Dr. Quiz or a
  // learning outcome reading "assessment methods" decide what kind of event this is. The cell that
  // says what happens is the cell that should say what kind it is.
  const topic = cellUnder(segment.cells, TOPIC_COLUMN);
  if (topic) {
    for (const [kind, pattern] of KIND_WORDS) if (pattern.test(topic.value)) return kind;
    return "other";
  }
  for (const [kind, pattern] of KIND_WORDS) if (pattern.test(segment.text)) return kind;
  return "other";
}

// ── Recurrence ───────────────────────────────────────────────────────────────

const DAY_WORDS: ReadonlyArray<readonly [number, RegExp]> = [
  [0, /\bsun(day)?\b/i],
  [1, /\bmon(day)?\b/i],
  [2, /\btue(s|sday)?\b/i],
  [3, /\bwed(nesday)?\b/i],
  [4, /\bthu(r|rs|rsday)?\b/i],
  [5, /\bfri(day)?\b/i],
  [6, /\bsat(urday)?\b/i],
];

/** A 24-hour HH:MM from "1:00 PM", "13:00", "8:00-9:50 am". Null when it is not a time. */
export function normalizeTime(raw: string): string | null {
  const m = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface MeetingPattern {
  days: number[];
  startTime?: string;
  endTime?: string;
}

/**
 * A repeating meeting, when a segment states one.
 *
 * 🔴 TWO OR MORE DAYS, OR IT IS NOT A PATTERN. A single "Friday" in a sentence is far more often
 * a one-off ("the deadline is Friday") than a weekly series, and turning that into a recurrence
 * would put a phantom class on every Friday of the term.
 */
export function meetingPatternOf(text: string): MeetingPattern | null {
  const days = DAY_WORDS.filter(([, pattern]) => pattern.test(text)).map(([day]) => day);
  if (days.length < 2) return null;
  const times = text.match(/\d{1,2}[:.]\d{2}\s*(am|pm)?/gi) ?? [];
  const startTime = times[0] ? normalizeTime(times[0]) ?? undefined : undefined;
  const endTime = times[1] ? normalizeTime(times[1]) ?? undefined : undefined;
  return { days, ...(startTime ? { startTime } : {}), ...(endTime ? { endTime } : {}) };
}

// ── The producer ─────────────────────────────────────────────────────────────

export interface ScheduleFromDocumentOptions {
  /** The canvas source id these candidates are attributed to. */
  sourceId: string;
  /** The stored parse, so a citation can be re-opened. */
  parsedDocumentId?: string;
  canvasId: string;
  /** What an undated or partially-dated expression is measured against. */
  anchor: Date;
  /** Injected so ids are stable and testable. */
  newId: (segment: ScheduleSegment, index: number) => string;
}

export interface ScheduleExtraction {
  candidates: ScheduleCandidate[];
  /** Segments that named a date we could not resolve, with the reason. Never silently dropped. */
  unresolved: { text: string; unit: number; reason: string }[];
  capabilities: ParseCapabilities;
}

/**
 * Every dated thing the document structurally states, as candidates with locators.
 *
 * 🔴 REFUSES OUTRIGHT WITHOUT THE CAPABILITY. Falling back to "run the old text algorithm" here
 * would make the capability layer decorative — the caller would get candidates either way and
 * never learn that the structure it was promised does not exist. The text path still exists and
 * is still reachable; it just has to be CHOSEN.
 */
export function scheduleCandidatesFrom(
  model: DocumentModel | null | undefined,
  options: ScheduleFromDocumentOptions,
): ScheduleExtraction {
  const capabilities = parseCapabilities(model);
  if (!model || !capabilities.scheduleExtraction) {
    return { candidates: [], capabilities, unresolved: [] };
  }

  const candidates: ScheduleCandidate[] = [];
  const unresolved: ScheduleExtraction["unresolved"] = [];
  const segments = segmentsOf(model);

  segments.forEach((segment, index) => {
    // 🔴 THE COLUMN IS THE DISAMBIGUATOR, NOT A BETTER PATTERN. Reading the whole row hands the
    // date finder `8-17` and `8:-9:50 CST/ 9-10:50 EST` as neighbouring tokens and it cannot tell
    // which is a date — 89 such tokens exist in one real syllabus and most are time fragments.
    // Scoped to the cell the table's OWN header calls "Date", there is nothing to disambiguate.
    // The reader itself is unchanged: the same `findDateMentions` every other path uses, so a
    // format it cannot read stays unread here rather than being guessed at locally.
    const dateCell = cellUnder(segment.cells, DATE_COLUMN);
    const dateText = dateCell ? dateCell.value : segment.text;
    let mentions = findDateMentions(dateText);
    // The shared reader first, always — it handles every written form and its year logic is the
    // one the rest of the product uses. Only when a labelled date cell says something it cannot
    // read at all does the bare-numeric form apply, and only to that cell.
    if (mentions.length === 0 && dateCell) {
      const bare = bareDateInCell(dateCell.value);
      if (bare) {
        mentions = [{
          day: bare.day,
          index: 0,
          month: bare.month,
          raw: dateCell.value.trim(),
          ...(bare.year !== undefined ? { year: bare.year } : {}),
        }];
      }
    }
    const pattern = meetingPatternOf(segment.text);

    // A recurring meeting is ONE candidate, not one per date it happens to name. The alternative
    // — a row per occurrence — is how "Tue/Thu, Aug 24–Dec 4" becomes thirty calendar entries
    // nobody asked for.
    if (pattern && mentions.length <= 2) {
      candidates.push(
        candidate({
          confidence: hasHedging(segment.text) ? 0.4 : 0.7,
          kind: "class",
          // 🔴 THE DAYS TRAVEL WITH IT. Keeping only the start time left the calendar with a
          // weekly class it could not place: one undated entry, or thirty if something
          // downstream expanded it by guessing an end. The pattern is what the document said.
          meetsOn: pattern.days,
          options,
          segment,
          title: titleFor(segment),
          ...(pattern.endTime ? { endTime: pattern.endTime } : {}),
          ...(pattern.startTime ? { startTime: pattern.startTime } : {}),
        }, options.newId(segment, index)),
      );
      return;
    }

    for (const mention of mentions) {
      const resolved = resolveYear(mention, options.anchor);
      if (!resolved) {
        unresolved.push({ reason: "the year could not be resolved", text: segment.text.slice(0, 160), unit: segment.unit });
        continue;
      }
      // The time comes from its own column for the same reason, and from the row only when the
      // table never named one.
      const timeCell = cellUnder(segment.cells, /^\s*(time|hour|start)\b/i);
      const time = normalizeTime(timeCell ? timeCell.value : segment.text);
      candidates.push(
        candidate({
          confidence: hasHedging(segment.text) ? 0.4 : segment.fromTable ? 0.85 : 0.7,
          // 🔴 `.date`, NOT `.iso`. Getting this wrong produced a candidate with a title, a kind,
          // a locator and NO DATE — which `toCalendarEvent` refuses as `no_date`, so the item
          // simply never appeared and nothing said why. Silent, plausible, and exactly the
          // failure shape this whole area keeps producing.
          date: resolved.date,
          kind: kindFor(segment),
          options,
          segment,
          title: titleFor(segment),
          ...(time ? { startTime: time } : {}),
        }, options.newId(segment, index)),
      );
    }
  });

  return { candidates, capabilities, unresolved };
}

/** A readable name for the thing, taken from the row or its section — never generated prose. */
/**
 * What to call this entry.
 *
 * 🔴 THE TOPIC CELL BEFORE THE FIRST CELL. Splitting a row on `|` and taking what comes first
 * names every schedule entry after whatever the leftmost column happens to hold — which on a real
 * syllabus is the DATE, so every exam in the calendar would be called "8-17". When the table names
 * a topic column, that column is the title; the positional guess is only the fallback for a row
 * whose columns were never named.
 */
function titleFor(segment: ScheduleSegment): string {
  const topic = cellUnder(segment.cells, TOPIC_COLUMN);
  if (topic?.value.trim()) return topic.value.trim().slice(0, 120);
  // A row with named columns but no topic column: the longest cell is the one carrying content,
  // and it beats "whichever column was printed leftmost" on every layout.
  if (segment.cells.length > 0) {
    const longest = [...segment.cells].sort((a, b) => b.value.trim().length - a.value.trim().length)[0];
    if (longest && longest.value.trim().length >= 3) return longest.value.trim().slice(0, 120);
  }
  const first = segment.fromTable ? segment.text.split("|")[0]?.trim() : segment.text.split(/[.\n]/)[0]?.trim();
  const candidateTitle = (first && first.length >= 3 ? first : segment.headingPath.at(-1)) ?? segment.text;
  return candidateTitle.slice(0, 120);
}

function candidate(
  input: {
    kind: ScheduleKind;
    title: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    meetsOn?: number[];
    confidence: number;
    segment: ScheduleSegment;
    options: ScheduleFromDocumentOptions;
  },
  id: string,
): ScheduleCandidate {
  const { options, segment } = input;
  const ref: SourceRef = {
    excerptId: segment.blockIds[0] ?? "",
    sourceId: options.sourceId,
    blockIds: segment.blockIds,
    headingPath: segment.headingPath,
    unitIndex: segment.unit,
    ...(options.parsedDocumentId ? { parsedDocumentId: options.parsedDocumentId } : {}),
  };
  // 🔴 A RECURRING MEETING HAS NO SINGLE DATE, so it must not be given one. `startAt` is built
  // from a resolved calendar date; a weekly class has weekdays and times and no date at all, and
  // manufacturing one here would put the whole series on whatever day this happened to pick.
  const startAt = input.date
    ? `${input.date}T${input.startTime ?? "00:00"}:00`
    : undefined;
  return {
    canvasId: options.canvasId,
    confidence: input.confidence,
    id,
    kind: input.kind,
    // 🔴 THE ROW AS WRITTEN. Verification later checks this against the stored document, so it has
    // to be what the document says, not a tidied version of it.
    originalExpression: segment.text.slice(0, 400),
    origin: "source_extraction",
    ...(input.meetsOn && input.meetsOn.length > 0 ? { meetsOn: input.meetsOn } : {}),
    ...(input.startTime ? { startTime: input.startTime } : {}),
    ...(input.endTime ? { endTime: input.endTime } : {}),
    resolvedAgainst: options.anchor.toISOString(),
    sourceRefs: [ref],
    status: "candidate",
    title: input.title,
    ...(startAt ? { startAt } : {}),
  };
}
