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
import {
  NO_SPEND,
  VisionLedger,
  documentUnitCap,
  withVisionBudget,
  type VisionSpend,
} from "@/lib/pdf/vision-budget";

/** What the parent sends. Bytes are transferred, not copied. */
export interface ParseThreadInput {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
  /**
   * Images and pages this parse may pay to look at.
   *
   * 🔴 A NUMBER, BECAUSE A LEDGER CANNOT CROSS A THREAD BOUNDARY. The parent holds the
   * database and does the reserving; a class instance would not survive structured
   * cloning, and an `AsyncLocalStorage` context does not span threads at all. So the
   * parent sends an allowance and the thread builds its own ledger from it — which is
   * also why the spend has to be sent back rather than read from a shared object.
   *
   * Absent means "no reservation was made", which is the synchronous upload lane and
   * every test. Those fall back to the per-document default rather than to unlimited.
   */
  visionUnitBudget?: number;
}

/**
 * What comes back.
 *
 * A parser refusal (`ok: false`) is a RESULT, not an error: "this file is
 * encrypted" is an answer, and the parent needs it to decide retryable versus
 * terminal. Only a genuine throw becomes `{ threw }`.
 */
export type ParseThreadOutput =
  /**
   * 🔴 SENT BEFORE ANY WORK, AND ITS ONLY JOB IS TO MAKE SILENCE MEAN SOMETHING.
   *
   * A thread that fails to LOAD - a package missing from the deployed function, which is
   * exactly what `fflate` did on the first document this worker was ever given - never
   * runs a line of this file and therefore never spends a penny on vision. A thread
   * killed MID-PARSE by the deadline or memory guard also sends no result, and its spend
   * is entirely real. Both look identical from the parent: no message.
   *
   * This message separates them. Without it the parent must assume the worst and charge
   * the full reservation, which burned this document's whole 120-unit lifetime budget on
   * a deployment defect and would have starved all four remaining attempts.
   */
  | { ready: true }
  | { ok: true; parsed: unknown; figures?: unknown; peakRssMb: number; visionSpend?: VisionSpend }
  /**
   * A refusal, and — for `no-text` — what was found anyway.
   *
   * 🔴 `parsed` ON A REFUSAL IS NOT A CONTRADICTION, AND OMITTING IT WAS THE
   * WHOLE DEFECT ONE LAYER DOWN. An image-only PDF is refused (there is no text
   * to return) while still holding units, figures and geometry worth storing.
   * If only the reason string crossed this boundary, the model would die here
   * instead of in the parser — the same loss, one file further along.
   *
   * It survives `postMessage` for the same reason the success path's does: the
   * model is plain data, so structured cloning carries it intact.
   */
  | { ok: false; reason: string; parsed?: unknown; figures?: unknown; peakRssMb: number; visionSpend?: VisionSpend }
  /**
   * 🔴 A THROW REPORTS ITS SPEND TOO, AND THAT IS THE WHOLE POINT OF SETTLING.
   * A parse that described thirty figures and then died on the thirty-first still cost
   * thirty figures. Reporting spend only on success would refund money that was
   * genuinely spent, and the per-user ceiling would drift upward every time a document
   * failed late — the ceiling leaking exactly where the expensive documents are.
   */
  | { threw: string; peakRssMb: number; visionSpend?: VisionSpend };

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
  // Announced first, before the sampler and before any parsing, so "the thread never
  // started" and "the thread died holding money" are distinguishable by the parent.
  post({ ready: true });
  const sampler = setInterval(sampleRss, 250);
  // The parse must not be kept alive by its own instrumentation.
  if (typeof sampler.unref === "function") sampler.unref();
  // Built once and read on every exit path, including the throw. `spend()` is a snapshot,
  // so asking after the parse died still reports what the parse had already spent.
  const ledger = new VisionLedger(input.visionUnitBudget ?? documentUnitCap());
  const spent = (): VisionSpend => (ledger ? ledger.spend() : NO_SPEND);
  try {
    const outcome = await withVisionBudget(ledger, () =>
      parseDocument(
        new Uint8Array(input.bytes),
        input.fileName,
        input.mimeType,
        // 🔴 THE BACKGROUND LANE IS WHERE A DOCUMENT MAY COST MINUTES AND MONEY.
        // The synchronous upload route calls the same parser and deliberately does
        // NOT set this: up to 40 vision calls on a request path is latency the
        // student waits through, on the one primitive with no entitlement, no
        // counter and no cache. Here the student is not waiting.
        { lookAtFigures: true },
      ),
    );
    sampleRss();
    post(
      // The DOCUMENT, not the outcome wrapper. A thread boundary is exactly the
      // place a wrapper gets forwarded by accident and every reader downstream
      // starts writing `result.parsed.document.text`.
      //
      // 🔴 AND THE FIGURES CROSS AS A SIBLING OF `parsed`, WHICH IS THE ONLY WAY THEY
      // CAN BE STORED AT ALL. This thread holds the one copy of the deck's pictures
      // that exists — already unwrapped from TIFF, already downscaled — and it has no
      // credentials to upload them with. The parent has. A structured clone of ~20 MB
      // is the price; the alternative is the parent re-downloading and re-parsing a
      // 124 MB original to recover pixels that were in memory here.
      outcome.ok
        ? { figures: outcome.figures, ok: true, parsed: outcome.document, peakRssMb: peakRss, visionSpend: spent() }
        : {
            ok: false,
            reason: outcome.reason,
            peakRssMb: peakRss,
            visionSpend: spent(),
            // Only `no-text` carries one. Every other refusal has nothing to send.
            ...(outcome.reason === "no-text"
              ? { figures: outcome.figures, parsed: outcome.document }
              : {}),
          },
    );
  } catch (caught) {
    sampleRss();
    // The message crosses a thread boundary, so it has to be a string — an
    // Error's prototype does not survive structured cloning intact, and the
    // parent classifies on the message anyway.
    post({
      threw: caught instanceof Error ? caught.message : String(caught),
      peakRssMb: peakRss,
      visionSpend: spent(),
    });
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
