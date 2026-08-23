// Calling Gemini Vision on a photo or drawing of a learner's handwritten or hand-drawn work, and
// turning the reply into a HandwritingObservation — never into a verdict.
//
// 🔴 REUSES THE EXISTING VISION PLUMBING RATHER THAN INVENTING A SECOND CLIENT. `readImage`
// (lib/vision/read.ts — DeepSeek first, the Gemini ladder behind it) owns the provider choice,
// the key lookup, the size ceiling, the spend row and the
// "never throw, return null on infra failure" contract — the same client `/api/study/occlusion`
// uses to turn a slide into suggested boxes. This module supplies a different prompt and a
// different parser; it does not touch the network itself.
//
// Everything except the single fetch inside `readWithVision` is pure and unit-tested here without
// a live key — see vision.test.ts, which mocks `globalThis.fetch` exactly as
// lib/vision/gemini.test.ts and lib/pdf/vision.test.ts already do.

import { jsonFrom } from "@nemesis/shared";

import type { VisionEnv } from "@/lib/vision/gemini";
import { readImage, type VisionSpend } from "@/lib/vision/read";

import type { HandwritingItem, HandwritingObservation } from "./types";

/**
 * The instruction the vision model is given.
 *
 * 🔴 EXPORTED SO A TEST CAN ASSERT THE "DO NOT GRADE" INSTRUCTION IS ACTUALLY STATED, rather than
 * trusting it was written once and never checked — the same reason OCCLUSION_VISION_PROMPT
 * (packages/shared/src/occlusion-suggest.ts) is exported.
 *
 * 🔴 DELIBERATELY DOES NOT MENTION ANY EXPECTED ELEMENT, LABEL, OR ANSWER. Telling the model what
 * a complete answer should contain and asking it to check for those things leads the witness — a
 * model prompted with "look for mitochondrion, nucleus" tends to report finding them, confidence
 * and all. This prompt asks only for a raw inventory of what is actually on the page;
 * `matchExpectedElements` (match-elements.ts) does the matching afterwards, in code that can be
 * read and revised without re-prompting the model.
 */
export const HANDWRITING_OBSERVATION_PROMPT = [
  "You are looking at a photo or drawing of a learner's handwritten or hand-drawn work.",
  "",
  "Report only what is visibly on the page. Do not grade it, do not say whether it is correct,",
  "and do not say what it means. You are a pair of eyes, not a teacher.",
  "",
  "Return ONLY JSON, no prose and no code fence, in exactly this shape:",
  '{"transcription":"...","transcriptionConfidence":0.8,'
    + '"items":[{"text":"...","kind":"text","confidence":0.9}],'
    + '"spatialRelations":["..."],"abstained":false,"abstentionReason":null}',
  "",
  "transcription: every word of legible text on the page, in reading order.",
  "items: each distinct written or drawn thing as its own entry. \"kind\" is \"text\" for a word,",
  "phrase, or label, and \"drawing\" for a shape, arrow, or symbol with no legible text of its",
  "own — describe those in a few plain words, for example \"an arrow pointing from the left",
  "circle to the box\".",
  "spatialRelations: plain observations about how items sit relative to each other, such as which",
  "is above, below, connected to, or pointing at which. An empty array is correct when nothing on",
  "the page is spatially meaningful.",
  "Every confidence value is 0 to 1 and describes only how sure you are of THE READING, never of",
  "whether anything on the page is right.",
  "",
  "If the image is too blurred, too dark, cut off, or shows no legible writing or drawing at all,",
  "set \"abstained\" to true, give a short plain reason, and leave transcription and items empty.",
  "Guessing at handwriting you cannot make out is worse than saying you could not read it.",
].join("\n");

/** How many items or spatial relations a reply may report before the rest are dropped. No page of
 *  handwritten work has hundreds of distinguishable parts — past this point the model is
 *  inventing, the same reasoning MAX_SUGGESTED_BOXES already applies to occlusion boxes. */
const MAX_ITEMS = 40;
const MAX_SPATIAL_RELATIONS = 20;
/** A defensive cap so one runaway field cannot blow up storage or a UI that renders it verbatim. */
const MAX_TEXT_LENGTH = 4_000;
const MAX_ITEM_TEXT_LENGTH = 300;

function finiteConfidence(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  // 🔴 REFUSES RATHER THAN CLAMPS. A confidence outside 0-1 is a units problem exactly like an
  // occlusion box outside 0-1 (occlusion-suggest.ts's looksNormalized) — evidence the model
  // answered on a different scale (a percentage, a 1-10 score) or hallucinated the field. Coercing
  // 95 down to 1 would assert near-total certainty the model never reported; the honest reading is
  // "we do not know how sure it was".
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 1) return null;
  return n;
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseItems(value: unknown): HandwritingItem[] {
  if (!Array.isArray(value)) return [];
  const out: HandwritingItem[] = [];
  for (const row of value) {
    if (out.length >= MAX_ITEMS) break;
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const text = cleanString(record.text, MAX_ITEM_TEXT_LENGTH);
    if (!text) continue; // An item that names nothing is not an observation.
    out.push({
      confidence: finiteConfidence(record.confidence),
      kind: record.kind === "drawing" ? "drawing" : "text",
      text,
    });
  }
  return out;
}

function parseSpatialRelations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const row of value) {
    if (out.length >= MAX_SPATIAL_RELATIONS) break;
    const text = cleanString(row, MAX_ITEM_TEXT_LENGTH);
    if (text) out.push(text);
  }
  return out;
}

const UNREADABLE_REPLY_REASON = "Nemesis could not understand the reading it got back for this image.";

/**
 * Turn whatever text the model returned into an observation, defaulting to abstention on anything
 * that does not parse cleanly.
 *
 * 🔴 REFUSES RATHER THAN GUESSES — the same rule occlusion-suggest.ts's `looksNormalized` applies
 * to units. A malformed reply becomes `abstained: true`, never a coerced or partially-invented
 * observation: silently accepting garbage here would let a parsing bug look, to every caller
 * downstream, exactly like a real "could not read this" — except that a real abstention is a fact
 * about the photo, and a parsing bug is a fact about this function, and the two must never be
 * indistinguishable in a durable record.
 *
 * 🔴 AND A MODEL THAT DECLARED `abstained: true` IS BELIEVED COMPLETELY — its own transcription
 * and items are DISCARDED even if it also sent some, rather than trusted as "abstained, but here
 * is a partial reading anyway". A model unsure enough to abstain is not a source to selectively
 * quote from.
 *
 * PURE.
 */
export function parseHandwritingObservation(text: string, model: string): HandwritingObservation {
  const payload = jsonFrom(text);
  // 🔴 `Array.isArray` IS NOT REDUNDANT WITH THE `typeof` CHECK. `typeof [1, 2, 3] === "object"`
  // in JavaScript, so `JSON.parse("[1,2,3]")` — valid JSON, wrong shape — would otherwise slip
  // past this guard and be read as a record with every field `undefined`, producing a confident
  // `abstained: false` empty observation instead of the honest abstention a malformed reply
  // deserves. Caught by vision.test.ts's own "valid JSON, but not an object" case.
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      abstained: true,
      abstentionReason: UNREADABLE_REPLY_REASON,
      items: [],
      model,
      spatialRelations: [],
      transcription: "",
      transcriptionConfidence: null,
    };
  }

  const record = payload as Record<string, unknown>;
  const abstained = record.abstained === true;
  if (abstained) {
    const reason = cleanString(record.abstentionReason, MAX_ITEM_TEXT_LENGTH);
    return {
      abstained: true,
      abstentionReason: reason || "The image could not be read clearly enough.",
      items: [],
      model,
      spatialRelations: [],
      transcription: "",
      transcriptionConfidence: null,
    };
  }

  return {
    abstained: false,
    abstentionReason: null,
    items: parseItems(record.items),
    model,
    spatialRelations: parseSpatialRelations(record.spatialRelations),
    transcription: cleanString(record.transcription, MAX_TEXT_LENGTH),
    transcriptionConfidence: finiteConfidence(record.transcriptionConfidence),
  };
}

export interface HandwritingAnalysisOptions {
  env?: VisionEnv;
  signal?: AbortSignal;
  /** Who to bill. Forwarded to the vision front door, which writes the one spend row. */
  spend?: VisionSpend;
}

/**
 * Read a photo or drawing of a learner's handwritten or hand-drawn work and report what is on it.
 *
 * 🔴 `null` IS AN INFRASTRUCTURE FAILURE — NEVER AN ABSTENTION. Unconfigured vision, an oversized
 * file, or a provider outage returns `null`, exactly like every other `readWithVision` caller, so
 * the surface calling this can fall back to "try again" or "type instead". A model that ran and
 * genuinely could not read the image returns a real `HandwritingObservation` with
 * `abstained: true` — a value, not an absence, because "we tried and could not read it" is
 * different information from "we never tried" and callers must be able to tell them apart.
 */
export async function analyzeHandwriting(
  bytes: Uint8Array,
  mimeType: string,
  options: HandwritingAnalysisOptions = {},
): Promise<HandwritingObservation | null> {
  const result = await readImage(bytes, mimeType, {
    env: options.env,
    prompt: HANDWRITING_OBSERVATION_PROMPT,
    signal: options.signal,
    ...(options.spend ? { spend: options.spend } : {}),
  });
  if (!result) return null;
  return parseHandwritingObservation(result.text, result.model);
}
