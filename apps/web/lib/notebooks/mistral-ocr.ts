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

/**
 * The moving alias, deliberately, never a pinned version (owner, 2026-08-13).
 *
 * 🔴 IT AUTO-UPGRADES, WHICH IS THE POINT: `mistral-ocr-latest` resolves to whatever the vendor's
 * current OCR model is — 4.1 at the time of writing — so Nemesis gets a better read without a
 * deploy, and pinning would freeze us on whatever was current the day this shipped. Parsing is
 * infrastructure; we do not want to be in the business of tracking its version numbers.
 *
 * 🔴 AND THE PRICE IS THAT NOTHING CAN TELL US WHICH VERSION READ A GIVEN ROW. Measured across
 * four real calls: the response's `model` field echoes the alias back verbatim, so it reports what
 * we ASKED for and never what actually ran. `MISTRAL_OCR_MODEL` exists so a concrete version can be
 * pinned from the environment if a regression ever needs bisecting against a specific one.
 */
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

/**
 * One region Mistral labelled, when `include_blocks` is on.
 *
 * 🔴 SHAPE CONFIRMED AGAINST THE LIVE API, NOT AGAINST THE DOCUMENTATION. The box arrives as four
 * flat page-pixel numbers — the same spelling `images` uses, not a nested `bbox` — and the text
 * arrives as `content` carrying its own markdown syntax (`# `, `- `, and a whole `<table>` for a
 * table block). Observed types so far: title · text · list · table · caption · header · footer.
 * `markdown` is kept as an alternate spelling because reading a field that never appears costs
 * nothing, and guessing wrong about which one exists cost a whole document's tables once already.
 */
export interface MistralBlock {
  type?: string | null;
  content?: string | null;
  markdown?: string | null;
  top_left_x?: number | null;
  top_left_y?: number | null;
  bottom_right_x?: number | null;
  bottom_right_y?: number | null;
  confidence_scores?: Record<string, unknown> | null;
}

/**
 * One table, held apart from the page's prose.
 *
 * 🔴 `id` IS LOAD-BEARING. The page markdown refers to a table as `[tbl-0.html](tbl-0.html)` and
 * never inlines it, so this id is the only thing connecting the reference to the grid. Reading the
 * markdown without resolving it turns every table in the document into the text "tbl-0.html".
 */
export interface MistralTable {
  id?: string | null;
  /** Rendered per `table_format` — HTML when we asked for HTML. */
  content?: string | null;
  format?: string | null;
  markdown?: string | null;
  html?: string | null;
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
  hyperlinks?: string[] | null;
  blocks?: MistralBlock[] | null;
}

export interface MistralOcrResponse {
  pages: MistralPage[];
  /**
   * What the vendor reports for this call.
   *
   * 🔴 THIS ECHOES THE ALIAS, IT DOES NOT RESOLVE IT. Asking for `mistral-ocr-latest` gets
   * `mistral-ocr-latest` back — verified on four real calls — so this records which model we
   * REQUESTED and cannot tell you which concrete version served it. Stored as provenance on that
   * honest basis: it distinguishes a vendor-read row from a locally-read one, and no more.
   */
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
 * 🔴🔴 PDF ONLY, AND THAT IS A MEASURED RESULT RATHER THAN A CAUTIOUS ONE. Every other format this
 * repository handles STATES its own structure — a .docx, a .pptx, a .xlsx and a .csv are markup, so
 * reading the markup is exact and reading a picture of it is a guess. Measured on the owner's own
 * course files, 2026-08-13, same file through both lanes:
 *
 *     .docx  local 6 tables (4 columns each, from Word's XML)   vs  Mistral 0
 *            — Mistral renders the document and emits a pipe table that breaks apart wherever a
 *              cell contains a line break, so the grid is unrecoverable from its output
 *     .pptx  local 209 blocks, 152 with rectangles, 20 figures  vs  Mistral 100 blocks, 0, 0
 *            — and 8,677 characters against 6,348
 *
 * 🔴 ON PDF THE RESULT IS THE OPPOSITE, AND DECISIVELY SO. A PDF is not markup; it is instructions
 * for painting glyphs, and a font whose "ti" is one ligature paints something pdf.js cannot map
 * back. On the 24-page drug chart: local recovered 9,098 words of which 60 were corrupted across 39
 * distinct spellings — `ac1on`, `indica1ons`, `contraindica1ons`, `palpita2ons` — while Mistral
 * recovered 16,823 words with none. The word "contraindication" appears 34 times in the local read
 * and 64 in Mistral's. A learner asked what the contraindications are would have been taught from
 * text that says "contraindica1ons".
 *
 * 🔴 AND `image` IS NOT ON IT EITHER, WHICH IS A THIRD REASON. A standalone picture goes to Gemini
 * with a prompt that asks it to DESCRIBE what it shows; OCR would transcribe the words in a
 * photograph of a whiteboard and say nothing about the diagram drawn beside them. Those are
 * different questions, and the existing lane already asks the better one. A scanned PDF is still
 * covered — it arrives as `pdf`. PURE.
 */
export function mistralHandles(kind: string): boolean {
  return kind === "pdf";
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
    // 🔴🔴 `include_image_base64: false` DECLINES THE PIXELS. `image_limit: 0` DECLINES THE
    // FIGURES THEMSELVES, AND THE TWO READ IDENTICALLY IN A DIFF. Measured on one 36-page
    // diagram-heavy lecture, same request in every other respect:
    //
    //     image_limit: 0              ->  0 figures
    //     include_image_base64: false -> 13 figures, all with coordinates, no pixels, +6 KB
    //
    // With the wrong one, a lecture built out of diagrams reports NO figures, coverage computes
    // `complete` because nothing was found to be missing, and the product tells a student it read
    // everything on a page it never looked at. A false claim of completeness is worse than a
    // truthful `partial`, and it is invisible: every count still reconciles.
    //
    // 🔴 `image_limit: 0` IS WHAT MISTRAL ITSELF RECOMMENDS FOR OFFICE FILES — it rejects this flag
    // for .docx and .pptx with "extracted images can only be returned in base64 ... try setting
    // image_limit=0 instead". That is real, and it is why this line was briefly the other way
    // round. It stopped mattering when the vendor's scope narrowed to PDF, where this flag works;
    // if Office ever comes back, they need different parameters, not a shared compromise.
    //
    // The rectangles are what a locator needs. The pixels would multiply the response size for
    // something the reader renders from the original file anyway.
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
