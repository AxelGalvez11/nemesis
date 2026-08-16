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
 * 🔴 THIS HEADER USED TO SAY THE KEY WAS NOT HERE, AND THAT IS NO LONGER TRUE.
 * `GEMINI_API_KEY` has been set on nemesis-web for Preview and Production since
 * 2026-07-23 (verified 2026-08-14 with `vercel env ls`, names only). So
 * `visionConfigured()` is TRUE in production and this path is live. Anything
 * reasoning about vision as "off by default" is reasoning about a state that
 * ended; what is still off by default is `ParseOptions.lookAtFigures`, which is
 * a latency-and-cost decision on the synchronous upload lane, not a missing key.
 *
 * Scope, stated plainly. Two doors, and they answer different questions:
 *   readPdfWithVision  — the WHOLE file has no text layer. One call, one document.
 *   readPdfPagesWithVision — SOME pages have no usable text inside a file that is
 *     otherwise readable. This is the common case in real lecture material and was
 *     missed entirely until 2026-07-24; see lib/pdf/pages.ts for the measurements.
 *     Those pages are cut out with pdf-lib and sent on their own, which is both
 *     cheaper than resending the file and the ONLY way to reach a page of a
 *     2,116-page book that could never go inline whole.
 *
 * A figure sitting on a page that already has plenty of text is still not read.
 * The page-level rule reaches a page whose content IS the picture, not a chart
 * beside three paragraphs; the coverage numbers report which pages were read so
 * that limit is visible rather than assumed away.
 *
 * Everything except the fetches is pure and unit-tested.
 */

import { descriptionWithoutLabels, parseFigureLabels, type FigureLabel } from "@/lib/learn/figure-labels";
import { PAGE_BATCH_SIZE, PAGE_CONCURRENCY, parsePageTranscripts } from "@/lib/pdf/pages";
import { currentVisionLedger } from "@/lib/pdf/vision-budget";

/**
 * Google retires fixed model ids for new keys, so walk a ladder newest-first on a 404
 * exactly like supabase/functions/nemesis-media does.
 *
 * 🔴🔴 EVERY MODEL ON THE PREVIOUS LADDER WAS DEAD, AND PRODUCTION HAD BEEN PAYING FOR IT.
 * Measured against the live API on 2026-08-15 with a working key: `gemini-3.5-flash`,
 * `gemini-3.1-flash-lite` AND `gemini-2.5-flash` all return 404 on `generateContent`.
 * The message on the last one is explicit — "no longer available to new users". The first
 * figure-bearing lecture the document worker ever parsed in production sent 9 figures,
 * made 3 requests, walked the whole ladder into 404s and recorded ZERO descriptions.
 *
 * That is also the explanation for a much older observation: `DocFigure.labels` is
 * populated in 0 of 74 real figures, and the §46.6 occlusion feature has never once had
 * data to work with. It was never a labelling problem. Nothing was ever reaching a model.
 *
 * 🔴 A LADDER OF LITERALS ROTS SILENTLY, so the ladder is no longer the only defence —
 * `readFiguresWithVision` now reports whether the provider was reached at all, and a
 * figure nobody could send is recorded as `vision-unavailable` rather than as a figure
 * something looked at and had nothing to say about. When this ladder next dies, coverage
 * says so instead of quietly reporting examined figures.
 *
 * Verified reachable on the same key and endpoint that 404s the old ones.
 */
export const VISION_MODEL_LADDER = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
] as const;

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
  "Answer as a numbered list with one entry per image and nothing else. " +
  // 🔴 THE LABELS RIDE ON THE CALL THAT WAS ALREADY BEING MADE (§46.6). A diagram becomes a
  // cognitive object rather than an illustration only if Nemesis knows WHAT is labelled and WHERE
  // — "hiding labels or regions ... asking the learner to identify them" is impossible from prose.
  // Asking for both in one response costs nothing extra: same batch, same image bytes, same
  // request. A second pass per figure would have doubled the spend on the one primitive with no
  // entitlement and no counter (unit-economics audit 2026-08-06), which is a cost decision this
  // deliberately does not need to make.
  "After each entry, if and only if the image is a LABELLED DIAGRAM — parts, regions or structures " +
  "named in the picture itself — add a line beginning 'LABELS:' followed by each label as " +
  "name@x,y where x and y are the centre of that label as decimals from 0 to 1 of the image width " +
  "and height, separated by semicolons. Only include labels whose text is actually printed in the " +
  "image. Omit the LABELS line entirely for photographs, charts without named parts, and anything " +
  "you are not certain about.";

/**
 * Reading PAGES whose content is a picture — a slide exported as an image, a
 * screenshot of a drug monograph, a scanned handout inside an otherwise digital
 * file. Unlike FIGURE_PROMPT this asks for the words, because on these pages the
 * words ARE the picture; and unlike VISION_PROMPT it must label each page, since
 * the slice being read is a handful of pages pulled out of a longer document and
 * the transcripts have to go back where they came from.
 */
export const PAGE_PROMPT =
  "Each page of this PDF is a page of course material whose text could not be extracted. " +
  "Transcribe every word you can see on each page, in reading order, preserving headings, lists and table structure as plain markdown. " +
  "For a diagram, figure, chart or screenshot, write what it shows and the relationships or values it conveys, then every label and line of text printed in it. " +
  "Do not summarise, do not add commentary, and do not invent text that is not visible. " +
  "Begin each page with a line containing only [[page N]], numbering from 1 in the order the pages appear, " +
  "and include that line for every page even if the page is blank.";

/** How many figures to put in one request. Gemini handles more, but a smaller batch
 *  keeps any single failure from costing the whole deck's descriptions. */
export const FIGURE_BATCH_SIZE = 8;
/** How many figure batches are in flight at once. Small on purpose: each request
 *  carries megabytes of image data, and the provider rate-limits per key. */
export const FIGURE_CONCURRENCY = 3;

/**
 * Retrying the SAME model before walking the ladder, and how hard.
 *
 * 🔴 MEASURED AGAINST THE LIVE API, 2026-08-15/16. `gemini-3.7-flash` answered 200
 * normally on 12/12 sequential calls and 6/6 fired concurrently, then hit a contiguous
 * ~1-minute window where EVERY call returned 404 with a COMPLETELY EMPTY body — same
 * key, same URL, same payload that had just succeeded a minute before — and recovered
 * on its own with no code change. Walking the ladder on that (as this code used to)
 * turns one transient minute into every figure in the document going undescribed,
 * because three models answer the same blip in milliseconds and the whole ladder is
 * exhausted before the outage has any chance to clear.
 *
 * The budget these numbers are cut from is `parse-worker.ts`'s: `maxDuration` is 300s
 * and `DEADLINE_ABORT_MS` self-aborts at 240s, leaving 60s to record the failure.
 * Worst case here — every attempt on every rung comes back transient — is
 * `VISION_RETRY_ATTEMPTS - 1` backoff sleeps per model, each capped and jittered up
 * to 1.25x:
 *
 *   per model:  400ms + 800ms deterministic, at most 500 + 1000 = 1500ms jittered
 *   full ladder (3 rungs): at most ~4.5s — under 2% of DEADLINE_ABORT_MS
 *
 * `FIGURE_CONCURRENCY` batches run this independently in parallel, so a document with
 * that many batches or fewer adds at most ~4.5s of wall clock to the whole vision
 * phase even under a total outage; a larger deck queues through the worker pool in
 * waves and adds a small multiple of that. Deliberately NOT sized to survive the full
 * measured ~60s window — that would risk a meaningful fraction of the shared parse
 * budget on one figure batch, and this is one of several batches that budget has to
 * cover. This turns "a blip kills the whole document" into "a blip usually clears";
 * an outage that genuinely outlasts the retry budget still exhausts the ladder and is
 * reported honestly, exactly as before.
 */
export const VISION_RETRY_ATTEMPTS = 3;
export const VISION_RETRY_BASE_MS = 400;
export const VISION_RETRY_CAP_MS = 3000;

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
  return (await readFiguresWithVision(images, options)).descriptions;
}

/**
 * What one figure request round produced, and whether it produced it at all.
 *
 * 🔴 `reached` IS NOT A DIAGNOSTIC NICETY. Without it, "the provider answered and had
 * nothing to say about this picture" and "no request ever succeeded" are the same value —
 * an absent description — and the second one silently wears the first one's name in
 * coverage. That is how a completely dead model ladder reported nine figures as examined.
 */
export interface VisionFigureRead {
  readonly descriptions: Map<string, string>;
  readonly labels: Map<string, FigureLabel[]>;
  /** True once any request returned a usable reply. False means nothing was ever read. */
  readonly reached: boolean;
}

/**
 * The same call, with what it saw NAMED AND PLACED as well as described (§46.6).
 *
 * 🔴 ONE REQUEST, TWO ANSWERS. `FIGURE_PROMPT` asks for the labels on the batch that was already
 * being sent, so a labelled diagram costs exactly what an unlabelled one did. Vision is the one
 * primitive here with no entitlement and no counter, and a second pass per figure would have
 * doubled that bill — see the unit-economics audit.
 *
 * `descriptions` is what every existing caller wanted and is unchanged. `labels` is empty for the
 * majority of figures, which is correct: a photograph has nothing to occlude.
 */
export async function readFiguresWithVision(
  images: readonly VisionImage[],
  options: { env?: VisionEnv; signal?: AbortSignal } = {},
): Promise<VisionFigureRead> {
  const out = new Map<string, string>();
  const found = new Map<string, FigureLabel[]>();
  const env = options.env ?? process.env;
  const key = (env.GEMINI_API_KEY ?? "").trim();
  // An unconfigured key is NOT "reached and said nothing" — nothing was sent at all.
  if (!key || images.length === 0) return { descriptions: out, labels: found, reached: false };
  // Flipped by the first request that comes back with a usable reply. Stays false when the
  // whole model ladder 404s, which is precisely the state that used to be indistinguishable
  // from a model looking at nine diagrams and having no comment on any of them.
  let reached = false;

  const withinLimit = images.filter((image) => withinVisionLimit(image.bytes.byteLength));
  // 🔴 THE BUDGET IS TAKEN BEFORE THE FIRST BATCH IS BUILT, NOT CHECKED INSIDE THE LOOP.
  // Checking per batch would let three concurrent workers each pass a check against the
  // same remaining allowance and then all spend it — the classic read-then-write race,
  // and `FIGURE_CONCURRENCY` is 3 precisely so batches do run at once. Taking the whole
  // grant up front is a single synchronous debit, so the arithmetic cannot be raced.
  //
  // Figures beyond the grant keep the `not-examined` reason they already have, which
  // coverage counts as a gap. A truncated document reports a shortfall rather than
  // reporting completion — the same rule `MAX_FIGURES_PER_DOC` follows.
  const usable = withinLimit.slice(0, currentVisionLedger().take(withinLimit.length));
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
    reached = true;
    const parsed = parseFigureDescriptions(reply.text, batch.length);
    if (!parsed) return;
    parsed.forEach((entry, index) => {
      const image = batch[index];
      if (!image || !entry) return;
      // 🔴 THE LABELS COME OFF THE SAME REPLY, AND THE PROSE IS HANDED ON WITHOUT THEM. Callers
      // that only want a caption must not suddenly receive a machine-readable line inside it —
      // that string is shown to learners and written into the document model.
      const labels = parseFigureLabels(entry);
      const description = descriptionWithoutLabels(entry);
      if (description) out.set(image.name, description);
      if (labels.length > 0) found.set(image.name, labels);
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
  return { descriptions: out, labels: found, reached };
}

/**
 * Transient vs terminal, for one completed (non-ok) response. PURE.
 *
 * Terminal — retrying wastes a slot in the budget for nothing:
 *   · 401 / 403 — the key itself is rejected; every model will refuse identically.
 *     The caller short-circuits the whole ladder on this, not just the current rung —
 *     this classification exists so it can, and so the other two callers agree with it.
 *   · 400 — the payload itself is unacceptable. Retrying the same request cannot
 *     change that; only a different model might.
 *   · 404 WITH A BODY — Google's own shape for "this model is retired", e.g.
 *     `{"error":{"code":404,"message":"...no longer available to new users..."}}`.
 *
 * Transient — worth a backoff and another try on the SAME model:
 *   · 404 with a COMPLETELY EMPTY body — the measured signature of a real upstream
 *     blip (see `VISION_RETRY_ATTEMPTS`). Not a shape Google documents as meaningful;
 *     a 404 with nothing behind it, on a model answering normally a minute later, is
 *     far more consistent with an edge or proxy hiccup than an actual "not found".
 *   · 429, 5xx, and anything else this codebase has not seen a reason to name.
 *     Defaulting to transient mirrors `parse-worker.ts`'s own `isRetryable`: guessing
 *     "permanent" wrongly strands a call that would have worked; guessing "transient"
 *     wrongly costs one bounded retry.
 */
export type VisionFailureKind = "transient" | "terminal-key" | "terminal-model";

export function classifyVisionFailure(status: number, bodyText: string): VisionFailureKind {
  if (status === 401 || status === 403) return "terminal-key";
  if (status === 400) return "terminal-model";
  if (status === 404) return bodyText.trim().length > 0 ? "terminal-model" : "transient";
  return "transient";
}

/** Exponential backoff before the next attempt on the SAME model, no jitter — the
 *  same shape as `parse-worker.ts`'s `backoffSeconds`, scaled down because this waits
 *  inside one HTTP call rather than between whole job attempts. PURE. */
export function visionBackoffMs(attemptJustFailed: number): number {
  return Math.min(VISION_RETRY_CAP_MS, VISION_RETRY_BASE_MS * 2 ** Math.max(attemptJustFailed - 1, 0));
}

/** ±25% around the deterministic delay. `FIGURE_CONCURRENCY` runs three batches at
 *  once; without jitter, three requests that failed in the same instant would also
 *  retry in the same instant. Narrow enough that the floor stays well clear of zero,
 *  so a calibration test can tell "backed off" from "did not" without flaking. PURE
 *  given `random`; defaults to `Math.random`. */
export function withVisionJitter(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * (0.75 + random() * 0.5));
}

/**
 * The real timer a retry waits on. Exported so a calibration test can prove it
 * genuinely elapses — never faked — and that an abort cancels it promptly instead of
 * being slept through.
 */
export function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * One generateContent call, walking the model ladder. Returns null on any failure
 * that survives every retry and every rung.
 *
 * A TERMINAL failure (`classifyVisionFailure`) advances to the next rung immediately,
 * exactly as before this fix. A TRANSIENT one retries the SAME model, with backoff,
 * up to `VISION_RETRY_ATTEMPTS` times, before advancing — so a blip that clears inside
 * the retry budget still describes the figure, instead of silently costing whichever
 * model it happened to land on.
 */
async function callGemini(
  body: string,
  key: string,
  env: VisionEnv,
  signal?: AbortSignal,
): Promise<{ model: string; text: string } | null> {
  const ledger = currentVisionLedger();
  // 🔴 WHY THE LADDER DIED, NOT JUST THAT IT DID. Production spent two whole parses
  // failing every request with no way to tell a retired model (404) from a rejected key
  // (401/403) from an exhausted quota (429), because the only trace was an absence. One
  // log line at the end of an exhausted ladder is the difference between "somebody needs
  // to look at the API key" and "somebody needs to read the model list".
  //
  // 🔴 ONE ENTRY PER HTTP REQUEST ACTUALLY ISSUED, retries included — not one per
  // model. A model retried twice before giving up now shows THREE entries here; a
  // model that was simply retired shows one. That is the whole extension this fix
  // needed to let a reader tell "retried 3x then gave up" from "model said it was
  // retired": the count already says it, without a richer format to maintain.
  const attempts: string[] = [];
  for (const model of visionModels(env)) {
    for (let attempt = 1; attempt <= VISION_RETRY_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return null;
      // 🔴 COUNTED PER REQUEST ISSUED, INSIDE THE RETRY LOOP, NOT ONCE PER MODEL. A
      // retried model is two or three HTTP requests, not one. Counting at the top of
      // the model loop would report 1 for 3 and quietly understate how hard this
      // document was to read — the diagnostic that explains a slow parse. `units`
      // remains the number a price is multiplied by; this is the number that
      // explains latency.
      ledger.noteCall();
      let response: Response;
      try {
        response = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
          body,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          method: "POST",
          signal,
        });
      } catch {
        // A thrown fetch (offline, DNS, a connection reset) is the same shape as an
        // empty 404: no diagnosis arrived, so it is treated as transient rather than
        // as a verdict about the model.
        attempts.push(`${model}=threw`);
        if (attempt < VISION_RETRY_ATTEMPTS) {
          await sleepUnlessAborted(withVisionJitter(visionBackoffMs(attempt)), signal);
          continue;
        }
        break;
      }
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        attempts.push(`${model}=${response.status}`);
        const kind = classifyVisionFailure(response.status, bodyText);
        // A rejected key will reject every model, so walking the rest is pointless —
        // but it must still SAY so, or the caller cannot distinguish it from a silent
        // success.
        if (kind === "terminal-key") {
          console.warn(JSON.stringify({ event: "vision_key_rejected", attempts }));
          return null;
        }
        if (kind === "terminal-model") break; // walk the ladder now; retrying wastes nothing back
        if (attempt < VISION_RETRY_ATTEMPTS) {
          await sleepUnlessAborted(withVisionJitter(visionBackoffMs(attempt)), signal);
          continue;
        }
        break; // transient, but this model's retry budget is spent — walk the ladder
      }
      const payload = (await response.json().catch(() => null)) as unknown;
      const text = parseVisionText(payload);
      if (text) return { model, text };
      attempts.push(`${model}=empty`);
      break; // a 200 with nothing usable is not a failure to retry, just a rung to leave
    }
    if (signal?.aborted) return null;
  }
  // Every model refused. Named individually, because "the ladder is dead" and "this one
  // model was retired" need different fixes and look identical from a description count.
  console.warn(JSON.stringify({ event: "vision_ladder_exhausted", attempts }));
  return null;
}

/**
 * Cut `indices` (0-based, in page order) out of a PDF into a fresh one-file-per-
 * batch document. `ignoreEncryption` because a student's file is often protected
 * against editing rather than against opening, and refusing to read a page they
 * can see on screen would be the wrong call. Returns null if the pages cannot be
 * copied at all.
 */
async function slicePages(
  source: import("pdf-lib").PDFDocument,
  indices: readonly number[],
): Promise<Uint8Array | null> {
  try {
    // pdf-lib is already a dependency (apps/web/package.json) — no new install.
    const { PDFDocument } = await import("pdf-lib");
    const slice = await PDFDocument.create();
    const copied = await slice.copyPages(source, [...indices]);
    for (const page of copied) slice.addPage(page);
    return await slice.save();
  } catch {
    return null;
  }
}

/**
 * Read the given pages of a PDF, keyed by their ORIGINAL 0-based page index.
 *
 * Batches are sliced, sent, and spliced back by the [[page N]] markers the model
 * is asked for, so a page it skips costs that page alone. A batch too large to
 * send inline is halved and retried; a SINGLE page too large is left out, and the
 * caller reports it as unread rather than pretending otherwise.
 *
 * Returns an empty map — never throws — when vision is unconfigured or every
 * request fails, so a PDF still imports with exactly the text it has today.
 */
export async function readPdfPagesWithVision(
  bytes: Uint8Array,
  indices: readonly number[],
  options: { env?: VisionEnv; signal?: AbortSignal } = {},
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const env = options.env ?? process.env;
  const key = (env.GEMINI_API_KEY ?? "").trim();
  if (!key || indices.length === 0) return out;

  // Parse the source ONCE. pdf-lib re-reads the whole document on every load, and
  // a picture-heavy lecture is both large and split across several batches — the
  // worst file in a real course is 7.6 MB and four batches, i.e. four full parses
  // of the same bytes for no reason.
  let source: import("pdf-lib").PDFDocument;
  try {
    const { PDFDocument } = await import("pdf-lib");
    source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return out;
  }

  const readBatch = async (batch: number[]): Promise<void> => {
    if (batch.length === 0) return;
    const sliced = await slicePages(source, batch);
    if (!sliced) return;
    if (!withinVisionLimit(sliced.byteLength)) {
      // One page that is itself too big cannot be split any further; leave it out
      // and let the caller count it. Anything larger splits and retries.
      if (batch.length === 1) return;
      const half = Math.ceil(batch.length / 2);
      await readBatch(batch.slice(0, half));
      await readBatch(batch.slice(half));
      return;
    }
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { data: Buffer.from(sliced).toString("base64"), mime_type: "application/pdf" } },
            { text: PAGE_PROMPT },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    });
    const reply = await callGemini(body, key, env, options.signal);
    if (!reply) return;
    const parsed = parsePageTranscripts(reply.text, batch.length);
    if (!parsed) return;
    parsed.forEach((text, position) => {
      const page = batch[position];
      if (page !== undefined && text) out.set(page, text);
    });
  };

  // 🔴 THE PAGE LANE IS THE EXPENSIVE ONE AND IT HAD NO CEILING AT ALL. `MAX_FIGURES_PER_DOC`
  // guards figures; a scanned book is not a figure, and its 2,116 pages are 2,116 billable
  // units. Whatever the grant does not cover is left out of `out`, and the caller already
  // reports an absent page as unread rather than as read-and-empty.
  const affordable = indices.slice(0, currentVisionLedger().take(indices.length));
  const batches: number[][] = [];
  for (let start = 0; start < affordable.length; start += PAGE_BATCH_SIZE) {
    batches.push([...affordable.slice(start, start + PAGE_BATCH_SIZE)]);
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        if (batch) await readBatch(batch);
      }
    }),
  );
  return out;
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
  // A whole-file read is one unit however many pages are inside it — that is how it is
  // billed, one inline request. Refusing when the budget is gone returns the same null
  // every other unavailable-vision path returns, so the caller keeps its existing "no
  // selectable text" answer instead of learning a new failure mode.
  if (currentVisionLedger().take(1) === 0) return null;

  const body = buildVisionRequest(Buffer.from(bytes).toString("base64"));
  // 🔴 SAME LADDER, SAME RETRY, SAME DIAGNOSTICS AS THE BATCHED FIGURE LANE — via the
  // SAME FUNCTION. This used to be its own copy of the ladder-walking loop; a
  // transient-vs-terminal fix would otherwise have needed making twice, and the two
  // copies could drift out of sync with each other the moment either one changed again.
  const reply = await callGemini(body, key, env, options.signal);
  return reply ? { model: reply.model, text: reply.text } : null;
}
