/**
 * Phase 1 spike, part two — can the worker renew its lease WHILE it parses?
 *
 * 🔴 WHY THIS IS A SEPARATE PROGRAM. Part one measured `beats=0` on every file,
 * including a 13.8-second parse. The parsers are CPU-bound and synchronous inside
 * their async wrappers, so `setInterval` never fires: a single-threaded worker
 * that promises to renew its lease every N seconds cannot keep that promise, and
 * a lease it cannot renew is a lease another worker will steal mid-parse.
 *
 * Two ways out, and this measures both so the choice is made on numbers:
 *
 *   INLINE  parse on the main thread. Renewal is impossible during the parse, so
 *           the lease TTL must exceed the worst-case block — which is a number we
 *           do not control, because it is set by the worst document a student
 *           uploads.
 *   THREAD  parse in a worker_thread. The main thread stays free, so renewal
 *           happens on schedule and the TTL can be short. Short TTL is what makes
 *           a dead worker's job recoverable quickly.
 *
 * Run: pnpm tsx apps/web/scripts/worker-lease-spike.mts <pdf>
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { extractPdfText } from "../lib/pdf/extract";

const HEARTBEAT_MS = 250;

interface Beat {
  beats: number;
  maxGapMs: number;
  ms: number;
  units: number;
}

function startHeartbeat() {
  let beats = 0;
  let maxGapMs = 0;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    maxGapMs = Math.max(maxGapMs, now - last);
    last = now;
    beats += 1;
  }, HEARTBEAT_MS);
  return {
    stop() {
      clearInterval(timer);
      return { beats, maxGapMs: Math.max(maxGapMs, Date.now() - last) };
    },
  };
}

/** Parse on the main thread — the shape a naive worker would have. */
async function inline(file: string): Promise<Beat> {
  const bytes = new Uint8Array(await readFile(file));
  const hb = startHeartbeat();
  const t0 = Date.now();
  const r = await extractPdfText(bytes);
  const ms = Date.now() - t0;
  return { ...hb.stop(), ms, units: r.meta.pages };
}

/** Parse in a worker_thread — the main thread stays free to renew the lease. */
async function threaded(file: string): Promise<Beat> {
  const hb = startHeartbeat();
  const t0 = Date.now();
  const workerPath = fileURLToPath(new URL("./worker-lease-child.mjs", import.meta.url));
  const units = await new Promise<number>((resolve, reject) => {
    // 🔴 The child is .mjs, not .mts. A worker_thread does NOT inherit tsx's module
    // loader, so a TypeScript child never resolves and the Worker hangs forever
    // rather than erroring — which is exactly what happened the first time this ran.
    const w = new Worker(workerPath, { workerData: { file } });
    w.once("message", (m) => resolve(typeof m?.units === "number" ? m.units : -1));
    w.once("error", reject);
  });
  const ms = Date.now() - t0;
  return { ...hb.stop(), ms, units };
}

const file = process.argv[2];
if (!file) {
  console.error("usage: worker-lease-spike.mts <pdf>");
  process.exit(1);
}

const rows: Array<[string, Beat]> = [];
rows.push(["INLINE", await inline(file)]);
try {
  rows.push(["THREAD", await threaded(file)]);
} catch (cause) {
  console.error(`THREAD failed: ${cause instanceof Error ? cause.message : String(cause)}`);
}

console.log(`\n=== lease renewal during parse — ${basename(file)} ===`);
console.log(`heartbeat every ${HEARTBEAT_MS}ms\n`);
for (const [mode, b] of rows) {
  const expected = Math.floor(b.ms / HEARTBEAT_MS);
  console.log(
    `${mode}  parse=${b.ms}ms  units=${b.units}  beats=${b.beats}/${expected} expected  ` +
      `maxGap=${b.maxGapMs}ms  ${b.beats === 0 ? "<-- LEASE CANNOT BE RENEWED" : "renewal OK"}`,
  );
}
console.log(JSON.stringify(Object.fromEntries(rows), null, 2));
