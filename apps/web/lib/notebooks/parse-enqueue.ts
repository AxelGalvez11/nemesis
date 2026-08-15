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

import { PARSER_VERSION } from "@nemesis/shared";

import { needsReprocess, type ReprocessReason } from "@/lib/learn/reprocess";
import { adminClient } from "@/lib/server";

/** The parse columns this decision reads. Nothing else is relevant. */
export interface EnqueueCandidate {
  parsedDocumentId: string | null;
  parseEnqueuedAt: string | null;
  parseFailedAt: string | null;
  /** Soft-deleted sources are not work. The claim predicate agrees. */
  deleted: boolean;
  storagePath: string | null;
  /**
   * `parsed_documents.parser_version` of the parse this row points at — WHO READ IT.
   *
   * 🔴 NOT `PARSER_VERSION`. A vendor-read row carries the vendor's own string (see
   * `PersistParseInput.readBy`), and comparing it against ours is exactly right: it says this parse
   * was not produced by the reader we would use now.
   */
  parsedParserVersion: string | null;
  /** `parsed_documents.content_hash` — the bytes that parse is ABOUT. */
  parsedContentHash: string | null;
  /**
   * `library_sources.content_hash` — the bytes this row now says it holds.
   *
   * 🔴 IT IS COMPARED AGAINST THE PARSE'S HASH, NEVER AGAINST A TIMESTAMP. "The source itself
   * changed" has to mean the bytes changed; `updated_at` and friends move when a file is renamed or
   * re-filed, and a reprocess triggered by filing would spend money on an identical document.
   */
  contentHash: string | null;
  /**
   * The parser version a reprocess has ALREADY been asked for, or null when none is pending.
   *
   * 🔴 THIS COLUMN IS THE IDEMPOTENCE, AND IT IS THE ONLY THING THAT MAKES ASKING TWICE FREE. See
   * `already-reprocessing` below — it is `already-queued`'s twin and exists for the same reason.
   */
  reprocessTarget: string | null;
}

/**
 * What the caller is asking for.
 *
 * 🔴 THE ORDINARY ASK CAN NEVER REPROCESS, AND THAT IS A SPEND DECISION MADE AT THE TYPE. Callers
 * that fire on page load — a Library view kicking what it sees, an attach handler, a student
 * refreshing — all take the default, and the default carries no parser version, so every version
 * comparison below is inert for them. There is no flag to get wrong and no sweep to write by
 * accident: reprocessing requires a caller that says so, one source at a time, which is the owner's
 * *"Do not automatically spend money reprocessing every historical document."*
 */
export type EnqueueRequest =
  /** Read this if it has not been read. The behaviour this module has always had. */
  | { intent: "parse" }
  /**
   * Read this AGAIN. A deliberate act with a named source and a named person behind it.
   *
   * `parserVersion` is what we would read it with now — the thing the stored parse is compared
   * against. Defaults to `PARSER_VERSION`; passed explicitly only by tests.
   */
  | { intent: "reprocess"; parserVersion?: string };

export type EnqueueDecision =
  /** Queue it for the first time. Retry bookkeeping is untouched. */
  | { action: "enqueue" }
  /** It had given up. The student asked again, so the clock starts over. */
  | { action: "requeue" }
  /** Already queued and not failed — leave the backoff exactly where it is. */
  | { action: "already-queued" }
  /** A parse artifact exists; asking again would be asking for nothing. */
  | { action: "already-parsed" }
  /**
   * Read it again, keeping the parse it already has until the new one lands. `reason` says what
   * moved — see `ReprocessReason`.
   */
  | { action: "reprocess"; reason: ReprocessReason }
  /**
   * A reprocess under exactly this parser version is already pending — leave it alone.
   *
   * 🔴 `already-reprocessing` IS NOT A NO-OP OUT OF LAZINESS EITHER, AND IT IS HERE FOR PRECISELY
   * THE REASON `already-queued` IS. A reprocess write resets `parse_attempts` and makes the row due
   * now; a second ask that wrote again would clear the wait a failing reprocess had earned, and a
   * button pressed twice, or a caller that fires on render, would hold a poisoned file at the front
   * of the queue until it burned every attempt. It is also what makes the owner's *"idempotent"*
   * true in the only sense that costs money: asking twice charges once.
   */
  | { action: "already-reprocessing" }
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
export function decideEnqueue(
  source: EnqueueCandidate,
  request: EnqueueRequest = { intent: "parse" },
): EnqueueDecision {
  // Order matters. An artifact wins over everything: the work is done, whatever
  // the retry columns happen to say — UNLESS someone has deliberately asked for
  // it to be redone.
  if (source.parsedDocumentId) {
    // 🔴 CHECKED INSIDE THIS BRANCH TOO. A deleted row, or one whose object never
    // arrived, is not work — and a reprocess of it would hand the queue a job
    // with no bytes behind it.
    if (source.deleted || !source.storagePath) return { action: "not-readable" };
    if (request.intent !== "reprocess") return { action: "already-parsed" };

    const parserVersion = request.parserVersion ?? PARSER_VERSION;
    // 🔴 THE PENDING STATE IS CHECKED BEFORE THE PREDICATE, NOT AFTER. The
    // predicate asks about the STORED PARSE, and a reprocess already in flight
    // has not changed the stored parse yet — so it would keep answering "stale"
    // for every ask until the worker finishes, and every one of those asks would
    // reset the clock. This line is the difference between "idempotent" and
    // "idempotent as long as nobody clicks twice".
    //
    // 🔴🔴 `&& !parseFailedAt` — AND WITHOUT IT A FAILED REPROCESS COULD NEVER BE
    // ASKED FOR AGAIN. This is the retry-button bug from the ordinary path,
    // reintroduced on the reprocess path, and it is a permanent dead end: the
    // worker gives up, `fail_document_parse` stamps `parse_failed_at` (on a
    // non-retryable error OR on the last attempt — both routes arrive here with
    // it set), the claim predicate excludes the row, and every later ask matches
    // the still-set target and returns a no-op. Un-claimable AND un-requeueable,
    // for ever, behind a button that reports success.
    //
    // The existing `requeue` comment's own argument applies verbatim: a source
    // that has already given up has NO BACKOFF LEFT TO PROTECT, so the only
    // reason this line is a no-op has expired. The pending state guards a clock;
    // there is no clock once the ladder has run out.
    if (source.reprocessTarget === parserVersion && !source.parseFailedAt) {
      return { action: "already-reprocessing" };
    }

    // 🔴 THE SAME PREDICATE THE TWO KNOWLEDGE MARKERS CALL. Not a second
    // implementation that happens to agree with it today — the owner's
    // constraint was one sentence long and it was this one.
    const verdict = needsReprocess({
      current: { contentHash: source.contentHash, parserVersion, rulesetVersion: null },
      requested: true,
      // 🔴 `rulesetVersion` IS NULL ON BOTH SIDES, DELIBERATELY. Parsing does not
      // run the knowledge lanes, so a better extractor cannot make re-READING
      // the bytes worth paying for. Passing `RULESET_VERSION` here would reparse
      // the whole corpus every time a knowledge lane moved — the mass backfill
      // the owner refused, arriving through the predicate meant to prevent it.
      stored: {
        contentHash: source.parsedContentHash,
        parserVersion: source.parsedParserVersion,
        rulesetVersion: null,
      },
    });
    // 🔴 A REQUESTED REPROCESS PROCEEDS EVEN WHEN NOTHING MOVED. The owner listed
    // an explicit request as its OWN trigger, beside the version and content
    // ones, not as something conditional on them: someone who believes a parse
    // is wrong must be able to get it re-read today rather than whenever a
    // version happens to bump. `needsReprocess` returns `explicitly-requested`
    // for exactly that case, so the reason still says which it was.
    return verdict.reprocess ? { action: "reprocess", reason: verdict.reason } : { action: "already-parsed" };
  }
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
  return decision.action === "enqueue" || decision.action === "requeue" || decision.action === "reprocess";
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
export async function enqueueParse(
  sourceId: string,
  userId: string,
  request: EnqueueRequest = { intent: "parse" },
): Promise<EnqueueResult> {
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  try {
    const read = (columns: string) =>
      admin
        .from("library_sources")
        .select(columns)
        .eq("id", sourceId)
        // 🔴 The authorisation. A row that is not theirs must not come back at all,
        // so "no such source" and "not your source" are the same answer.
        .eq("user_id", userId)
        .maybeSingle();

    // 🔴 THE PARSE IS EMBEDDED, NOT LOOKED UP SEPARATELY. Whether a stored parse is stale cannot be
    // decided from the placement row alone: `library_sources.content_hash` says which bytes are
    // filed, and only `parsed_documents` says which bytes were READ, and by whom.
    let result = await read(
      "deleted,parse_enqueued_at,parse_failed_at,parsed_document_id,storage_path,content_hash," +
        "parse_reprocess_target,parsed_documents(content_hash,parser_version)",
    );
    // 🔴 THE MIGRATION MAY NOT BE APPLIED YET, AND POSTGREST ERRORS ON A MISSING COLUMN RATHER THAN
    // OMITTING IT. The app deploys from `main` automatically; a schema change is a separate,
    // owner-gated push. Without this fallback, the window between the two turns EVERY enqueue — the
    // ordinary first read of a freshly uploaded file — into "unavailable", and a student's upload
    // would silently never be queued. The GET half of the parse route already carries this exact
    // pattern for the same reason.
    if (result.error) {
      result = await read("deleted,parse_enqueued_at,parse_failed_at,parsed_document_id,storage_path");
    }
    const { data, error } = result;
    if (error) return { ok: false, reason: "unavailable" };
    if (!data) return { ok: false, reason: "missing" };

    const row = data as unknown as Record<string, unknown>;
    // 🔴 BOTH EMBED SHAPES, FOR THE REASON `canvas-sources.ts` DOCUMENTS AT LENGTH: supabase-js
    // TYPES a to-one embed as a list, and this project has measured it arriving as a bare object.
    // Assume either one and the other silently yields `undefined` — here that would read as "no
    // parser version on record", which `needsReprocess` turns into `content-changed` and a paid
    // re-read of a perfectly current document.
    const embed = row.parsed_documents as
      | { content_hash?: unknown; parser_version?: unknown }
      | { content_hash?: unknown; parser_version?: unknown }[]
      | null
      | undefined;
    const parsed = (Array.isArray(embed) ? embed[0] : embed) ?? null;
    const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

    const decision = decideEnqueue(
      {
        contentHash: text(row.content_hash),
        deleted: row.deleted === true,
        parsedContentHash: text(parsed?.content_hash),
        parsedDocumentId: typeof row.parsed_document_id === "string" ? row.parsed_document_id : null,
        parsedParserVersion: text(parsed?.parser_version),
        parseEnqueuedAt: typeof row.parse_enqueued_at === "string" ? row.parse_enqueued_at : null,
        parseFailedAt: typeof row.parse_failed_at === "string" ? row.parse_failed_at : null,
        reprocessTarget: text(row.parse_reprocess_target),
        storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
      },
      request,
    );
    if (!writesRow(decision)) return { ok: true, decision };

    const patch: Record<string, unknown> = { parse_enqueued_at: new Date().toISOString() };
    if (decision.action === "reprocess") {
      // 🔴 THE EXISTING PARSE IS LEFT IN PLACE — `parsed_document_id` IS NOT CLEARED, AND THAT IS
      // THE DIFFERENCE BETWEEN THIS AND THE DESTRUCTIVE BACKFILL THE OWNER DECLINED. Clearing it is
      // what makes a canvas report `outcome: "failed"` mid-reprocess ("unknown is not empty"), the
      // trust gate refuse to produce knowledge, and a learner who opens their material during the
      // window get asked nothing at all. Instead the claim predicate is widened to let a linked row
      // through when a reprocess is pending, so the old parse keeps serving every reader until
      // `finish_document_parse` swaps in the new one in a single statement.
      patch.parse_reprocess_target = request.intent === "reprocess" ? request.parserVersion ?? PARSER_VERSION : null;
      // A deliberate new ask, so it gets a full attempt budget and is due now. There is no backoff
      // to protect: `already-reprocessing` above is what stops a second ask reaching this line.
      patch.parse_attempts = 0;
      patch.parse_error = null;
      patch.parse_failed_at = null;
      patch.parse_next_attempt_at = new Date().toISOString();
    }
    if (decision.action === "requeue") {
      // Starting over, explicitly: clear the terminal failure, return the
      // attempt budget, and make it due now. Only reachable because a person
      // asked after it had already given up.
      patch.parse_attempts = 0;
      patch.parse_error = null;
      patch.parse_failed_at = null;
      patch.parse_next_attempt_at = new Date().toISOString();
    }

    const write = admin.from("library_sources").update(patch).eq("id", sourceId).eq("user_id", userId);
    // 🔴 Re-checked at write time, not just at read time. Between the select
    // and the update a worker may have finished this very source; linking is
    // what "done" means, and re-queuing a finished parse would hand the queue
    // work that no longer exists.
    //
    // 🔴 AND IT IS SKIPPED FOR A REPROCESS — WHICH IS THE ONE CASE THAT MEANS TO WRITE ONTO A
    // LINKED ROW, not an exception smuggled past the check. The race this predicate guards is "a
    // parse finished while we were deciding", and for a reprocess that race is harmless: a parse
    // that lands in the window is the very row the reprocess decided was stale, and the pending
    // target is what stops the second ask. Leaving the predicate on would have made the reprocess
    // write match zero rows and report success — a trigger that looks wired and does nothing,
    // which is the exact shape of the gate that "passed review and left the evidence loop dead".
    const { error: writeError } = await (decision.action === "reprocess"
      ? write
      : write.is("parsed_document_id", null));
    if (writeError) return { ok: false, reason: "unavailable" };
    return { ok: true, decision };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
