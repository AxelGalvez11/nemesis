/**
 * LlamaParse, as the extraction vendor for Office documents.
 *
 * 🔴 A SIBLING OF `mistral-ocr.ts`, NOT A REPLACEMENT, AND THE SPLIT IS MEASURED. PDFs go to
 * Mistral because a PDF is painted glyphs: a font whose "ti" is one ligature defeats every
 * text-layer reader, and on a 24-page drug chart LlamaParse reproduced our own parser's corruption
 * exactly — 9,656 words with 60 broken across 39 spellings — while Mistral returned 16,823 with
 * none. Office files go to LlamaParse because a .pptx carries the lecturer's spoken explanation in
 * `ppt/notesSlides/`, which is never painted on a slide and which an optical model therefore cannot
 * see: LlamaParse has a first-class `slideSpeakerNotes` field and recovered a deck's declared
 * 13,134 characters exactly, where Mistral recovered none of them.
 *
 * 🔴 IT IS ASYNCHRONOUS, WHICH MISTRAL IS NOT, AND THAT IS THE ONLY REAL COMPLEXITY HERE.
 * Upload returns a job id; the result has to be polled for. Everything about that is bounded — a
 * total deadline, a poll interval, and a cap on attempts — because this runs inside a 300-second
 * request that a student is waiting through.
 *
 * 🔴 AND IT NEVER THROWS. Same contract as the Mistral client: every failure is a typed reason, and
 * the caller's correct response to all of them is to fall through to the reader that was there
 * before. An upload must not fail because a vendor did.
 */

export type LlamaEnv = Readonly<Record<string, string | undefined>>;

const BASE = "https://api.cloud.llamaindex.ai/api/v1/parsing";

/**
 * The cheapest tier that proved sufficient, and `version` is NOT optional.
 *
 * 🔴 A TIER WITHOUT A VERSION IS A JOB THAT FAILS AFTER UPLOADING THE WHOLE FILE. The API accepts
 * the request, runs, and then returns `MISSING_VERSION_FOR_TIER` — so the cost is paid in latency
 * and the failure looks like a parse error rather than a bad parameter. Measured on all three test
 * files before the pair was discovered.
 *
 * 🔴 COST-EFFECTIVE WAS ENOUGH, MEASURED, SO NOTHING DEFAULTS TO AN EXPENSIVE MODE. On the owner's
 * own coursework it matched the local reader's text to within 0.05%, returned every table with both
 * an HTML string and a rows array, and put a bounding box on 100% of items. 3 credits/page
 * (~$0.00375). `parse_page_with_agent` produced identical output on the PDF tested, so paying for a
 * stronger tier bought nothing there either.
 */
export const LLAMA_DEFAULT_TIER = "cost_effective";
export const LLAMA_DEFAULT_VERSION = "latest";

/** Base64 inflates by 4/3 and the whole file crosses the wire; past this the local readers are the
 *  better answer anyway. */
export const LLAMA_MAX_BYTES = 40 * 1024 * 1024;

/** The whole operation — upload, poll, fetch — inside the route's 300s budget. */
const TOTAL_DEADLINE_MS = 240_000;
const POLL_INTERVAL_MS = 2_000;

export interface LlamaFailure {
  reason:
    | "not-configured"
    | "too-large"
    | "rejected"
    | "rate-limited"
    | "provider-error"
    | "unreachable"
    | "timed-out"
    | "malformed"
    | "empty";
  status?: number;
  /** The vendor's own error code, for the server log only. Never shown to a learner. */
  code?: string;
}

export type LlamaOutcome =
  | { ok: true; result: unknown; durationMs: number; pages: number }
  | ({ ok: false; durationMs: number } & LlamaFailure);

/** Whether LlamaParse can run at all here. Callers must handle false without degrading. */
export function llamaConfigured(env: LlamaEnv = process.env): boolean {
  return Boolean((env.LLAMAPARSE_API_KEY ?? "").trim());
}

/** The tier and version to request, overridable from the environment. PURE. */
export function llamaTier(env: LlamaEnv = process.env): { tier: string; version: string } {
  return {
    tier: (env.LLAMAPARSE_TIER ?? "").trim() || LLAMA_DEFAULT_TIER,
    version: (env.LLAMAPARSE_VERSION ?? "").trim() || LLAMA_DEFAULT_VERSION,
  };
}

/** Which formats this vendor is asked for. PURE — see the header for why PDFs are not on it. */
export function llamaHandles(kind: string): boolean {
  return kind === "pptx" || kind === "docx";
}

/** Did anything readable come back? PURE. */
export function llamaYieldedText(result: unknown): boolean {
  const pages = (result as { pages?: unknown })?.pages;
  if (!Array.isArray(pages)) return false;
  return pages.some((page) => {
    const p = page as { text?: unknown; slideSpeakerNotes?: unknown };
    return (
      (typeof p.text === "string" && p.text.trim().length > 0) ||
      (typeof p.slideSpeakerNotes === "string" && p.slideSpeakerNotes.trim().length > 0)
    );
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one document to LlamaParse and wait for its result.
 *
 * Never throws. Never returns the key, and never puts it in a log line.
 */
export async function readWithLlama(
  bytes: Uint8Array,
  fileName: string,
  options: { env?: LlamaEnv; signal?: AbortSignal } = {},
): Promise<LlamaOutcome> {
  const env = options.env ?? process.env;
  const key = (env.LLAMAPARSE_API_KEY ?? "").trim();
  const started = Date.now();
  const since = () => Date.now() - started;

  if (!key) return { durationMs: 0, ok: false, reason: "not-configured" };
  if (bytes.byteLength === 0 || bytes.byteLength > LLAMA_MAX_BYTES) {
    return { durationMs: since(), ok: false, reason: "too-large" };
  }

  const auth = { Authorization: `Bearer ${key}`, accept: "application/json" };
  const { tier, version } = llamaTier(env);
  const form = new FormData();
  form.append("file", new Blob([bytes as unknown as BlobPart]), fileName);
  form.append("tier", tier);
  // 🔴 BOTH, ALWAYS. See LLAMA_DEFAULT_TIER: a tier without a version fails AFTER the upload.
  form.append("version", version);

  let jobId: string;
  try {
    const upload = await fetch(`${BASE}/upload`, {
      body: form,
      headers: auth,
      method: "POST",
      signal: options.signal,
    });
    const text = await upload.text();
    if (!upload.ok) {
      console.warn(JSON.stringify({ event: "llama_upload_rejected", status: upload.status }));
      if (upload.status === 429) return { durationMs: since(), ok: false, reason: "rate-limited", status: upload.status };
      return {
        durationMs: since(),
        ok: false,
        reason: upload.status >= 500 ? "provider-error" : "rejected",
        status: upload.status,
      };
    }
    const id = (JSON.parse(text) as { id?: string }).id;
    if (!id) return { durationMs: since(), ok: false, reason: "malformed" };
    jobId = id;
  } catch {
    return { durationMs: since(), ok: false, reason: "unreachable" };
  }

  // Poll to a deadline. A job that has not finished by then is abandoned rather than waited on —
  // the local reader will produce something in milliseconds.
  let status = "";
  let code: string | undefined;
  while (since() < TOTAL_DEADLINE_MS) {
    if (options.signal?.aborted) return { durationMs: since(), ok: false, reason: "unreachable" };
    await sleep(POLL_INTERVAL_MS);
    let body: string;
    try {
      const check = await fetch(`${BASE}/job/${jobId}`, { headers: auth, signal: options.signal });
      body = await check.text();
    } catch {
      continue;
    }
    try {
      const job = JSON.parse(body) as { status?: string; error_code?: string };
      status = job.status ?? "";
      code = job.error_code ?? code;
    } catch {
      continue;
    }
    if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") break;
    if (status === "ERROR" || status === "CANCELED") {
      // 🔴 THE VENDOR'S ERROR CODE IS WORTH LOGGING AND IS NEVER SHOWN TO A LEARNER. It is what
      // turned "status: ERROR" into "MISSING_VERSION_FOR_TIER" during the benchmark — the
      // difference between a broken document and a wrong parameter.
      console.warn(JSON.stringify({ code, event: "llama_job_failed", status }));
      return { code, durationMs: since(), ok: false, reason: "provider-error" };
    }
  }
  if (status !== "SUCCESS" && status !== "PARTIAL_SUCCESS") {
    console.warn(JSON.stringify({ event: "llama_timed_out", ms: since(), status }));
    return { durationMs: since(), ok: false, reason: "timed-out" };
  }

  try {
    const response = await fetch(`${BASE}/job/${jobId}/result/json`, { headers: auth, signal: options.signal });
    if (!response.ok) {
      await response.body?.cancel();
      return { durationMs: since(), ok: false, reason: "provider-error", status: response.status };
    }
    const result = (await response.json()) as { pages?: unknown[] };
    if (!Array.isArray(result.pages)) return { durationMs: since(), ok: false, reason: "malformed" };
    if (!llamaYieldedText(result)) {
      console.warn(JSON.stringify({ event: "llama_empty_extraction", pages: result.pages.length }));
      return { durationMs: since(), ok: false, reason: "empty" };
    }
    return { durationMs: since(), ok: true, pages: result.pages.length, result };
  } catch {
    return { durationMs: since(), ok: false, reason: "unreachable" };
  }
}
