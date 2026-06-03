/**
 * Phase 2: Layer 1 license gate (Deno-portable, no imports from apps/web).
 *
 * Mirrors apps/web/lib/sources/provenance.ts. Edge functions cannot import
 * from apps/web because Deno + Node module resolution diverge.
 *
 * License gate: ANY source whose license blocks commercial use is rejected
 * before insert into core_sources. CHECK constraint at DB level is the
 * second line of defense (commercial_use_allowed = true).
 */

export type CoreSourceProvider =
  | "openfda"
  | "dailymed"
  | "rxnorm"
  | "cdc"
  | "nih"
  | "medlineplus"
  | "pubmed_oa"
  | "drugbank_open"
  | "oer"
  | "ascend_original"
  // Phase 7 expansion — guideline / evidence-synthesis sources
  | "nih_nhlbi"
  | "ahrq"
  | "clinicaltrials"
  | "ncbi_bookshelf"
  | "uspstf"
  | "va_dod"
  | "fda_safety"
  | "livertox"
  | "lactmed"
  | "fda_orange_book"
  | "cdc_mmwr"
  | "pubchem"
  | "pharmgkb"
  | "openstax"
  // Phase A expansion (Cycle 1) — DiPiro-equivalent coverage gap closers
  | "drugs_fda"
  | "nci_pdq"
  | "dhhs_hiv"
  | "orphanet";

export type CoreSourceLicense =
  | "public_domain"
  | "cc0"
  | "cc_by"
  | "cc_by_sa"
  | "fda_public"
  | "nlm_public"
  | "oer_open"
  | "ascend_owned";

export interface LicenseRequirements {
  readonly attribution_required: boolean;
  readonly commercial_use_allowed: boolean;
  readonly share_alike_required: boolean;
}

const LICENSE_REQUIREMENTS: Readonly<
  Record<CoreSourceLicense, LicenseRequirements>
> = {
  public_domain: {
    attribution_required: false,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
  cc0: {
    attribution_required: false,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
  cc_by: {
    attribution_required: true,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
  cc_by_sa: {
    attribution_required: true,
    commercial_use_allowed: true,
    share_alike_required: true,
  },
  fda_public: {
    attribution_required: false,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
  nlm_public: {
    attribution_required: false,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
  oer_open: {
    attribution_required: true,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
  ascend_owned: {
    attribution_required: false,
    commercial_use_allowed: true,
    share_alike_required: false,
  },
};

export function getLicenseRequirements(
  license: CoreSourceLicense,
): LicenseRequirements {
  return LICENSE_REQUIREMENTS[license];
}

/**
 * Loud rejection at ingest. Throws so misconfigured pipelines surface
 * before silently inserting a non-commercial-friendly source.
 */
export function assertCommercialFriendly(license: CoreSourceLicense): void {
  const req = getLicenseRequirements(license);
  if (!req.commercial_use_allowed) {
    throw new Error(
      `License ${license} does not allow commercial use. Reject at ingest. See docs/source-strategy.md.`,
    );
  }
}

/**
 * Provider → default license mapping. Each provider can override per-record
 * (e.g. PubMed OA mixes CC BY and CC0 depending on author choice).
 */
export const PROVIDER_DEFAULT_LICENSE: Readonly<
  Record<CoreSourceProvider, CoreSourceLicense>
> = {
  openfda: "fda_public",
  dailymed: "nlm_public",
  rxnorm: "nlm_public",
  cdc: "public_domain",
  nih: "public_domain",
  medlineplus: "nlm_public",
  pubmed_oa: "cc_by", // mixed; per-record override likely
  drugbank_open: "cc0", // DrugBank Open Data is CC0
  oer: "cc_by",
  ascend_original: "ascend_owned",
  // Phase 7 expansion
  nih_nhlbi: "public_domain", // US fed work
  ahrq: "public_domain", // US fed work
  clinicaltrials: "public_domain", // NLM, US fed
  ncbi_bookshelf: "cc_by", // per-book; filter at ingest, default to permissive
  uspstf: "public_domain", // US fed advisory body
  va_dod: "public_domain", // US fed
  fda_safety: "fda_public",
  livertox: "public_domain", // NIH NLM
  lactmed: "public_domain", // NIH NLM
  fda_orange_book: "fda_public",
  cdc_mmwr: "public_domain", // CDC, US fed
  pubchem: "public_domain", // NIH NLM
  pharmgkb: "cc_by_sa", // PharmGKB CC BY-SA — share-alike applies
  openstax: "cc_by", // OpenStax textbooks CC BY 4.0
  // Phase A expansion (Cycle 1)
  drugs_fda: "fda_public", // FDA approval packages, US fed
  nci_pdq: "public_domain", // NIH/NCI, US fed
  dhhs_hiv: "public_domain", // DHHS clinicalinfo.hiv.gov, US fed
  orphanet: "cc_by", // Orphanet CC BY 4.0 (per orphadata.com)
};
