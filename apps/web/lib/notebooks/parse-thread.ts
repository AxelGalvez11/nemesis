/**
 * The parse, running on its own thread.
 *
 * 🔴 THIS FILE IS AN ENTRY POINT, NOT A MODULE. Nothing imports it. It is
 * bundled by `scripts/build-parse-thread.mjs` into `workers/parse-thread.mjs`
 * and spawned by path at runtime, because a `worker_thread` does not inherit
 * the TypeScript loader and Next's own bundle is not addressable from one.
 *
 * Why a thread at all, from `docs/document-worker-spike.md`:
 *
 *   * The parsers are CPU-bound and synchronous *inside* their async wrappers,
 *     so there is no await point for a timer. Measured across a 12.3 s parse:
 *     0 of 49 heartbeats fired inline; 50 of 50 fired threaded.
 *   * An inline parse cannot be cancelled — synchronous CPU has nothing to
 *     throw at. `worker.terminate()` reclaimed a running parse in 9 ms, which
 *     is what makes the deadline and memory guards enforceable rather than
 *     aspirational.
 *
 * The contract is deliberately narrow: bytes in, a parse outcome out. It holds
 * no database client, no service-role key and no lease. If this thread is
 * terminated at any moment, nothing it was doing needed cleaning up.
 */

import { parentPort, workerData } from "node:worker_threads";

import { parseDocument } from "./parse-document";

/** What the parent sends. Bytes are transferred, not copied. */
export interface ParseThreadInput {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
}

/**
 * What comes back.
 *
 * A parser refusal (`ok: false`) is a RESULT, not an error: "this file is
 * encrypted" is an answer, and the parent needs it to decide retryable versus
 * terminal. Only a genuine throw becomes `{ threw }`.
 */
export type ParseThreadOutput =
  | { ok: true; parsed: unknown; peakRssMb: number }
  | { ok: false; reason: string; peakRssMb: number }
  | { threw: string; peakRssMb: number };

/** Peak resident memory seen by this thread, sampled as the parse runs. */
let peakRss = 0;

function sampleRss(): number {
  const rss = Math.round(process.memoryUsage.rss() / (1024 * 1024));
  if (rss > peakRss) peakRss = rss;
  return peakRss;
}

export async function runParseThread(
  input: ParseThreadInput,
  post: (message: ParseThreadOutput) => void,
): Promise<void> {
  // Sampling on a timer, not once at the end: `rss` after a parse has already
  // been reduced by whatever the collector reclaimed, so an end-of-run reading
  // reports a number the platform never had to accommodate.
  const sampler = setInterval(sampleRss, 250);
  // The parse must not be kept alive by its own instrumentation.
  if (typeof sampler.unref === "function") sampler.unref();
  try {
    const outcome = await parseDocument(
      new Uint8Array(input.bytes),
      input.fileName,
      input.mimeType,
    );
    sampleRss();
    post(
      // The DOCUMENT, not the outcome wrapper. A thread boundary is exactly the
      // place a wrapper gets forwarded by accident and every reader downstream
      // starts writing `result.parsed.document.text`.
      outcome.ok
        ? { ok: true, parsed: outcome.document, peakRssMb: peakRss }
        : { ok: false, reason: outcome.reason, peakRssMb: peakRss },
    );
  } catch (caught) {
    sampleRss();
    // The message crosses a thread boundary, so it has to be a string — an
    // Error's prototype does not survive structured cloning intact, and the
    // parent classifies on the message anyway.
    post({ threw: caught instanceof Error ? caught.message : String(caught), peakRssMb: peakRss });
  } finally {
    clearInterval(sampler);
  }
}

// Spawned as a thread: run immediately. Imported by a test: do nothing, so the
// same file can be exercised without a Worker.
if (parentPort && workerData) {
  const port = parentPort;
  void runParseThread(workerData as ParseThreadInput, (message) => port.postMessage(message));
}
