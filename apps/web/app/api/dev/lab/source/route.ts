/**
 * "Open in Tutor Lab" — the one moment Nemesis Lab writes anything.
 *
 * 🔴🔴 PERSISTENCE IS AN EXPLICIT ACT, AND IT IS HERE RATHER THAN IN THE INSPECTOR ON PURPOSE.
 * The parser inspector must be able to look at a file without putting it anywhere; the Tutor Lab
 * cannot run at all without durable rows, because `knowledgeSignature` keys on
 * `canvas.sources[].librarySourceId` and `ensureKnowledgeForCanvas` reads knowledge that outlives
 * the canvas. Those two requirements are opposites, so the seam between them is a button.
 *
 * 🔴 EVERY ROW BELONGS TO THE LAB LEARNER. See lib/lab/learner.ts: a dedicated account that owns
 * nothing else, so the owner's Library, histories, evidence and experiment assignments are
 * untouched, and reset is a delete by user id rather than a guess about who made what.
 *
 * 🔴 IT USES THE PRODUCTION WRITE PATH, NOT A LAB COPY OF IT. `parseDocument` reads, the bytes go
 * to the same bucket under the same `<uid>/…` prefix the storage policy requires, `library_sources`
 * gets the same columns the Library's own insert writes, `storeFigureAssets` +`attachFigureAssets`
 * put the pictures where the learner can be shown them, and `persistParse` records the parse
 * through `record_parsed_document` — the RPC whose "never replace a complete parse with a worse
 * one" rule lives in the database. A shortcut anywhere here would mean the Tutor Lab was teaching
 * from a document shaped differently from a real upload, and every finding would be about the Lab.
 */
import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { labRouteRefusal } from "@/lib/lab/gate";
import { ensureLabLearner, labEnvironment } from "@/lib/lab/learner";
import { attachFigureAssets, FIGURE_ASSET_BUCKET, storeFigureAssets } from "@/lib/notebooks/figure-assets";
import { contentHashOf, persistParse, type ParsedDocKind } from "@/lib/notebooks/parse-record";
import { parseDocument } from "@/lib/notebooks/parse-document";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Formats `parsed_documents.doc_kind` accepts. `image` and the rest map straight through. */
const DOC_KINDS: readonly string[] = ["pdf", "pptx", "docx", "xlsx", "csv", "image", "text", "html"];

export async function POST(req: Request): Promise<Response> {
  const refusal = labRouteRefusal();
  if (refusal) return refusal;

  const env = labEnvironment();
  if (!env.ok) {
    return NextResponse.json(
      { error: `Nemesis Lab needs ${env.missing} in apps/web/.env.local before it can save a source.` },
      { status: 503 },
    );
  }
  const learner = await ensureLabLearner();
  if (!learner.ok) return NextResponse.json({ error: learner.error }, { status: 503 });
  const uid = learner.learner.userId;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = contentHashOf(bytes);
  // pdf.js detaches what it is handed, and the bytes are needed afterwards for the upload.
  const outcome = await parseDocument(bytes.slice(), file.name, file.type, {
    // 🔴 THE WORKER'S SETTING, NOT THE UPLOAD ROUTE'S. The Tutor Lab teaches from diagrams, and a
    // document whose pictures were never examined would make every figure finding a finding about
    // the Lab. This is the background lane, where a document is allowed to cost minutes.
    lookAtFigures: form?.get("figures") !== "skip",
  });
  if (!outcome.ok && outcome.reason !== "no-text") {
    return NextResponse.json({ error: `Nemesis could not read this file: ${outcome.reason}.` }, { status: 422 });
  }
  const parsed = outcome.ok ? outcome.document : outcome.document;
  const normalized = outcome.ok ? (outcome.figures ?? []) : (outcome.figures ?? []);

  const admin = createClient(env.url, env.service, { auth: { persistSession: false } });

  // ── the bytes ──────────────────────────────────────────────────────────────
  // 🔴 `<uid>/…` IS REQUIRED, NOT TIDY. The bucket's row-level policy matches on the FIRST path
  // segment; an object stored anywhere else is written by the service role and then unreadable by
  // the learner who owns it, which is how a previous feature stored recordings that nothing could
  // ever play back.
  const storagePath = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120)}`;
  const uploaded = await admin.storage
    .from("library-sources")
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploaded.error) {
    return NextResponse.json({ error: `Could not store the file: ${uploaded.error.message}` }, { status: 502 });
  }

  // ── the pictures ───────────────────────────────────────────────────────────
  let model = parsed.model;
  if (model && normalized.length > 0) {
    const stored = await storeFigureAssets(
      {
        put: async (path, pixels, mime) => {
          const { error } = await admin.storage
            .from(FIGURE_ASSET_BUCKET)
            .upload(path, pixels, { contentType: mime, upsert: true });
          return !error;
        },
      },
      uid,
      normalized,
    );
    model = attachFigureAssets(model, stored.byEntry);
  }

  // ── the source row ─────────────────────────────────────────────────────────
  const inserted = await admin
    .from("library_sources")
    .insert({
      bucket: "library-sources",
      file_name: file.name.slice(0, 512),
      folder_path: "Nemesis Lab",
      mime_type: file.type || null,
      size_bytes: bytes.byteLength,
      storage_path: storagePath,
      user_id: uid,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    return NextResponse.json(
      { error: `Could not file this source: ${inserted.error?.message ?? "no row returned"}` },
      { status: 502 },
    );
  }
  const sourceId = (inserted.data as { id: string }).id;

  // ── the parse ──────────────────────────────────────────────────────────────
  const docKind = (DOC_KINDS.includes(parsed.kind) ? parsed.kind : "text") as ParsedDocKind;
  const recorded = await persistParse({
    contentHash,
    coverage: parsed.coverage,
    docKind,
    ...(model ? { model } : {}),
    ...(parsed.readBy ? { readBy: parsed.readBy } : {}),
    sourceId,
    text: parsed.text,
    title: parsed.title,
    userId: uid,
  });
  if (!recorded.ok) {
    return NextResponse.json({ error: `Could not record the parse (${recorded.reason}).` }, { status: 502 });
  }

  return NextResponse.json({
    fileName: file.name,
    learnerId: uid,
    sourceId,
    state: parsed.coverage.state,
    units: parsed.coverage.units,
  });
}
