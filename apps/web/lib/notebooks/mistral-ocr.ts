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
import { toMistralPages } from "./page-selection";

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
 * 🔴🔴 PDF, PPTX AND DOCX — A PRODUCT DECISION BY THE OWNER (2026-08-13), MADE OVER A BENCHMARK AND
 * DELIBERATELY SO. Measured per-file, the local readers win on Office: a Word activity gave them 6
 * tables against Mistral's 0, and a deck gave 209 blocks / 152 rectangles / 20 figures against
 * 100 / 0 / 0. That is a real difference and it is not the question being answered here.
 *
 * The question is who OWNS document parsing. Keeping the Office readers as primary means keeping
 * three parsers, three sets of edge cases, and a standing obligation to patch SmartArt, merged
 * cells and Office equations for ever — which is the position this work exists to leave. Mistral
 * supports all three formats and improves without a deploy. 94% that someone else maintains beats
 * 97% that we do, at this stage, by a wide margin.
 *
 * 🔴 ON PDF THE MEASUREMENT AGREES WITH THE DECISION ANYWAY, DECISIVELY. A PDF is not markup; it is
 * instructions for painting glyphs, and a font whose "ti" is one ligature paints something pdf.js
 * cannot map back. On a 24-page drug chart the local reader recovered 9,098 words of which 60 were
 * corrupted across 39 spellings — `ac1on`, `indica1ons`, `contraindica1ons`, `palpita2ons` — while
 * Mistral recovered 16,823 with none. "contraindication" appears 34 times locally and 64 in
 * Mistral's read.
 *
 * 🔴 OFFICE MOVED TO LLAMAPARSE, WHICH IS WHY THIS LIST SHRANK BACK. The owner's decision to stop
 * owning Office parsing stands; the vendor that serves it changed once one was measured that can
 * see a deck's speaker notes. See `llamaparse-ocr.ts`. `mistral-quality.ts` still gates BOTH lanes.
 *
 * 🔴 `image` IS STILL NOT ON THE LIST, FOR A DIFFERENT REASON. A standalone picture goes to Gemini
 * with a prompt that asks it to DESCRIBE what it shows; OCR would transcribe the words in a
 * photograph of a whiteboard and say nothing about the diagram beside them. Different questions,
 * and the existing lane asks the better one. `xlsx`/`csv` stay local too: a spreadsheet's exact
 * cell references and formulas are not something an optical read can improve on. PURE.
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
  /** Office formats reject the flag PDFs need — see `include_image_base64` below. */
  office?: boolean;
  /**
   * CANONICAL 0-based page indices to read, and the document's total page count.
   *
   * 🔴 THE DIFFERENCE BETWEEN PAYING FOR TWENTY PAGES AND PAYING FOR FOUR
   * HUNDRED. This request used to send the whole document every time, so a
   * 400-page PDF with two scanned pages was billed as 400 OCR pages. The local
   * reader already knows which pages it could not read; `toMistralPages` turns
   * that list into this parameter.
   *
   * Omitting `pages` (or passing no selection) reads the whole document, which
   * is the right behaviour for a document that IS a scan.
   */
  pages?: readonly number[];
  totalPages?: number;
}): string {
  const pages = input.pages && input.totalPages != null
    ? toMistralPages(input.pages, input.totalPages)
    : null;
  return JSON.stringify({
    model: input.model,
    document: {
      type: "document_url",
      document_url: `data:${input.mime};base64,${input.base64}`,
    },
    // Only the pages the cheap local read could not handle. `null` means the
    // whole document, which is what a fully scanned PDF actually needs.
    ...(pages ? { pages } : {}),
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
    // 🔴 AND THE TWO FAMILIES NEED DIFFERENT PARAMETERS, WHICH IS WHY THIS IS CONDITIONAL RATHER
    // THAN A SHARED COMPROMISE. Mistral rejects this flag outright for .docx and .pptx —
    // "extracted images can only be returned in base64 ... try setting image_limit=0 instead" — so
    // sending it to an Office file is a 400 and a silent fall-back to the legacy reader. Office
    // files are therefore sent no image parameter at all (measured: the default is accepted and
    // returns the same result as `image_limit: 0`), and PDFs get the flag that keeps their figures.
    // A single value that satisfied both would have to be `image_limit: 0`, which costs every PDF
    // its diagrams — the expensive half of the trade, paid to avoid one conditional.
    //
    // The rectangles are what a locator needs. The pixels would multiply the response size for
    // something the reader renders from the original file anyway.
    ...(input.office ? {} : { include_image_base64: false }),
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
  options: { env?: MistralEnv; office?: boolean; signal?: AbortSignal } = {},
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
    ...(options.office ? { office: true } : {}),
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
