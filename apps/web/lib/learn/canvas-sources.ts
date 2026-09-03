// Reading a canvas's material back out of the database, as it actually survived.
//
// 🔴 THE CANVAS USED TO BUILD ITS GROUNDING FROM THE UPLOAD RESPONSE, AND THAT IS A DIFFERENT
// DOCUMENT FROM THE ONE THAT GOT STORED. The response carries whatever the parser produced in that
// request; `parsed_documents.structure` carries whatever survived being written, read back and
// validated. Those two agree right up until they do not — a column that failed to write, a shape
// the envelope reader rejects, a parse that was later redone by the worker — and while the canvas
// reads the first, nothing anywhere can notice the difference. Every later reader (retrieval, the
// reader, extraction, a second canvas) sees only the stored one.
//
// So this is the single door: a filed source id goes in, and what comes out is the same
// `SourceContext` an extractor gets, derived from the same column, through the same validator.
//
// 🔴 AND IT REPORTS QUALITY RATHER THAN HIDING IT. A source whose structure did not survive is
// still usable — one coarse text unit is enough to learn from — but the caller has to be able to
// say so, because "we could not read the table" and "the document had no table" are different
// facts and only one of them is the document's.

import { coverageNoticeForLearner, coverageNoticeForModel, readCoverage, UNSORTED_FOLDER } from "@nemesis/shared";

import { supabase } from "@/lib/supabase";
import type { CanvasSource } from "./canvas-model";
import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

/**
 * Where a canvas attachment is filed.
 *
 * 🔴 THE EXISTING INBOX, NOT A NEW "CANVAS" FOLDER, AND THAT IS A PRODUCT DECISION. Filing is a
 * BACKEND requirement: a row is what lets a second canvas recognise the same document, lets
 * retrieval index it, and gives a citation something to point at. It is not an instruction to the
 * student to go and manage the file somewhere.
 *
 * Minting a folder named after the surface would have taught exactly the mental model that was
 * retired — "upload in Canvas, then go to the Library to look after it". The user-facing model
 * stays `Canvas session → Sources → this document`. Chat attachments already land in the Inbox, so
 * using it adds a durable record without adding a workflow.
 */
export const CANVAS_FILING_FOLDER = UNSORTED_FOLDER;

export type CanonicalLoadFailure =
  /** No row, or not this user's. */
  | "not-found"
  /** Filed, but nobody has parsed it yet — the queue may still be holding it. */
  | "not-parsed"
  /** Parsed, but the stored structure did not validate, so there is nothing to read. */
  | "unreadable";

/**
 * WHICH parse this context came out of — the bytes and the reader, never the row.
 *
 * 🔴 IT IS NOT ON `SourceContext`, ON PURPOSE. That type is the EXTRACTION boundary: an extractor
 * must decide what a document teaches from what survived, and handing it a parser version invites a
 * lane to branch on one. This is the REPROCESS boundary — the same row, read for a different
 * question — so it travels beside the context rather than inside it.
 *
 * 🔴 EVERY FIELD IS NULLABLE BECAUSE EVERY FIELD GENUINELY CAN BE. `content_hash` is null on rows
 * whose parse predates the column being linked, and PostgREST hands back an embed that this file
 * already documents as arriving in two different shapes. Null means UNKNOWN, and `needsReprocess`
 * treats an unknown current dimension as a reason to suppress a rebuild rather than cause one — so
 * the failure mode of a missing hash is one skipped opportunity, never a surprise bill.
 */
export interface SourceProvenance {
  sourceId: string;
  /** sha256 of the original bytes, as `parsed_documents` recorded them. */
  contentHash: string | null;
  /** The reader that produced this parse — `PARSER_VERSION`, or a vendor's own string. */
  parserVersion: string | null;
}

export type CanonicalLoad =
  | { ok: true; context: SourceContext; provenance: SourceProvenance }
  | { ok: false; reason: CanonicalLoadFailure };

/** The embed PostgREST returns for a to-one relation.
 *
 *  🔴 BOTH SHAPES ARE HANDLED BECAUSE BOTH OCCUR. supabase-js types a to-one embed as a LIST, and
 *  other code in this repo comments that it always is one — but measured against production on
 *  2026-08-11 this particular embed comes back as a bare OBJECT. Whichever a caller assumes, the
 *  other one silently yields `undefined`, every source looks degraded, and nothing fails loudly. */
type ParsedEmbed = {
  structure?: unknown;
  doc_kind?: string | null;
  coverage?: unknown;
  content_hash?: string | null;
  parser_version?: string | null;
};

function firstEmbed(value: ParsedEmbed[] | ParsedEmbed | null | undefined): ParsedEmbed | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * The two provenance columns, off whichever shape PostgREST handed back.
 *
 * 🔴 EXPORTED SO THE EMBED-SHAPE TRAP CAN BE TESTED WITHOUT A DATABASE, AND IT IS A REAL TRAP THAT
 * THIS FILE HAS ALREADY BEEN CAUGHT BY — see `ParsedEmbed` above. Assume a list and a bare object
 * yields `undefined`; assume an object and a list does. Either way every field reads back null, the
 * material stamp comes out null, and "we already looked at this material" silently starts standing
 * for ever — a cache that can never expire, produced by a shape mismatch nothing throws on.
 *
 * 🔴 FIELD BY FIELD, NEVER CAST. The columns are snake_case and this type is camelCase, so a cast
 * would compile and hand back an object whose every field is `undefined`.
 */
export function provenanceOf(
  sourceId: string,
  embed: ParsedEmbed[] | ParsedEmbed | null | undefined,
): SourceProvenance {
  const parsed = firstEmbed(embed);
  return {
    contentHash: typeof parsed?.content_hash === "string" && parsed.content_hash ? parsed.content_hash : null,
    parserVersion: typeof parsed?.parser_version === "string" && parsed.parser_version ? parsed.parser_version : null,
    sourceId,
  };
}

/**
 * Load a filed source as the canonical extraction boundary.
 *
 * One round trip: the row and its parse are read together, because a decision made from either
 * one alone is wrong in a familiar way — a parse with no row cannot be anchored to anything, and a
 * row with no parse cannot be read at all.
 */
export async function loadCanonicalSource(librarySourceId: string): Promise<CanonicalLoad> {
  const { data, error } = await supabase
    .from("library_sources")
    // 🔴 `content_hash` AND `parser_version` ARE SELECTED FOR THE REPROCESS QUESTION, NOT THE
    // EXTRACTION ONE. They never reach `buildSourceContext`; they answer "is a stored answer about
    // this document still the answer the current rules would give?" — see `SourceProvenance`.
    .select(
      "id,mime_type,created_at,parsed_document_id,parsed_documents(structure,doc_kind,coverage,content_hash,parser_version)",
    )
    .eq("id", librarySourceId)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not-found" };

  const row = data as {
    created_at?: string | null;
    parsed_document_id?: string | null;
    parsed_documents?: ParsedEmbed[] | ParsedEmbed | null;
  };
  const parsed = firstEmbed(row.parsed_documents);
  if (!row.parsed_document_id || !parsed) return { ok: false, reason: "not-parsed" };

  const context = buildSourceContext({
    // 🔴 The DURABLE id, so anchors minted from this context mean the same thing in every canvas
    // and after every reparse. A canvas-local "s1" here would make them meaningless elsewhere.
    sourceId: librarySourceId,
    sourceKind: parsed.doc_kind ?? "unknown",
    structure: parsed.structure,
    // 🔴 SELECTED ALONGSIDE structure, ON PURPOSE. This is the one production door onto
    // `contentIntegrity` (see source-context.ts): omitting this column here is indistinguishable
    // from a row that genuinely has no coverage yet, and both read back as "unknown" rather than a
    // guessed-healthy verdict — but only the second one is honest.
    coverage: parsed.coverage,
    ...(row.created_at ? { capturedAt: row.created_at } : {}),
  });

  // A context with no units is not a degraded parse — it is nothing to read. Saying "unreadable"
  // lets the caller fall back to the text it already has, instead of building a lesson from an
  // empty document and reporting success.
  if (context.units.length === 0) return { ok: false, reason: "unreadable" };

  // 🔴 BUILT FROM THE RAW EMBED, NOT FROM `parsed`, SO ONE FUNCTION OWNS THE SHAPE HANDLING. Two
  // readers of a value that arrives in two shapes is two chances to pick the wrong one.
  return { context, ok: true, provenance: provenanceOf(librarySourceId, row.parsed_documents) };
}

/**
 * Just the `coverage` column for one library source.
 *
 * 🔴 A SEPARATE, NARROWER READ THAN `loadCanonicalSource`, DELIBERATELY. That one builds a whole
 * `SourceContext` — structure, capabilities, provenance, integrity — because its callers are about
 * to extract knowledge from the document. This caller wants one JSON column to re-derive one
 * sentence, on every canvas load, for every attached source. Paying for a full context to render a
 * disclosure would make the cheapest thing on the page the most expensive.
 */
export async function storedCoverageNote(librarySourceId: string): Promise<string | null> {
  return coverageNote(await loadStoredCoverage(librarySourceId));
}

/**
 * Both spellings of the stored disclosure, in ONE round trip.
 *
 * 🔴 ONE READ, BECAUSE TWO READS IS TWO ANSWERS. Asking for the note and the label separately means
 * two queries against a row that can change between them, and the panel and the packet disagreeing
 * about what was missed is exactly the failure this pair exists to prevent.
 */
export async function storedCoverage(librarySourceId: string): Promise<{ label: string | null; note: string | null }> {
  const coverage = await loadStoredCoverage(librarySourceId);
  return { label: coverageLabel(coverage), note: coverageNote(coverage) };
}

async function loadStoredCoverage(librarySourceId: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("library_sources")
    .select("parsed_documents(coverage)")
    .eq("id", librarySourceId)
    .maybeSingle();
  if (error || !data) return null;
  const embed = (data as { parsed_documents?: unknown }).parsed_documents;
  // 🔴 BOTH SHAPES, for the reason `ParsedEmbed` above already documents: supabase-js TYPES a
  // to-one embed as a list and this one comes back as a bare object in production. Assuming either
  // alone yields `undefined` silently, and every source then looks fully read.
  const row = Array.isArray(embed) ? embed[0] : embed;
  return (row as { coverage?: unknown } | null | undefined)?.coverage ?? null;
}

/** The extractor's own account of what it could not read, in the words the shared module already
 *  uses for exactly this — so a canvas built on a half-read lecture says so in the same terms chat
 *  does. Returns null when the file was read whole.
 *
 *  🔴 MOVED HERE FROM `use-canvas-session.ts` so the refresher below and the attach path share ONE
 *  definition. Two spellings of "what could this document not read" is two answers to the question
 *  the disclosure exists to answer. */
export function coverageNote(coverage: unknown): string | null {
  const parsed = readCoverage(coverage);
  return parsed ? coverageNoticeForModel(parsed) : null;
}

/**
 * The same disclosure for the sources panel, in the learner's own vocabulary.
 *
 * 🔴 THE PANEL WAS PRINTING THE MODEL'S COPY. See `coverageNoticeForLearner` for the measurement:
 * a learner reading their own sources shelf was shown an instruction addressed to the model, which
 * referred to them in the third person as "the student". Same parsed coverage, two renderings, so
 * the two can never disagree about what was missed.
 */
export function coverageLabel(coverage: unknown): string | null {
  const parsed = readCoverage(coverage);
  return parsed ? coverageNoticeForLearner(parsed) : null;
}

/**
 * Re-read the coverage note for a canvas's sources, so the disclosure stops lying about a document
 * that has since been read more fully.
 *
 * 🔴🔴 THE NOTE WAS A SNAPSHOT TAKEN AT ATTACH, AND NOTHING EVER LOOKED AGAIN. `use-canvas-session`
 * computes `coverageNote(extracted.coverage)` once, when the file lands, and writes the string onto
 * the canvas. That was harmless while a document's coverage could never improve — and as of the
 * automatic figure pass it improves routinely, in the background, minutes after the upload.
 *
 * So an already-attached canvas keeps telling the learner "8 pictures were not read" about a
 * document whose pictures now have descriptions. The knowledge pipeline is unaffected — it reads
 * `parsed_documents` fresh every time — which makes this precisely the failure this project calls
 * DEGRADED, NOT COMPLETE: the data got better, the words on screen did not, and only the words are
 * what the learner can see.
 *
 * 🔴 IT RETURNS A NEW LIST RATHER THAN MUTATING, and returns the SAME list when nothing changed, so
 * a caller can skip a write. A canvas save on every load would be a write amplification on the one
 * path every session takes.
 *
 * 🔴 A SOURCE WITH NO `librarySourceId` IS LEFT EXACTLY AS IT IS. Pasted text and model knowledge
 * have no parsed document behind them; "no row found" means "nothing to refresh here", never
 * "this source lost its coverage".
 */
export async function refreshedCoverageNotes(
  sources: readonly CanvasSource[],
  load: (id: string) => Promise<unknown> = loadStoredCoverage,
): Promise<readonly CanvasSource[]> {
  const withIds = sources.filter((source) => source.librarySourceId);
  if (withIds.length === 0) return sources;

  const fresh = new Map<string, { label: string | undefined; note: string | undefined }>();
  await Promise.all(
    withIds.map(async (source) => {
      const coverage = await load(source.librarySourceId!);
      fresh.set(source.id, {
        label: coverageLabel(coverage) ?? undefined,
        note: coverageNote(coverage) ?? undefined,
      });
    }),
  );

  let changed = false;
  const next = sources.map((source) => {
    const now = fresh.get(source.id);
    if (!now) return source;
    if (now.note === source.coverageNote && now.label === source.coverageLabel) return source;
    changed = true;
    // 🔴 AN ABSENT NOTE DELETES THE OLD ONE. A document that is now fully read must stop carrying
    // the sentence saying it is not — leaving the stale string because the new value is empty is
    // the exact bug this function exists to fix, one layer in. The learner's label goes with it:
    // two spellings of one disclosure must appear and disappear together.
    const { coverageLabel: _label, coverageNote: _note, ...rest } = source;
    return {
      ...rest,
      ...(now.note ? { coverageNote: now.note } : {}),
      ...(now.label ? { coverageLabel: now.label } : {}),
    };
  });
  return changed ? next : sources;
}

/** The Library's own name for each of these filed sources, in one round trip. */
async function loadFiledNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const { data, error } = await supabase.from("library_sources").select("id,file_name").in("id", [...ids]);
  if (error || !data) return new Map();
  const names = new Map<string, string>();
  for (const row of data as { id?: unknown; file_name?: unknown }[]) {
    if (typeof row.id === "string" && typeof row.file_name === "string" && row.file_name.trim()) {
      names.set(row.id, row.file_name.trim());
    }
  }
  return names;
}

/**
 * Put back the file name a source was filed under, for canvases written while it was being changed.
 *
 * 🔴🔴 THE NAMES WERE PRETTIFIED ON THE WAY IN, AND THE CANVAS IS WHERE THE COPY LIVES. Owner,
 * 2026-09-03: *"these are being renamed. Shouldn't they keep their original file names?"* The
 * attach path now hands the file name straight through (`attachedFileTitle`), but a canvas holds
 * its own copy of every source's title, so the 28 canvases already written keep saying `08 insulin`
 * about a row whose `file_name` is `08-insulin.pdf`, for ever, unless something looks again.
 *
 * 🔴 THE SAME SHAPE AS `refreshedCoverageNotes` DIRECTLY ABOVE, AND FOR THE SAME REASON. That
 * function exists because a coverage note was a snapshot nothing ever revisited; this is the same
 * failure about a different field. Correcting on READ rather than by an UPDATE over production rows
 * means a wrong judgement here costs one function, not a restore from a backup we do not have.
 *
 * 🔴 `library_sources.file_name` IS THE AUTHORITY, NOT A SECOND OPINION. It is what the learner
 * uploaded and the one name they can change (from the Library), so a rename there now reaches every
 * canvas holding that document instead of stopping at the Library page.
 *
 * 🔴 A PROMOTED WEB PAGE IS LEFT ALONE, AND THIS IS THE HALF THAT WOULD DO REAL DAMAGE WITHOUT IT.
 * `attachUrl` files a page as `<page title>.md`, a file name we invented — measured on production,
 * 136 of the 217 stale titles are these. Restoring those would replace "Hydroxy group - Wikipedia"
 * with "Hydroxy group - Wikipedia.md" and show the learner an extension no page ever had.
 * `sourceUrl` is present for exactly and only those, which is what this reads.
 *
 * 🔴 SAME LIST BACK WHEN NOTHING CHANGED, so the caller can skip the write.
 */
export async function restoredFileNames(
  sources: readonly CanvasSource[],
  load: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>> = loadFiledNames,
): Promise<readonly CanvasSource[]> {
  const filed = sources.filter((source) => source.librarySourceId && !source.sourceUrl);
  if (filed.length === 0) return sources;

  const names = await load(filed.map((source) => source.librarySourceId!));
  if (names.size === 0) return sources;

  let changed = false;
  const next = sources.map((source) => {
    if (!source.librarySourceId || source.sourceUrl) return source;
    const name = names.get(source.librarySourceId);
    // 🔴 A MISSING ROW CHANGES NOTHING. "The Library did not answer" is not "this source has no
    // name" — blanking a title on a failed lookup would be a far worse bug than the stale one.
    if (!name || name === source.title) return source;
    changed = true;
    return { ...source, title: name };
  });
  return changed ? next : sources;
}
