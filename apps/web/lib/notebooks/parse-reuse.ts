/**
 * Has this user already had these exact bytes read?
 *
 * 🔴🔴 THE ANSWER WAS ALWAYS AVAILABLE AND NOBODY ASKED IT BEFORE SPENDING. `parsed_documents` has
 * been keyed `(user_id, content_hash, parser_version)` since it was created, under a comment saying
 * precisely what the key is for — *"Re-importing an unchanged file finds this row instead of paying
 * to parse and embed again."* But `record_parsed_document` consults that key at WRITE time, which
 * deduplicates the ROW and not the WORK: by the time the upsert runs the file has been fetched,
 * unzipped, parsed, possibly sent to a vendor and possibly looked at by a vision model.
 *
 * Measured on production: 21 sources carry a hash, 19 of the hashes are distinct. One upload in ten
 * was already being paid for twice, in a library of twenty-one files, before the product has a
 * second cohort.
 *
 * 🔴 FOUR IDENTITIES, AND THIS MODULE IS ABOUT THE FIRST TWO. `parse-record.ts` names them:
 *
 *     file       -> content_hash (sha256 of the ORIGINAL bytes)
 *     parse      -> parsed_documents.id  (user_id, content_hash, parser_version)
 *     placement  -> library_sources.id   (folder, title, course)
 *     knowledge  -> objects derived from the parse
 *
 * The same file filed into two folders is TWO placements and ONE parse. That was already true of
 * the WRITE; this makes it true of the WORK.
 *
 * 🔴 PER USER. NOT ACROSS USERS. The obvious next saving is two students uploading the same lecture,
 * and it is deliberately not taken: it would mean one person's parse becoming the answer served to
 * another, which is a change to what user data is rather than an optimisation. The owner's brief
 * lists materially new user-data sharing as something to escalate, not to decide. The same-user
 * case carries no such question.
 *
 * 🔴 AND IT IS NOT A REPROCESS DECISION. `decideEnqueue`/`needsReprocess` already own "should these
 * bytes be read AGAIN because something moved". This owns the narrower and cheaper question: "is
 * there already an answer for these bytes". A parse produced by an older parser version is still an
 * answer; getting a better one is a deliberate act with a caller, exactly as it is today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readStructureEnvelope, type DocumentModel, type ExtractionCoverage } from "@nemesis/shared";

import { adminClient } from "@/lib/server";

/** A parse that already exists for these bytes, reduced to what a decision needs. */
export interface ExistingParse {
  readonly id: string;
  readonly parserVersion: string;
  readonly state: string;
  readonly complete: boolean;
  readonly docKind: string;
  readonly unitCount: number;
}

export type ReuseDecision =
  | {
      readonly reuse: true;
      readonly parse: ExistingParse;
      /** Why, in words, for the log and the cost record. */
      readonly reason: "same-bytes-already-parsed";
    }
  | {
      readonly reuse: false;
      readonly reason:
        /** Nothing has read these bytes for this user. */
        | "no-existing-parse"
        /**
         * Something read them and did not succeed.
         *
         * 🔴 A FAILED PARSE IS NOT AN ANSWER, AND REUSING ONE WOULD BE THE WORST POSSIBLE SAVING:
         * a document that failed once would be permanently unreadable, with each retry finding the
         * failure and declining to try. `record_parsed_document` keeps failed rows on purpose —
         * they carry the error — so this has to look at more than existence.
         */
        | "existing-parse-failed"
        /** The caller asked for a reparse. Reuse would be answering a different question. */
        | "reprocess-requested";
    };

/**
 * Is this stored parse worth reusing? PURE.
 *
 * 🔴 `partially_parsed` IS REUSED, AND THAT IS THE SAME RULE THE REST OF THE PIPELINE FOLLOWS. A
 * 300-page scan with 40 pages transcribed is a resting state, not a failure — `record_parsed_document`
 * says so in SQL, `pipelineStateFor` says so in TypeScript, and the reader shows the coverage caveat.
 * Re-reading it would spend the same money to reach the same partial answer. What is NOT reused is
 * `failed`, which is not an answer at all.
 */
export function decideReuse(
  existing: ExistingParse | null,
  options: { reprocessRequested?: boolean } = {},
): ReuseDecision {
  if (options.reprocessRequested) return { reason: "reprocess-requested", reuse: false };
  if (!existing) return { reason: "no-existing-parse", reuse: false };
  if (existing.state === "failed") return { reason: "existing-parse-failed", reuse: false };
  return { parse: existing, reason: "same-bytes-already-parsed", reuse: true };
}

/**
 * The best existing parse of these bytes for this user, or null.
 *
 * 🔴 BEST, NOT FIRST. A file can have several rows — one per parser version — because that is what
 * makes "reprocess everything read by version X" answerable. A complete parse beats a partial one
 * and, among equals, the most recently updated wins: that is the row a reprocess most recently
 * produced, and reusing an older one would silently undo a reprocess somebody paid for.
 *
 * Never throws. A lookup that fails is `null`, which means "parse it", which is exactly what
 * happened before this function existed. A bookkeeping query must never be able to stop a student's
 * document being read.
 */
export async function findReusableParse(
  admin: SupabaseClient,
  userId: string,
  contentHash: string,
): Promise<ExistingParse | null> {
  try {
    const { data, error } = await admin
      .from("parsed_documents")
      .select("id,parser_version,state,complete,doc_kind,unit_count,updated_at")
      // 🔴 BOTH COLUMNS, ALWAYS. `user_id` is not a filter that could be dropped for convenience;
      // it is the whole of the privacy argument above, and it is the prefix of the identity index
      // so it costs nothing.
      .eq("user_id", userId)
      .eq("content_hash", contentHash)
      .neq("state", "failed")
      .order("complete", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      complete: data.complete === true,
      docKind: String(data.doc_kind ?? ""),
      id: String(data.id),
      parserVersion: String(data.parser_version ?? ""),
      state: String(data.state ?? ""),
      unitCount: Number(data.unit_count ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Reuse a stored parse on the SYNCHRONOUS lane, and point the placement at it.
 *
 * 🔴 THE WORKER AND THIS LANE REUSE THE SAME ROWS AND FINISH DIFFERENTLY, WHICH IS WHY THERE ARE
 * TWO FUNCTIONS. The worker holds a lease and must release it, so its link goes through
 * `reuse_document_parse` where the token is proved in SQL. This lane holds no lease — it is inside
 * the student's own request — so it links the way `persistParse` does, scoped to the owner, and
 * has to hand the CONTENT back as well because the caller is waiting for it.
 *
 * 🔴 READ THROUGH THE REAL ENVELOPE VALIDATOR, NEVER TRUSTED BY SHAPE. `readStructureEnvelope` is
 * what every other consumer of `parsed_documents` goes through; a row it cannot read is a row this
 * declines to reuse, falling through to the parser. A reuse that returned a half-understood row
 * would be worse than no reuse at all: it would look like a successful parse.
 *
 * Never throws. Every failure returns null, which means "parse it".
 */
export async function reuseStoredParse(
  userId: string,
  sourceId: string,
  contentHash: string,
): Promise<{
  parsedDocumentId: string;
  parserVersion: string;
  text: string;
  title: string | null;
  coverage: ExtractionCoverage;
  model?: DocumentModel;
  readBy?: string;
} | null> {
  let admin: SupabaseClient;
  try {
    admin = adminClient();
  } catch {
    return null;
  }

  const existing = await findReusableParse(admin, userId, contentHash);
  const decision = decideReuse(existing);
  if (!decision.reuse) return null;

  let row: { coverage: unknown; structure: unknown; parser_version: unknown } | null = null;
  try {
    const { data, error } = await admin
      .from("parsed_documents")
      .select("coverage,structure,parser_version")
      .eq("id", decision.parse.id)
      // 🔴 SCOPED TO THE OWNER EVEN THOUGH THE LOOKUP ALREADY WAS. The service role bypasses row
      // level security, so this predicate is the only thing standing between a wrong id and
      // somebody else's document. It costs nothing and it cannot be the line that was forgotten.
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    row = data;
  } catch {
    return null;
  }

  const envelope = readStructureEnvelope(row.structure);
  if (!envelope) return null;

  // 🔴 A REUSE THAT RETURNS NOTHING IS NOT A SAVING. An empty stored text means the caller would
  // get a blank document instantly instead of a real one slowly, which is the worst possible trade.
  // Falling through re-reads the file, and `record_parsed_document` will keep whichever parse is
  // better.
  if (!envelope.text.trim()) return null;

  const coverage = row.coverage as ExtractionCoverage | null;
  if (!coverage || typeof coverage !== "object") return null;

  try {
    const { error } = await admin
      .from("library_sources")
      .update({ content_hash: contentHash, parsed_document_id: decision.parse.id })
      .eq("id", sourceId)
      .eq("user_id", userId);
    if (error) {
      console.warn(JSON.stringify({ event: "parse_reuse_link_failed", detail: error.message.slice(0, 160) }));
      return null;
    }
  } catch {
    return null;
  }

  const parserVersion = String(row.parser_version ?? "");
  return {
    coverage,
    parsedDocumentId: decision.parse.id,
    parserVersion,
    text: envelope.text,
    title: envelope.title,
    // 🔴 ONLY A v2 ENVELOPE CARRIES A MODEL, AND THE NARROWING IS BY `shape` RATHER THAN BY
    // `"model" in envelope`. A v1 row was written by the flat extractor and genuinely has no
    // structure; a consumer must read its absence as UNKNOWN — falling back to the text path —
    // which is exactly what the parsing path does when `parsed.model` is undefined.
    ...(envelope.shape === "units-blocks" ? { model: envelope.model } : {}),
    // 🔴 THE PROVENANCE TRAVELS WITH THE REUSE. A row read by a vendor says so in
    // `parser_version`; the response's `readBy` means the same thing, so a reused vendor parse
    // still tells the caller a machine read the pixels rather than the file's own text layer.
    // Our own parses are stamped `extract-YYYY-MM-DD` and carry no `readBy`, exactly as they do
    // on the parsing path.
    ...(parserVersion && !parserVersion.startsWith("extract-") ? { readBy: parserVersion } : {}),
  };
}
