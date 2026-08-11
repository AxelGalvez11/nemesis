// The ONE place a calendar event crosses the schema boundary.
//
// 🔴 THE BUG CLASS THIS EXISTS TO END. There were two hand-written decoders — `sanitizeEvent`
// for the browser's cache and `calendarEventFromRow` for the cloud — each naming the keys it
// knew and rebuilding the object from them. Both therefore DELETED anything they did not
// recognise, and the failure is silent in the worst way:
//
//     a writer adds a field  →  the other reader does not know it
//     →  that reader drops it  →  the next save writes the object back WITHOUT it
//     →  the field is gone from the database, permanently, with no error anywhere
//
// Everything looks like it saved correctly the entire time. `parseRecurrence` was already
// pulled out for exactly this reason; this finishes the job for the whole event.
//
// The invariant, stated so a test can check it:
//
//     an event written by any supported writer survives every supported read path
//     without losing a recognised field
//
// 🔴 AND UNRECOGNISED FIELDS SURVIVE TOO. `extra` carries keys this build does not know about
// back out on write. A tab running last week's deploy can therefore read, re-save, and not
// destroy something this week's deploy added. Strict decoding would need version negotiation to
// be safe; carrying the unknown is cheaper and fails in the harmless direction.

import type { SourceRef } from "@/lib/learn/canvas-model";

import { type CalendarEvent, type CalendarEventKind, parseRecurrence } from "./calendar-model";

/** Why this event exists (§19). Distinct from `source`, which says who may edit it:
 *  `source: "agent"` is read-only in the UI, and that is a permissions fact, not a semantic one.
 *
 *  🔴 An exam has a date because the world says so. A review block exists because Nemesis
 *  suggested it. Rendering them as peers is what makes a calendar untrustworthy, so the
 *  distinction is stored rather than inferred. */
export type CalendarOrigin = "user" | "source_extraction" | "nemesis_plan";

const ORIGINS: ReadonlySet<string> = new Set<CalendarOrigin>(["user", "source_extraction", "nemesis_plan"]);
const KINDS: ReadonlySet<string> = new Set<CalendarEventKind>([
  "assignment",
  "exam",
  "rotation",
  "class",
  "other",
]);

/** Provenance and planning fields, added 2026-08-11. All optional: every row written before
 *  this decodes with them absent, which is what "additive" has to mean for data already in the
 *  database. */
export interface CalendarProvenance {
  origin?: CalendarOrigin;
  /** The Canvas session this belongs to, so Calendar can open it (§23). */
  canvasId?: string;
  /** Which excerpts of which sources said so. §14: a date the learner cannot trace is a date
   *  they have to take on faith, and dates are too consequential for faith. */
  sourceRefs?: SourceRef[];
  confidence?: number;
  /** What the material literally said — "next Thursday". Never discarded (§15). */
  originalExpression?: string;
  /** What that was measured against, so the resolution can be re-checked. */
  resolvedAgainst?: string;
}

export type DecodedCalendarEvent = CalendarEvent &
  CalendarProvenance & {
    /** Keys this build does not recognise, carried through untouched. */
    extra?: Record<string, unknown>;
  };

/** Every key the current build understands. Anything else goes to `extra`. */
const KNOWN = new Set([
  "id",
  "user_id",
  "title",
  "date",
  "time",
  "endTime",
  "end_time",
  "kind",
  "course",
  "note",
  "source",
  "recurrence",
  "seriesId",
  "origin",
  "canvasId",
  "canvas_id",
  "sourceRefs",
  "source_refs",
  "confidence",
  "originalExpression",
  "original_expression",
  "resolvedAgainst",
  "resolved_against",
  "created_at",
  "updated_at",
  "extra",
]);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Source references, with the whole locator — not just the two fields this
 * function used to know about.
 *
 * 🔴 THIS REBUILT EACH REF FROM `sourceId` AND `excerptId` AND SILENTLY DROPPED
 * THE REST, WHICH IS THE FAILURE THIS FILE'S OWN HEADER WARNS ABOUT. `SourceRef`
 * grew `parsedDocumentId`, `unitIndex`, `blockIds` and `headingPath` precisely so
 * a calendar entry could answer "show me where that came from" — and the writer
 * stored all four while this reader returned two, so every date came back
 * pointing at a canvas-local string and nothing else. Measured on a real
 * syllabus: 48 of 48 events lost their page and block ids between being written
 * and being read, with no error on either side.
 *
 * `excerptId` remains required because it is the canvas-local identity every
 * existing ref carries; the locator fields are optional because a source may
 * genuinely have no structure, and ABSENT MEANS UNKNOWN — never page 1.
 */
function refs(value: unknown): SourceRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SourceRef[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const sourceId = str(record.sourceId ?? record.source_id);
    const excerptId = str(record.excerptId ?? record.excerpt_id);
    if (!sourceId || !excerptId) continue;
    const parsedDocumentId = str(record.parsedDocumentId ?? record.parsed_document_id);
    const rawUnit = record.unitIndex ?? record.unit_index;
    const unitIndex = typeof rawUnit === "number" && Number.isInteger(rawUnit) && rawUnit >= 0 ? rawUnit : undefined;
    const rawBlocks = record.blockIds ?? record.block_ids;
    const blockIds = Array.isArray(rawBlocks)
      ? rawBlocks.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined;
    const rawHeadings = record.headingPath ?? record.heading_path;
    const headingPath = Array.isArray(rawHeadings)
      ? rawHeadings.filter((h): h is string => typeof h === "string")
      : undefined;
    out.push({
      excerptId,
      sourceId,
      ...(parsedDocumentId ? { parsedDocumentId } : {}),
      ...(unitIndex !== undefined ? { unitIndex } : {}),
      ...(blockIds && blockIds.length > 0 ? { blockIds } : {}),
      ...(headingPath && headingPath.length > 0 ? { headingPath } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Row or cached object → typed event. Null when it is not an event at all.
 *
 *  🔴 THE ONLY DECODER. Both the cloud reader and the localStorage reader call this. Adding a
 *  field here makes it survive on both paths at once, which is the entire point — there is no
 *  longer a second list to forget. */
export function decodeCalendarEvent(raw: unknown): DecodedCalendarEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const id = str(row.id);
  const title = str(row.title);
  const date = str(row.date);
  if (!id || !title || !date || !DATE_KEY.test(date)) return null;

  const kindRaw = typeof row.kind === "string" ? row.kind : "";
  const event: DecodedCalendarEvent = {
    id,
    title,
    date,
    // An unrecognised kind is a formatting slip, not a reason to drop somebody's exam.
    kind: (KINDS.has(kindRaw) ? kindRaw : "other") as CalendarEventKind,
  };

  const time = str(row.time);
  if (time) event.time = time;
  const endTime = str(row.endTime) ?? str(row.end_time);
  if (endTime) event.endTime = endTime;
  const course = str(row.course);
  if (course) event.course = course;
  const note = str(row.note);
  if (note) event.note = note;
  if (row.source === "agent" || row.source === "manual") event.source = row.source;
  const seriesId = str(row.seriesId);
  if (seriesId) event.seriesId = seriesId;

  const recurrence = parseRecurrence(row.recurrence);
  if (recurrence) event.recurrence = recurrence;

  const origin = str(row.origin);
  if (origin && ORIGINS.has(origin)) event.origin = origin as CalendarOrigin;
  const canvasId = str(row.canvasId) ?? str(row.canvas_id);
  if (canvasId) event.canvasId = canvasId;
  const sourceRefs = refs(row.sourceRefs ?? row.source_refs);
  if (sourceRefs) event.sourceRefs = sourceRefs;
  if (typeof row.confidence === "number" && Number.isFinite(row.confidence)) {
    event.confidence = Math.min(1, Math.max(0, row.confidence));
  }
  const expression = str(row.originalExpression) ?? str(row.original_expression);
  if (expression) event.originalExpression = expression;
  const against = str(row.resolvedAgainst) ?? str(row.resolved_against);
  if (against) event.resolvedAgainst = against;

  // 🔴 Everything this build does not know, kept rather than dropped.
  const carried = (row.extra && typeof row.extra === "object" ? { ...(row.extra as object) } : {}) as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(row)) {
    if (!KNOWN.has(key)) carried[key] = value;
  }
  if (Object.keys(carried).length > 0) event.extra = carried;

  return event;
}

/** Typed event → the row shape the database takes.
 *
 *  Owns persistence semantics in one place, so a writer cannot disagree with the reader about
 *  what a field is called. */
export function encodeCalendarEvent(
  event: DecodedCalendarEvent,
  userId: string,
  source: "agent" | "manual",
): Record<string, unknown> {
  return {
    id: event.id,
    user_id: userId,
    title: event.title,
    date: event.date,
    time: event.time ?? null,
    end_time: event.endTime ?? null,
    kind: event.kind,
    course: event.course ?? null,
    note: event.note ?? null,
    source,
    recurrence: event.recurrence ?? null,
    origin: event.origin ?? null,
    canvas_id: event.canvasId ?? null,
    source_refs: event.sourceRefs ?? null,
    confidence: event.confidence ?? null,
    original_expression: event.originalExpression ?? null,
    resolved_against: event.resolvedAgainst ?? null,
    // Unknown keys ride back out so a newer field survives an older client's re-save.
    extra: event.extra && Object.keys(event.extra).length > 0 ? event.extra : null,
  };
}
