/**
 * Asking for a document to be read.
 *
 * 🔴 THIS IS THE ONLY THING THAT PUTS WORK IN THE QUEUE, AND THAT IS THE POINT.
 *
 * `claim_document_parses` requires `parse_enqueued_at is not null`. Before that
 * column existed the predicate meant "unparsed", not "asked for" — and measured
 * against production it matched 16 of the 17 stored sources, because every
 * column it rested on defaults to due. Enabling the cron would have parsed the
 * whole back catalogue at once.
 *
 * So enqueue is a deliberate act with a call site, and this module is it.
 *
 * The decision is kept PURE (`decideEnqueue`) and the write is a thin wrapper,
 * because the interesting part is not the UPDATE — it is knowing which of three
 * different things a caller is actually asking for:
 *
 *   * a first read        — set the enqueue stamp, leave the retry clock alone
 *   * a retry after giving up — clear the terminal failure and reset the clock
 *   * nothing at all      — already queued, or already parsed
 *
 * Collapsing those into one "just set the columns" write is how backoff dies.
 */

import { adminClient } from "@/lib/server";

/** The parse columns this decision reads. Nothing else is relevant. */
export interface EnqueueCandidate {
  parsedDocumentId: string | null;
  parseEnqueuedAt: string | null;
  parseFailedAt: string | null;
  /** Soft-deleted sources are not work. The claim predicate agrees. */
  deleted: boolean;
  storagePath: string | null;
}

export type EnqueueDecision =
  /** Queue it for the first time. Retry bookkeeping is untouched. */
  | { action: "enqueue" }
  /** It had given up. The student asked again, so the clock starts over. */
  | { action: "requeue" }
  /** Already queued and not failed — leave the backoff exactly where it is. */
  | { action: "already-queued" }
  /** A parse artifact exists; asking again would be asking for nothing. */
  | { action: "already-parsed" }
  /** Deleted, or never finished uploading. There is nothing to read. */
  | { action: "not-readable" };

/**
 * What should happen when someone asks for this source to be read. PURE.
 *
 * 🔴 `already-queued` IS NOT A NO-OP OUT OF LAZINESS — IT PROTECTS THE BACKOFF.
 *
 * A source that has failed twice is sitting on a four-minute wait by design. If
 * a re-enqueue reset `parse_next_attempt_at`, then any caller that fires on page
 * load — a Library view that kicks what it sees, a student refreshing because
 * nothing seems to be happening — would clear that wait every few seconds. The
 * exponential backoff would still be computed, written, and then immediately
 * thrown away, and a poisoned file would be retried as fast as the cron runs
 * until it burned all five attempts. The retry ladder only exists if something
 * refuses to reset it.
 *
 * `requeue` is the deliberate exception: the source has already given up
 * (`parse_failed_at` set), nothing is scheduled, and a person explicitly asked
 * again. There is no backoff left to protect.
 */
export function decideEnqueue(source: EnqueueCandidate): EnqueueDecision {
  // Order matters. An artifact wins over everything: the work is done, whatever
  // the retry columns happen to say.
  if (source.parsedDocumentId) return { action: "already-parsed" };
  if (source.deleted || !source.storagePath) return { action: "not-readable" };
  // Checked BEFORE `already-queued`, because a failed source is still enqueued —
  // its stamp is set — and treating it as "already queued" would make the retry
  // button do nothing at all.
  if (source.parseFailedAt) return { action: "requeue" };
  if (source.parseEnqueuedAt) return { action: "already-queued" };
  return { action: "enqueue" };
}

/** True when the decision changes the row, i.e. when a write is worth making. */
export function writesRow(decision: EnqueueDecision): boolean {
  return decision.action === "enqueue" || decision.action === "requeue";
}

export type EnqueueResult =
  | { ok: true; decision: EnqueueDecision }
  | { ok: false; reason: "missing" | "unavailable" };

/**
 * Queue a source for parsing, on behalf of a user who has already been
 * authenticated.
 *
 * `userId` MUST be the id an auth check resolved. The service role bypasses
 * row-level security, so that predicate in the WHERE clause is the entire
 * authorisation — the same construction, and the same rule, as ingest-fetch.
 */
export async function enqueueParse(sourceId: string, userId: string): Promise<EnqueueResult> {
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  try {
    const { data, error } = await admin
      .from("library_sources")
      .select("deleted,parse_enqueued_at,parse_failed_at,parsed_document_id,storage_path")
      .eq("id", sourceId)
      // 🔴 The authorisation. A row that is not theirs must not come back at all,
      // so "no such source" and "not your source" are the same answer.
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, reason: "unavailable" };
    if (!data) return { ok: false, reason: "missing" };

    const row = data as Record<string, unknown>;
    const decision = decideEnqueue({
      deleted: row.deleted === true,
      parsedDocumentId: typeof row.parsed_document_id === "string" ? row.parsed_document_id : null,
      parseEnqueuedAt: typeof row.parse_enqueued_at === "string" ? row.parse_enqueued_at : null,
      parseFailedAt: typeof row.parse_failed_at === "string" ? row.parse_failed_at : null,
      storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    });
    if (!writesRow(decision)) return { ok: true, decision };

    const patch: Record<string, unknown> = { parse_enqueued_at: new Date().toISOString() };
    if (decision.action === "requeue") {
      // Starting over, explicitly: clear the terminal failure, return the
      // attempt budget, and make it due now. Only reachable because a person
      // asked after it had already given up.
      patch.parse_attempts = 0;
      patch.parse_error = null;
      patch.parse_failed_at = null;
      patch.parse_next_attempt_at = new Date().toISOString();
    }

    const { error: writeError } = await admin
      .from("library_sources")
      .update(patch)
      .eq("id", sourceId)
      .eq("user_id", userId)
      // 🔴 Re-checked at write time, not just at read time. Between the select
      // and the update a worker may have finished this very source; linking is
      // what "done" means, and re-queuing a finished parse would hand the queue
      // work that no longer exists.
      .is("parsed_document_id", null);
    if (writeError) return { ok: false, reason: "unavailable" };
    return { ok: true, decision };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
