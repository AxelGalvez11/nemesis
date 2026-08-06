/**
 * Phase 1 spike, part three — the two things a worker does besides parse:
 * reach storage, and stop when told to.
 *
 * STORAGE. The worker never receives bytes or a path from its caller; it is given
 * a job id and resolves everything from the database. So the question is narrow:
 * can a service-role client download a `library-sources` object from outside a
 * request context? Read-only — this spike never writes.
 *
 * CANCELLATION. `extractPdfText` is synchronous CPU inside an async wrapper, so it
 * cannot observe an AbortSignal: there is no await point to throw at. In a
 * worker_thread the equivalent is `terminate()`, and this measures whether that
 * actually reclaims a parse in flight or merely detaches from it.
 *
 * GEMINI is deliberately NOT exercised here — GEMINI_API_KEY lives only in the
 * Vercel Preview/Production env, never locally. See the PR for why that is not a
 * gap: the chosen runtime is the same Vercel Node runtime the current extract
 * route already calls Gemini from, so worker access is not a new risk.
 *
 * Run: pnpm tsx apps/web/scripts/worker-io-spike.mts
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const HEAVY_PDF = "/Users/axelgalvez/Desktop/nemesisquality/pkdo/sources/Orange_Book_46th_ed_-_2026.pdf";

async function storageCheck() {
  const url = (process.env.SUPABASE_URL ?? process.env.SB_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_KEY ?? "").trim();
  if (!url || !key) return { ok: false, why: "no service-role env in this shell" };

  // List one object, then range-request its first bytes. A HEAD/range read proves
  // reachability without pulling a whole lecture down.
  const listed = await fetch(`${url}/storage/v1/object/list/library-sources`, {
    body: JSON.stringify({ limit: 1, prefix: "" }),
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    method: "POST",
  });
  if (!listed.ok) return { ok: false, status: listed.status, why: "list failed" };
  const rows = (await listed.json()) as Array<{ name?: string }>;
  const name = rows[0]?.name;
  if (!name) return { ok: true, note: "reachable; bucket empty at prefix ''", objects: 0 };

  const got = await fetch(`${url}/storage/v1/object/library-sources/${encodeURIComponent(name)}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, range: "bytes=0-15" },
  });
  const head = new Uint8Array(await got.arrayBuffer());
  return {
    ok: got.ok,
    firstBytes: Array.from(head.slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join(" "),
    objects: rows.length,
    status: got.status,
  };
}

async function cancellationCheck() {
  const workerPath = fileURLToPath(new URL("./worker-lease-child.mjs", import.meta.url));
  const t0 = Date.now();
  const w = new Worker(workerPath, { workerData: { file: HEAVY_PDF } });

  let settled: "message" | "exit" = "exit";
  const done = new Promise<number>((resolve) => {
    w.once("message", () => {
      settled = "message";
      resolve(Date.now() - t0);
    });
    w.once("exit", () => resolve(Date.now() - t0));
  });

  // Terminate well before the ~12s this parse needs.
  await new Promise((r) => setTimeout(r, 1500));
  const killedAt = Date.now() - t0;
  const code = await w.terminate();
  const stoppedAt = await done;

  return {
    // If the parse had run to completion we would have seen a message instead.
    reclaimed: settled === "exit",
    killRequestedAtMs: killedAt,
    stoppedAtMs: stoppedAt,
    terminateReturned: code,
    parseWouldHaveTakenMs: "~12300",
  };
}

const bytes = new Uint8Array(await readFile(HEAVY_PDF));
console.log(JSON.stringify({
  cancellation: await cancellationCheck(),
  fixtureBytes: bytes.length,
  storage: await storageCheck(),
}, null, 2));
