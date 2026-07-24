/**
 * Reading a PDF that has no text layer — scans, photographed pages, slide decks
 * exported as images. unpdf pulls the text LAYER; when a page is a picture of
 * text there is no layer to pull, which is why /api/notebooks/extract/file has
 * always answered "This PDF has no selectable text (it may be scanned images)".
 * This module is what that dead end turns into.
 *
 * Gemini's flash/pro models are multimodal and accept a PDF directly as inline
 * data — each page is processed as an image server-side — so no page rasteriser
 * or OCR binary is needed here. Bytes in, transcript out.
 *
 * INERT BY DEFAULT. `GEMINI_API_KEY` lives in the Supabase vault, not in this
 * app's environment, so `visionConfigured()` is false in production today and
 * every caller falls straight back to the existing text-only behaviour. Adding
 * the key to the web app's environment is the single owner-side step that turns
 * this on; nothing else changes. That is deliberate — a half-wired vision path
 * that throws at request time would be worse than one that is simply off.
 *
 * Scope, stated plainly: this reads pages that have NO text layer. Diagrams and
 * figures embedded in a PDF that already has readable text are a different job
 * (they need an image extractor to pull the figure out first) and are not
 * handled here.
 *
 * Everything except the single fetch is pure and unit-tested.
 */

/** Google retires fixed model ids for new keys (learned 2026-07-14 with
 *  gemini-2.5-flash → 404 on a fresh key), so walk a ladder newest-first on a
 *  404 exactly like supabase/functions/nemesis-media does. */
export const VISION_MODEL_LADDER = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini takes inline data base64-encoded, which inflates bytes by ~4/3, and
 *  the inline request ceiling is 20 MB. 14 MB of PDF stays under it with room
 *  for the prompt; anything larger falls back rather than failing upstream. */
export const VISION_MAX_BYTES = 14 * 1024 * 1024;

/** Transcription, not summarising — the output becomes the student's Library
 *  note, so an invented heading is a corrupted note. */
export const VISION_PROMPT =
  "Transcribe every word of text in this document, page by page, in reading order. " +
  "Preserve headings, lists, and table structure using plain markdown. " +
  "For a diagram, figure, or chart, add a short bracketed description of what it shows followed by any text it contains. " +
  "Do not summarise, do not add commentary, and do not invent text that is not visible. " +
  "If a page is genuinely blank, write nothing for it.";

export interface VisionResult {
  text: string;
  model: string;
}

/** The environment this module reads, as a plain string bag rather than
 *  NodeJS.ProcessEnv: `process.env` satisfies it, and a test can pass a literal
 *  `{ GEMINI_API_KEY: "k" }` without fabricating NODE_ENV and the rest. Only
 *  GEMINI_API_KEY and GEMINI_VISION_MODEL are ever read. */
export type VisionEnv = Readonly<Record<string, string | undefined>>;

/** Whether the vision fallback can run at all. False in production today. */
export function visionConfigured(env: VisionEnv = process.env): boolean {
  return Boolean((env.GEMINI_API_KEY ?? "").trim());
}

/** The ladder to walk, honouring a GEMINI_VISION_MODEL override. PURE. */
export function visionModels(env: VisionEnv = process.env): string[] {
  const override = (env.GEMINI_VISION_MODEL ?? "").trim();
  return override ? [override] : [...VISION_MODEL_LADDER];
}

/** Small enough to send inline? PURE. */
export function withinVisionLimit(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= VISION_MAX_BYTES;
}

/** Pull the transcript out of a generateContent response, joining the parts.
 *  Returns "" for a blocked, empty, or malformed reply — the caller treats that
 *  the same as "no text found". PURE. */
export function parseVisionText(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  const chunks: string[] = [];
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: unknown } })?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const text = (part as { text?: unknown })?.text;
      if (typeof text === "string" && text.trim()) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

/** The generateContent request body for one PDF. PURE. */
export function buildVisionRequest(base64: string): string {
  return JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { data: base64, mime_type: "application/pdf" } },
          { text: VISION_PROMPT },
        ],
      },
    ],
    // Transcription must not drift; temperature 0 keeps it literal.
    generationConfig: { temperature: 0 },
  });
}

/**
 * Read a text-layer-less PDF with Gemini. Returns null — never throws — whenever
 * vision is unconfigured, the file is too large, or the provider fails, so the
 * caller keeps its existing "no selectable text" answer instead of turning a
 * missing key into a 500.
 */
export async function readPdfWithVision(
  bytes: Uint8Array,
  options: { env?: VisionEnv; signal?: AbortSignal } = {},
): Promise<VisionResult | null> {
  const env = options.env ?? process.env;
  const key = (env.GEMINI_API_KEY ?? "").trim();
  if (!key) return null;
  if (!withinVisionLimit(bytes.byteLength)) return null;

  const body = buildVisionRequest(Buffer.from(bytes).toString("base64"));
  for (const model of visionModels(env)) {
    let response: Response;
    try {
      response = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
        body,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        method: "POST",
        signal: options.signal,
      });
    } catch {
      continue;
    }
    // Model id retired for this key — try the next rung.
    if (response.status === 404) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    const text = parseVisionText(payload);
    if (text) return { model, text };
    return null;
  }
  return null;
}
