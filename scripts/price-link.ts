#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 2 — drug_prices projection (NADAC per-NDC), BEST-EFFORT / non-blocking.
 *
 * The cms_nadac Layer-A row is coarse provenance only (one row, the weekly
 * dataset). This builds the typed per-NDC projection: streams the current NADAC
 * CSV, joins each NDC to a drug_entity via the openFDA labels we already linked
 * (label metadata.ndc → drug_entity_sources → entity), and inserts only MATCHED
 * rows (the full ~666k-row file is a price history we don't need wholesale).
 *
 * NADAC = average price pharmacies pay to ACQUIRE a drug (CMS survey), NOT a
 * patient's out-of-pocket / cash price. Disclaimer lives on the cms_nadac source
 * row + app layer. Public CMS data only.
 *
 * NDC join: openFDA product_ndc is labeler-product (2 segments) → normalize to a
 * 9-digit labeler(5)+product(4) key; NADAC NDC is 11-digit (labeler+product+
 * package) → its first 9 digits are that same key. Match on the 9-digit prefix.
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... deno run -A scripts/price-link.ts [--year=2026] [--max=20000]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SB_URL || !SERVICE_KEY) { console.error("SB_URL + SERVICE_KEY required"); Deno.exit(2); }
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
const arg = (n: string, d: string) => Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const YEAR = arg("year", "2026");
const MAX = Number(arg("max", "50000"));
const UA = "Mozilla/5.0 (PharmaBro corpus ingest)";

// ---- 1. resolve current NADAC CSV url (DKAN, same logic as pricing-ingest) ----
async function resolveCsv(): Promise<{ url: string; asOf: string | null }> {
  const api = `https://data.medicaid.gov/api/1/search/?fulltext=${encodeURIComponent(`NADAC National Average Drug Acquisition Cost ${YEAR}`)}&page-size=10`;
  const res = await fetch(api, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`DKAN search ${res.status}`);
  const data = await res.json();
  const items = Object.values(data.results ?? {}) as Array<Record<string, unknown>>;
  const item = items.find((it) => String(it.title ?? "").includes(`Acquisition Cost) ${YEAR}`)) ??
    items.find((it) => String(it.title ?? "").includes(YEAR));
  if (!item) throw new Error(`No NADAC ${YEAR} dataset`);
  const dist = (item.distribution as Array<Record<string, unknown>> | undefined)?.[0];
  const url = String((dist?.data as Record<string, unknown>)?.downloadURL ?? dist?.downloadURL ?? "");
  if (!url) throw new Error("No downloadURL");
  const m = url.match(/-(\d{2})-(\d{2})-(\d{4})\.csv$/);
  return { url, asOf: m ? `${m[3]}-${m[1]}-${m[2]}` : null };
}

// ---- 2. ndc9 -> entity map from linked openFDA labels ----
function ndc9FromOpenFda(productNdc: string): string | null {
  const seg = productNdc.split("-");
  if (seg.length < 2) return null;
  const labeler = seg[0].padStart(5, "0");
  const product = seg[1].padStart(4, "0");
  const key = (labeler + product).replace(/\D/g, "");
  return key.length === 9 ? key : null;
}

async function loadAll<T>(table: string, select: string, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += page) {
    const { data, error } = await sb.from(table).select(select).range(off, off + page - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

console.log(`price-link → ${SB_URL} | NADAC ${YEAR}`);
const labels = await loadAll<{ id: string; metadata: { ndc?: string[] } }>("core_sources", "id,metadata", 1000)
  .then((rows) => rows.filter((r) => Array.isArray(r.metadata?.ndc) && r.metadata.ndc.length));
const bridge = await loadAll<{ source_id: string; drug_entity_id: string }>("drug_entity_sources", "source_id,drug_entity_id");
const srcToEntity = new Map(bridge.map((b) => [b.source_id, b.drug_entity_id]));
const ndc9ToEntity = new Map<string, string>();
for (const l of labels) {
  const eid = srcToEntity.get(l.id);
  if (!eid) continue;
  for (const ndc of l.metadata.ndc ?? []) {
    const k = ndc9FromOpenFda(ndc);
    if (k) ndc9ToEntity.set(k, eid);
  }
}
console.log(`  ndc9 keys from ${labels.length} labels: ${ndc9ToEntity.size}`);
if (!ndc9ToEntity.size) { console.log("  no NDC keys — nothing to join. (logged; non-blocking)"); Deno.exit(0); }

const { data: nadacSrc } = await sb.from("core_sources").select("id").eq("provider", "cms_nadac").maybeSingle();
const sourceId = nadacSrc?.id ?? null;

// ---- 3. stream the CSV, join on ndc9, upsert matched rows ----
const { url, asOf } = await resolveCsv();
console.log(`  csv: ${url.split("/").pop()} (as_of ${asOf ?? "?"})`);
const res = await fetch(url, { headers: { "User-Agent": UA } });
if (!res.ok || !res.body) throw new Error(`NADAC download ${res.status}`);

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
let buf = ""; let header: string[] | null = null; let col: Record<string, number> = {};
let scanned = 0, matched = 0;
const pending: Record<string, unknown>[] = [];

async function flush() {
  if (!pending.length) return;
  const { error } = await sb.from("drug_prices").upsert(pending.splice(0), { onConflict: "ndc,as_of_date", ignoreDuplicates: true });
  if (error) throw error;
}

function num(s: string | undefined): number | null {
  if (!s) return null; const n = Number(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : null;
}
function isoDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

outer:
while (true) {
  const { done, value } = await reader.read();
  if (value) buf += value;
  let nl: number;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).replace(/\r$/, "");
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const cells = splitCsv(line);
    if (!header) {
      header = cells.map((h) => h.trim());
      col = Object.fromEntries(header.map((h, i) => [h.toLowerCase(), i]));
      continue;
    }
    scanned++;
    const ndcRaw = (cells[col["ndc"]] ?? "").replace(/\D/g, "");
    if (ndcRaw.length < 9) continue;
    const ndc11 = ndcRaw.padStart(11, "0").slice(0, 11);
    const eid = ndc9ToEntity.get(ndc11.slice(0, 9));
    if (!eid) continue;
    matched++;
    pending.push({
      drug_entity_id: eid,
      ndc: ndc11,
      description: cells[col["ndc description"]] ?? null,
      nadac_per_unit: num(cells[col["nadac per unit"]]),
      pricing_unit: cells[col["pricing unit"]] ?? null,
      classification_for_rate_setting: cells[col["classification for rate setting"]] ?? null,
      pricing_basis: "average_acquisition_cost",
      as_of_date: isoDate(cells[col["as of date"]]) ?? asOf,
      effective_date: isoDate(cells[col["effective date"]]),
      source_id: sourceId,
    });
    if (pending.length >= 500) await flush();
    if (matched >= MAX) { await flush(); break outer; }
  }
  if (done) break;
}
await flush();

const { count } = await sb.from("drug_prices").select("*", { count: "exact", head: true });
const { count: withEntity } = await sb.from("drug_prices").select("*", { count: "exact", head: true }).not("drug_entity_id", "is", null);
console.log(`  scanned=${scanned} matched=${matched} | drug_prices total=${count} (entity-linked=${withEntity})`);
console.log("done.");
