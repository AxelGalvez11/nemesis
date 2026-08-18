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
import {
  attachFigureAssets,
  FIGURE_ASSET_BUCKET,
  readNormalizedFigures,
  storeFigureAssets,
} from "@/lib/notebooks/figure-assets";
import { runParseOnThread, type ParseRunSpend } from "@/lib/notebooks/parse-run";
import {
  NO_SPEND,
  VisionLedger,
  documentUnitCap,
  userDailyUnitCap,
  withVisionBudget,
} from "@/lib/pdf/vision-budget";
import { contentHashOf, rowCounts, structureEnvelope } from "@/lib/notebooks/parse-record";
import { decideReuse, findReusableParse } from "@/lib/notebooks/parse-reuse";
import { runShadowEvaluation } from "@/lib/notebooks/parse-shadow";
import {
  DEADLINE_ABORT_MS,
  isRetryable,
  JOBS_PER_RUN,
  LEASE_SECONDS,
  sanitizeError,
  secretMatches,
  visionSettlement,
  workerName,
} from "@/lib/notebooks/parse-worker";
import { kindFor, sniffKind, type ParsedDocument } from "@/lib/notebooks/parse-document";
import { doclingFormats, routeFor } from "@/lib/notebooks/parse-router";
import {
  awaitDoclingTask,
  doclingConfig,
  submitDoclingTask,
  type DoclingServiceConfig,
} from "@/lib/notebooks/docling-client";
import { buildDoclingParse, doclingFallback, type DoclingKind } from "@/lib/notebooks/parse-docling";
import { supabaseFigureCache, withFigureCache } from "@/lib/pdf/figure-cache";
import { nativeTextMap, probePdfNativeText } from "@/lib/pdf/native-probe";
import { readPdfStructure } from "@/lib/pdf/structure";
import type { CapturedFigure } from "@/lib/pdf/structure";
import { PARSER_VERSION, type DocumentModel } from "@nemesis/shared";

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
  /**
   * A conversion already running in the sidecar, from an earlier attempt.
   *
   * 🔴 OPTIONAL ON PURPOSE, AND NOT BECAUSE OF SLOPPINESS. These two columns
   * arrive from a migration that may not be applied — `claim_document_parses`
   * returns `s.*`, so they appear the moment the table has them and are simply
   * absent until then. A deployment without the migration still routes to
   * Docling and still parses correctly; it just cannot resume a task across
   * attempts. Treating `undefined` as "no task in flight" is what makes the
   * migration optional rather than a deploy-order trap.
   */
  parse_external_task_id?: string | null;
  parse_external_started_at?: string | null;
  /** Claims this row has had, INCLUDING this one — the claim increments it. */
  parse_attempts?: number | null;
}

/**
 * Time kept back from the Docling wait so a fallback parse still fits.
 *
 * If the sidecar refuses or the task fails we parse the document ourselves, in
 * this same invocation. The worst real document measured takes 12.3 s (2,116
 * pages, 1,067 MB), so 45 s is roughly 3.5x the measured worst case — enough that
 * the fallback is not itself the thing that runs out of time.
 */
const DOCLING_FALLBACK_RESERVE_MS = 45_000;

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

/**
 * One claimed document, wrapped in its vision reservation.
 *
 * 🔴 THE RESERVATION IS SETTLED IN A `finally`, AND THAT IS NOT DEFENSIVE STYLE — IT IS
 * THE ONLY CORRECT PLACE. `runClaimed` returns from eleven different points (fetch
 * refused, lease lost, parser refused, deadline, memory, no bundle, docling pending, ...).
 * Settling at each of them is eleven chances to forget one, and forgetting one leaves a
 * student permanently charged for pictures nobody looked at. A `finally` cannot be
 * forgotten.
 *
 * A reservation of zero is not settled at all: there is nothing to refund, and calling
 * the RPC would be a round trip to write two zeroes.
 */
async function runOne(
  admin: ReturnType<typeof adminClient>,
  job: ClaimedSource,
): Promise<{ sourceId: string; outcome: string }> {
  const reservation: VisionReservation = { granted: 0, spend: null };
  try {
    return await runClaimed(admin, job, reservation);
  } finally {
    if (reservation.granted > 0) {
      // 🔴 `null` SPEND MEANS "THE THREAD DIED BEFORE IT COULD SAY", NOT "IT SPENT
      // NOTHING". A parse killed by the deadline or memory guard is terminated
      // mid-flight and posts no message, while the images it already sent were already
      // billed. Treating silence as zero would refund the whole reservation exactly in
      // the case where the money was most certainly spent.
      const { calls, used } = visionSettlement(reservation.granted, reservation.spend);
      const { error } = await admin.rpc("settle_vision_units", {
        p_calls: calls,
        p_granted: reservation.granted,
        p_source_id: job.id,
        p_used: used,
        p_user_id: job.user_id,
      });
      // A failed settlement leaves the reservation standing, which over-charges rather
      // than under-charges. Logged, never thrown: a good parse must not be reported as
      // failed because its accounting round trip did not land.
      if (error) console.warn(JSON.stringify({ event: "vision_settle_failed", detail: error.message.slice(0, 120) }));
      else
        console.info(
          JSON.stringify({
            calls,
            event: "vision_spend",
            granted: reservation.granted,
            sourceId: job.id,
            units: used,
          }),
        );
    }
  }
}

/** What this attempt was allowed to spend, and what it reported spending. */
interface VisionReservation {
  granted: number;
  spend: ParseRunSpend | null;
}

async function runClaimed(
  admin: ReturnType<typeof adminClient>,
  job: ClaimedSource,
  reservation: VisionReservation,
): Promise<{ sourceId: string; outcome: string }> {
  const token = job.parse_lease_token;
  // When this invocation began. The routed lane needs it: its share of the
  // deadline is whatever is left after fetching bytes, minus the reserve that
  // keeps a fallback parse possible.
  const startedAt = Date.now();

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
  //
  // 🔴 THE HASH IS OF THE ORIGINAL UPLOADED BYTES AND NOTHING ELSE. No parser
  // feeds it, so which program read the document cannot move a content hash, a
  // source identity or a course placement. That is what makes routing a format
  // to a different parser a reversible decision rather than a data migration.
  const contentHash = contentHashOf(bytes);

  // 🔴 RESERVED BEFORE A SINGLE IMAGE IS SENT. Counting afterwards records nothing when
  // the platform kills the process, which is exactly the expensive case. The grant is the
  // smaller of what this document has left of its lifetime cap and what this user has
  // left of today — computed in SQL under a row lock, because two workers holding two
  // documents of the same user would otherwise both read the same remainder and both
  // spend it.
  const { data: granted, error: reserveError } = await admin.rpc("reserve_vision_units", {
    p_document_cap: documentUnitCap(),
    p_source_id: job.id,
    p_user_daily_cap: userDailyUnitCap(),
    p_user_id: job.user_id,
  });
  if (reserveError) {
    // The migration may not be applied on this deployment. A parse that cannot reserve
    // must not silently proceed uncapped — that is the state this whole ledger exists to
    // end — so it proceeds with a grant of zero: text, tables and structure are read
    // exactly as before, and figures keep the honest `not-examined` reason coverage
    // already counts as a gap.
    console.warn(JSON.stringify({ event: "vision_reserve_unavailable", detail: reserveError.message.slice(0, 120) }));
  }
  reservation.granted = typeof granted === "number" ? granted : 0;

  const heartbeat = async (): Promise<boolean> => {
    const { data } = await admin.rpc("renew_document_parse_lease", {
      p_lease_seconds: LEASE_SECONDS,
      p_source_id: job.id,
      p_token: token,
    });
    return data === true;
  };

  /**
   * 🔴 ONE WRITE, NOT TWO, AND ONE WRITE FOR BOTH LANES.
   *
   * `finish_document_parse` records the parse AND links the placement AND
   * releases the lease, inside one transaction that proves the token first.
   * Calling `persistParse` as well — which is what the synchronous upload lane
   * does, because it holds no lease — would write the same parse twice and,
   * worse, would write it once even when the lease had been lost.
   *
   * Both parsers end here deliberately. A second writer for the routed lane is
   * how the two lanes would drift into recording different things about the same
   * document, which is the failure this whole integration is shaped to avoid.
   */
  /**
   * Put the parse's pictures where the learner can be shown them, and give the model
   * their addresses.
   *
   * 🔴 THIS IS THE ONLY MOMENT THE PIXELS EXIST OUTSIDE THE ORIGINAL FILE. They came
   * across the thread boundary already unwrapped and downscaled; after this function
   * returns they are garbage. Skipping it does not lose a nice-to-have — it means the
   * only route back to a diagram is downloading and re-parsing the source, which for
   * a 124 MB deck is the entire working-set problem.
   *
   * Storage failure is NOT parse failure. A deck whose text, tables and structure read
   * perfectly is still a good parse if an image upload was refused; the model simply
   * records fewer showable figures, which is the truth. Failing the whole job here
   * would throw away a correct read of the document over a picture.
   */
  const withStoredFigures = async (parsed: ParsedDocument, figures: unknown): Promise<ParsedDocument> => {
    const normalized = readNormalizedFigures(figures);
    if (!parsed.model || normalized.length === 0) return parsed;
    const stored = await storeFigureAssets(
      {
        put: async (path, bytes, mime) => {
          // 🔴 `upsert: true` IS THE CORRECTNESS CHOICE HERE, NOT A SHORTCUT. The path
          // is a hash OF THESE BYTES, so an object already at it holds exactly what is
          // about to be written and overwriting is a no-op by construction.
          //
          // The alternative — `upsert: false` and treat "already exists" as success —
          // requires recognising a storage error by its shape. That guess is only
          // testable against the real service, and getting it wrong fails in the
          // quietest possible way: every re-parse of a deck reports all of its figures
          // as failed uploads, attaches no assets, and still records a successful
          // parse. Nothing here can distinguish that from a deck with no figures.
          const { error } = await admin.storage
            .from(FIGURE_ASSET_BUCKET)
            .upload(path, bytes, { contentType: mime, upsert: true });
          return !error;
        },
      },
      job.user_id,
      normalized,
    );
    console.info(
      JSON.stringify({
        event: "figure_assets_stored",
        bytes: stored.bytes,
        failed: stored.failed,
        sourceId: job.id,
        stored: stored.stored,
      }),
    );
    return { ...parsed, model: attachFigureAssets(parsed.model, stored.byEntry) };
  };

  const finish = async (parsed: ParsedDocument, ms: number, peakRssMb: number) => {
    const counts = countsFor(parsed);
    const { data: finished, error: finishError } = await admin.rpc("finish_document_parse", {
      p_content_hash: contentHash,
      p_coverage: parsed.coverage as unknown as Record<string, unknown>,
      p_doc_kind: parsed.kind,
      p_parse_ms: Math.round(ms),
      // 🔴 `p_peak_rss_mb`, NOT `p_parse_peak_rss_mb`. The COLUMN is `parse_peak_rss_mb`
      // and the ARGUMENT is not, and this call had the column's name for the argument
      // since the day it was written. PostgREST resolves an RPC by its argument NAMES, so
      // one wrong name is not a wrong value — it is "function not found", returned as a
      // PostgrestError. Every parse this worker ever completed would have been discarded
      // at the last step, after the document had been fetched, parsed and paid for.
      //
      // It survived every test because nothing exercised the real function signature, and
      // it survived nine days in production because the worker had never once run.
      // `parse-rpc-arguments.test.ts` now reads the migration and refuses any argument the
      // deployed function does not declare.
      p_peak_rss_mb: peakRssMb,
      p_parser_version: parsed.readBy ?? PARSER_VERSION,
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
    // A null return is the lease check refusing, not an error. The newer
    // worker's result is the one that should stand.
    return { sourceId: job.id, outcome: finished ? "parsed" : "lease-lost" };
  };

  // ── Have we already read exactly these bytes for this person? ─────────────
  //
  // 🔴🔴 ASKED BEFORE ANYTHING IS SPENT, WHICH IS THE WHOLE POINT AND WAS THE WHOLE GAP.
  // `parsed_documents` has been keyed on `(user_id, content_hash, parser_version)` since it was
  // created, and `record_parsed_document` consults that key — at WRITE time. Deduplicating the row
  // after the file has been fetched, parsed, sent to a vendor and looked at by a vision model saves
  // a row and none of the money. Measured on production the day this was written: 21 hashed
  // sources, 19 distinct hashes.
  //
  // 🔴 IT IS A LOOKUP, NOT A JUDGEMENT. `decideReuse` refuses a failed parse — reusing one would
  // make a document that failed once permanently unreadable — and refuses nothing else. A partial
  // parse IS an answer; re-reading it spends the same money to reach the same place.
  //
  // 🔴 AND A LOOKUP THAT FAILS PARSES THE DOCUMENT. Every path out of `findReusableParse` and
  // `reuse_document_parse` that is not an unambiguous hit falls through to the ordinary lanes
  // below, which is exactly what happened before this block existed.
  const existing = await findReusableParse(admin, job.user_id, contentHash);
  const reuse = decideReuse(existing);
  if (reuse.reuse) {
    const { data: linked, error: reuseError } = await admin.rpc("reuse_document_parse", {
      p_content_hash: contentHash,
      p_parsed_document_id: reuse.parse.id,
      p_source_id: job.id,
      p_token: token,
      p_user_id: job.user_id,
    });
    if (reuseError) {
      // The migration may not be applied on this deployment. Parsing is always a correct answer.
      console.warn(JSON.stringify({ event: "parse_reuse_unavailable", detail: reuseError.message.slice(0, 160) }));
    } else if (typeof linked === "string") {
      console.info(JSON.stringify({
        event: "parse_reused",
        docKind: reuse.parse.docKind,
        parsedDocumentId: linked,
        parserVersion: reuse.parse.parserVersion,
        sourceId: job.id,
        state: reuse.parse.state,
        units: reuse.parse.unitCount,
      }));
      // 🔴 THE RESERVATION IS RELEASED UNSPENT. `settle_vision_units` refunds what was not used, and
      // a reuse used none — so a document reused ten times must not accumulate ten documents' worth
      // of reserved budget against the person who uploaded it.
      reservation.spend = NO_SPEND;
      return { sourceId: job.id, outcome: "reused" };
    }
    // `null` means the lease check refused or the parse did not survive its own validation. Both
    // are ordinary races, and both mean: read the file.
  }

  // ── The routed lane ────────────────────────────────────────────────────────
  //
  // 🔴 THE DEFAULT IS STILL OUR OWN PARSER, FOR EVERY FORMAT. With no
  // DOCLING_FORMATS set and no DOCLING_SERVE_URL configured, `routeFor` returns
  // "nemesis" and none of the code below runs. Production behaviour is unchanged
  // until somebody deliberately sets both.
  const kind = kindFor(fileName, mimeType) ?? sniffKind(bytes);
  const service = doclingConfig();
  const routed =
    kind && kind !== "image"
      ? routeFor(kind, { formats: doclingFormats(), serviceConfigured: Boolean(service) })
      : null;

  // 🔴 THE LAST CLAIM MUST NOT WAIT FOR ANYTHING. `claim_document_parses` will
  // not hand this row out again once `parse_attempts` reaches the maximum, and
  // `fail_document_parse` is the ONLY thing that sets `parse_failed_at`. So a
  // final attempt that returned "the conversion is still running" — which is
  // deliberately not a failure and writes nothing — would leave the row claimable
  // by nobody and failed by nobody: a document stuck at "queued" forever, with no
  // error to see and no worker coming. On the last claim we skip the sidecar
  // entirely and read the file ourselves, so every document is read by something.
  //
  // The limit is read from SQL rather than restated here, because the claim
  // predicate has to agree with it and two copies of a limit is one copy too
  // many. The worker cannot run at all without that migration — `claim_document_
  // parses` lives in it — so a failure to read it is a real fault, and the
  // fail-safe answer is our own parser.
  //
  // Asked only when the sidecar is actually in play, so the default lane costs
  // no extra round trip.
  const mayWait = routed?.parser === "docling" && service && kind && kind !== "image"
    ? !(await isFinalClaim(admin, job))
    : false;
  if (mayWait && service && kind && kind !== "image") {
    // 🔴 THE SIDECAR LANE SPENDS VISION IN *THIS* PROCESS, NOT ON THE THREAD.
    // `buildDoclingParse` reaches pdf.js and the figure describer directly, so without an
    // ambient ledger installed here this lane would fall back to the per-call default and
    // the reservation would buy nothing. Same budget object, so a document that spends on
    // this lane and then falls through to the built-in parser cannot spend twice.
    const doclingLedger = new VisionLedger(reservation.granted);
    // The same cache as the threaded lane. This one runs in-process, so it installs the store
    // directly rather than answering questions over a port.
    const lane = await withFigureCache(supabaseFigureCache(admin, job.user_id), () =>
      withVisionBudget(doclingLedger, () =>
      runDoclingLane({
      admin,
      budgetMs: Math.max(0, DEADLINE_ABORT_MS - (Date.now() - startedAt) - DOCLING_FALLBACK_RESERVE_MS),
      bytes,
      config: service,
      fileName,
      heartbeat,
        job,
        kind,
      })),
    );
    reservation.spend = doclingLedger.spend();
    if (lane.status === "parsed") {
      return await finish(lane.parsed, lane.ms, 0);
    }
    if (lane.status === "pending") {
      // 🔴 NOT A FAILURE, AND IT MUST NOT BE RECORDED AS ONE. The conversion is
      // still running in the sidecar and its id is on the row. Shortening the
      // lease to its floor hands the job back so the next minute's cron resumes
      // the SAME task instead of paying for the document twice. Writing a
      // failure row here would show the student an error for a file that is
      // being read correctly, and would burn the backoff as well.
      await admin.rpc("renew_document_parse_lease", {
        p_lease_seconds: 0,
        p_source_id: job.id,
        p_token: token,
      });
      return { sourceId: job.id, outcome: "external-pending" };
    }
    if (lane.status === "lease-lost") return { sourceId: job.id, outcome: "lease-lost" };
    // Anything else falls through to the built-in parser, saying why. A document
    // the student uploaded must be read by something.
    console.warn(JSON.stringify({ event: "docling_fallback", sourceId: job.id, reason: lane.reason }));
  }

  const run = await runParseOnThread(bytes, fileName, mimeType, {
    // 🔴 THE CACHE IS THE PARENT'S BECAUSE THE CREDENTIALS ARE. The parse thread holds no database
    // client by design; it asks over the port and this side answers from `figure_descriptions`. A
    // picture this learner has already paid to have described costs nothing and does not consume a
    // unit of this document's vision budget.
    figureCache: supabaseFigureCache(admin, job.user_id),
    heartbeat,
    visionUnitBudget: reservation.granted,
  });
  // Recorded before the switch, so every outcome below — including the refusals and the
  // throw — settles against what the parse actually spent.
  reservation.spend = ("visionSpend" in run ? run.visionSpend : undefined) ?? null;

  switch (run.status) {
    case "parsed":
      break;
    case "refused":
      // 🔴 A REFUSAL CAN STILL CARRY A DOCUMENT, AND THEN IT IS A RECORD, NOT A
      // FAILURE TO WRITE. `no-text` means a scan: no text to return, and units,
      // figures and geometry the structural reader already found. Taking the
      // `fail` branch would store the refusal and throw that away — the exact
      // loss #486 exists to stop, one lane over from where it was found.
      //
      // The resulting artifact still reports `failed` to the student, because
      // its coverage says zero pages were read and that is true. The difference
      // is that the file's shape survives, so a later vision pass enriches a
      // known document instead of deciding again what it is.
      if (run.parsed)
        return await finish(
          await withStoredFigures(run.parsed as ParsedDocument, run.figures),
          run.ms,
          run.peakRssMb,
        );
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

  const parsed = await withStoredFigures(run.parsed as ParsedDocument, run.figures);
  const finished = await finish(parsed, run.ms, run.peakRssMb);

  // ── Did the cheap route actually get away with it? ─────────────────────────
  //
  // 🔴🔴 AFTER `finish`, ALWAYS, AND THAT ORDER IS THE SAFETY. The learner's parse is recorded and
  // their placement is linked before a single shadow byte is sent. Nothing below can make them wait
  // for their document, nothing below can fail it, and a shadow run that throws leaves a completed
  // job behind it.
  //
  // 🔴 ONLY FOR PARSES NOBODY WAS BILLED FOR. A document that already went to the vendor has
  // nothing to compare against itself; `readBy` naming a vendor is the exact test.
  //
  // 🔴 AND ONLY WITH TIME LEFT. A vendor read can take tens of seconds, and spending the worker's
  // remaining deadline on bookkeeping would turn an observation into a killed job — which
  // `fail_document_parse` would then record as this document's failure.
  const wasVendorRead = (parsed.readBy ?? "").startsWith("mistral/") || (parsed.readBy ?? "").startsWith("llamaparse/");
  const msLeft = DEADLINE_ABORT_MS - (Date.now() - startedAt);
  if (finished.outcome === "parsed" && !wasVendorRead && msLeft > SHADOW_RESERVE_MS) {
    try {
      const shadow = await runShadowEvaluation({
        admin,
        bytes,
        contentHash,
        fileName,
        kind: parsed.kind,
        mimeType,
        routeReason: parsed.routeReason ?? "unrecorded",
        shipped: parsed,
        sourceId: job.id,
        userId: job.user_id,
      });
      if (!shadow.ran) {
        console.info(JSON.stringify({ event: "parse_shadow_skipped", sourceId: job.id, why: shadow.why }));
      }
    } catch (cause) {
      // A check that can break the thing it is checking is not a check.
      console.warn(JSON.stringify({
        event: "parse_shadow_failed",
        detail: cause instanceof Error ? cause.message.slice(0, 200) : "unknown",
      }));
    }
  }

  return finished;
}

/**
 * Time the worker keeps back for itself before it will start a shadow evaluation.
 *
 * A vendor read of a lecture is tens of seconds, and the worker aborts itself at `DEADLINE_ABORT_MS`.
 * Starting one with less than this left trades a bookkeeping row for a killed invocation.
 */
const SHADOW_RESERVE_MS = 90_000;

/**
 * Is this the last time this row will ever be handed out?
 *
 * The attempt counter increments AT CLAIM, and the claim predicate is
 * `parse_attempts < max_attempts` — so a row we are holding whose counter has
 * already reached the maximum will never be claimed again. Anything that defers
 * work to "the next attempt" has to know that, or it defers into nothing.
 *
 * Conservative on every uncertainty: an unreadable counter or an unreachable
 * limit both answer TRUE, which routes the document to the parser that always
 * finishes inside one invocation.
 */
async function isFinalClaim(admin: ReturnType<typeof adminClient>, job: ClaimedSource): Promise<boolean> {
  const attempts = typeof job.parse_attempts === "number" ? job.parse_attempts : null;
  if (attempts === null) return true;
  const { data, error } = await admin.rpc("document_parse_max_attempts");
  if (error || typeof data !== "number") {
    console.warn(JSON.stringify({ event: "parse_max_attempts_unreadable", detail: error?.message.slice(0, 120) }));
    return true;
  }
  return attempts >= data;
}

/**
 * Hand one document to the sidecar, resuming a conversion if one is in flight.
 *
 * 🔴 THE ORIGINAL BYTES ARE NEVER REPLACED BY WHAT COMES BACK. The sidecar is
 * handed a copy and returns a description; storage still holds the file the
 * student uploaded, and the content hash was taken before any of this ran. If
 * this lane is switched off tomorrow, nothing has to be undone.
 *
 * Every failure here is a FALLBACK, never a verdict about the file. The one
 * outcome that is not a fallback is `pending`, which means the conversion is
 * genuinely still running and the caller should hand the job back rather than
 * either waiting or giving up.
 */
async function runDoclingLane(input: {
  admin: ReturnType<typeof adminClient>;
  budgetMs: number;
  bytes: Uint8Array;
  config: DoclingServiceConfig;
  fileName: string;
  heartbeat: () => Promise<boolean>;
  job: ClaimedSource;
  kind: DoclingKind;
}): Promise<
  | { status: "parsed"; parsed: ParsedDocument; ms: number }
  | { status: "pending" }
  | { status: "lease-lost" }
  | { status: "fallback"; reason: string }
> {
  const { admin, config, job } = input;
  const token = job.parse_lease_token;
  const started = Date.now();

  /**
   * Write, or clear, the task id — best effort on purpose.
   *
   * The migration that adds the column is optional, so this RPC may not exist.
   * When it does not, we lose the ability to RESUME, which costs the long tail
   * its tables; we do not lose correctness, and we must not turn a missing
   * migration into a failed parse.
   */
  const rememberTask = async (taskId: string | null): Promise<boolean> => {
    const { error } = await admin.rpc("set_document_parse_task", {
      p_source_id: job.id,
      p_task_id: taskId,
      p_token: token,
    });
    if (error) {
      console.warn(JSON.stringify({ event: "docling_task_id_unavailable", detail: error.message.slice(0, 120) }));
      return false;
    }
    return true;
  };

  // A task from an earlier attempt, if the column exists and it is still young
  // enough to be worth waiting for. An id older than the whole task budget is
  // abandoned rather than resumed — otherwise a conversion that never finishes
  // would be resumed on every attempt until the document ran out of them.
  const existing = (job.parse_external_task_id ?? "").trim();
  const startedAtIso = job.parse_external_started_at ?? null;
  const spentMs = startedAtIso ? Math.max(0, Date.now() - Date.parse(startedAtIso)) : 0;
  const resumable = existing && (!startedAtIso || spentMs < config.taskBudgetMs);
  if (existing && !resumable) {
    await rememberTask(null);
    return { status: "fallback", reason: doclingFallback("task-budget-exhausted", `${Math.round(spentMs / 1000)}s`) };
  }

  let taskId = resumable ? existing : "";
  if (!taskId) {
    const submitted = await submitDoclingTask(input.bytes, input.fileName, config);
    if (!submitted.ok) {
      return { status: "fallback", reason: doclingFallback(submitted.reason, submitted.detail) };
    }
    taskId = submitted.taskId;
    // Persisted BEFORE the wait, so an invocation that dies mid-poll still
    // leaves the id behind for its successor. Persisting afterwards would mean
    // the only crash that loses work is the one most likely to happen.
    await rememberTask(taskId);
  }

  const waited = await awaitDoclingTask(taskId, config, {
    budgetMs: input.budgetMs,
    heartbeat: input.heartbeat,
    spentMs: resumable ? spentMs : 0,
  });

  if (!waited.ok) {
    if (waited.reason === "still-running") return { status: "pending" };
    if (waited.reason === "lease-lost") return { status: "lease-lost" };
    await rememberTask(null);
    return { status: "fallback", reason: doclingFallback(waited.reason, waited.detail) };
  }

  // The result is in hand; the task must not be resumed by a later attempt.
  await rememberTask(null);

  // 🔴 PDF.JS EARNS ITS PLACE ON THIS LANE BY ANSWERING ONE QUESTION. Docling's
  // export says nothing about which pages RapidOCR rescued, so without this the
  // coverage record would call a scanned page "native" — a document read from
  // pixels reported as though it had real embedded text. The probe returns text
  // PRESENCE and page size, nothing else: no blocks, no reading order, no
  // structure. A second structure engine is what this integration removes.
  //
  // It runs on a COPY. pdf.js takes ownership of the buffer it is handed, and
  // `bytes` is still needed for the fallback parse below.
  let nativeText: ReadonlyMap<number, boolean> | undefined;
  if (input.kind === "pdf") {
    try {
      nativeText = nativeTextMap(await probePdfNativeText(new Uint8Array(input.bytes)));
    } catch (caught) {
      // A probe that will not open the file is not a reason to lose a good
      // conversion — but it IS a reason not to publish a native/OCR split we
      // cannot support. `buildDoclingParse` refuses without the map for a PDF,
      // so this becomes a fallback rather than a flattering guess.
      console.warn(JSON.stringify({ event: "docling_native_probe_failed", detail: sanitizeError(caught) }));
    }
  }

  // 🔴 PDF.JS'S THIRD AND LAST JOB ON THIS LANE: DECODED PIXELS, NOT STRUCTURE.
  // Docling detects a picture and never looks at one. `structural.model` is
  // handed to `buildDoclingParse` ONLY so `matchFigureImages` can pair its
  // rectangles with `figureImages` by geometry — nothing here reads its blocks,
  // text or reading order. A failure is a missing description, not a failed
  // parse: every figure just keeps its honest `not-examined` state.
  let pdfFigures: { model: DocumentModel; images: ReadonlyMap<string, CapturedFigure> } | undefined;
  if (input.kind === "pdf") {
    try {
      const structural = await readPdfStructure(new Uint8Array(input.bytes), { captureFigures: true });
      pdfFigures = { model: structural.model, images: structural.figureImages };
    } catch (caught) {
      console.warn(JSON.stringify({ event: "docling_figure_capture_failed", detail: sanitizeError(caught) }));
    }
  }

  const outcome = await buildDoclingParse({
    document: waited.document,
    kind: input.kind,
    status: waited.status,
    title: job.title,
    ...(nativeText ? { nativeText } : {}),
    ...(pdfFigures ? { pdfFigures } : {}),
  });
  if (!outcome.ok) {
    const detail = outcome.reason === "unreconciled" ? outcome.detail : outcome.reason;
    return { status: "fallback", reason: doclingFallback("unusable-result", detail) };
  }
  return { status: "parsed", parsed: outcome.document, ms: Date.now() - started };
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
/**
 * 🔴 DELEGATES, RATHER THAN COUNTING AGAIN. This function used to read
 * `coverage.figures.total` — a field `FigureCoverage` does not have — through a
 * cast that hid it from the compiler, so this lane wrote `visual_count = 0` for
 * every document it ever parsed while the upload lane wrote the real number.
 * `rowCounts` is now the single definition both lanes call.
 */
function countsFor(parsed: ParsedDocument): { units: number; visuals: number } {
  return rowCounts(parsed.coverage, parsed.model?.units.length ?? 0);
}
