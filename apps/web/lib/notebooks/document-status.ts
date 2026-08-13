/**
 * THE single resolver for "what is happening to this document?".
 *
 * ── THE CONTRACT (owner, 2026-08-06) ───────────────────────────────────────
 *
 * Two records own two different halves of a document's life, and the earlier
 * correction to say plainly: **`parsed_documents` cannot be the sole lifecycle
 * authority before it exists.** Its identity is the sha256 of the bytes, which
 * nothing knows until something has read them — so everything that happens
 * before that first read has to be owned somewhere else.
 *
 *   `library_sources` owns   enqueue · fetch and hash attempts · the lease ·
 *                            retry timing · and every failure that happens
 *                            BEFORE a parse artifact exists.
 *
 *   `parsed_documents` owns  the canonical parse artifact · coverage · parser
 *                            version · and the downstream parse/chunk/embed
 *                            lifecycle, from the moment the hash is known.
 *
 * 🔴 `parsed_document_id IS NOT NULL` MEANS "AN ARTIFACT IS LINKED". IT DOES
 * NOT MEAN "COMPLETE". A partial parse is a real, linked, useful artifact — a
 * scanned deck where nine slides of forty were unreadable is worth keeping and
 * worth telling the truth about. Completion comes from the parsed document's
 * own `state` and `coverage`, never from the presence of the link.
 *
 * Reading completion off the link is the single most tempting mistake available
 * here, because the link is the convenient column: it is on the row you already
 * loaded, and it is never null once anything worked. Everything downstream of a
 * wrong answer here — the Library badge, chat's disclosure, what the model is
 * told it has read — inherits the lie.
 *
 * ── WHY ONE RESOLVER AND NOT A FIELD ───────────────────────────────────────
 *
 * There is deliberately no stored `parse_state`. Two records that each carry a
 * status column will eventually disagree, and the flattering one gets believed.
 * Deriving costs one function call and cannot drift.
 */

/** The `library_sources` half: enqueue, lease, retry, pre-artifact failure. */
export interface SourceParseRow {
  /** A LINK, not a completion flag. See the header. */
  parsedDocumentId: string | null;
  /**
   * 🔴 NULL MEANS NOBODY EVER ASKED FOR THIS PARSE, WHICH IS NOT "WAITING".
   *
   * The claim predicate requires this column, so a source without it will never
   * be picked up by anything, ever. Reporting that as `pending` would have been
   * the exact lie this module exists to prevent: a spinner that spins forever,
   * and `isInFlight` telling every caller to keep waiting for work that is not
   * scheduled. 16 of the 17 sources in production are in this state — they
   * predate the worker entirely.
   */
  parseEnqueuedAt: string | null;
  parseAttempts: number;
  parseLeasedUntil: string | null;
  parseNextAttemptAt: string | null;
  parseFailedAt: string | null;
  parseError: string | null;
}

/** The `parsed_documents` half: artifact, coverage, downstream lifecycle. */
export interface ParsedDocumentRow {
  /** pending | parsing | parsed | partially_parsed | chunking | chunked | embedding | ready | failed */
  state: string;
  /** Tied to `coverage->>'state' = 'complete'` by a CHECK constraint. */
  complete: boolean;
  coverage: { state?: string; units?: number; unitsUnread?: number } | null;
  failedStage: string | null;
  error: string | null;
}

export type DocumentStatus =
  // ── owned by library_sources: nothing has been read yet ──
  /** Stored, readable, and not scheduled to be read. Deliberately NOT in flight. */
  | { kind: "not_queued" }
  | { kind: "pending"; attempts: number }
  | { kind: "parsing"; attempts: number }
  | { kind: "retrying"; attempts: number; nextAttemptAt: string }
  /**
   * 🔴 `message` IS FOR THE STUDENT. `detail` IS THE TECHNICAL CAUSE, AND THEY MUST NOT SWAP.
   *
   * They used to be one field, and the field held the raw exception: `fail()` always writes
   * `sanitizeError(cause)`, so `parsed.error` was never null, so the friendly fallback beside it
   * was **unreachable** and a learner was shown a developer's error text spliced into a sentence.
   * Every other branch of `documentStatusLine` is plain English written for a student; this was
   * the only one that was not, and the only one that had never run — nothing in production has
   * ever failed a parse, so nobody had seen it.
   *
   * Splitting them makes the friendly message reachable BY CONSTRUCTION rather than by a `??`
   * that a writer upstream can quietly defeat.
   */
  | { kind: "failed"; attempts: number; message: string; detail: string | null; stage: string | null }
  // ── owned by parsed_documents: an artifact exists ──
  | { kind: "partially_parsed"; units: number; unitsUnread: number }
  | { kind: "parsed" }
  // ── later phases. Not reachable in Phase 1; modelled so the resolver does
  //    not have to be rewritten (and so a test can assert unreachability). ──
  | { kind: "indexing"; stage: string }
  | { kind: "ready" };

const INDEXING_STATES = new Set(["chunking", "chunked", "embedding"]);

/**
 * A recorded failure, said to the student.
 *
 * 🔴 THE RAW CAUSE NEVER REACHES THIS RETURN VALUE. `sanitizeError` redacts URLs and tokens, which
 * makes the string safe to STORE — it does not make it something to show a person. This maps the
 * causes we raise ourselves onto prose, and answers everything else with the honest generic rather
 * than passing the exception through.
 *
 * 🔴 AND AN OUTAGE IS NEVER PHRASED AS THE STUDENT'S FAULT. A timeout, a memory ceiling and a
 * missing worker are ours; the wording says so, and offers no action they cannot take. The same
 * rule the evaluator follows when a judge could not be reached.
 *
 * Matched on OUR OWN messages — the ones raised in the parse worker and the refusals
 * `isRetryable` already keys on. It is not a general error taxonomy and must not grow into one:
 * an unmatched cause is not a gap, it is the default doing its job. PURE.
 */
export function failureMessage(raw: string | null): string {
  const text = (raw ?? "").toLowerCase();
  if (!text) return "We could not read this file.";
  if (/password|encrypted/.test(text)) {
    return "This file is password-protected, so Nemesis could not open it. Remove the password and upload it again.";
  }
  // 🔴 `invalid pdf structure` IS HERE BECAUSE A REAL FAILURE WAS FORCED AND THAT IS WHAT CAME
  // BACK. It is pdf.js's wording for a truncated or damaged file, it matched none of the patterns
  // written from our own `throw` sites, and it is the single most likely real failure in this
  // product. Written from an observation, not from imagining what a parser might say.
  if (/corrupt|not a (pdf|zip)|damaged|invalid pdf/.test(text)) {
    return "This file looks damaged, so Nemesis could not open it. Try downloading or exporting it again, then re-upload.";
  }
  if (/too-large|too large/.test(text)) {
    return "This file is too large for Nemesis to read.";
  }
  if (/unsupported/.test(text)) {
    return "Nemesis cannot read this kind of file yet.";
  }
  // Ours, not theirs — no instruction to the student, because there is nothing for them to fix.
  if (/ran past \d+s|more memory than|worker is not installed|timed out/.test(text)) {
    return "Nemesis could not finish reading this file. That is a problem on our side, not with your document.";
  }
  return "We could not finish reading this file.";
}

/**
 * Derive the one true status from both records.
 *
 * @param parsed  null until a parse artifact exists — which is the normal state
 *                for everything between upload and the worker's first success.
 */
export function describeDocument(
  source: SourceParseRow,
  parsed: ParsedDocumentRow | null,
  now: Date = new Date(),
): DocumentStatus {
  // ── An artifact exists: parsed_documents is authoritative from here. ──
  // Checked FIRST, because once a good parse is linked, a later failed attempt
  // on the source row must not drag the reported status backwards. Phase 0b
  // preserves a complete parse against a later partial one; this preserves the
  // same truth in what a student is shown.
  if (source.parsedDocumentId && parsed) {
    if (parsed.state === "failed") {
      return {
        attempts: source.parseAttempts,
        detail: parsed.error,
        kind: "failed",
        message: failureMessage(parsed.error),
        stage: parsed.failedStage,
      };
    }
    if (parsed.state === "ready") return { kind: "ready" };
    if (INDEXING_STATES.has(parsed.state)) return { kind: "indexing", stage: parsed.state };

    // 🔴 Completion comes from `complete` + coverage, NOT from the link.
    if (!parsed.complete) {
      return {
        kind: "partially_parsed",
        units: parsed.coverage?.units ?? 0,
        unitsUnread: parsed.coverage?.unitsUnread ?? 0,
      };
    }
    return { kind: "parsed" };
  }

  // ── No artifact yet: library_sources is authoritative. ──
  if (source.parseFailedAt) {
    return {
      attempts: source.parseAttempts,
      detail: source.parseError,
      kind: "failed",
      message: failureMessage(source.parseError),
      // No artifact was ever produced, so the failure is by definition in the
      // fetch/hash/parse leg. There is no chunk or embed stage to blame yet.
      stage: "parse",
    };
  }

  // 🔴 Nothing has been asked for, so nothing is coming. Must be distinguishable
  // from "queued and waiting its turn": the claim predicate requires
  // parse_enqueued_at, so this row is invisible to every worker and every cron.
  // Calling it `pending` would show a student a spinner for work that will never
  // start, and would tell `isInFlight` to keep waiting for it.
  if (!source.parseEnqueuedAt) return { kind: "not_queued" };

  const leasedUntil = source.parseLeasedUntil ? new Date(source.parseLeasedUntil) : null;
  if (leasedUntil && leasedUntil > now) return { attempts: source.parseAttempts, kind: "parsing" };

  const next = source.parseNextAttemptAt ? new Date(source.parseNextAttemptAt) : null;
  // A future retry time only means "retrying" once something has actually been
  // tried. A brand new row's next_attempt_at defaults to its creation instant,
  // which can sit a hair in the future — reporting that as a retry would tell a
  // student a failure happened before anything ran.
  if (next && next > now && source.parseAttempts > 0) {
    return { attempts: source.parseAttempts, kind: "retrying", nextAttemptAt: next.toISOString() };
  }
  return { attempts: source.parseAttempts, kind: "pending" };
}

/**
 * 🔴 Is this document safe to answer questions from *as if it were whole*?
 *
 * Only a complete parse is. A partial one is still usable — and should be used —
 * but every caller that reaches for it owes the student and the model a note
 * about what was missed. That is what Phase 0's coverage disclosure is for.
 *
 * Note what this is NOT: it is not "retrieval-ready". Nothing has been indexed
 * in Phase 1, so nothing here can promise search coverage.
 */
export function isWholeDocument(status: DocumentStatus): boolean {
  return status.kind === "parsed" || status.kind === "ready";
}

/** Still moving. Distinguishes "wait" from "act" for the UI and for retry logic. */
export function isInFlight(status: DocumentStatus): boolean {
  return status.kind === "pending" || status.kind === "parsing" ||
    status.kind === "retrying" || status.kind === "indexing";
}

/** Attempts allowed before a parse is terminally failed. Mirrors the SQL. */
export const MAX_ATTEMPTS = 5;

/**
 * Plain English, and specific about whether Nemesis is still working, partly
 * succeeded, or needs the student to do something.
 */
export function documentStatusLine(status: DocumentStatus): string {
  switch (status.kind) {
    case "not_queued":
      // Says what is true and offers the action, rather than implying progress.
      // "Waiting to be read" would be a spinner for work nobody scheduled.
      return "Stored, but not read yet. Read it to search and study from it.";
    case "pending":
      return "Waiting to be read.";
    case "parsing":
      return "Reading this document now.";
    case "retrying":
      return `That attempt did not finish. Trying again — attempt ${status.attempts + 1} of ${MAX_ATTEMPTS}.`;
    case "partially_parsed":
      return status.unitsUnread > 0
        ? `Read, but ${status.unitsUnread} of ${status.units} could not be read. Answers will say so.`
        : "Read, with some parts missing. Answers will say so.";
    case "parsed":
      return "Read and saved.";
    case "indexing":
      return "Read. Indexing it now.";
    case "ready":
      return "Read and searchable.";
    case "failed":
      // 🔴 `message`, NEVER `detail`. The technical cause is carried on the status for logs and
      // support; putting it here is the defect this branch had. The separator is explicit because
      // a stored message with no trailing stop used to run straight into the next sentence.
      return `${status.message} We tried ${status.attempts} times and have stopped. You can retry it yourself.`;
  }
}
