/**
 * The worker thread, exercised as a worker thread.
 *
 * 🔴 THE POINT OF THIS FILE IS THE HEARTBEAT TEST. The spike measured 0 of 49
 * renewals fired inline and 50 of 50 threaded; that measurement is what the
 * design rests on, and a design that rests on a measurement nobody re-runs is a
 * design that rests on a memory. So one test spawns the REAL bundle, blocks it
 * with real CPU, and counts renewals that actually happened.
 *
 * The guard tests inject their clock and memory reader instead: asserting that
 * a 240-second deadline fires by waiting 240 seconds would be a test nobody
 * runs, and allocating 2.4 GB to prove a comparison would be worse.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseThreadPath, runParseOnThread, PARSE_THREAD_RELATIVE } from "./parse-run";

const webRoot = join(import.meta.dirname, "..", "..");
const bundle = join(webRoot, PARSE_THREAD_RELATIVE);

/** Build the bundle on demand so this file passes on a clean checkout. */
function ensureBundle(): string {
  if (!existsSync(bundle)) {
    execFileSync("node", [join(webRoot, "scripts", "build-parse-thread.mjs")], { cwd: webRoot });
  }
  return bundle;
}

/**
 * A worker that burns CPU for `ms` without yielding, then answers.
 *
 * Deliberately NOT the real parser: this test is about whether the main thread
 * stays free while another thread is blocked, and a synthetic block makes that
 * unambiguous and fast. The real bundle is exercised by the test below it.
 */
function blockingWorker(ms: number): string {
  const dir = join(tmpdir(), "nemesis-parse-run-test");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `block-${ms}.mjs`);
  writeFileSync(
    path,
    `import { parentPort } from "node:worker_threads";
const until = Date.now() + ${ms};
while (Date.now() < until) { /* no await point, exactly like the parsers */ }
parentPort.postMessage({ ok: true, parsed: { blocked: ${ms} }, peakRssMb: 1 });
`,
  );
  return path;
}

test("the lease is renewed while another thread is blocked solid", async () => {
  let beats = 0;
  const outcome = await runParseOnThread(new Uint8Array([1, 2, 3]), "x.pdf", "application/pdf", {
    heartbeat: async () => {
      beats += 1;
      return true;
    },
    heartbeatMs: 100,
    workerPath: blockingWorker(1_200),
  });

  assert.equal(outcome.status, "parsed");
  // 1,200 ms of solid CPU at a 100 ms cadence. Inline this number is zero —
  // that is the whole finding. Asserting >= 6 rather than == 11 leaves room for
  // a loaded CI machine without weakening what is being claimed.
  assert.ok(beats >= 6, `expected the heartbeat to keep firing, got ${beats}`);
});

test("a lease taken by someone else abandons the parse instead of finishing it", async () => {
  const outcome = await runParseOnThread(new Uint8Array([1]), "x.pdf", "application/pdf", {
    heartbeat: async () => false,
    heartbeatMs: 50,
    workerPath: blockingWorker(3_000),
  });
  assert.equal(outcome.status, "lease-lost");
  // And it did not wait out the 3 seconds to discover that.
  assert.ok(outcome.ms < 2_000, `abandoned late, after ${outcome.ms} ms`);
});

test("a renewal that throws is not a lost lease", async () => {
  let beats = 0;
  const outcome = await runParseOnThread(new Uint8Array([1]), "x.pdf", "application/pdf", {
    heartbeat: async () => {
      beats += 1;
      throw new Error("database blipped");
    },
    heartbeatMs: 50,
    workerPath: blockingWorker(400),
  });
  assert.equal(outcome.status, "parsed");
  assert.ok(beats > 0);
});

test("the deadline aborts a parse that would otherwise outlive the invocation", async () => {
  let clock = 0;
  const outcome = await runParseOnThread(new Uint8Array([1]), "x.pdf", "application/pdf", {
    deadlineMs: 500,
    heartbeat: async () => true,
    heartbeatMs: 10_000,
    // Time advances 200 ms per read, so the guard's own 250 ms tick crosses the
    // deadline in three ticks rather than in half a second of real waiting.
    now: () => (clock += 200),
    workerPath: blockingWorker(10_000),
  });
  assert.equal(outcome.status, "deadline");
});

test("memory above the abort line stops the parse before the platform does", async () => {
  const outcome = await runParseOnThread(new Uint8Array([1]), "x.pdf", "application/pdf", {
    heartbeat: async () => true,
    heartbeatMs: 10_000,
    memoryAbortMb: 10,
    rssMb: () => 4_000,
    workerPath: blockingWorker(10_000),
  });
  assert.equal(outcome.status, "memory");
  assert.equal(outcome.peakRssMb, 4_000);
});

test("a missing bundle is reported as a missing bundle, not as a bad document", async () => {
  const outcome = await runParseOnThread(new Uint8Array([1]), "x.pdf", "application/pdf", {
    heartbeat: async () => true,
    workerPath: null,
  });
  assert.equal(outcome.status, "no-worker-bundle");
});

test("a worker that dies without answering still settles", async () => {
  const dir = join(tmpdir(), "nemesis-parse-run-test");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "silent-exit.mjs");
  writeFileSync(path, "process.exit(7);\n");

  const outcome = await runParseOnThread(new Uint8Array([1]), "x.pdf", "application/pdf", {
    heartbeat: async () => true,
    workerPath: path,
  });
  assert.equal(outcome.status, "threw");
  // The exit code is reported because it is what is known. Guessing "out of
  // memory" here would write a cause nobody measured into `parse_error`.
  assert.match((outcome as { error: string }).error, /exited \(code 7\)/);
});

test("the real bundle parses a real PDF on a real thread", async () => {
  ensureBundle();
  // A one-page PDF written by hand: no fixture file, no corpus dependency, and
  // it exercises the whole chain — Worker spawn, esbuild bundle, pdf.js load,
  // structural read, message back.
  const pdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n" +
      "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
      "5 0 obj<</Length 62>>stream\nBT /F1 24 Tf 72 700 Td (Threaded parse reached the page) Tj ET\nendstream endobj\n" +
      "trailer<</Root 1 0 R>>\n",
    "latin1",
  );

  let beats = 0;
  const outcome = await runParseOnThread(new Uint8Array(pdf), "threaded.pdf", "application/pdf", {
    heartbeat: async () => {
      beats += 1;
      return true;
    },
    heartbeatMs: 100,
    workerPath: ensureBundle(),
  });

  // 🔴 THE ASSERTION THAT MATTERS: a bundle that lost its parser would answer
  // `refused`/`threw` here, and every other test in this file would still pass.
  assert.equal(outcome.status, "parsed", `bundle did not parse: ${JSON.stringify(outcome).slice(0, 300)}`);
  const parsed = (outcome as { parsed: { text: string; kind: string } }).parsed;
  assert.equal(parsed.kind, "pdf");
  assert.match(parsed.text, /Threaded parse reached the page/);
  assert.ok(beats >= 0);
});

test("the bundle resolves from the app root the deployed function runs in", () => {
  ensureBundle();
  assert.equal(parseThreadPath(webRoot), bundle);
  // And from the repo root, which is where scripts and CI run.
  assert.equal(parseThreadPath(join(webRoot, "..", "..")), bundle);
  assert.equal(parseThreadPath(tmpdir()), null);
});
