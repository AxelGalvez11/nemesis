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

/**
 * Reading FIGURES, which is a different job from reading pages of text and needs a
 * different instruction. A diagram's value to a student is what it asserts — what
 * causes what, which line is higher, what the labels are — so this asks for the
 * content of the figure rather than a caption of it. One numbered answer per image,
 * because a single batched call is far cheaper than one call per picture.
 */
export const FIGURE_PROMPT =
  "These are figures taken from a lecture slide deck, in order. For EACH image, in one to three sentences, " +
  "say what it shows and state the relationships or values it conveys — labels, axes, directions, groupings, " +
  "and any text printed in it. Describe only what is visible; never infer facts the image does not show. " +
  "If an image is a logo, a decorative photo, or otherwise carries no teaching content, answer exactly 'none'. " +
  "Answer as a numbered list with one entry per image and nothing else.";

/** How many figures to put in one request. Gemini handles more, but a smaller batch
 *  keeps any single failure from costing the whole deck's descriptions. */
export const FIGURE_BATCH_SIZE = 8;
/** How many figure batches are in flight at once. Small on purpose: each request
 *  carries megabytes of image data, and the provider rate-limits per key. */
export const FIGURE_CONCURRENCY = 3;

export interface VisionResult {
  text: string;
  model: string;
}

export interface VisionImage {
  /** Caller's own key — the zip entry name — returned untouched so descriptions can
   *  be matched back without relying on array position. */
  name: string;
  mime: string;
  bytes: Uint8Array;
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

/** The generateContent body for a batch of figures. PURE. */
export function buildFigureRequest(images: readonly { mime: string; base64: string }[]): string {
  return JSON.stringify({
    contents: [
      {
        parts: [
          ...images.map((image) => ({ inline_data: { data: image.base64, mime_type: image.mime } })),
          { text: FIGURE_PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  });
}

/**
 * Split a numbered reply back into one description per image.
 *
 * Order is the only link between a batched reply and its inputs, so a reply with
 * the wrong NUMBER of entries is discarded entirely rather than matched up
 * optimistically — a description attached to the wrong figure is worse than none,
 * because it becomes a confident caption on an unrelated diagram. "none" answers
 * are dropped, which is how a logo that slipped through the size filter stops here.
 * PURE.
 */
export function parseFigureDescriptions(reply: string, expected: number): string[] | null {
  if (expected <= 0) return [];
  const entries: string[] = [];
  let current: string[] = [];
  for (const line of reply.split(/\r?\n/)) {
    const started = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (started) {
      if (current.length > 0) entries.push(current.join(" ").trim());
      current = [started[2] ?? ""];
      continue;
    }
    if (current.length > 0 && line.trim()) current.push(line.trim());
  }
  if (current.length > 0) entries.push(current.join(" ").trim());
  if (entries.length !== expected) return null;
  return entries.map((entry) => (/^none\b/i.test(entry.trim()) ? "" : entry.trim()));
}

/**
 * Describe slide figures with Gemini, keyed by the caller's own names. Returns an
 * empty map — never throws — when vision is unconfigured or the provider fails, so
 * a deck still imports with its text exactly as before.
 */
export async function describeFiguresWithVision(
  images: readonly VisionImage[],
  options: { env?: VisionEnv; signal?: AbortSignal } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const env = options.env ?? process.env;
  const key = (env.GEMINI_API_KEY ?? "").trim();
  if (!key || images.length === 0) return out;

  const usable = images.filter((image) => withinVisionLimit(image.bytes.byteLength));
  const batches: VisionImage[][] = [];
  for (let start = 0; start < usable.length; start += FIGURE_BATCH_SIZE) {
    batches.push(usable.slice(start, start + FIGURE_BATCH_SIZE));
  }

  // A slide-heavy lecture can hold two dozen figures, which is four or five calls.
  // Run a few at once so importing a real deck is a wait, not a coffee break —
  // but only a few, because each request carries megabytes of image data and the
  // provider rate-limits per key.
  const describeBatch = async (batch: VisionImage[]) => {
    const body = buildFigureRequest(
      batch.map((image) => ({ base64: Buffer.from(image.bytes).toString("base64"), mime: image.mime })),
    );
    const reply = await callGemini(body, key, env, options.signal);
    // One failed batch loses its own descriptions and nothing else.
    if (!reply) return;
    const parsed = parseFigureDescriptions(reply, batch.length);
    if (!parsed) return;
    parsed.forEach((description, index) => {
      const image = batch[index];
      if (image && description) out.set(image.name, description);
    });
  };

  let next = 0;
  const workers = Array.from({ length: Math.min(FIGURE_CONCURRENCY, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      if (batch) await describeBatch(batch);
    }
  });
  await Promise.all(workers);
  return out;
}

/** One generateContent call, walking the model ladder. Returns null on any failure. */
async function callGemini(body: string, key: string, env: VisionEnv, signal?: AbortSignal): Promise<string | null> {
  for (const model of visionModels(env)) {
    let response: Response;
    try {
      response = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
        body,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        method: "POST",
        signal,
      });
    } catch {
      continue;
    }
    if (response.status === 404) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    return parseVisionText(payload) || null;
  }
  return null;
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
