#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * FDA Purple Book companion ingest script.
 *
 * Parses the monthly Purple Book CSV (a full snapshot of licensed biologics
 * with an N/R/U change annotation), aggregates products per Proper Name, and
 * POSTs pre-aggregated records to core-source-sync with skip_embed:true
 * (structured reference data → provenance rows, no chunks).
 *
 * Uses a small quote-aware CSV reader because fields contain embedded commas
 * (e.g. Strength "5LF,2LF/.5ML"). The header is located by its N/R/U first
 * cell, so leading preamble lines are skipped robustly.
 *
 * Usage:
 *   SERVICE_KEY=... deno run -A scripts/purple-book-ingest.ts \
 *     --file=/path/purplebook.csv [--url=http://127.0.0.1:54321] \
 *     [--proper=adalimumab,etanercept] [--limit=N] [--dry-run]
 *
 * With no --file, downloads the latest monthly CSV (--month=May, --year=2026).
 */

import type {
  PurpleBookProduct,
  PurpleBookRecord,
} from "../supabase/functions/core-source-sync/providers/purple-book.ts";

const BATCH = 50;
const UA = "Mozilla/5.0 (PharmaBro corpus ingest)";

function arg(name: string): string | undefined {
  return Deno.args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}
const hasFlag = (n: string) => Deno.args.includes(`--${n}`);

const SB_URL = arg("url") ?? Deno.env.get("SB_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY") ?? arg("service-key");
const DRY_RUN = hasFlag("dry-run");
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const FILTER = (arg("proper") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** RFC4180-ish parser: handles quoted fields, embedded commas, "" escapes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t.length && t !== "N/A" ? t : undefined;
};

async function loadCsv(): Promise<string> {
  const file = arg("file");
  if (file) return await Deno.readTextFile(file);
  const month = arg("month") ?? "May";
  const year = arg("year") ?? "2026";
  const url =
    `https://www.accessdata.fda.gov/drugsatfda_docs/PurpleBook/${year}/purplebook-search-${month}-data-download.csv`;
  console.error(`Downloading Purple Book ${month} ${year}…`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Purple Book download ${res.status} (${url})`);
  return await res.text();
}

function main() {
  return loadCsv().then(async (text) => {
    const all = parseCsv(text);
    const headerIdx = all.findIndex((r) => (r[0] ?? "").trim() === "N/R/U");
    if (headerIdx < 0) throw new Error("Purple Book header (N/R/U) not found");
    const dataRows = all.slice(headerIdx + 1).filter((r) => r.length > 4 && (r[4] ?? "").trim());

    const byProper = new Map<string, {
      rec: PurpleBookRecord & {
        products: PurpleBookProduct[];
        applicants: string[];
        bla_numbers: string[];
        is_biosimilar: boolean;
        is_interchangeable: boolean;
        ref_product_proper_name?: string;
        ref_product_proprietary_name?: string;
      };
    }>();

    for (const r of dataRows) {
      const proper = (r[4] ?? "").trim();
      if (!proper) continue;
      const licenseType = (r[5] ?? "").trim();
      let entry = byProper.get(proper);
      if (!entry) {
        entry = {
          rec: {
            proper_name: proper,
            applicants: [],
            bla_numbers: [],
            is_biosimilar: false,
            is_interchangeable: false,
            products: [],
          },
        };
        byProper.set(proper, entry);
      }
      const rec = entry.rec;
      const product: PurpleBookProduct = {
        bla_number: (r[2] ?? "").trim(),
        proprietary_name: (r[3] ?? "").trim(),
        license_type: licenseType,
        strength: (r[6] ?? "").trim(),
        dosage_form: (r[7] ?? "").trim(),
        route: (r[8] ?? "").trim(),
        presentation: (r[9] ?? "").trim(),
        marketing_status: (r[10] ?? "").trim(),
        approval_date: clean(r[12]),
        product_number: (r[20] ?? "").trim(),
        center: (r[21] ?? "").trim(),
        change_flag: clean(r[0]),
      };
      rec.products.push(product);
      const applicant = (r[1] ?? "").trim();
      if (applicant && !rec.applicants.includes(applicant)) rec.applicants.push(applicant);
      if (product.bla_number && !rec.bla_numbers.includes(product.bla_number)) {
        rec.bla_numbers.push(product.bla_number);
      }
      if (licenseType.includes("351(k)")) rec.is_biosimilar = true;
      if (licenseType.toLowerCase().includes("interchangeable")) rec.is_interchangeable = true;
      const refProper = clean(r[14]);
      const refProp = clean(r[15]);
      if (refProper && !rec.ref_product_proper_name) rec.ref_product_proper_name = refProper;
      if (refProp && !rec.ref_product_proprietary_name) rec.ref_product_proprietary_name = refProp;
    }

    let records: PurpleBookRecord[] = [...byProper.values()].map((e) => e.rec);
    if (FILTER.length) {
      records = records.filter((r) =>
        FILTER.some((f) =>
          r.proper_name.toLowerCase().includes(f) ||
          (r.ref_product_proper_name ?? "").toLowerCase().includes(f)
        )
      );
    }
    records.sort((a, b) => a.proper_name.localeCompare(b.proper_name));
    if (LIMIT) records = records.slice(0, LIMIT);

    const biosimilars = records.filter((r) => r.is_biosimilar).length;
    console.error(
      `${byProper.size} biologics total; ${records.length} selected (${biosimilars} biosimilars)${
        FILTER.length ? ` filter: ${FILTER.join(",")}` : ""
      }`,
    );

    if (DRY_RUN) {
      for (const r of records.slice(0, 25)) {
        console.log(
          `  ${r.proper_name}: ${r.products.length} products, biosimilar=${r.is_biosimilar}` +
            `, interchangeable=${r.is_interchangeable}${
              r.ref_product_proper_name ? `, ref=${r.ref_product_proper_name}` : ""
            }, BLAs=${r.bla_numbers.join("/")}`,
        );
      }
      return;
    }

    if (!SERVICE_KEY) {
      console.error("SERVICE_KEY required to POST (or use --dry-run)");
      Deno.exit(2);
    }

    let ingested = 0;
    const errors: unknown[] = [];
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const res = await fetch(`${SB_URL}/functions/v1/core-source-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({
          provider: "purple_book",
          opts: { pre_parsed: batch },
          skip_embed: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        errors.push({ status: res.status, body });
        console.error(`batch ${i / BATCH} failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
      } else {
        ingested += body.ingested ?? 0;
        console.error(`batch ${i / BATCH}: ingested=${body.ingested} skipped=${body.skipped_unchanged} chunks=${body.chunk_count}`);
      }
    }
    console.log(`DONE — ingested ${ingested}/${records.length} biologics, ${errors.length} batch errors`);
    if (errors.length) Deno.exit(1);
  });
}

await main();
