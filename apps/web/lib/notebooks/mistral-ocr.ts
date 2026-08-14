/**
 * Mistral Document AI, as the extraction vendor. Bytes in, a page-shaped read out.
 *
 * 🔴 THIS MODULE KNOWS NOTHING ABOUT NEMESIS. It does not import the document model, it does not
 * decide what a heading means, and it never reaches a verdict about a learner. It answers exactly
 * one question — WHAT IS IN THIS DOCUMENT, AND WHERE — and hands back the vendor's own shape.
 * `mistral-model.ts` is where that becomes a `DocumentModel`; keeping the two apart is what makes
 * the vendor swappable, and what stops a provider's vocabulary leaking into the cognition layer.
 *
 * 🔴 AND IT NEVER THROWS. Every failure — no key, a refused file, a rate limit, a malformed reply —
 * comes back as a typed reason, because the caller's correct response to all of them is the same:
 * fall through to the extractor that was there before. An upload must not fail because a vendor did.
 *
 * 🔴 BASE64 DATA URI, NOT A SIGNED URL, AND THAT IS THE DESIGN DECISION IN THIS FILE. `parseDocument`
 * takes bytes and is forbidden from acquiring storage or database dependencies — the synchronous
 * upload route holds the bytes from a multipart body and may not have written them anywhere yet.
 * Mistral's `document_url` accepts `data:<mime>;base64,...`, so the vendor call fits inside the
 * existing seam with no new hop, no signed-URL lifetime to get wrong, and no second lane that could
 * disagree with the first. A signed URL would have forced storage into this function and made the
 * upload path and the worker path structurally different, which is the exact split the one-parser
 * rule exists to prevent.
 */

/** The environment this module reads, as a plain string bag — `process.env` satisfies it, and a
 *  test can pass `{ MISTRAL_API_KEY: "k" }` without fabricating the rest of the environment.
 *  Only MISTRAL_API_KEY and MISTRAL_OCR_MODEL are ever read. */
export type MistralEnv = Readonly<Record<string, string | undefined>>;

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";

/** The published default. Overridable so a model change does not need a deploy. */
export const MISTRAL_DEFAULT_MODEL = "mistral-ocr-latest";

/**
 * The largest file worth sending.
 *
 * 🔴 A CEILING ON WHAT WE SEND, NOT A CLAIM ABOUT WHAT MISTRAL ACCEPTS. Base64 inflates bytes by
 * 4/3, so a 40 MB file is a ~54 MB request body; past that the request is likelier to die in
 * transit than to return a document, and the local extractors handle a large file perfectly well.
 * A refusal here is silent and falls through — the student never learns a size limit existed.
 */
export const MISTRAL_MAX_BYTES = 40 * 1024 * 1024;

/** How long to wait for one attempt. The route allows 300s in total; a single vendor call that has
 *  not answered in four minutes is not going to. */
const REQUEST_TIMEOUT_MS = 240_000;

/** Retries are for the two statuses that mean "ask again", and nothing else. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

/** One image Mistral located on a page. Coordinates are top-left origin, page pixels. */
export interface MistralImage {
  id?: string;
  top_left_x?: number | null;
  top_left_y?: number | null;
  bottom_right_x?: number | null;
  bottom_right_y?: number | null;
  image_base64?: string | null;
}

/** One block Mistral labelled, when `include_blocks` is on. */
export interface MistralBlock {
  type?: string | null;
  /** The vendor has used both spellings across shapes; both are read, neither is required. */
  content?: string | null;
  markdown?: string | null;
  bbox?: unknown;
  confidence?: number | null;
}

export interface MistralTable {
  /** Rendered per `table_format` — HTML when we asked for HTML. */
  content?: string | null;
  markdown?: string | null;
  html?: string | null;
  bbox?: unknown;
}

export interface MistralPage {
  index: number;
  markdown: string;
  images?: MistralImage[] | null;
  tables?: MistralTable[] | null;
  header?: string | null;
  footer?: string | null;
  dimensions?: { dpi?: number | null; height?: number | null; width?: number | null } | null;
  confidence_scores?: Record<string, unknown> | null;
  blocks?: MistralBlock[] | null;
}

export interface MistralOcrResponse {
  pages: MistralPage[];
  /** What the vendor says it actually ran — NOT what we asked for. Recorded as telemetry so a
   *  silent model change on their side is visible on ours. */
  model: string;
  usage_info?: { pages_processed?: number | null; doc_size_bytes?: number | null } | null;
}

/**
 * Why a read did not happen.
 *
 * 🔴 THESE ARE NEMESIS WORDS, NOT MISTRAL WORDS, AND NO PROVIDER STRING CROSSES THIS BOUNDARY.
 * A learner must never be shown "429 Too Many Requests" or a vendor's stack trace. The HTTP status
 * rides along for the server log and stops there.
 */
export type MistralFailure =
  /** No key in this environment. Not an error — a preview deploy or a local checkout. */
  | { reason: "not-configured" }
  /** Bigger than we are willing to send. */
  | { reason: "too-large"; bytes: number }
  /** The vendor refused the file: unsupported format, corrupt, or a bad request. */
  | { reason: "rejected"; status: number }
  /** Out of quota or throttled, after retries. */
  | { reason: "rate-limited"; status: number }
  /** The vendor broke, after retries. */
  | { reason: "provider-error"; status: number }
  /** The network never answered, or the attempt timed out. */
  | { reason: "unreachable" }
  /** A 200 whose body was not the shape this module can read. */
  | { reason: "malformed" }
  /** A well-formed reply with nothing in it. Distinct from `malformed`: the call worked and the
   *  document really did yield no text, which is a fact about the FILE, not about the vendor. */
  | { reason: "empty" };

export type MistralOutcome =
  | { ok: true; response: MistralOcrResponse; durationMs: number }
  | ({ ok: false; durationMs: number } & MistralFailure);

/** Whether Mistral extraction can run at all in this environment.
 *
 *  🔴 CALLERS MUST HANDLE FALSE WITHOUT DEGRADING THE PRODUCT. A missing key means the local
 *  extractors run, exactly as they did before this module existed. */
export function mistralConfigured(env: MistralEnv = process.env): boolean {
  return Boolean((env.MISTRAL_API_KEY ?? "").trim());
}

/** The model to ask for, honouring a MISTRAL_OCR_MODEL override. PURE. */
export function mistralModel(env: MistralEnv = process.env): string {
  return (env.MISTRAL_OCR_MODEL ?? "").trim() || MISTRAL_DEFAULT_MODEL;
}

/**
 * What Mistral should be told this file is.
 *
 * 🔴 THE DATA URI'S MIME DECIDES HOW THE VENDOR READS THE BYTES, so an unknown or wrong type is a
 * silent quality loss rather than an error. Derived from the extension first — the browser-supplied
 * type is frequently empty or `application/octet-stream` on a drag-and-drop. PURE.
 */
export function mistralMime(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".avif")) return "image/avif";
  const declared = mimeType.trim();
  return declared && declared !== "application/octet-stream" ? declared : "application/pdf";
}

/**
 * Whether this file goes to Mistral at all.
 *
 * 🔴 A DELIBERATELY SHORT LIST, AND TEXT/CSV/XLSX ARE NOT ON IT. Nemesis already reads those
 * deterministically — no model call, no heuristic, exact cell references and formulas preserved.
 * Sending a spreadsheet to an OCR model would replace an exact answer with an approximate one and
 * pay for the privilege. The brief says as much: keep local handling where the vendor adds nothing.
 *
 * 🔴 AND `image` IS NOT ON IT EITHER, WHICH IS A DIFFERENT REASON. A standalone picture goes to
 * Gemini with a prompt that asks it to DESCRIBE what it shows; OCR would transcribe the words in a
 * photograph of a whiteboard and say nothing about the diagram drawn beside them. Those are
 * different questions, and the existing lane already asks the better one. A scanned PDF is still
 * covered — it arrives as `pdf`. PURE.
 */
export function mistralHandles(kind: string): boolean {
  return kind === "pdf" || kind === "docx" || kind === "pptx";
}

/** The request body for one document. PURE, and separated so a test can assert the exact
 *  parameters without a network. */
export function buildMistralRequest(input: {
  base64: string;
  mime: string;
  model: string;
}): string {
  return JSON.stringify({
    model: input.model,
    document: {
      type: "document_url",
      document_url: `data:${input.mime};base64,${input.base64}`,
    },
    // Labelled regions, so a heading arrives as a heading rather than as a line of markdown we
    // would have to re-infer with a regex — which is the keyword-list mistake in another costume.
    include_blocks: true,
    // 🔴 HTML, NOT MARKDOWN, BECAUSE `DocTable.cells` IS THE TRUTH AND ROWS ARE ITS PROJECTION.
    // Markdown pipe tables cannot express a merged cell or a spanning header, so a markdown table
    // would arrive already flattened and no later pass could recover the grid.
    table_format: "html",
    confidence_scores_granularity: "block",
    extract_header: true,
    extract_footer: true,
    // Images are LOCATED but not returned as bytes. Their rectangles are what a locator needs; the
    // pixels would multiply the response size for something the reader renders from the original.
    include_image_base64: false,
  });
}

/** Read a response body as the OCR shape, or say it was not one.
 *
 *  🔴 VALIDATED, NEVER CAST. External data is not trusted at this boundary: a 200 carrying an error
 *  envelope, a truncated body, or a future shape change all land here rather than propagating a
 *  half-built document into knowledge construction. PURE. */
export function parseMistralResponse(payload: unknown): MistralOcrResponse | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as { pages?: unknown; model?: unknown; usage_info?: unknown };
  if (!Array.isArray(body.pages)) return null;

  const pages: MistralPage[] = [];
  for (const [position, raw] of body.pages.entries()) {
    if (typeof raw !== "object" || raw === null) return null;
    const page = raw as Partial<MistralPage>;
    if (typeof page.markdown !== "string") return null;
    pages.push({
      ...page,
      // 🔴 POSITION IS THE FALLBACK, AND IT IS NOT THE SAME NUMBER. Mistral's `index` is
      // zero-based; every locator downstream is one-based, and that conversion happens once, in
      // the model mapping, so it cannot be applied twice. Here we only guarantee the field exists.
      index: typeof page.index === "number" ? page.index : position,
      markdown: page.markdown,
    });
  }

  return {
    model: typeof body.model === "string" ? body.model : "",
    pages,
    usage_info:
      typeof body.usage_info === "object" && body.usage_info !== null
        ? (body.usage_info as MistralOcrResponse["usage_info"])
        : null,
  };
}

/** Did the vendor return anything a learner could be taught from? PURE. */
export function mistralYieldedText(response: MistralOcrResponse): boolean {
  return response.pages.some((page) => page.markdown.trim().length > 0);
}

/** Which statuses are worth asking again. PURE. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one document to Mistral.
 *
 * Never throws. Never returns the key, and never puts it in a log line.
 */
export async function readWithMistral(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  options: { env?: MistralEnv; signal?: AbortSignal } = {},
): Promise<MistralOutcome> {
  const env = options.env ?? process.env;
  const key = (env.MISTRAL_API_KEY ?? "").trim();
  const started = Date.now();
  const since = () => Date.now() - started;

  if (!key) return { durationMs: 0, ok: false, reason: "not-configured" };
  if (bytes.byteLength === 0 || bytes.byteLength > MISTRAL_MAX_BYTES) {
    return { bytes: bytes.byteLength, durationMs: since(), ok: false, reason: "too-large" };
  }

  const model = mistralModel(env);
  const body = buildMistralRequest({
    base64: Buffer.from(bytes).toString("base64"),
    mime: mistralMime(fileName, mimeType),
    model,
  });

  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // One timeout per attempt, and it is linked to the caller's signal so an abandoned upload
    // stops paying for a vendor call nobody is waiting for.
    const timer = new AbortController();
    const onAbort = () => timer.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const deadline = setTimeout(() => timer.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(MISTRAL_OCR_URL, {
        body,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        method: "POST",
        signal: timer.signal,
      });
    } catch {
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) return { durationMs: since(), ok: false, reason: "unreachable" };
      if (attempt === MAX_ATTEMPTS) return { durationMs: since(), ok: false, reason: "unreachable" };
      await sleep(RETRY_BASE_DELAY_MS * attempt);
      continue;
    } finally {
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (!response.ok) {
      lastStatus = response.status;
      // 🔴 STATUS AND MODEL ONLY. The key is in a header we built and is never read back out; the
      // body may quote the request, so it is cancelled rather than logged.
      console.warn(
        JSON.stringify({ attempt, event: "mistral_provider_error", model, status: response.status }),
      );
      await response.body?.cancel();
      if (!retryable(response.status)) {
        return { durationMs: since(), ok: false, reason: "rejected", status: response.status };
      }
      if (attempt === MAX_ATTEMPTS) {
        return response.status === 429
          ? { durationMs: since(), ok: false, reason: "rate-limited", status: response.status }
          : { durationMs: since(), ok: false, reason: "provider-error", status: response.status };
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt);
      continue;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const parsed = parseMistralResponse(payload);
    if (!parsed) {
      console.warn(JSON.stringify({ event: "mistral_malformed_response", model }));
      return { durationMs: since(), ok: false, reason: "malformed" };
    }
    if (!mistralYieldedText(parsed)) {
      console.warn(
        JSON.stringify({ event: "mistral_empty_extraction", model, pages: parsed.pages.length }),
      );
      return { durationMs: since(), ok: false, reason: "empty" };
    }
    return { durationMs: since(), ok: true, response: parsed };
  }

  return lastStatus === 429
    ? { durationMs: since(), ok: false, reason: "rate-limited", status: lastStatus }
    : { durationMs: since(), ok: false, reason: "provider-error", status: lastStatus };
}
