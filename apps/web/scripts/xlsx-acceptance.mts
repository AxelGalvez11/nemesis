/**
 * Does a real workbook survive the WHOLE production chain?
 *
 * upload → private bucket → the live parse route → persistence → read the row
 * back → DECODE it → the seven acceptance properties → address a cell.
 *
 * 🔴 PARSER SUCCESS IN MEMORY IS NOT THE CLAIM (owner). Everything this checks
 * has already passed locally, in `lib/notebooks/xlsx-acceptance.test.ts`, with
 * the identical assertions. The only thing this run adds is the part no unit
 * test can reach: bytes that actually travelled through storage, a route
 * running deployed code, a JSONB column, and the decoder on the way back.
 *
 * 🔴 IT DECODES, IT DOES NOT PEEK. The stored JSON is passed through
 * `readDocumentModel` — the same validator every consumer goes through — and a
 * null there ends the run. Reading fields straight off `row.structure` would
 * prove the bytes are present while saying nothing about whether anything can
 * read them, which is the exact failure this whole chain keeps having.
 *
 *   set -a; . /path/to/.env; set +a
 *   NEMESIS_ACCEPTANCE_USER_ID=<uuid> npx tsx scripts/xlsx-acceptance.mts
 *   NEMESIS_ACCEPTANCE_USER_ID=<uuid> npx tsx scripts/xlsx-acceptance.mts --cleanup <sourceId>
 *
 * Run with cwd `apps/web` — `@/lib/...` does not resolve from the repo root.
 *
 * SECRETS: the service role key and the app URL come from the environment and
 * are never printed. The device key minted below exists only in this process's
 * memory; only its SHA-256 is written, and it is revoked before the script
 * exits, on every path.
 */

import { createHash, randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { readDocumentModel } from "../../../packages/shared/src/document-envelope.ts";
import { xlsxAcceptance, addressCell } from "../lib/notebooks/xlsx-acceptance.ts";
import { buildSourceContext, sourceContextFromModel } from "../lib/sources/source-context.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const BUCKET = "library-sources";
/** 🔴 PROVENANCE, NOT A TIMESTAMP. Cleanup deletes by the id this run printed and
 *  by this marker — never by "rows created around when I was running", which has
 *  already caught the owner's own rows once. */
const MARKER = "ACCEPTANCE-PROBE-xlsx";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const url = process.env.SUPABASE_URL || need("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const appUrl = process.env.NEMESIS_APP_URL || "https://app.enternemesis.com";
const userId = need("NEMESIS_ACCEPTANCE_USER_ID");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function cleanup(sourceId: string) {
  const { data } = await db
    .from("library_sources")
    .select("id,file_name,storage_path,parsed_document_id")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return console.log(`no source ${sourceId} — nothing to clean`);
  if (!String(data.file_name).startsWith(MARKER)) {
    // The safety rail: a row that is not ours by NAME is not ours to delete,
    // whatever id was typed.
    throw new Error(`refusing to delete ${sourceId}: file_name is not a ${MARKER} row`);
  }
  await db.storage.from(BUCKET).remove([String(data.storage_path)]);
  await db.from("library_sources").delete().eq("id", sourceId).eq("user_id", userId);
  if (data.parsed_document_id) {
    await db.from("parsed_documents").delete().eq("id", data.parsed_document_id).eq("user_id", userId);
  }
  console.log(`removed source ${sourceId}, its object and its parsed row`);
}

async function main() {
  const cleanupAt = process.argv.indexOf("--cleanup");
  if (cleanupAt >= 0) return await cleanup(process.argv[cleanupAt + 1] ?? "");

  const bytes = readFileSync(new URL("../lib/notebooks/fixtures/xlsx/acceptance.xlsx", import.meta.url));
  const storagePath = `${userId}/${randomUUID()}.xlsx`;
  const fileName = `${MARKER}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  console.log(`\nfixture ${bytes.byteLength} bytes → ${BUCKET}/${storagePath.split("/")[0]}/…`);

  // ── 1. the object, where the browser would have put it ───────────────────
  const put = await fetch(`${url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    body: new Uint8Array(bytes),
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": XLSX_MIME },
    method: "POST",
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status} ${await put.text()}`);

  // ── 2. the row that owns it ──────────────────────────────────────────────
  const { data: source, error: sourceError } = await db
    .from("library_sources")
    .insert({
      bucket: BUCKET,
      file_name: fileName,
      mime_type: XLSX_MIME,
      size_bytes: bytes.byteLength,
      storage_path: storagePath,
      user_id: userId,
    })
    .select("id")
    .single();
  if (sourceError) throw sourceError;
  const sourceId = source!.id as string;
  console.log(`source ${sourceId}   (clean up: --cleanup ${sourceId})`);

  // ── 3. a device key that exists for one request ──────────────────────────
  const deviceKey = `nmk_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(deviceKey, "utf8").digest("hex");
  const { error: keyError } = await db
    .from("device_keys")
    .insert({ key_hash: keyHash, label: `${MARKER} (temporary)`, user_id: userId });
  if (keyError) throw keyError;

  let failure: unknown = null;
  try {
    // ── 4. the live route, by reference — the lane that persists ───────────
    const started = Date.now();
    const response = await fetch(`${appUrl}/api/notebooks/extract/file`, {
      body: JSON.stringify({ sourceId }),
      headers: { authorization: `Bearer ${deviceKey}`, "content-type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as Record<string, unknown>;
    console.log(`\nPOST /api/notebooks/extract/file → ${response.status} in ${Date.now() - started}ms`);
    console.log(
      `  route said: kind=${body.kind} chars=${String(body.text ?? "").length} ` +
        `parsedDocumentId=${body.parsedDocumentId ?? "—"}`,
    );
    if (!response.ok) throw new Error(`route refused: ${JSON.stringify(body).slice(0, 400)}`);

    // ── 5. the row production actually wrote ───────────────────────────────
    // 🔴 NOT THE RESPONSE. The response is what the function believed; the row is
    // what survives. They have disagreed before.
    const { data: link } = await db
      .from("library_sources")
      .select("parsed_document_id")
      .eq("id", sourceId)
      .single();
    const parsedId = link?.parsed_document_id as string | null;
    if (!parsedId) throw new Error("library_sources.parsed_document_id is still null — nothing was persisted");
    if (body.parsedDocumentId && body.parsedDocumentId !== parsedId) {
      throw new Error(`the route reported ${body.parsedDocumentId} but the row points at ${parsedId}`);
    }

    const { data: row, error: rowError } = await db
      .from("parsed_documents")
      .select("id,doc_kind,parser_version,state,complete,unit_count,table_count,visual_count,structure,coverage,content_hash")
      .eq("id", parsedId)
      .single();
    if (rowError) throw rowError;
    console.log(
      `\nparsed_documents ${row!.id}\n  kind=${row!.doc_kind} state=${row!.state} complete=${row!.complete} ` +
        `units=${row!.unit_count} tables=${row!.table_count} visuals=${row!.visual_count} parser=${row!.parser_version}`,
    );

    // ONE WRITER. Inserting the source arms the background worker's queue, and this
    // repo has already had two lanes writing one column with different answers.
    const { count } = await db
      .from("parsed_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("content_hash", row!.content_hash);
    console.log(`  rows with this content hash: ${count} (must be 1)`);
    if (count !== 1) throw new Error(`${count} parsed_documents rows for one workbook — two writers`);

    // ── 6. decode, then assert ─────────────────────────────────────────────
    const structure = row!.structure as Record<string, unknown>;
    const model = readDocumentModel(structure.model ?? structure);
    if (!model) throw new Error("readDocumentModel returned null — the stored model does not decode");
    console.log(`  decoded: format=${model.format} units=${model.units.length} blocks=${model.blocks.length}\n`);

    const checks = xlsxAcceptance(model, sourceId);
    for (const check of checks) {
      console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.item}. ${check.name}\n          ${check.found}`);
    }

    // 🔴 THE DOOR CONSUMERS ACTUALLY USE. `xlsxAcceptance` addresses through
    // `sourceContextFromModel`, which needs a model someone already decoded. Every
    // real consumer starts from the stored COLUMN and calls `buildSourceContext`,
    // which unwraps the envelope itself and knows the legacy flat-string shape. If
    // the two ever disagree, that disagreement is the finding — so both run.
    const fromRow = buildSourceContext({ sourceId, sourceKind: "xlsx", structure: row!.structure });
    const fromModel = sourceContextFromModel({ model, sourceId, sourceKind: "xlsx" });

    // A second and third reference on different rows and columns — one cell
    // resolving could be arithmetic that happens to land; three cannot be.
    for (const [sheet, ref] of [["Ledger", "E7"], ["Ledger", "G8"], ["Catalog", "B2"], ["Internal", "A1"]] as const) {
      const viaRow = addressCell(fromRow, sheet, ref);
      const viaModel = addressCell(fromModel, sheet, ref);
      const agree = viaRow?.text === viaModel?.text;
      console.log(
        `  addressed ${sheet}!${ref} → ${viaRow ? JSON.stringify(viaRow.text) : "nothing"}` +
          `${agree ? "" : `   🔴 DISAGREES with the model-level door: ${JSON.stringify(viaModel?.text ?? null)}`}`,
      );
      if (!agree) throw new Error(`${sheet}!${ref} resolves differently from the row than from the model`);
    }
    if (addressCell(fromRow, "Ledger", "E7")?.text !== "7.5%") {
      throw new Error("the stored ROW does not address Ledger!E7 — item 7 fails at the door consumers use");
    }

    const failed = checks.filter((check) => !check.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} acceptance properties hold in production`);
    if (failed.length) failure = new Error(`${failed.length} acceptance properties failed`);
  } catch (error) {
    failure = error;
  } finally {
    // 🔴 REVOKED ON EVERY PATH, INCLUDING THE FAILING ONE. A key left live because
    // the assertion threw is the worst outcome this script has available.
    await db.from("device_keys").update({ revoked: true }).eq("key_hash", keyHash);
    console.log("device key revoked");
  }
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
