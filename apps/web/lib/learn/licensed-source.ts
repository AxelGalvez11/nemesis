// The gate every source must pass before one word of it may enter the canonical corpus.
//
// 🔴🔴 THE RULE IS A TYPE, NOT A CONVENTION, AND THAT IS THE ENTIRE POINT OF THIS FILE.
//
// The owner's rule is *"unknown licence = do not ingest"*. Written as a convention it is a sentence
// in a document that the person in a hurry does not read, and the failure is silent and permanent:
// a row in a corpus, indistinguishable from a checked one, that nobody re-examines because nothing
// records that it was never examined. Written as a type, the corpus writer cannot be CALLED without
// one, because `LicensedSource` has a private brand and `admitSource` is the only thing that mints
// it. Forgetting the check stops being possible; it becomes a compile error.
//
// This is the shape `reference-images.ts` already proved for images: *"a curated row cannot exist
// without one, because the type will not let it."* That worked. This is the same idea for text.
//
// 🔴🔴 IT MINTS NO SOURCE IDENTITY. Owner ruling, 2026-08-23: *"Do not create a second competing
// source table. `core_sources` remains the canonical source identity… The `licensed-source.ts` gate
// you built should consume a verified license attestation tied to `core_sources`, not introduce
// another source identity system."*
//
// An earlier draft of this file carried its own `id`, `name` and `url` — a second catalogue of what
// a source IS, which is two answers to one question and the second one always goes stale. What it
// takes now is a `sourceId` pointing at a `core_sources` row plus the attestation recorded against
// that row's edition. This module answers exactly one question and does not know what a source is:
//
//     core_sources                    →  WHAT source is this?
//     core_source_license_versions    →  under WHAT VERIFIED CONDITIONS was this version approved?
//     admitSource (here)              →  may THIS attestation be built on?
//
// 🔴 IT DECIDES ADMISSIBILITY, NEVER TRUTH. A source passing this gate is one Nemesis is ALLOWED to
// read. Whether what it says is correct, current, or well-taught is a different question that this
// file has no opinion about and must never grow one.
//
// PURE. No React, no I/O, no network. Nothing here fetches anything — a caller brings the attestation
// a human recorded, which is the only way the record means anything.

import { attributionRequired, isReusableLicence, REUSABLE_LICENCES } from "./visual-provenance";

/**
 * The version of the GATE, recorded on every source it admits.
 *
 * 🔴 SO A LATER TIGHTENING CAN FIND ITS OWN ROWS. If `REUSABLE_LICENCES` ever loses an entry, or
 * this file starts requiring something it does not require today, the rows admitted under the old
 * rules have to be findable. Without a version stamp, "which sources were admitted before we
 * started checking X" has no answer and the only safe remedy is re-checking everything by hand.
 *
 * Bump whenever `admitSource` refuses something it used to admit.
 */
export const LICENCE_GATE_VERSION = 1;

/**
 * What a source may be used FOR — `core_sources.source_role`.
 *
 * 🔴 `alignment_target` EXISTS SO THAT A PUBLIC URL IS NOT MISTAKEN FOR A REUSE RIGHT, and it is the
 * one value with NO STORAGE. The AP course descriptions, the NCLEX test plan, the CPA blueprints and
 * the CFA outcome statements are all published so candidates can study from them — and none carries
 * a licence permitting a commercial product to copy their structure into a database. They may be
 * READ, to check whether a Nemesis curriculum broadly covers what such an exam expects. They may not
 * be INGESTED.
 *
 * The migration deliberately omits it from `core_sources.source_role`'s CHECK, because
 * `core_sources_commercial_friendly_check` would refuse such a row anyway and a column value nothing
 * may hold is dead architecture. It lives HERE because refusing by name is a behaviour, and a
 * refusal that cannot name what it refused teaches the caller nothing.
 */
export type SourceRole =
  /** Material a curriculum may be built FROM. */
  | "curriculum_seed"
  /** A concept vocabulary or hierarchy — MeSH, OpenAlex, Wikidata. Identity only, never pedagogy. */
  | "ontology"
  /** Structured data a renderer draws from — PDB accessions, PubChem records. */
  | "structured_data"
  /** A framework a finished curriculum may be compared AGAINST. Read, never copied, never stored. */
  | "alignment_target";

/** Roles whose material is copied into the corpus, and therefore need reuse rights. */
const INGESTING_ROLES: ReadonlySet<SourceRole> = new Set<SourceRole>([
  "curriculum_seed",
  "ontology",
  "structured_data",
]);

/** `core_source_license_versions.status`. Only `approved` may be built on. */
export type AttestationStatus = "approved" | "review" | "blocked";

/**
 * One row of `core_source_license_versions`, as the reader hands it over.
 *
 * 🔴 EVERY FIELD IS WHAT SOMEBODY SAW, NOT WHAT A PROVIDER IS ASSUMED TO GRANT. The owner's rule:
 * *"Never infer license from provider name."* Verified counterexamples that all look safe and are
 * not — OpenStax is CC BY-NC-SA, MIT OpenCourseWare is CC BY-NC-SA, WHO publications are
 * CC BY-NC-SA 3.0 IGO. Three of the most obvious "obviously open" educational publishers in the
 * world, all non-commercial, all fatal to a paid product.
 */
export interface LicenceAttestation {
  /** `core_sources.id`. THE source identity. This module mints none of its own. */
  readonly sourceId: string;
  /** `core_sources.source_role`. Null on every row written before 2026-08-23 — unknown, never permitted. */
  readonly role: SourceRole | null;
  /** SPDX-style identifier for THIS edition. Never the publisher's general policy. */
  readonly licenseName: string;
  /** The credit line the licence asks for, verbatim. */
  readonly attributionText?: string;
  /** Which edition, snapshot or release was read. */
  readonly sourceVersion: string;
  /** ISO date a human read the licence. Not when a crawler ran — nothing here crawls. */
  readonly verifiedAt: string;
  /** The page carrying the licence for THIS edition. */
  readonly verificationUrl?: string;
  readonly commercialUse: boolean;
  readonly derivatives: boolean;
  readonly shareAlike: boolean;
  readonly status: AttestationStatus;
}

export type LicenceRefusal =
  /** The attestation is not `approved`. Review and blocked are both "not yet". */
  | "not-approved"
  /** No role recorded, so nothing says what this source may be used for. */
  | "role-unknown"
  /** An `alignment_target` was offered for ingestion. Read it; do not copy it. */
  | "role-forbids-ingestion"
  /** No identifier at all. A repository name is not a licence. */
  | "licence-missing"
  /** An identifier we do not recognise. Unknown is a NO, never a maybe. */
  | "licence-not-reusable"
  /** The attestation itself says commercial use is not permitted. */
  | "commercial-use-denied"
  /** The attestation says no derivatives. Ingest chunks and re-expresses text, which is one. */
  | "derivatives-denied"
  /** A BY-family licence whose credit line was not kept, so it could never be displayed. */
  | "attribution-missing"
  /** No edition recorded — so the licence claim cannot be checked again. */
  | "version-missing"
  /** No verification date, or one that is not a real day. */
  | "unverified";

/**
 * A source that has passed the gate.
 *
 * 🔴 THE BRAND IS WHY THIS FILE WORKS. `LICENSED` is a private symbol-typed field no other module
 * can produce, so a plain object literal cannot be passed where a `LicensedSource` is required, and
 * a cast to one is visible in review as a cast. Every corpus writer takes this type and no other.
 */
declare const LICENSED: unique symbol;

export interface LicensedSource {
  readonly [LICENSED]: true;
  /** `core_sources.id` — carried through so provenance points at the one catalogue. */
  readonly sourceId: string;
  readonly role: SourceRole;
  readonly licenseName: string;
  readonly sourceVersion: string;
  /** Which gate admitted it — see `LICENCE_GATE_VERSION`. */
  readonly gateVersion: number;
  /** Whether a credit line must be rendered wherever this source's material is shown. */
  readonly attributionRequired: boolean;
  /** The credit line itself, when one is owed. Empty string when none is. */
  readonly attributionText: string;
  /**
   * 🔴 CARRIED, BECAUSE SHARE-ALIKE IS A PROMISE ABOUT WHAT NEMESIS PUBLISHES, NOT ABOUT WHAT IT
   * READS. `visual-provenance.ts` records the same caveat for images: showing a CC-BY-SA figure
   * unmodified triggers nothing, and the day something starts adapting and republishing is the day
   * this flag has to be consulted. Recording it costs nothing and cannot be recovered afterwards.
   */
  readonly shareAlike: boolean;
}

export type SourceAdmission =
  | { readonly ok: true; readonly source: LicensedSource }
  | { readonly ok: false; readonly refusal: LicenceRefusal; readonly detail: string };

/**
 * The only way to obtain a `LicensedSource`.
 *
 * 🔴 IT REFUSES BY DEFAULT. Every branch below returns a refusal; admission is the single fall
 * through at the end. A rule written the other way round — refuse a known-bad list, admit the rest —
 * lets a typo, a new identifier or an empty string through as permitted, and the failure mode is
 * legal rather than functional, so no test in this repo would catch it.
 *
 * 🔴 IT CHECKS THE NAME *AND* THE RIGHTS, WHICH ARE TWO DIFFERENT FACTS. `isReusableLicence` asks
 * whether the identifier is one Nemesis has decided it may build on; `commercialUse`/`derivatives`
 * are what the human who read the page actually recorded. Requiring both catches the two opposite
 * mistakes: an identifier nobody has vetted, and a vetted identifier whose row was filled in wrong.
 *
 * 🔴 IT NAMES ITS REFUSALS. `visual-route.ts` records why: a silence and a rejection must not be the
 * same outcome, or nothing can ever count how often the boundary is being probed. A source refused
 * for a missing credit line is one email away from being usable; one refused for CC BY-NC never
 * will be. Collapsing them loses the difference that decides what a human should do next.
 */
export function admitSource(attestation: LicenceAttestation): SourceAdmission {
  const name = attestation.sourceId;

  if (attestation.status !== "approved") {
    return {
      detail: `${name} carries a "${attestation.status}" attestation — only an approved one may be built on`,
      ok: false,
      refusal: "not-approved",
    };
  }

  if (attestation.role === null) {
    return {
      detail: `${name} has no source_role, so nothing records what it may be used for`,
      ok: false,
      refusal: "role-unknown",
    };
  }

  if (!INGESTING_ROLES.has(attestation.role)) {
    return {
      detail:
        `${name} is registered as ${attestation.role}, which may be read to check coverage ` +
        "and may never be copied into the corpus",
      ok: false,
      refusal: "role-forbids-ingestion",
    };
  }

  if (!attestation.sourceVersion.trim()) {
    return {
      detail: `${name} records no edition, so its licence claim names nothing checkable`,
      ok: false,
      refusal: "version-missing",
    };
  }

  if (!isIsoDate(attestation.verifiedAt)) {
    return {
      detail: `${name} has no date a human read its licence`,
      ok: false,
      refusal: "unverified",
    };
  }

  const identifier = attestation.licenseName.trim();
  if (!identifier) {
    return {
      detail: `no licence recorded for ${name} — a publisher's name is not a licence`,
      ok: false,
      refusal: "licence-missing",
    };
  }

  if (!isReusableLicence(identifier)) {
    return {
      detail:
        `"${identifier}" is not a licence Nemesis may build a corpus under. ` +
        `Permitted: ${REUSABLE_LICENCES.join(", ")}`,
      ok: false,
      refusal: "licence-not-reusable",
    };
  }

  if (!attestation.commercialUse) {
    return {
      detail: `the attestation for ${name} records that commercial use is not permitted`,
      ok: false,
      refusal: "commercial-use-denied",
    };
  }

  if (!attestation.derivatives) {
    // Ingest chunks, normalises and re-expresses text. That is a derivative work.
    return {
      detail: `the attestation for ${name} forbids derivatives, and ingestion produces one`,
      ok: false,
      refusal: "derivatives-denied",
    };
  }

  const needsCredit = attributionRequired(identifier);
  const credit = attestation.attributionText?.trim() ?? "";
  if (needsCredit && !credit) {
    return {
      detail: `${identifier} requires a credit line and none was kept for ${name}`,
      ok: false,
      refusal: "attribution-missing",
    };
  }

  return {
    ok: true,
    source: {
      attributionRequired: needsCredit,
      attributionText: credit,
      gateVersion: LICENCE_GATE_VERSION,
      licenseName: identifier,
      role: attestation.role,
      shareAlike: attestation.shareAlike,
      sourceId: attestation.sourceId,
      sourceVersion: attestation.sourceVersion.trim(),
    } as LicensedSource,
  };
}

/**
 * 🔴 A SHAPE CHECK PLUS A REALITY CHECK, BECAUSE `new Date("2026-13-45")` IS `Invalid Date` BUT
 * `new Date("2026-02-30")` SILENTLY BECOMES 2 MARCH. The round-trip comparison is what catches the
 * second, and a verification date that quietly moved is a record of a check that did not happen on
 * the day it claims.
 *
 * Accepts a bare `YYYY-MM-DD` or the leading date of an ISO timestamp, because `verified_at` is
 * `timestamptz` in Postgres and arrives as a full ISO string.
 */
function isIsoDate(value: string): boolean {
  const day = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === day;
}
