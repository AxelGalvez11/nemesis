// File source extraction — turns an uploaded PDF / Word / PowerPoint / photo into text server side
// (Node runtime: unpdf + fflate need it) and hands that text back to the client, which writes its own
// rows under its own RLS session.
//
// It makes exactly ONE kind of DB write of its own, and only on the by-reference path: the durable
// record of what the parse achieved (lib/notebooks/parse-record.ts). That cannot be left to the
// client, because coverage is a MEASUREMENT the server made — a client able to write it could tell
// itself its own half-read lecture was complete.
//
// It is the single chokepoint for every upload lane — Library import, coursework import, notebook
// sources, chat attachments and the syllabus reader — so the scanned-PDF vision fallback below
// reaches all of them from one place.
//
// 🔴 TWO WAYS IN, AND THE SECOND ONE IS THE REAL ONE.
//
//   1. `multipart/form-data` with a `file` part — the original shape. Still supported, still used
//      for small files, and CAPPED BY THE PLATFORM, NOT BY US: Vercel refuses a request body over
//      ~4.5 MB at the edge with a plain-text FUNCTION_PAYLOAD_TOO_LARGE, before any line of this
//      file runs. Measured against production on 2026-08-05: 4.4 MB reaches the handler, 4.6 MB
//      does not. For two years the code, the comments and the UI all said 25 MB.
//
//   2. `application/json` naming an object ALREADY in private storage. The browser uploads under
//      its own RLS session — which the chat and Library lanes were doing anyway — and posts a
//      reference. Nothing large travels through the function, so the ceiling becomes ours to pick
//      (MAX_SOURCE_BYTES) instead of the platform's.
//
// The reference is attacker-controlled and is read with the SERVICE ROLE, which bypasses RLS. Every
// safeguard for that lives in lib/notebooks/ingest-ref.ts; do not inline a shortcut here.
//
// Secrets: none required to PARSE. GEMINI_API_KEY is read only if present, to enable the vision
// fallback (lib/pdf/vision.ts) — and because it IS present in production, this route can turn an
// upload into a billed API call on our account. That is why the gate below is a real lookup.
import { NextResponse } from "next/server";

import { type ExtractionCoverage } from "@nemesis/shared";
import { bearerFrom, verifyDeviceKey } from "@/lib/device-key";
// 🔴 THE PARSING IMPORTS ARE GONE ON PURPOSE. This route used to import the
// PDF, Word, PowerPoint and vision readers directly and re-derive coverage from
// them, which made it a second copy of decisions that also live in
// `parse-document.ts`. It now imports one function. A route that cannot see the
// extractors cannot quietly disagree with the worker about what a page is.
import { singleUnitCoverage } from "@/lib/notebooks/extract-coverage";
import { needsFigureEnrichment, requestFigureEnrichment } from "@/lib/notebooks/parse-enqueue";
import { fetchIngestSource } from "@/lib/notebooks/ingest-fetch";
import { contentHashOf, persistParse, recordSummary } from "@/lib/notebooks/parse-record";
import { reuseStoredParse } from "@/lib/notebooks/parse-reuse";
import { kindFor, parseDocument, sniffKind } from "@/lib/notebooks/parse-document";
import { noTextMessage } from "@/lib/notebooks/parse-message";
import { MAX_INLINE_UPLOAD_BYTES, MAX_SOURCE_BYTES, readIngestRef } from "@/lib/notebooks/ingest-ref";
import { visionConfigured, visionMime, VISION_MAX_BYTES } from "@/lib/vision/gemini";

export const runtime = "nodejs";
/** A picture-heavy lecture now costs several transcription calls in waves of
 *  three. The worst file in a real 83-PDF course needs 26 pages read — four
 *  requests, two waves — so the old implicit budget is no longer obviously
 *  enough to state by omission. */
export const maxDuration = 300;


/** The one place the ceiling is put into words, so the number a student reads
 *  can never drift from the number the code enforces — which is exactly how
 *  "25 MB max" survived for months against a real limit of 4.5. */
function sizeMessage(): string {
  return `That file is too large (${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MB max).`;
}

/**
 * 🔴 WHICH FORMATS EXIST IS NOT THIS FILE'S OPINION — AND IT USED TO BE.
 *
 * This route carried its own private `kindFor`/`sniffKind`, written before the
 * canonical pair moved to lib/, and the worker route already imported the real
 * ones. So the two lanes disagreed about what a file even IS. When .xlsx support
 * landed, `parse-document.ts` learned about spreadsheets, the worker learned with
 * it, and this route — the door EVERY interactive upload comes through — kept
 * refusing them with 415 "Unsupported file". A complete parser behind a shut door
 * looks exactly like a missing parser to a student.
 *
 * Found by uploading a real workbook to production. Every unit test passed,
 * because they all tested the canonical copy.
 *
 * The old comment here said these were not exported because Next rejects extra
 * exports from a route file, and that the fix was to move them to lib/ if anyone
 * else needed them. They were moved. This is the other half of that move.
 */
const supportedFormats = "a photo, a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx)";

export async function POST(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  // 🔴 RESOLVE the device key; do not glance at how it starts.
  //
  // This used to be `bearer.startsWith("nmk_")` and nothing else, which is a
  // SHAPE check wearing an auth check's clothes. The sibling URL route and
  // /api/workspace/search carry the same-looking line and are fine, because both
  // FORWARD the header to a Supabase function that resolves it. This route
  // forwards it nowhere — so the line that read identically was, here, the only
  // thing between a made-up string and a Gemini bill on our key.
  //
  // lib/device-key.ts was written for exactly this (PR #284) and was never
  // imported by anything but its own test. A fix that is not wired in is not a
  // fix; grep for the CALLER, not the helper.
  const check = await verifyDeviceKey(bearerFrom(req.headers.get("authorization")));
  if (!check.ok) {
    // "unavailable" means our lookup broke, not that the caller is an impostor —
    // 503 so a database blip reads as "try again", never as "your device is
    // broken", and never as a pass.
    return check.reason === "unavailable"
      ? NextResponse.json({ error: "Can't check this device right now. Try again in a moment." }, { status: 503 })
      : NextResponse.json({ error: "This device needs to re-connect to your account. Try again." }, { status: 401 });
  }

  // ── Getting the bytes ───────────────────────────────────────────────────────
  // JSON means "it is already in storage, go and read it". Anything else is the
  // old multipart form. The content type decides, so a client that sends neither
  // gets one clear answer rather than a parse error from whichever branch ran.
  let sourceBytes: Uint8Array;
  // Set only on the by-reference path. Without a stored row there is nothing to
  // attach a durable parse record to, so the multipart lane keeps its old
  // behaviour of returning the text and writing nothing.
  let sourceId: string | null = null;
  let sourceName: string;
  let sourceType: string;
  const byRef = (req.headers.get("content-type") ?? "").includes("application/json");

  if (byRef) {
    const body = (await req.json().catch(() => null)) as unknown;
    const ref = readIngestRef(body);
    if (!ref.ok) {
      return NextResponse.json({ error: "Expected an uploaded file to read." }, { status: 400 });
    }
    const fetched = await fetchIngestSource(ref.ref, check.userId);
    if (!fetched.ok) {
      if (fetched.reason === "missing") {
        // ONE answer for "no such row" and "not your row" — they are the same
        // query result, so this cannot be used to discover which ids exist.
        return NextResponse.json(
          { error: "That upload isn't there any more. Try adding the file again." },
          { status: 404 },
        );
      }
      if (fetched.reason === "too-large") {
        return NextResponse.json({ error: sizeMessage() }, { status: 413 });
      }
      return NextResponse.json({ error: "Can't reach storage right now. Try again in a moment." }, { status: 503 });
    }
    sourceId = ref.ref.sourceId;
    sourceBytes = fetched.source.bytes;
    sourceName = fetched.source.fileName;
    sourceType = fetched.source.mimeType ?? "";
  } else {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    // This branch can only ever see a small file — the platform rejects the rest
    // before we run — so the message says what to do rather than restating a
    // limit the caller already blew past.
    if (file.size > MAX_INLINE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "That file is too large to send directly. Upload it to your Library first." },
        { status: 413 },
      );
    }
    sourceBytes = new Uint8Array(await file.arrayBuffer());
    sourceName = file.name;
    sourceType = file.type;
  }

  const sourceSize = sourceBytes.byteLength;
  const bytes = sourceBytes;
  // Name first (cheap and right almost always), contents second (right when a name
  // has lost its extension). Refusing only after both have failed.
  const kind = kindFor(sourceName, sourceType) ?? sniffKind(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: `Unsupported file. Add ${supportedFormats}.` },
      { status: 415 },
    );
  }
  // The defensive copy, paid ONLY by the format that needs it.
  //
  // pdf.js detaches whatever ArrayBuffer it is handed, so every later reader of
  // these bytes — the page slicer, a second sniff — would silently see zeros.
  // That is real, and it is a property of pdf.js alone: the Office readers copy
  // nothing and detach nothing.
  //
  // 🔴 It used to be unconditional, which made it a second full-size allocation
  // on EVERY upload. On the owner's 118 MiB lecture that was 116 MiB of heap
  // spent to protect a code path a .pptx never enters. Measured: it was the
  // third of three copies that took the old route to 676 MiB of RSS.
  const original = kind === "pdf" ? new Uint8Array(bytes) : bytes;
  if (kind === "image") {
    if (sourceSize > VISION_MAX_BYTES) {
      return NextResponse.json({ error: "That picture is too large (14 MB max)." }, { status: 413 });
    }
    if (!visionConfigured()) {
      return NextResponse.json({ error: "Reading photos isn't switched on for this app yet." }, { status: 503 });
    }
  }
  console.info(JSON.stringify({
    event: "file_extract_started",
    requestId,
    kind,
    byRef,
    bytes: sourceSize,
    mime: sourceType || "unknown",
  }));

  try {
    // ── Have we already read exactly these bytes for this person? ──────────
    //
    // 🔴 THE SAME QUESTION THE WORKER ASKS, ASKED HERE FOR THE SAME REASON. A student who
    // re-uploads last week's lecture, or files one document into a second folder, has already paid
    // for it. Production had 21 hashed sources and 19 distinct hashes on the day this was written.
    //
    // 🔴 THE STORED PARSE IS READ THROUGH THE REAL ENVELOPE VALIDATOR, NEVER TRUSTED BY SHAPE.
    // `readStructureEnvelope` is what every other consumer of `parsed_documents` goes through, and
    // a row it cannot read is a row this lane declines to reuse — falling through to the parser,
    // which is what happened before this block existed.
    const reusable = sourceId ? await reuseStoredParse(check.userId, sourceId, contentHashOf(original)) : null;
    if (reusable) {
      console.info(JSON.stringify({
        event: "file_extract_reused",
        requestId,
        kind,
        parsedDocumentId: reusable.parsedDocumentId,
        parserVersion: reusable.parserVersion,
      }));
      // 🔴 THE SAME RESPONSE SHAPE THE PARSING PATH RETURNS, FIELD FOR FIELD. A caller must not be
      // able to tell a reused parse from a fresh one by the shape of what it received — a
      // second, thinner response would be a second contract, and the first client to branch on its
      // absence would make reuse a visible product behaviour instead of an invisible saving.
      return NextResponse.json({
        bytes: sourceSize,
        coverage: reusable.coverage,
        kind,
        parsedDocumentId: reusable.parsedDocumentId,
        text: reusable.text,
        title: reusable.title ?? (sourceName.replace(/\.[^.]+$/, "").trim() || "Untitled document"),
        ...(reusable.model ? { model: reusable.model } : {}),
        ...(reusable.readBy ? { readBy: reusable.readBy } : {}),
      });
    }

    // 🔴 ONE PARSER, CALLED HERE AND BY THE WORKER. This block used to be a
    // ~150-line copy of the same decisions — which file kinds route to vision,
    // when a page counts as thin, what becomes coverage — and the file it was
    // copied from says exactly why that is not survivable: the same document
    // would get two different coverage records depending on which lane reached
    // it, and `parsed_documents` would keep whichever wrote last.
    //
    // The shared parser also returns the canonical model, which is what carries
    // Word's structure and a PDF's figures past this request.
    const outcome = await parseDocument(original, sourceName, sourceType);
    if (!outcome.ok && outcome.reason === "too-large-image") {
      return NextResponse.json({ error: "That picture is too large (14 MB max)." }, { status: 413 });
    }
    if (!outcome.ok && outcome.reason === "vision-unavailable") {
      return NextResponse.json({ error: "Reading photos isn't switched on for this app yet." }, { status: 503 });
    }
    if (!outcome.ok && outcome.reason === "unsupported") {
      return NextResponse.json({ error: "That file type isn't supported yet." }, { status: 415 });
    }
    // 🔴 `no-text` IS A REFUSAL THAT STILL HAS A DOCUMENT. A scan has nothing to
    // return to the student and plenty to remember: units, figures, geometry.
    // Treating it as `null` here is what discarded that model before #486.
    const parsed = outcome.ok || outcome.reason === "no-text" ? outcome.document : null;
    const result = { text: parsed?.text ?? "", title: parsed?.title ?? null };
    const readBy = parsed?.readBy;
    const skippedFigures = parsed?.skippedFigures ?? 0;
    // 🔴 ALWAYS SET, for every format and every outcome. It used to be optional
    // and per-format, so "no coverage field" meant both "read completely" and
    // "nobody computed it" — and the caller could not tell which. A record that
    // is absent cannot be checked; a record that is always present can.
    const coverage: ExtractionCoverage =
      parsed?.coverage ?? singleUnitCoverage({ read: false, method: "native" });
    const text = result.text;

    // ── The durable record ─────────────────────────────────────────────────
    // 🔴 BEFORE THE `!text` RETURN, NOT AFTER IT, AND THAT ORDER IS THE FIX.
    // What survives a reload must be the same account of the same parse the
    // caller receives — including when the account is "this file is pictures".
    // Written for the by-reference lane only: a multipart upload has no stored
    // row to attach a parse to, and inventing one would create a source the
    // student never asked us to keep.
    //
    // Best-effort by design. A student who cannot add their lecture because a
    // bookkeeping write timed out has lost more than the caveat was worth, so a
    // failure here is logged and the extraction still succeeds — but it is a
    // failure, and `persisted` says so rather than the response implying a
    // record exists.
    let parsedDocumentId: string | null = null;
    if (sourceId && parsed) {
      const saved = await persistParse({
        contentHash: contentHashOf(original),
        coverage,
        docKind: kind,
        sourceId,
        text,
        title: result.title,
        ...(readBy ? { readBy } : {}),
        userId: check.userId,
        // 🔴 THE STRUCTURE HAS TO SURVIVE THE REQUEST. Everything downstream —
        // chat, retrieval, study generation, the reader — loads from
        // `parsed_documents`, so a model computed here and not written is a
        // model that dies with the upload. That is the same defect Phase 3 had
        // one layer down, where Word's structure was rendered to a string and
        // thrown away at the function boundary.
        ...(parsed.model ? { model: parsed.model } : {}),
      });
      if (saved.ok) parsedDocumentId = saved.parsedDocumentId;
    }

    // 🔴 THE FIGURE PASS THIS PARSE COULD NOT AFFORD, ASKED FOR ANYWAY — JUST NOT ON THIS REQUEST.
    // This lane never sets `lookAtFigures` (see `parseDocument`'s own doc comment on that option):
    // up to 40 vision calls is latency a student should not wait through here. That used to be
    // where the story ended — the only thing that ever set `lookAtFigures: true` is the background
    // worker, and the only thing that ever asked the worker for THIS source was a person clicking a
    // control that, measured, nothing in the product renders for a source in this state. The owner
    // decided (2026-08-20): uploading means everything gets read, not "everything the synchronous
    // request could afford". So a document that still owes the student a described picture gets one
    // ask, here, for the SAME background pass a manual reprocess already triggers today — not a new
    // mechanism, the existing one, reached automatically instead of by a button that did not exist.
    //
    // Scoped to a source that just received its OWN first durable parse: `parsedDocumentId` is only
    // set above on the by-reference lane, and only once `persistParse` actually wrote a row. A
    // REUSED parse (the early `if (reusable)` return above) never reaches here at all — reuse is
    // keyed on `(user, content hash)`, not on this placement, so the very first parse of these bytes
    // is the only one that ever asks, and re-attaching the same file elsewhere costs nothing more.
    //
    // One extra awaited round trip (a Supabase read, then a write) on the request the student is
    // already waiting on — no HTTP call to the worker, no nudge: `pg_cron` claims an enqueued row
    // within a minute on its own, and nobody is watching for this one the way a person who clicked
    // "read again" is. Never allowed to fail the upload: `requestFigureEnrichment` cannot throw, and
    // its result is logged, not surfaced — the student already has their document either way.
    if (sourceId && parsedDocumentId && needsFigureEnrichment(coverage)) {
      const enrichment = await requestFigureEnrichment(sourceId, check.userId);
      console.info(JSON.stringify({
        event: "figure_enrichment_requested",
        decision: enrichment.ok ? enrichment.decision.action : null,
        reason: enrichment.ok ? null : enrichment.reason,
        requestId,
        sourceId,
      }));
    }

    if (!text) {
      console.warn(JSON.stringify({
        event: "file_extract_empty",
        requestId,
        kind,
        readBy: readBy ?? null,
        // Distinguishes "nothing at all" from "pictures we cannot read", which
        // are different bugs and were the same log line until now.
        figures: coverage.figures.found,
        structural: Boolean(parsed?.model),
        persisted: parsedDocumentId !== null,
        durationMs: Date.now() - startedAt,
      }));
      return NextResponse.json({ error: noTextMessage(kind, coverage) }, { status: 422 });
    }

    const baseName = sourceName.replace(/\.[^.]+$/, "").trim();
    console.info(JSON.stringify({
      event: "file_extract_completed",
      requestId,
      kind,
      readBy: readBy ?? "text",
      chars: text.length,
      // Logged so a partial read is findable in production without a student
      // having to report one. `state` is the field to alert on.
      ...recordSummary(coverage),
      unitsUnread: coverage.unitsUnread,
      figuresSkipped: coverage.figures.skipped,
      persisted: parsedDocumentId !== null,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({
      kind,
      title: result.title ?? (baseName || "Untitled document"),
      text,
      bytes: sourceSize,
      // Present only when the pages had to be read as images, so a caller (and
      // the student) can tell a transcription apart from an exact text layer.
      ...(readBy ? { readBy } : {}),
      // Present only when a deck had more figures than the per-deck cap, so a
      // partial read is never presented as a complete one.
      ...(skippedFigures > 0 ? { skippedFigures } : {}),
      // 🔴 ALWAYS PRESENT. What was read and what was not — pages/slides read
      // natively, read as pixels, read both ways, and left unread; figures kept
      // and skipped with reasons; every cut with its stage and amount.
      //
      // Unconditional on purpose. While this was optional, its absence was
      // ambiguous between "complete" and "nobody computed it", and every client
      // resolved that ambiguity the flattering way.
      coverage,
      // 🔴 THE STRUCTURE HAS TO REACH THE CLIENT, NOT ONLY THE DATABASE. Until
      // now this model was computed here, written to `parsed_documents`, and
      // left out of the response — so chat, Canvas and every import received
      // `text` and re-derived the structure from it with a regular expression.
      // That is the same defect as the persistence one a few lines above, one
      // boundary further out: a table came back as a paragraph of pipes and a
      // heading was a guess.
      //
      // Absent when a format produces no structure (an image) or the structural
      // reader could not open the file, which a consumer must read as UNKNOWN —
      // falling back to the text path — never as "this document is flat".
      ...(parsed?.model ? { model: parsed.model } : {}),
      // The durable record's id, when one was written. Absent on the multipart
      // lane (nothing to attach to) and when the write failed — and absent is
      // read as "no record", never as "the record says it was fine".
      ...(parsedDocumentId ? { parsedDocumentId } : {}),
    });
  } catch (err) {
    console.error(JSON.stringify({
      event: "file_extract_failed",
      requestId,
      kind,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message.slice(0, 300) : "unknown",
    }));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read that file." },
      { status: 422 },
    );
  }
}
