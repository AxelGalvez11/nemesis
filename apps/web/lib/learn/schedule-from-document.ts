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
  tables: boolean;
}

export const NO_CAPABILITIES: ParseCapabilities = {
  figures: false,
  locators: false,
  scheduleExtraction: false,
  structuredText: false,
  tables: false,
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
    tables: kinds.has("table"),
  };
}

/** One addressable piece of the document a date can be attached to. */
export interface ScheduleSegment {
  /** The text a human would read for this row/paragraph. */
  text: string;
  headingPath: string[];
  unit: number;
  blockIds: string[];
  /** True when this came from one row of a real grid rather than a run of prose. */
  fromTable: boolean;
}

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
      const header = block.table.headerRows > 0 ? block.table.rows.slice(0, block.table.headerRows) : [];
      const headerLine = header.map((row) => row.join(" | ")).join(" ");
      for (const row of block.table.rows.slice(block.table.headerRows)) {
        const text = row.join(" | ").trim();
        if (!text) continue;
        out.push({
          blockIds: [block.id],
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
    const mentions = findDateMentions(segment.text);
    const pattern = meetingPatternOf(segment.text);

    // A recurring meeting is ONE candidate, not one per date it happens to name. The alternative
    // — a row per occurrence — is how "Tue/Thu, Aug 24–Dec 4" becomes thirty calendar entries
    // nobody asked for.
    if (pattern && mentions.length <= 2) {
      candidates.push(
        candidate({
          confidence: hasHedging(segment.text) ? 0.4 : 0.7,
          kind: "class",
          options,
          segment,
          title: titleFor(segment),
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
      const time = normalizeTime(segment.text);
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
function titleFor(segment: ScheduleSegment): string {
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
    resolvedAgainst: options.anchor.toISOString(),
    sourceRefs: [ref],
    status: "candidate",
    title: input.title,
    ...(startAt ? { startAt } : {}),
  };
}
