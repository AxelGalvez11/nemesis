"use client";

// Syllabus import orchestrator — file in, verified events out. Follows the
// same shape as study-generate.ts: one non-streaming metered completion via
// postChatCompletion, then pure parsing and checking.
//
// Nothing here writes to the calendar. It returns a VerifiedSyllabus for the
// review step to show; only the student pressing "Add these" writes anything.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import { extractFile } from "@/lib/workspace/chat-attachments";
import { jsonSlice } from "@/lib/workspace/study-artifact-content";
import { buildFromCensus, type VerifiedSyllabus } from "@/lib/workspace/syllabus";
import {
  applyLabels,
  buildCensusPrompt,
  CENSUS_SYSTEM_PROMPT,
  censusEntries,
  CONTEXT_RADIUS,
  findDateMentions,
  HEADER_CHARS,
  resolveMentions,
} from "@/lib/workspace/syllabus-dates";

/**
 * Roughly how many characters of date context one request may carry.
 *
 * The old pipeline sent a WINDOW of the document and hoped the schedule was
 * inside it. This one sends the neighbourhood of every date it found, so the
 * document's length stops mattering and only the number of dates does. The
 * budget keeps a pathological file — a department handbook listing every
 * deadline of every course — from building a request nothing will answer.
 */
export const CENSUS_PROMPT_BUDGET = 60_000;

/** Below this there is not enough around a date to tell what it is, so the
 *  entry count is cut instead of squeezing the context further. */
const MIN_CONTEXT_RADIUS = 150;

/** More dates than any real syllabus has, and well past what MAX_IMPORT_EVENTS
 *  would let through anyway. */
const MAX_CENSUS_ENTRIES = 200;

function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ReadSyllabusOptions {
  file: File;
  uid: string;
  /** Injected so callers and tests control "now". */
  today?: Date;
}

/**
 * Read a syllabus file and return the events it genuinely contains.
 *
 * Throws only for failures the student can act on (unreadable file, engine
 * unreachable). A syllabus the model simply found nothing in comes back as a
 * normal result carrying a `note`, not an exception.
 */
export async function readSyllabus(options: ReadSyllabusOptions): Promise<VerifiedSyllabus> {
  const { file, uid } = options;
  const today = options.today ?? new Date();

  // Scanned syllabi (a photo of a printout, an image-only export) land here as
  // an empty text layer; the extract route falls back to reading the pages
  // with vision when that is configured, and otherwise returns its own
  // "no selectable text" error, which surfaces to the student unchanged.
  //
  // extractFile REPLACED extractDocument when photographs became readable: it
  // takes an image as happily as a PDF, so a syllabus the student photographed
  // now imports by the same path. Only `.text` is wanted here — the title it
  // also returns describes the FILE, and the course name is read from the
  // content by verifySyllabus instead.
  const { text: fullText } = await extractFile(file, uid);
  if (!fullText.trim()) {
    return { course: null, dropped: [], events: [], meetings: [], note: "That file had no readable text.", term: null };
  }

  // 🔴 THE WHOLE DOCUMENT IS SCANNED, not a window of it.
  //
  // Windowing was the old design's answer to a long syllabus, and it was always
  // a gamble: the owner's file states an immunization deadline in a paragraph
  // on page 8 and keeps its schedule table on pages 14 to 25, fourteen thousand
  // characters apart. No single window holds both. Finding dates costs a regular
  // expression, so there is no reason to look at less than all of it.
  const resolved = resolveMentions(findDateMentions(fullText), today);
  if (resolved.length === 0) {
    return { course: null, dropped: [], events: [], meetings: [], note: "No dates were found in that file.", term: null };
  }

  // Shrink the context around each date to fit the budget rather than dropping
  // dates — a cramped label is recoverable, a missing deadline is not. Only
  // once the context is as small as it can usefully be does the count get cut.
  const kept = resolved.slice(0, MAX_CENSUS_ENTRIES);
  const radius = Math.max(
    MIN_CONTEXT_RADIUS,
    Math.min(CONTEXT_RADIUS, Math.floor(CENSUS_PROMPT_BUDGET / kept.length / 2)),
  );
  const entries = censusEntries(fullText, kept, radius);
  const header = fullText.slice(0, HEADER_CHARS);

  const reply = await postChatCompletion(
    uid,
    [
      { content: CENSUS_SYSTEM_PROMPT, role: "system" },
      { content: buildCensusPrompt(entries, header), role: "user" },
    ],
    { decision: { route: "conversation", searchWeb: false } },
  );
  if (!reply.text) throw new Error(reply.errorText ?? "The engine couldn't read that syllabus. Try again.");

  const parsed = jsonSlice(reply.text) as Record<string, unknown> | null;
  const outcome = applyLabels(entries, parsed?.labels);

  // Meeting quotes are still checked verbatim, and against exactly what the
  // model was shown — the opening plus every date context, never the whole
  // document. A quote from a page it never saw could only be a coincidence or
  // an invention.
  const shown = [header, ...entries.map((entry) => entry.context)].join("\n");
  const result = buildFromCensus(outcome, parsed?.meetings, {
    course: typeof parsed?.course === "string" && parsed.course.trim() ? parsed.course.trim() : null,
    newId: newEventId,
    sourceText: shown,
    term: typeof parsed?.term === "string" && parsed.term.trim() ? parsed.term.trim() : null,
  });

  if (resolved.length > kept.length) {
    result.dropped.push({
      reason: `Only the first ${MAX_CENSUS_ENTRIES} dates in this file were read`,
      title: `(${resolved.length - kept.length} more dates)`,
    });
  }
  return result;
}
