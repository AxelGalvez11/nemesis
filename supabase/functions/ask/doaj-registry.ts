/**
 * DOAJ journal registry — a credibility signal, not a source.
 *
 * DOAJ (Directory of Open Access Journals) vets journals against an anti-predatory checklist. A
 * citation whose journal is DOAJ-listed gets a "vetted open-access journal" badge. This is a
 * POSITIVE-ONLY signal: a missing badge means "not confirmed DOAJ-listed", NOT "low quality".
 *
 * The ISSN set is bundled (doaj-registry.data.ts) so the check is an offline O(1) lookup — no extra
 * API call in the answer path. Edge-only; the web client never imports the data (it just reads the
 * boolean the ask function stamps onto each citation).
 */

import { DOAJ_ISSNS } from "./doaj-registry.data.ts";

/**
 * Normalize an ISSN to the canonical `NNNN-NNNX` form. Accepts hyphenless ("00283004") and
 * mixed-case check digits ("2049-368x"). Returns "" when it isn't a well-formed 8-character ISSN.
 */
export function normalizeIssn(issn: string | null | undefined): string {
  if (!issn) return "";
  const s = issn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/**
 * True when ANY of the given ISSNs (a source can carry both a print and an online ISSN) belongs to a
 * DOAJ-listed journal. Tolerant of undefined/garbage entries.
 */
export function isDoajVetted(issns: ReadonlyArray<string | null | undefined>): boolean {
  for (const raw of issns) {
    const n = normalizeIssn(raw);
    if (n && DOAJ_ISSNS.has(n)) return true;
  }
  return false;
}
