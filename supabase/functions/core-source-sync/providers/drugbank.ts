/**
 * Phase 2: DrugBank Open Data provider (stub).
 *
 * License: cc0 (DrugBank Open Data subset only — NOT the full DrugBank
 * which requires commercial license).
 * Source: https://go.drugbank.com/releases/latest#open-data
 * Format: CSV bulk download, not REST API.
 *
 * Phase 2 scope: stub. Open Data subset = drug vocabulary only (DBID,
 * generic name, synonyms, CAS, ATC). No clinical narrative, so most
 * useful as cross-reference for query expansion. Bulk CSV import worker
 * deferred to Phase 6.
 *
 * NOTE: License gate at ingest. Verify subset is CC0 (full DrugBank
 * Academic = CC BY-NC, REJECTED — see source-strategy.md red zone).
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

export interface DrugBankFetchOpts {
  /** Pre-downloaded CSV rows from DrugBank Open Data. */
  rows: ReadonlyArray<{
    drugbank_id: string;
    name: string;
    cas_number?: string;
    unii?: string;
    synonyms?: string[];
    standard_inchi_key?: string;
  }>;
}

export async function ingestDrugBankOpenData(
  opts: DrugBankFetchOpts,
): Promise<NormalizedSource[]> {
  const sources: NormalizedSource[] = [];

  for (const row of opts.rows) {
    if (!row.drugbank_id || !row.name) continue;
    const synonymsLine = row.synonyms?.length
      ? `Synonyms: ${row.synonyms.join(", ")}\n`
      : "";
    const content_text =
      `DrugBank ID: ${row.drugbank_id}\n` +
      `Generic name: ${row.name}\n` +
      synonymsLine +
      (row.cas_number ? `CAS: ${row.cas_number}\n` : "") +
      (row.unii ? `UNII: ${row.unii}\n` : "") +
      (row.standard_inchi_key ? `InChIKey: ${row.standard_inchi_key}\n` : "");

    sources.push({
      provider: "drugbank_open",
      provider_id: row.drugbank_id,
      title: `DrugBank Open: ${row.name}`,
      source_url: `https://go.drugbank.com/drugs/${row.drugbank_id}`,
      license: "cc0",
      content_text,
      content_hash: await sha256Hex(content_text),
      metadata: {
        drugbank_id: row.drugbank_id,
        name: row.name,
        cas_number: row.cas_number ?? null,
        unii: row.unii ?? null,
        synonyms: row.synonyms ?? [],
      },
    });
  }
  return sources;
}
