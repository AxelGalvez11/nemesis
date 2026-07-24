"use client";

// Syllabus import orchestrator — file in, verified events out. Follows the
// same shape as study-generate.ts: one non-streaming metered completion via
// postChatCompletion, then pure parsing and checking.
//
// Nothing here writes to the calendar. It returns a VerifiedSyllabus for the
// review step to show; only the student pressing "Add these" writes anything.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import { extractDocument } from "@/lib/workspace/chat-attachments";
import { jsonSlice } from "@/lib/workspace/study-artifact-content";
import {
  buildSyllabusPrompt,
  SYLLABUS_SYSTEM_PROMPT,
  type SyllabusExtraction,
  type VerifiedSyllabus,
  verifySyllabus,
} from "@/lib/workspace/syllabus";

/** How much of the file the model sees. A syllabus that runs past this is
 *  mostly policy boilerplate — the schedule is near the front — and an
 *  unbounded prompt is an unbounded bill. */
export const SYLLABUS_TEXT_LIMIT = 24_000;

/** Local yyyy-mm-dd. The calendar stores local dates with no timezone
 *  (calendar-model.ts), so building this from UTC would shift the anchor a day
 *  in negative-offset zones and push every inferred year decision with it. */
function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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
  const fullText = await extractDocument(file, uid);

  // The model sees this slice, and verification checks quotes against THIS
  // SAME slice. Verifying against the full text instead would accept a quote
  // from a part of the document the model was never shown — which can only
  // happen by coincidence or fabrication.
  const text = fullText.slice(0, SYLLABUS_TEXT_LIMIT);
  if (!text.trim()) {
    return { course: null, term: null, events: [], meetings: [], dropped: [], note: "That file had no readable text." };
  }

  const reply = await postChatCompletion(
    uid,
    [
      { content: SYLLABUS_SYSTEM_PROMPT, role: "system" },
      { content: buildSyllabusPrompt(text, localDateKey(today)), role: "user" },
    ],
    { decision: { model: "deepseek-chat", route: "conversation", searchWeb: false } },
  );
  if (!reply.text) throw new Error(reply.errorText ?? "The engine couldn't read that syllabus. Try again.");

  const parsed = jsonSlice(reply.text) as SyllabusExtraction | null;
  return verifySyllabus(parsed, { newId: newEventId, sourceText: text, today });
}
