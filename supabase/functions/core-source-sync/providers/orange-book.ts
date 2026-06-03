/**
 * FDA Orange Book provider — "Approved Drug Products with Therapeutic
 * Equivalence Evaluations."
 *
 * Source data: the quarterly EOBZIP archive of `~`-delimited text files
 *   - products.txt    Ingredient~DF;Route~Trade_Name~Applicant~Strength~
 *                     Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~
 *                     RLD~RS~Type~Applicant_Full_Name
 *   - patent.txt      Appl_Type~Appl_No~Product_No~Patent_No~
 *                     Patent_Expire_Date_Text~Drug_Substance_Flag~
 *                     Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date
 *   - exclusivity.txt Appl_Type~Appl_No~Product_No~Exclusivity_Code~Exclusivity_Date
 *   from https://www.fda.gov/media/76860/download
 * License: fda_public (US Government work, public domain) — clears the gate.
 *
 * This is STRUCTURED reference data (therapeutic-equivalence codes, generic
 * availability, reference-listed drug, patents, exclusivity) — not semantic
 * prose. It is ingested with `skip_embed: true`: a `core_sources`
 * provenance/license/content_hash row per active ingredient, with ZERO
 * chunks. The structured fields live in `metadata` for the typed Layer-B
 * projection + drug page; the source row makes it citeable like any source.
 * Embedding tabular TE codes would only pollute the vector space.
 *
 * The 60s edge-function budget cannot download + unzip + join ~70k rows, so
 * the companion script `scripts/orange-book-ingest.ts` owns parse + aggregate
 * and POSTs pre-aggregated per-ingredient records via `opts.pre_parsed`
 * (mirrors the drugs-fda.ts pattern). This provider only normalizes them.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

// =============================================================================
// Record types — shared with scripts/orange-book-ingest.ts (the parser)
// =============================================================================

export interface OrangeBookProduct {
  readonly trade_name: string;
  readonly applicant: string;
  readonly applicant_full_name?: string;
  readonly strength: string;
  readonly df_route: string; // "TABLET;ORAL"
  readonly appl_type: string; // "N" (NDA) | "A" (ANDA)
  readonly appl_no: string;
  readonly product_no: string;
  readonly te_code?: string; // AB, AB1, BX… (absent = not therapeutically rated)
  readonly approval_date?: string; // "Apr 12, 2023" | "Approved Prior to Jan 1, 1982"
  readonly rld: boolean; // Reference Listed Drug
  readonly rs: boolean; // Reference Standard
  readonly market_type: string; // RX | OTC | DISCN
}

export interface OrangeBookPatent {
  readonly appl_no: string;
  readonly product_no: string;
  readonly patent_no: string;
  readonly patent_expire_date?: string;
  readonly drug_substance: boolean;
  readonly drug_product: boolean;
  readonly patent_use_code?: string;
  readonly delisted: boolean;
}

export interface OrangeBookExclusivity {
  readonly appl_no: string;
  readonly product_no: string;
  readonly exclusivity_code: string;
  readonly exclusivity_date?: string;
}

/** Per-ingredient aggregate — becomes one core_sources row. */
export interface OrangeBookRecord {
  readonly ingredient: string; // "ATORVASTATIN CALCIUM"
  readonly products: ReadonlyArray<OrangeBookProduct>;
  readonly patents: ReadonlyArray<OrangeBookPatent>;
  readonly exclusivity: ReadonlyArray<OrangeBookExclusivity>;
}

export interface OrangeBookFetchOpts {
  /** Pre-aggregated per-ingredient records from the companion ingest script. */
  readonly pre_parsed?: ReadonlyArray<OrangeBookRecord>;
}

const OB_SOURCE_URL =
  "https://www.accessdata.fda.gov/scripts/cder/ob/index.cfm";

// =============================================================================
// Provider entrypoint
// =============================================================================

/**
 * Edge-fn entrypoint. Parse + aggregation happen in the companion script,
 * which POSTs records via opts.pre_parsed. Without them this is a no-op
 * (returns []), keeping the edge function free of zip/parse dependencies.
 *
 * Call with `skip_embed: true` — these rows carry structured metadata, not
 * embeddable prose.
 */
export async function fetchOrangeBook(
  opts: OrangeBookFetchOpts = {},
): Promise<NormalizedSource[]> {
  if (!opts.pre_parsed?.length) return [];
  const out: NormalizedSource[] = [];
  for (const rec of opts.pre_parsed) {
    const normalized = await normalizeOrangeBook(rec);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function normalizeOrangeBook(
  rec: OrangeBookRecord,
): Promise<NormalizedSource | null> {
  if (!rec.ingredient || !rec.products.length) return null;

  const genericAvailable = rec.products.some((p) => p.appl_type === "A");
  const teCodes = [
    ...new Set(rec.products.map((p) => p.te_code).filter((c): c is string => !!c)),
  ].sort();
  const tradeNames = [
    ...new Set(rec.products.map((p) => p.trade_name).filter(Boolean)),
  ];
  const rldProduct = rec.products.find((p) => p.rld);

  // Deterministic serialization → content_hash drives supersession when FDA
  // republishes the quarterly file with changed TE codes / patents.
  const content_text = serialize(rec, genericAvailable, teCodes);

  return {
    provider: "fda_orange_book",
    provider_id: slug(rec.ingredient),
    title: `Orange Book: ${titleCase(rec.ingredient)}`,
    subtitle: tradeNames.slice(0, 3).join(", ") || undefined,
    source_url: OB_SOURCE_URL,
    license: "fda_public",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      ingredient: rec.ingredient,
      generic_available: genericAvailable,
      te_codes: teCodes,
      rld_trade_name: rldProduct?.trade_name ?? null,
      product_count: rec.products.length,
      patent_count: rec.patents.length,
      exclusivity_count: rec.exclusivity.length,
      products: rec.products,
      patents: rec.patents,
      exclusivity: rec.exclusivity,
    },
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

function serialize(
  rec: OrangeBookRecord,
  genericAvailable: boolean,
  teCodes: ReadonlyArray<string>,
): string {
  const lines: string[] = [
    `FDA ORANGE BOOK — ${rec.ingredient}`,
    `Generic available: ${genericAvailable ? "Yes (ANDA approved)" : "No"}`,
    `Therapeutic-equivalence codes: ${teCodes.length ? teCodes.join(", ") : "not rated"}`,
    `Products (${rec.products.length}):`,
  ];
  for (const p of sortProducts(rec.products)) {
    lines.push(
      `  ${p.trade_name} | ${p.df_route} | ${p.strength} | ${p.appl_type} ${p.appl_no}/${p.product_no}` +
        ` | TE=${p.te_code ?? "-"} | RLD=${p.rld ? "Y" : "N"} | ${p.market_type}` +
        ` | approved ${p.approval_date ?? "?"}`,
    );
  }
  if (rec.patents.length) {
    lines.push(`Patents (${rec.patents.length}):`);
    for (const pt of sortPatents(rec.patents)) {
      const flags = [
        pt.drug_substance ? "substance" : null,
        pt.drug_product ? "product" : null,
        pt.patent_use_code ? `use ${pt.patent_use_code}` : null,
        pt.delisted ? "DELISTED" : null,
      ]
        .filter(Boolean)
        .join("; ");
      lines.push(
        `  ${pt.patent_no} (${pt.appl_no}/${pt.product_no}) expires ${pt.patent_expire_date ?? "?"}${flags ? ` [${flags}]` : ""}`,
      );
    }
  }
  if (rec.exclusivity.length) {
    lines.push(`Exclusivity (${rec.exclusivity.length}):`);
    for (const ex of sortExclusivity(rec.exclusivity)) {
      lines.push(
        `  ${ex.exclusivity_code} (${ex.appl_no}/${ex.product_no}) until ${ex.exclusivity_date ?? "?"}`,
      );
    }
  }
  return lines.join("\n");
}

function sortProducts(
  products: ReadonlyArray<OrangeBookProduct>,
): OrangeBookProduct[] {
  return [...products].sort((a, b) =>
    `${a.appl_no}/${a.product_no}`.localeCompare(`${b.appl_no}/${b.product_no}`)
  );
}

function sortPatents(
  patents: ReadonlyArray<OrangeBookPatent>,
): OrangeBookPatent[] {
  return [...patents].sort((a, b) =>
    `${a.appl_no}/${a.product_no}/${a.patent_no}`.localeCompare(
      `${b.appl_no}/${b.product_no}/${b.patent_no}`,
    )
  );
}

function sortExclusivity(
  exclusivity: ReadonlyArray<OrangeBookExclusivity>,
): OrangeBookExclusivity[] {
  return [...exclusivity].sort((a, b) =>
    `${a.appl_no}/${a.product_no}/${a.exclusivity_code}`.localeCompare(
      `${b.appl_no}/${b.product_no}/${b.exclusivity_code}`,
    )
  );
}

/** Stable provider_id from an ingredient name. */
function slug(ingredient: string): string {
  return ingredient
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}
