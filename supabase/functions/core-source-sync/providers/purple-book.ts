/**
 * FDA Purple Book provider — "Database of Licensed Biological Products."
 *
 * Source: the monthly CSV at accessdata.fda.gov/drugsatfda_docs/PurpleBook/...
 * (a full snapshot — every licensed biologic re-listed each month with an
 * N/R/U "changes" annotation). Columns: Applicant, BLA Number, Proprietary
 * Name, Proper Name, License Type (351(a) originator | 351(k) biosimilar |
 * 351(k) Interchangeable), Strength, Dosage Form, Route, Marketing Status,
 * Approval Date, Reference Product (Proper + Proprietary), exclusivity dates,
 * Center (CDER/CBER), etc.
 * License: fda_public (US Government work).
 *
 * Like the Orange Book, this is STRUCTURED reference data, not prose. Ingested
 * with skip_embed:true → one core_sources provenance/license/hash row per
 * biologic (keyed by Proper Name), ZERO chunks; structured fields in metadata
 * for the Layer-B projection + drug page. The heavy CSV parse lives in the
 * companion scripts/purple-book-ingest.ts; this provider only normalizes the
 * pre-aggregated records POSTed via opts.pre_parsed.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

export interface PurpleBookProduct {
  readonly bla_number: string;
  readonly proprietary_name: string; // brand ("Humira", "Hadlima"); may be "N/A"
  readonly license_type: string; // "351(a)" | "351(k)" | "351(k) Interchangeable"
  readonly strength: string;
  readonly dosage_form: string;
  readonly route: string;
  readonly presentation: string;
  readonly marketing_status: string; // Rx | Disc | OTC | ...
  readonly approval_date?: string;
  readonly product_number: string;
  readonly center: string; // CDER | CBER
  readonly change_flag?: string; // N | R | U | undefined (this month's changes)
}

/** Per-biologic aggregate (keyed by Proper Name) — one core_sources row. */
export interface PurpleBookRecord {
  readonly proper_name: string; // "adalimumab" | "adalimumab-bwwd"
  readonly applicants: ReadonlyArray<string>;
  readonly bla_numbers: ReadonlyArray<string>;
  readonly is_biosimilar: boolean; // any 351(k)
  readonly is_interchangeable: boolean; // any "Interchangeable"
  readonly ref_product_proper_name?: string;
  readonly ref_product_proprietary_name?: string;
  readonly products: ReadonlyArray<PurpleBookProduct>;
}

export interface PurpleBookFetchOpts {
  /** Pre-aggregated per-biologic records from the companion ingest script. */
  readonly pre_parsed?: ReadonlyArray<PurpleBookRecord>;
}

const PB_SOURCE_URL = "https://purplebooksearch.fda.gov/";

export async function fetchPurpleBook(
  opts: PurpleBookFetchOpts = {},
): Promise<NormalizedSource[]> {
  if (!opts.pre_parsed?.length) return [];
  const out: NormalizedSource[] = [];
  for (const rec of opts.pre_parsed) {
    const normalized = await normalizePurpleBook(rec);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function normalizePurpleBook(
  rec: PurpleBookRecord,
): Promise<NormalizedSource | null> {
  if (!rec.proper_name || !rec.products.length) return null;

  const proprietaryNames = [
    ...new Set(
      rec.products
        .map((p) => p.proprietary_name)
        .filter((n) => n && n.toUpperCase() !== "N/A"),
    ),
  ];
  const licenseClass = rec.is_interchangeable
    ? "351(k) Interchangeable"
    : rec.is_biosimilar
    ? "351(k) Biosimilar"
    : "351(a) Originator";

  const content_text = serialize(rec, licenseClass, proprietaryNames);

  return {
    provider: "purple_book",
    provider_id: slug(rec.proper_name),
    title: `Purple Book: ${rec.proper_name}`,
    subtitle: proprietaryNames.slice(0, 3).join(", ") || undefined,
    source_url: PB_SOURCE_URL,
    license: "fda_public",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      proper_name: rec.proper_name,
      license_class: licenseClass,
      is_biosimilar: rec.is_biosimilar,
      is_interchangeable: rec.is_interchangeable,
      ref_product_proper_name: rec.ref_product_proper_name ?? null,
      ref_product_proprietary_name: rec.ref_product_proprietary_name ?? null,
      proprietary_names: proprietaryNames,
      bla_numbers: rec.bla_numbers,
      applicants: rec.applicants,
      product_count: rec.products.length,
      products: rec.products,
    },
  };
}

function serialize(
  rec: PurpleBookRecord,
  licenseClass: string,
  proprietaryNames: ReadonlyArray<string>,
): string {
  const lines: string[] = [
    `FDA PURPLE BOOK — ${rec.proper_name}`,
    `License class: ${licenseClass}`,
    `Brand name(s): ${proprietaryNames.join(", ") || "n/a"}`,
    `BLA(s): ${[...rec.bla_numbers].sort().join(", ") || "n/a"}`,
  ];
  if (rec.is_biosimilar && rec.ref_product_proper_name) {
    lines.push(
      `Reference product: ${rec.ref_product_proper_name}` +
        (rec.ref_product_proprietary_name
          ? ` (${rec.ref_product_proprietary_name})`
          : ""),
    );
  }
  lines.push(`Products (${rec.products.length}):`);
  for (const p of sortProducts(rec.products)) {
    lines.push(
      `  ${p.proprietary_name} | BLA ${p.bla_number}/${p.product_number} | ${p.license_type}` +
        ` | ${p.dosage_form};${p.route} | ${p.strength} | ${p.marketing_status}` +
        ` | ${p.center} | approved ${p.approval_date ?? "?"}`,
    );
  }
  return lines.join("\n");
}

function sortProducts(
  products: ReadonlyArray<PurpleBookProduct>,
): PurpleBookProduct[] {
  return [...products].sort((a, b) =>
    `${a.bla_number}/${a.product_number}`.localeCompare(
      `${b.bla_number}/${b.product_number}`,
    )
  );
}

function slug(properName: string): string {
  return properName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
