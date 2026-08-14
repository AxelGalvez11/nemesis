/**
 * Running one parse on a thread, while the main thread holds the lease.
 *
 * This is the half of Phase 1 the spike's measurements are about. The database
 * half (claiming, backoff, recovery) lives in SQL; the decisions live in
 * `parse-worker.ts`; this file is the moving part between them.
 *
 * 🔴 THE MAIN THREAD DOES EXACTLY THREE THINGS AND NONE OF THEM ARE PARSING:
 * renew the lease, watch the clock, watch memory. Any of those done on the
 * parsing thread would be done by a thread that is not free to run — which is
 * the measured failure (0 of 49 heartbeats fired inline) rather than a worry.
 *
 * Every exit path terminates the worker. A parse that overran its deadline and
 * kept running would still be holding memory when the next job started, and the
 * platform would kill the process — losing the lease, the attempt count and the
 * failure record together, which is the one outcome with no recovery story.
 */

import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { DEADLINE_ABORT_MS, HEARTBEAT_MS, MEMORY_ABORT_MB } from "./parse-worker";

/** Where `scripts/build-parse-thread.mjs` puts the bundle, relative to the app. */
export const PARSE_THREAD_RELATIVE = "workers/parse-thread.mjs";

/**
 * Resolve the worker bundle, or say plainly that it is missing.
 *
 * 🔴 A MISSING BUNDLE IS A DEPLOYMENT FACT, NOT A PARSE FAILURE. Next traces
 * files it can see referenced; this one is spawned by a path it computes, so it
 * is shipped by an explicit `outputFileTracingIncludes` entry. If that entry is
 * ever dropped the file simply is not there, and the honest response is to say
 * so once — not to fail every document with a message about the student's file.
 */
export function parseThreadPath(cwd: string = process.cwd()): string | null {
  // Two roots: the monorepo runs functions from `apps/web`, a local `next start`
  // from the same place, but a test or script may run from the repo root.
  const candidates = [
    join(cwd, PARSE_THREAD_RELATIVE),
    join(cwd, "apps/web", PARSE_THREAD_RELATIVE),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export type ParseRunOutcome =
  | { status: "parsed"; parsed: unknown; ms: number; peakRssMb: number }
  /**
   * The parser read the file and refused it. Not an error — an answer.
   *
   * `parsed` is present only for `no-text`: a scan or an image-only export,
   * where there is no text to return and there IS a structural model worth
   * storing. The caller decides whether to record it; this layer only carries
   * it across, because dropping it here would lose the same model the parser
   * deliberately kept.
   */
  | { status: "refused"; reason: string; parsed?: unknown; ms: number; peakRssMb: number }
  | { status: "threw"; error: string; ms: number; peakRssMb: number }
  /** Aborted by us, before the platform could abort us. */
  | { status: "deadline"; ms: number; peakRssMb: number }
  | { status: "memory"; peakRssMb: number; ms: number }
  /** The lease was taken by someone else while we were parsing. */
  | { status: "lease-lost"; ms: number; peakRssMb: number }
  | { status: "no-worker-bundle"; ms: number; peakRssMb: number };

export interface ParseRunOptions {
  /**
   * Renew the lease. Returning false means the lease is gone, and the run is
   * abandoned immediately — continuing would be computing a result that
   * `finish_document_parse` will refuse to write anyway.
   */
  heartbeat: () => Promise<boolean>;
  heartbeatMs?: number;
  deadlineMs?: number;
  memoryAbortMb?: number;
  /** Injected so the guards can be tested without allocating 2.4 GB. */
  now?: () => number;
  rssMb?: () => number;
  workerPath?: string | null;
}

/**
 * Parse `bytes` on a worker thread, holding the lease from this one.
 *
 * The returned promise never rejects: every ending is a described outcome. A
 * worker loop that has to distinguish "threw" from "rejected" ends up with two
 * failure paths and writes the failure row on only one of them.
 */
export async function runParseOnThread(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  options: ParseRunOptions,
): Promise<ParseRunOutcome> {
  const now = options.now ?? Date.now;
  const rssMb = options.rssMb ?? (() => Math.round(process.memoryUsage.rss() / (1024 * 1024)));
  const deadlineMs = options.deadlineMs ?? DEADLINE_ABORT_MS;
  const memoryAbortMb = options.memoryAbortMb ?? MEMORY_ABORT_MB;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const started = now();
  const elapsed = () => now() - started;

  const path = options.workerPath === undefined ? parseThreadPath() : options.workerPath;
  if (!path) return { status: "no-worker-bundle", ms: elapsed(), peakRssMb: rssMb() };

  // 🔴 A COPY, DETACHED ON PURPOSE. Transferring the buffer to the thread frees
  // this thread of a second copy of a document that may be 100 MB — the whole
  // reason `MEMORY_ABORT_MB` exists. The caller must not read `bytes` after
  // this point, which is why nothing below does.
  // `slice` always returns a plain ArrayBuffer, never the SharedArrayBuffer the
  // source view's type allows — and a shared buffer is not transferable, so the
  // copy is what makes the transfer legal as well as what bounds the memory.
  const transfer: ArrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const worker = new Worker(path, {
    workerData: { bytes: transfer, fileName, mimeType },
    transferList: [transfer],
    // A parse must not be able to read the environment it did not need. The
    // EXTRACTION keys are the exception: the PDF lane calls Gemini for figures,
    // and every lane may call Mistral to read the document itself.
    //
    // 🔴🔴 A KEY MISSING FROM THIS LIST DOES NOT FAIL — IT DOWNGRADES, SILENTLY, AND ONLY ON
    // ONE OF THE TWO LANES. `parseDocument` falls back to the local extractors whenever a
    // provider is unconfigured, which is correct behaviour and is exactly what makes the
    // omission invisible: the synchronous upload would read a document with Mistral while the
    // background worker read the SAME document with pdf.js, and `parsed_documents` would hold
    // whichever lane wrote last. That is the precise failure `parse-document.ts` exists to
    // prevent ("one function, one answer"), reintroduced one level down where no test that
    // calls `parseDocument` directly can see it. ADD THE VARIABLE HERE WHENEVER A PROVIDER IS
    // ADDED THERE; `parse-run.test.ts` asserts this list against what the parser reads.
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      MISTRAL_OCR_MODEL: process.env.MISTRAL_OCR_MODEL,
      LLAMAPARSE_API_KEY: process.env.LLAMAPARSE_API_KEY,
      LLAMAPARSE_TIER: process.env.LLAMAPARSE_TIER,
      LLAMAPARSE_VERSION: process.env.LLAMAPARSE_VERSION,
    },
    resourceLimits: {
      // Node's own ceiling, below ours, so V8 throws a catchable OOM inside the
      // thread before the platform kills the whole process.
      maxOldGenerationSizeMb: memoryAbortMb,
    },
  });

  let peakRssMb = rssMb();
  const observe = () => {
    const rss = rssMb();
    if (rss > peakRssMb) peakRssMb = rss;
    return rss;
  };

  return await new Promise<ParseRunOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: ParseRunOutcome) => {
      if (settled) return;
      settled = true;
      clearInterval(beat);
      clearInterval(guard);
      // Fire and forget: the outcome is already decided, and waiting on
      // termination would let a wedged thread delay the failure record.
      void worker.terminate();
      resolve(outcome);
    };

    // The lease. `heartbeat` is async, and a slow database must not stack up
    // overlapping renewals, so a renewal in flight suppresses the next tick.
    let renewing = false;
    const beat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void options
        .heartbeat()
        .then((held) => {
          if (!held) finish({ status: "lease-lost", ms: elapsed(), peakRssMb: observe() });
        })
        // A failed renewal is NOT a lost lease. A transient database error would
        // otherwise throw away a parse that is going fine; the lease has room
        // for seven consecutive misses before anything can steal the job.
        .catch(() => {})
        .finally(() => {
          renewing = false;
        });
    }, heartbeatMs);

    // The clock and the memory ceiling, sampled together because they abort the
    // same way. A second timer for the second guard would be two things to get
    // right in the shutdown path.
    const guard = setInterval(() => {
      const rss = observe();
      if (elapsed() >= deadlineMs) finish({ status: "deadline", ms: elapsed(), peakRssMb: rss });
      else if (rss >= memoryAbortMb) finish({ status: "memory", ms: elapsed(), peakRssMb: rss });
    }, 250);

    worker.on("message", (message: { ok?: boolean; parsed?: unknown; reason?: string; threw?: string; peakRssMb?: number }) => {
      // The thread's own peak is the one that matters — it holds the document.
      const peak = Math.max(peakRssMb, message.peakRssMb ?? 0);
      if (message.threw !== undefined) finish({ status: "threw", error: message.threw, ms: elapsed(), peakRssMb: peak });
      else if (message.ok) finish({ status: "parsed", parsed: message.parsed, ms: elapsed(), peakRssMb: peak });
      else {
        finish({
          status: "refused",
          reason: message.reason ?? "unknown",
          ms: elapsed(),
          peakRssMb: peak,
          ...(message.parsed !== undefined ? { parsed: message.parsed } : {}),
        });
      }
    });

    worker.on("error", (error: Error) => {
      finish({ status: "threw", error: error.message, ms: elapsed(), peakRssMb: observe() });
    });

    // 🔴 EXIT WITHOUT A MESSAGE MUST STILL SETTLE. `resourceLimits` can kill the
    // thread rather than throwing something catchable, so without this handler
    // the promise would never resolve and the job would hang holding its lease
    // until it expired — the worst shape of failure, because nothing records it.
    //
    // It does NOT assume the cause. Calling every silent exit "memory" would
    // put a number in `parse_error` that nobody measured; the exit code is what
    // is actually known.
    worker.on("exit", (code: number) => {
      finish({ status: "threw", error: `parse thread exited (code ${code})`, ms: elapsed(), peakRssMb: observe() });
    });
  });
}
