/**
 * Asking for one source to be read, and asking how it is going.
 *
 * POST — queue it (or retry it), then nudge the worker.
 * GET  — the single status this source has, resolved once, server-side.
 *
 * This route is the airlock between a browser and a worker that holds the
 * service-role key. It authenticates the student, `enqueueParse` proves the
 * source is theirs by putting `user_id` in the WHERE clause, and only then is
 * the key spent. Nothing in the request body names a source, a path or a user.
 *
 * 🔴 THE NUDGE IS AN ACCELERANT, NOT A REQUIREMENT. pg_cron picks the job up
 * within a minute regardless, so every failure path here is a quiet success:
 * the work is already queued, and a student does not need to understand that a
 * follow-up request did not land.
 */

import { NextRequest } from "next/server";

import { appUrl, serviceRoleKey } from "@/lib/env";
import { json, userClient, verifyBearer } from "@/lib/server";
import { enqueueParse } from "@/lib/notebooks/parse-enqueue";
import {
  describeDocument,
  documentStatusLine,
  type ParsedDocumentRow,
} from "@/lib/notebooks/document-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fire the worker without waiting for it. Failures are logged, never surfaced. */
async function nudgeWorker(): Promise<boolean> {
  const secret = process.env.DOCUMENT_WORKER_SECRET || serviceRoleKey;
  if (!secret) return false;
  try {
    // Same deployment, so a relative origin is correct and no third party is
    // involved. `appUrl` is used rather than the request's own host header,
    // which is attacker-controlled.
    await fetch(`${appUrl}/api/documents/parse/worker`, {
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      method: "POST",
    });
    return true;
  } catch (caught) {
    console.error("document worker nudge failed", (caught as Error)?.message);
    return false;
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyBearer(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const { id } = await context.params;
  if (!id) return json({ error: "a source id is required" }, 400);

  const queued = await enqueueParse(id, auth.id);
  if (!queued.ok) {
    // "missing" and "not yours" are deliberately the same answer — see
    // `enqueueParse`. A 404 that distinguished them would be a membership oracle.
    return json({ error: queued.reason === "missing" ? "not found" : "unavailable" },
      queued.reason === "missing" ? 404 : 503);
  }

  // Only worth waking the worker when the row actually changed. An
  // `already-queued` decision means a job is already due and protected by its
  // own backoff; nudging on every page load is how a backoff dies.
  const nudged =
    queued.decision.action === "enqueue" || queued.decision.action === "requeue"
      ? await nudgeWorker()
      : false;

  return json({ decision: queued.decision.action, nudged }, 202);
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyBearer(req);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const { id } = await context.params;
  if (!id) return json({ error: "a source id is required" }, 400);

  // Read through the CALLER'S token so row-level security is the ownership
  // proof, exactly as the recording kick route does. A service-role read here
  // would put that check in this file, where getting it wrong is silent.
  const client = userClient(req);
  const { data: source } = await client
    .from("library_sources")
    .select(
      "id,deleted,storage_path,parsed_document_id,parse_enqueued_at,parse_attempts,parse_error,parse_failed_at,parse_leased_until,parse_next_attempt_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!source) return json({ error: "not found" }, 404);

  const row = source as Record<string, unknown>;
  const text = (key: string): string | null => (typeof row[key] === "string" ? (row[key] as string) : null);

  let parsed: ParsedDocumentRow | null = null;
  const parsedId = text("parsed_document_id");
  if (parsedId) {
    const { data } = await client
      .from("parsed_documents")
      .select("state,complete,coverage,failed_stage,error")
      .eq("id", parsedId)
      .maybeSingle();
    if (data) {
      const p = data as Record<string, unknown>;
      // 🔴 MAPPED FIELD BY FIELD, NOT CAST. The columns are snake_case and the
      // resolver's fields are camelCase, so a cast would compile and hand it an
      // object where every field is undefined — which reads as "no coverage,
      // never failed", the flattering answer.
      parsed = {
        complete: p.complete === true,
        coverage: (p.coverage ?? null) as ParsedDocumentRow["coverage"],
        error: typeof p.error === "string" ? p.error : null,
        failedStage: typeof p.failed_stage === "string" ? p.failed_stage : null,
        state: typeof p.state === "string" ? p.state : "pending",
      };
    }
  }

  // 🔴 ONE RESOLVER. The status a student sees, the status the API returns and
  // the status the worker reasons about are the same function's output — a
  // second opinion computed in a component is how a finished lecture comes to
  // be reported as lost.
  const status = describeDocument(
    {
      parseAttempts: typeof row.parse_attempts === "number" ? row.parse_attempts : 0,
      parsedDocumentId: parsedId,
      parseEnqueuedAt: text("parse_enqueued_at"),
      parseError: text("parse_error"),
      parseFailedAt: text("parse_failed_at"),
      parseLeasedUntil: text("parse_leased_until"),
      parseNextAttemptAt: text("parse_next_attempt_at"),
    },
    parsed,
  );
  return json({ line: documentStatusLine(status), status });
}
