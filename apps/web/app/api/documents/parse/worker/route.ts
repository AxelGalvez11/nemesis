/**
 * The document parse worker.
 *
 * Called by pg_cron every minute (`run_document_parse_jobs`) and nudged by the
 * kick route. Never by a browser: the only credential it accepts is the shared
 * worker secret, and the only thing it reads from the caller is "there may be
 * work" — no source id, no storage path, no user id.
 *
 * 🔴 IT RUNS HERE, NOT ON SUPABASE EDGE, AND THAT WAS MEASURED. Edge Functions
 * cap at 256 MB; the worst real document needs 959 MB in Deno. See
 * `docs/document-worker-spike.md` §2. The database half of the recording-worker
 * pattern — lease, backoff, cron recovery — is kept exactly as it is; only the
 * host changed.
 *
 * The shape of one run:
 *
 *   claim (SQL, atomic)  ->  fetch bytes  ->  parse on a thread
 *        ^                                          |
 *        |                          heartbeat from THIS thread
 *        '------ finish, or fail with backoff ------'
 *
 * Everything authoritative comes from the claimed row. A request that could name
 * a storage path could name someone else's.
 */

import { NextRequest } from "next/server";

import { serviceRoleKey } from "@/lib/env";
import { adminClient, json } from "@/lib/server";
import { fetchIngestSource } from "@/lib/notebooks/ingest-fetch";
import { runParseOnThread } from "@/lib/notebooks/parse-run";
import { contentHashOf, structureEnvelope } from "@/lib/notebooks/parse-record";
import {
  isRetryable,
  JOBS_PER_RUN,
  LEASE_SECONDS,
  sanitizeError,
  secretMatches,
  workerName,
} from "@/lib/notebooks/parse-worker";
import type { ParsedDocument } from "@/lib/notebooks/parse-document";
import { PARSER_VERSION } from "@nemesis/shared";

export const runtime = "nodejs";
/** 300 s is the platform maximum; `DEADLINE_ABORT_MS` keeps us 60 s inside it. */
export const maxDuration = 300;
/** Never cached, never statically analysed into a build-time fetch. */
export const dynamic = "force-dynamic";

/** The claimed row, narrowed to what a parse actually needs. */
interface ClaimedSource {
  id: string;
  user_id: string;
  storage_path: string | null;
  title: string | null;
  mime_type: string | null;
  parse_lease_token: string;
}

/**
 * The worker's own credential.
 *
 * Separate from `CRON_SECRET` on purpose: this endpoint can spend real money
 * (vision calls) and hold 2.4 GB, so it should be revocable without disturbing
 * every other scheduled job. Falls back to the service-role key so a deploy that
 * has not set it yet is closed rather than open.
 */
function workerSecret(): string {
  return process.env.DOCUMENT_WORKER_SECRET || serviceRoleKey;
}

function presentedSecret(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.headers.get("x-worker-secret");
}

export async function POST(req: NextRequest) {
  const expected = workerSecret();
  // No secret configured means no authenticated caller is possible. Closed, not
  // open — an unauthenticated parse worker is an unmetered vision budget.
  if (!expected) return json({ error: "worker not configured" }, 503);
  if (!secretMatches(presentedSecret(req), expected)) return json({ error: "unauthorized" }, 401);

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return json({ error: "database not configured" }, 503);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_document_parses", {
    p_limit: JOBS_PER_RUN,
    p_lease_seconds: LEASE_SECONDS,
    p_owner: workerName(),
  });
  if (claimError) {
    console.error("document worker claim failed", claimError.message);
    return json({ error: "claim failed" }, 500);
  }

  const jobs = (claimed ?? []) as ClaimedSource[];
  // Zero is the normal answer. A cron that ran and found nothing is healthy, and
  // reporting it as an error would make the healthy case indistinguishable from
  // the broken one in whatever watches this endpoint.
  if (jobs.length === 0) return json({ claimed: 0, results: [] });

  const results = [];
  for (const job of jobs) results.push(await runOne(admin, job));
  return json({ claimed: jobs.length, results });
}

async function runOne(
  admin: ReturnType<typeof adminClient>,
  job: ClaimedSource,
): Promise<{ sourceId: string; outcome: string }> {
  const token = job.parse_lease_token;

  /** Record a failure and let the SQL decide backoff versus giving up. */
  const fail = async (cause: unknown, retryable = isRetryable(cause)) => {
    const message = sanitizeError(cause);
    // Logged unsanitised server-side is exactly what we must NOT do — a storage
    // URL carries a signed token in its query string.
    console.error("document parse failed", job.id, message);
    await admin.rpc("fail_document_parse", {
      p_error: message,
      p_retryable: retryable,
      p_source_id: job.id,
      p_token: token,
    });
    return { sourceId: job.id, outcome: retryable ? "failed-retryable" : "failed-permanent" };
  };

  if (!job.storage_path) return await fail(new Error("unsupported: the source has no stored file"), false);

  let bytes: Uint8Array;
  let fileName = job.title ?? "document";
  let mimeType = job.mime_type ?? "application/octet-stream";
  try {
    const fetched = await fetchIngestSource({ sourceId: job.id }, job.user_id);
    if (!fetched.ok) {
      // "too-large" will be too large again next time. The other two are
      // transient by construction — see `FetchedSource`.
      return await fail(new Error(fetched.reason), fetched.reason !== "too-large");
    }
    ({ bytes } = fetched.source);
    // The fetch resolved the file's real name and type from the row it proved
    // ownership of. Preferred over the claim columns for the same reason the
    // worker takes nothing from the request: the resolved value is the one that
    // came with the bytes.
    fileName = fetched.source.fileName || fileName;
    mimeType = fetched.source.mimeType ?? mimeType;
  } catch (caught) {
    return await fail(caught);
  }
  // Hashed BEFORE the parse: `runParseOnThread` transfers the buffer to the
  // worker and detaches it here, so reading these bytes afterwards would read a
  // zero-length array — silently, with no error to notice.
  const contentHash = contentHashOf(bytes);

  const run = await runParseOnThread(bytes, fileName, mimeType, {
    heartbeat: async () => {
      const { data } = await admin.rpc("renew_document_parse_lease", {
        p_lease_seconds: LEASE_SECONDS,
        p_source_id: job.id,
        p_token: token,
      });
      return data === true;
    },
  });

  switch (run.status) {
    case "parsed":
      break;
    case "refused":
      // The parser read the file and declined it. That verdict will not change
      // on a fourth attempt.
      return await fail(new Error(`unsupported: ${run.reason}`), false);
    case "deadline":
      return await fail(new Error(`the parse ran past ${Math.round(run.ms / 1000)}s and was stopped`), true);
    case "memory":
      return await fail(new Error(`the parse needed more memory than one job may hold (${run.peakRssMb} MB)`), false);
    case "lease-lost":
      // Somebody else owns this job now. Writing anything — including a failure
      // — would be this worker overwriting a newer one's work.
      return { sourceId: job.id, outcome: "lease-lost" };
    case "no-worker-bundle":
      // 🔴 A DEPLOYMENT DEFECT WEARING A DOCUMENT'S CLOTHES. Retryable on
      // purpose: the next deploy fixes it, and the student's file is fine.
      return await fail(new Error("the document worker is not installed on this deployment"), true);
    default:
      return await fail(new Error((run as { error: string }).error));
  }

  const parsed = run.parsed as ParsedDocument;

  // 🔴 ONE WRITE, NOT TWO. `finish_document_parse` records the parse AND links
  // the placement AND releases the lease, inside one transaction that proves the
  // token first. Calling `persistParse` as well — which is what the synchronous
  // upload lane does, because it holds no lease — would write the same parse
  // twice and, worse, would write it once even when the lease had been lost.
  const counts = countsFor(parsed);
  const { data: finished, error: finishError } = await admin.rpc("finish_document_parse", {
    p_content_hash: contentHash,
    p_coverage: parsed.coverage as unknown as Record<string, unknown>,
    p_doc_kind: parsed.kind,
    p_parse_ms: Math.round(run.ms),
    p_parse_peak_rss_mb: run.peakRssMb,
    p_parser_version: PARSER_VERSION,
    p_source_id: job.id,
    p_structure: structureEnvelope({
      model: parsed.model,
      text: parsed.text,
      title: parsed.title,
    }) as unknown as Record<string, unknown>,
    p_token: token,
    p_unit_count: counts.units,
    p_user_id: job.user_id,
    p_visual_count: counts.visuals,
  });
  if (finishError) return await fail(finishError);

  // A null return is the lease check refusing, not an error. The newer worker's
  // result is the one that should stand.
  return { sourceId: job.id, outcome: finished ? "parsed" : "lease-lost" };
}

/**
 * The cheap top-level counts `parsed_documents` stores so a caller can judge a
 * parse without loading its structure.
 *
 * Taken from COVERAGE, not from the model, because coverage is the contract
 * that already knows the difference between "this document has three pages" and
 * "three pages were read". A count derived from the model would silently mean
 * the second while being read as the first.
 */
function countsFor(parsed: ParsedDocument): { units: number; visuals: number } {
  const coverage = parsed.coverage as { units?: number; figures?: { total?: number } };
  return {
    units: coverage.units ?? parsed.model?.units.length ?? 0,
    visuals: coverage.figures?.total ?? 0,
  };
}
