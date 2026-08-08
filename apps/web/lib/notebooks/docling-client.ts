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
 *
 * 🔴 THE CONVERSION IS SUBMITTED ASYNCHRONOUSLY, AND THAT IS A CORRECTNESS
 * DECISION, NOT AN OPTIMISATION.
 *
 * The worker function's ceiling is 300 s and it aborts itself at 240 s. Docling's
 * measured distribution over 154 real course PDFs is median 12.8 s, p90 65 s,
 * p95 99 s, p99 145 s, slowest 297 s. A single blocking request therefore cannot
 * cover the whole distribution inside one invocation — and the files that miss
 * are not a random tail. The 297 s file is 17 pages carrying 15 tables:
 * TableFormer is the entire cost. Our own PDF lane finds ZERO tables. So a
 * timeout-and-fall-back design would systematically lose exactly the documents
 * Docling is being adopted for.
 *
 * `POST /v1/convert/file/async` returns a task id immediately. The worker stores
 * that id against the row, polls for as long as its own deadline allows, and — if
 * the task is still running when the invocation must end — leaves the id in place
 * so the NEXT attempt resumes the same task instead of paying for it again. The
 * long tail completes; nothing is computed twice; the lease, backoff and attempt
 * limits are untouched.
 */

/**
 * Submitting and polling return immediately, so these calls are short by nature.
 * A control call that hangs is a broken service, not a slow document.
 */
const CONTROL_TIMEOUT_MS = 30_000;

/**
 * Bytes we will hand over. Above this the document goes to our own parser, which
 * streams rather than buffering a base64 body.
 */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/**
 * How long one task may live before we stop waiting for it at all.
 *
 * This is the ceiling the SEVEN-DAY server default made necessary, and it is the
 * one number the async design still needs: a task that is resumed across attempts
 * would otherwise be resumed forever. 900 s is three times the slowest document
 * this corpus produced (297 s), which leaves room for queue wait on a shared
 * sidecar without leaving room for a runaway.
 *
 * It is a guard against the unseen pathological document, NOT against anything
 * measured here. The one 3,555 s reading in the benchmark was the laptop asleep
 * for an hour — wall-clock keeps counting through a suspend and the file in
 * flight absorbs all of it. Do not size any limit from a number measured on an
 * unattended laptop.
 */
const TASK_BUDGET_MS = 900_000;

/** Poll cadence. Starts tight so the median 12.8 s document is not made slower. */
const POLL_FIRST_MS = 1_500;
const POLL_MAX_MS = 5_000;

export interface DoclingServiceConfig {
  baseUrl: string;
  apiKey?: string;
  /** Per-request cap on submit and poll. Not the document's budget. */
  timeoutMs: number;
  /** Wall-clock a single task may live, across however many attempts see it. */
  taskBudgetMs: number;
  maxBytes: number;
}

/**
 * Read the service config from the environment.
 *
 * Absent URL means "not configured", which is the normal production state and
 * is NOT an error — the router simply keeps using our own parsers.
 */
export function doclingConfig(env: Readonly<Record<string, string | undefined>> = process.env): DoclingServiceConfig | null {
  const baseUrl = (env.DOCLING_SERVE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  return {
    baseUrl,
    apiKey: (env.DOCLING_SERVE_API_KEY ?? "").trim() || undefined,
    timeoutMs: Number(env.DOCLING_SERVE_TIMEOUT_MS) || CONTROL_TIMEOUT_MS,
    taskBudgetMs: Number(env.DOCLING_SERVE_TASK_BUDGET_MS) || TASK_BUDGET_MS,
    maxBytes: Number(env.DOCLING_SERVE_MAX_BYTES) || MAX_UPLOAD_BYTES,
  };
}

/** Why a call could not produce a document. Every one of these means "fall back". */
export type DoclingFailure = "not-configured" | "too-large" | "timeout" | "http" | "malformed" | "task-failed";

export type DoclingSubmitOutcome =
  | { ok: true; taskId: string; state: DoclingTaskState }
  | { ok: false; reason: DoclingFailure; detail?: string };

/** docling-serve's four task states, normalised. Anything else is `unknown`. */
export type DoclingTaskState = "pending" | "started" | "success" | "failure" | "unknown";

export type DoclingPollOutcome =
  | { ok: true; state: "pending" | "started"; position: number | null }
  | { ok: true; state: "success" }
  | { ok: false; reason: DoclingFailure; detail?: string };

export type DoclingResultOutcome =
  | { ok: true; document: unknown; status: string; processingSeconds: number | null }
  | { ok: false; reason: DoclingFailure; detail?: string };

function headersFor(config: DoclingServiceConfig): Record<string, string> | undefined {
  return config.apiKey ? { "X-Api-Key": config.apiKey } : undefined;
}

/** One request, with our timeout, never the server's. */
async function call(
  config: DoclingServiceConfig,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; body: unknown } | { ok: false; reason: DoclingFailure; detail?: string }> {
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...(headersFor(config) ?? {}), ...((init.headers as Record<string, string>) ?? {}) },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, reason: "http", detail: `${res.status} ${res.statusText}`.slice(0, 120) };
    }
    return { ok: true, body: await res.json() };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "timeout", detail: `${config.timeoutMs}ms` };
    }
    return { ok: false, reason: "http", detail: String(err).slice(0, 160) };
  }
}

function normaliseState(raw: unknown): DoclingTaskState {
  const value = String(raw ?? "").toLowerCase();
  if (value === "pending" || value === "started" || value === "success" || value === "failure") return value;
  return "unknown";
}

/**
 * Hand a document to the service and get back a task id.
 *
 * 🔴 NOTHING IS ADAPTED, INTERPRETED OR JUDGED IN THIS FILE. It returns raw JSON
 * and a status string. Turning that into a `DocumentModel` is
 * `adaptDoclingDocument`'s job and deciding whether the read was complete is
 * coverage's job. Keeping the three apart is what stops "the service returned
 * 200" from becoming "Nemesis read the whole document".
 */
export async function submitDoclingTask(
  bytes: Uint8Array,
  fileName: string,
  config: DoclingServiceConfig | null,
): Promise<DoclingSubmitOutcome> {
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
  // Placeholders, not embedded images. Docling's rectangles tell us WHERE a
  // figure is; the bytes come from PDF.js, which already has the page open.
  // Embedding them here would base64 every picture into the JSON we then have to
  // hold in a 3 GB function.
  form.append("image_export_mode", "placeholder");

  const res = await call(config, "/v1/convert/file/async", { method: "POST", body: form });
  if (!res.ok) return res;
  const body = res.body as { task_id?: unknown; task_status?: unknown };
  const taskId = typeof body?.task_id === "string" ? body.task_id.trim() : "";
  if (!taskId) return { ok: false, reason: "malformed", detail: "no task_id" };
  return { ok: true, taskId, state: normaliseState(body?.task_status) };
}

/** Ask once whether a task is done. Never waits. */
export async function pollDoclingTask(
  taskId: string,
  config: DoclingServiceConfig | null,
): Promise<DoclingPollOutcome> {
  if (!config) return { ok: false, reason: "not-configured" };
  const res = await call(config, `/v1/status/poll/${encodeURIComponent(taskId)}`);
  if (!res.ok) return res;
  const body = res.body as { task_status?: unknown; task_position?: unknown };
  const state = normaliseState(body?.task_status);
  if (state === "success") return { ok: true, state: "success" };
  if (state === "failure") return { ok: false, reason: "task-failed", detail: "docling reported failure" };
  if (state === "unknown") {
    return { ok: false, reason: "malformed", detail: `unknown task_status ${String(body?.task_status).slice(0, 40)}` };
  }
  const position = typeof body?.task_position === "number" ? body.task_position : null;
  return { ok: true, state, position };
}

/** Collect a finished task's document. */
export async function fetchDoclingResult(
  taskId: string,
  config: DoclingServiceConfig | null,
): Promise<DoclingResultOutcome> {
  if (!config) return { ok: false, reason: "not-configured" };
  const res = await call(config, `/v1/result/${encodeURIComponent(taskId)}`);
  if (!res.ok) return res;
  const body = res.body as {
    document?: { json_content?: unknown };
    status?: string;
    processing_time?: number;
  };
  const document = body?.document?.json_content;
  if (!document || typeof document !== "object") {
    return { ok: false, reason: "malformed", detail: "no json_content" };
  }
  return {
    ok: true,
    document,
    status: String(body?.status ?? "unknown"),
    processingSeconds: typeof body?.processing_time === "number" ? body.processing_time : null,
  };
}

/**
 * How long to wait before asking again.
 *
 * Exported so the cadence is a tested fact rather than a loop nobody reads. It
 * starts at 1.5 s because half of these documents are finished in under 13 s, and
 * settles at 5 s so a queued task costs a handful of requests a minute.
 */
export function pollDelayMs(attempt: number): number {
  return Math.min(POLL_MAX_MS, POLL_FIRST_MS * 2 ** Math.max(0, attempt));
}

export type DoclingAwaitOutcome =
  | { ok: true; document: unknown; status: string; processingSeconds: number | null }
  /** Still running, and the id is worth keeping — the next attempt resumes it. */
  | { ok: false; reason: "still-running"; taskId: string; polls: number }
  /** The lease was taken while we waited. Nothing may be written after this. */
  | { ok: false; reason: "lease-lost" }
  | { ok: false; reason: DoclingFailure; detail?: string };

export interface AwaitOptions {
  /**
   * How long THIS invocation may spend waiting. Computed by the caller from its
   * own remaining deadline, never from a constant here: the worker knows how much
   * of its 240 s it has already spent fetching bytes, and this module does not.
   */
  budgetMs: number;
  /** Wall-clock the task has already burned in earlier attempts, if resumed. */
  spentMs?: number;
  /**
   * Renew the lease between polls. Returning false means the job belongs to
   * somebody else now and this call must stop immediately.
   *
   * 🔴 WAITING IS STILL HOLDING. The built-in lane renews from the main thread
   * while a worker thread parses; this lane has no thread, but it has the same
   * obligation — a job that sits in a poll loop for three minutes without
   * renewing gets reclaimed by the recovery cron that exists to help it.
   */
  heartbeat?: () => Promise<boolean>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Wait for a task, within a budget this invocation actually has.
 *
 * 🔴 RUNNING OUT OF BUDGET IS NOT A FAILURE, AND MUST NOT BE RECORDED AS ONE.
 * `still-running` carries the task id back so the caller can persist it and let
 * the next attempt pick the same task up. Treating it as a failure is what turns
 * a slow document into a retry storm, where every attempt resubmits the same file
 * and re-queues behind its own predecessor.
 */
export async function awaitDoclingTask(
  taskId: string,
  config: DoclingServiceConfig | null,
  options: AwaitOptions,
): Promise<DoclingAwaitOutcome> {
  if (!config) return { ok: false, reason: "not-configured" };
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  const spent = Math.max(0, options.spentMs ?? 0);

  for (let polls = 0; ; polls += 1) {
    // The task's whole life, across attempts — the guard that stops a resumed id
    // from being resumed forever.
    if (spent + (now() - started) >= config.taskBudgetMs) {
      return { ok: false, reason: "timeout", detail: `task budget ${config.taskBudgetMs}ms` };
    }
    const status = await pollDoclingTask(taskId, config);
    if (!status.ok) return status;
    if (status.state === "success") return await fetchDoclingResult(taskId, config);

    // A failed renewal is NOT a lost lease — the same rule the threaded lane
    // uses. Only an explicit `false` means somebody else owns this job; a thrown
    // renewal is a database blip, and the lease has room for several misses.
    if (options.heartbeat) {
      const held = await options.heartbeat().catch(() => true);
      if (!held) return { ok: false, reason: "lease-lost" };
    }

    const wait = pollDelayMs(polls);
    // Only sleep if the answer could still arrive inside this invocation's share.
    if (now() - started + wait >= options.budgetMs) {
      return { ok: false, reason: "still-running", taskId, polls: polls + 1 };
    }
    await sleep(wait);
  }
}

/**
 * Submit and wait, for a caller with no row to persist a task id against.
 *
 * The worker does NOT use this — it needs the two halves so it can hand the id to
 * the database between them. This exists so a script or a test can convert one
 * document without reimplementing the loop.
 */
export async function convertDoclingDocument(
  bytes: Uint8Array,
  fileName: string,
  config: DoclingServiceConfig | null,
  options: AwaitOptions,
): Promise<DoclingAwaitOutcome> {
  const submitted = await submitDoclingTask(bytes, fileName, config);
  if (!submitted.ok) return submitted;
  return await awaitDoclingTask(submitted.taskId, config, options);
}
