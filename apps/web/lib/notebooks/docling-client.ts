/**
 * Talk to a docling-serve instance over HTTP.
 *
 * 🔴 WHY HTTP AND NOT AN EMBEDDED PYTHON PROCESS. Docling needs PyTorch. The
 * published measurement (Docling technical report, arXiv 2408.09869, Table 1) is
 * 2.42-2.56 GB peak RSS with the pypdfium backend and 6.16-6.20 GB with the
 * native backend, for a 225-page run. That does not fit in a Vercel function and
 * it has no business inside a Next.js request. The only sane boundary is a
 * separate long-lived service that owns its own memory and its own restarts, and
 * the project ships exactly that (`ghcr.io/docling-project/docling-serve`).
 * Nemesis therefore speaks to it the way it speaks to any other provider: over a
 * network call with a timeout, a size cap, and a fallback.
 *
 * 🔴 EVERY LIMIT HERE IS SET BY US, BECAUSE THE SERVER'S DEFAULTS ARE UNSAFE.
 * docling-serve ships `DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT=604800` — SEVEN DAYS —
 * and leaves `MAX_NUM_PAGES` and `MAX_FILE_SIZE` unset entirely. A client that
 * trusts those defaults has handed an unbounded resource to whoever uploads a
 * file. The caps below are the client's own and do not depend on how the service
 * happens to be configured.
 */

/** Nothing may occupy the service longer than this. */
const REQUEST_TIMEOUT_MS = 120_000;
/**
 * Bytes we will hand over. Above this the document goes to our own parser, which
 * streams rather than buffering a base64 body.
 */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export interface DoclingServiceConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  maxBytes: number;
}

/**
 * Read the service config from the environment.
 *
 * Absent URL means "not configured", which is the normal production state and
 * is NOT an error — the router simply keeps using our own parsers.
 */
export function doclingConfig(env: NodeJS.ProcessEnv = process.env): DoclingServiceConfig | null {
  const baseUrl = (env.DOCLING_SERVE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  return {
    baseUrl,
    apiKey: (env.DOCLING_SERVE_API_KEY ?? "").trim() || undefined,
    timeoutMs: Number(env.DOCLING_SERVE_TIMEOUT_MS) || REQUEST_TIMEOUT_MS,
    maxBytes: Number(env.DOCLING_SERVE_MAX_BYTES) || MAX_UPLOAD_BYTES,
  };
}

export type DoclingFetchOutcome =
  | { ok: true; document: unknown; status: string; processingSeconds: number | null }
  | { ok: false; reason: "not-configured" | "too-large" | "timeout" | "http" | "malformed"; detail?: string };

/**
 * Convert one document and return Docling's JSON export, unmodified.
 *
 * 🔴 THIS FUNCTION DOES NOT ADAPT, INTERPRET OR JUDGE. It returns raw JSON and a
 * status string. Turning that into a `DocumentModel` is `adaptDoclingDocument`'s
 * job and deciding whether the read was complete is coverage's job. Keeping the
 * three apart is what stops "the service returned 200" from becoming "Nemesis
 * read the whole document".
 */
export async function fetchDoclingDocument(
  bytes: Uint8Array,
  fileName: string,
  config: DoclingServiceConfig | null,
): Promise<DoclingFetchOutcome> {
  if (!config) return { ok: false, reason: "not-configured" };
  if (bytes.byteLength > config.maxBytes) {
    return { ok: false, reason: "too-large", detail: `${bytes.byteLength} > ${config.maxBytes}` };
  }

  const form = new FormData();
  form.append("files", new Blob([bytes as unknown as BlobPart]), fileName);
  // Ask for JSON only. The markdown rendering is the lossy one — it drops every
  // `notes` content layer, which on a real deck was 13,101 characters of the
  // lecturer's own script.
  form.append("to_formats", "json");
  form.append("image_export_mode", "placeholder");

  try {
    const res = await fetch(`${config.baseUrl}/v1/convert/file`, {
      method: "POST",
      body: form,
      headers: config.apiKey ? { "X-Api-Key": config.apiKey } : undefined,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, reason: "http", detail: `${res.status} ${res.statusText}`.slice(0, 120) };
    }
    const body = (await res.json()) as {
      document?: { json_content?: unknown };
      status?: string;
      processing_time?: number;
    };
    const document = body.document?.json_content;
    if (!document || typeof document !== "object") {
      return { ok: false, reason: "malformed", detail: "no json_content" };
    }
    return {
      ok: true,
      document,
      status: String(body.status ?? "unknown"),
      processingSeconds: typeof body.processing_time === "number" ? body.processing_time : null,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "timeout", detail: `${config.timeoutMs}ms` };
    }
    return { ok: false, reason: "http", detail: String(err).slice(0, 160) };
  }
}
