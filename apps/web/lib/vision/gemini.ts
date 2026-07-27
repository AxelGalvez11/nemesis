/**
 * Reading a PICTURE — a photo of a lecture slide, a textbook page, a whiteboard,
 * a page of handwriting — and turning it into text the rest of the app can use.
 *
 * Gemini's flash models are multimodal: bytes and a mime type go in, a
 * transcript comes out. No OCR binary, no rasteriser, no image preprocessing.
 * That is the whole of the "vision" here.
 *
 * WHY THIS FILE IS MIME-AGNOSTIC. PR #278 adds lib/pdf/vision.ts, which does the
 * same thing hardwired to application/pdf so a scanned PDF stops being a dead
 * end. Both call one endpoint with one ladder; keeping two copies of a model
 * ladder is how ladders drift apart. This module is the general one — once #278
 * lands, readPdfWithVision collapses into a three-line wrapper over
 * readWithVision(bytes, "application/pdf", { prompt: DOCUMENT_PROMPT }) and the
 * duplicate ladder goes away. They are separate files today only because #278 is
 * stacked behind a conflicting PR and this work must not wait on it.
 *
 * Everything except the single fetch is pure and unit-tested.
 */

/** Walk a current, production-priced ladder on a 404 exactly like
 * supabase/functions/nemesis-media does. Gemini 2.0 Flash was shut down on
 * 2026-06-01, so it must not remain the recovery path for camera or slide OCR.
 * Flash-Lite is the lower-cost fallback and is still multimodal. */
export const VISION_MODEL_LADDER = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini takes inline data base64-encoded, which inflates bytes by ~4/3, and
 *  the inline request ceiling is 20 MB. 14 MB of original file stays under it
 *  with room for the prompt. A 12-megapixel iPhone photo is ~3-5 MB, so this is
 *  many times the size of anything the camera will hand us. */
export const VISION_MAX_BYTES = 14 * 1024 * 1024;

/** The image formats Gemini accepts AND the storage bucket allows. HEIC/HEIF
 *  are here because they are what an iPhone camera produces by default — an
 *  allowlist without them rejects the most common input on the platform the
 *  camera feature was asked for. SVG is deliberately absent: it is a
 *  script-capable format, and it is not a photograph. */
export const VISION_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const EXTENSION_MIME: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * The image mime type for an upload, or null when it is not an image we read.
 *
 * The browser's own `file.type` is trusted first and the filename is the
 * fallback, because the two disagree in both directions in practice: Safari
 * hands up an empty type for a HEIC picked from Files, and some Android
 * pickers report `application/octet-stream` for a perfectly ordinary JPEG.
 * PURE.
 */
export function visionMime(name: string, type: string): string | null {
  const declared = type.trim().toLowerCase();
  if ((VISION_IMAGE_MIMES as readonly string[]).includes(declared)) return declared;
  // image/jpg is not a real mime type but is written by enough tools to matter.
  if (declared === "image/jpg") return "image/jpeg";
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME[extension] ?? null;
}

/** Transcription, not summarising — for a slide or a page of notes the output
 *  becomes the student's Library note, and an invented heading is a corrupted
 *  note. The second half matters as much as the first: a photo is not always a
 *  document. A student photographing a piece of lab equipment, a rash, a
 *  worked-out whiteboard diagram gets a description rather than an empty
 *  answer, and the model is told to say plainly when it cannot read something
 *  instead of guessing at blurred handwriting. */
export const PHOTO_PROMPT =
  "Read this photograph. " +
  "Transcribe every word of text you can see, in reading order, preserving headings, lists, and table structure using plain markdown. " +
  "For a diagram, figure, chart, or equation, add a short bracketed description of what it shows followed by any text it contains. " +
  "If the picture contains little or no text, describe what it shows in a few plain sentences instead. " +
  "Do not summarise, do not add commentary, and do not invent text that is not visible. " +
  "If part of the image is too blurred or cut off to read, write [unreadable] there rather than guessing.";

/** The document counterpart, for a scanned PDF or a page image that is
 *  unambiguously a document. Kept beside PHOTO_PROMPT so #278's copy has an
 *  obvious home to collapse into. */
export const DOCUMENT_PROMPT =
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

/** Whether vision can run at all. TRUE in production since 2026-07-23, when the
 *  owner added GEMINI_API_KEY to the web app's Preview + Production env. Callers
 *  still have to handle false — a preview deploy or a local checkout without the
 *  key must degrade, never throw. */
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
 *  the same as "nothing readable was found". PURE. */
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

/** The generateContent request body for one file. PURE. */
export function buildVisionRequest(base64: string, mimeType: string, prompt: string): string {
  return JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { data: base64, mime_type: mimeType } },
          { text: prompt },
        ],
      },
    ],
    // Transcription must not drift; temperature 0 keeps it literal.
    generationConfig: { temperature: 0 },
  });
}

/**
 * Read a picture (or any inline-able file) with Gemini.
 *
 * Returns null — never throws — whenever vision is unconfigured, the file is too
 * large, or the provider fails, so a caller can always fall back to whatever it
 * did before instead of turning a missing key into a 500.
 */
export async function readWithVision(
  bytes: Uint8Array,
  mimeType: string,
  options: { env?: VisionEnv; prompt?: string; signal?: AbortSignal } = {},
): Promise<VisionResult | null> {
  const env = options.env ?? process.env;
  const key = (env.GEMINI_API_KEY ?? "").trim();
  if (!key) return null;
  if (!withinVisionLimit(bytes.byteLength)) return null;

  const body = buildVisionRequest(
    Buffer.from(bytes).toString("base64"),
    mimeType,
    options.prompt ?? PHOTO_PROMPT,
  );
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
