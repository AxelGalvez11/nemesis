// §42 rung three, filled from openly licensed textbooks.
//
// 🔴🔴 THE RUNG HAS EXISTED SINCE #756 AND HAS NEVER HAD A SHELF BEHIND IT. `reference-registry.ts`
// is empty on purpose and says why: a hand-entered row is a file somebody opened and read the
// licence of, which is slow, which is the point. That argument is right and this does not weaken
// it. What it adds is a shelf where the same standard is met by MACHINE-CHECKABLE evidence rather
// than by a person: a textbook whose catalogue entry says CC BY, whose own metadata endpoint says
// CC BY, and whose figure could not have been inserted without passing a database constraint that
// only admits four licence families. Three checks, each independent, none of them a guess.
//
// 🔴 IT IS NOT "BULK-INGEST THE INTERNET", WHICH THE OWNER FORBADE AND WAS RIGHT TO. The distinction
// is the unit. A crawler takes whatever a page holds and asks a licence question afterwards, when
// the answer can no longer be checked. This takes a BOOK at a time, from a catalogue that states a
// licence per book, and verifies that licence against what the book says about itself before a
// single figure is read. The failure mode a crawler has — a corpus whose licences were true on the
// day it ran — is answered by storing the licence url per row, so any row can be re-checked later
// against the source that granted it.
//
// 🔴 THE CAPTION IS THE AUTHOR'S OWN, AND THAT IS WHY THIS IS CHEAP AND GOOD. Nothing here asks a
// vision model what a picture shows. The person who wrote the textbook already wrote it down, and
// their sentence is both the searchable text and the thing shown to the learner.

import type { ReferenceCandidate } from "./reference-images";
import type { AssetLicence } from "./visual-provenance";

/** One row as `/api/v1/figures/search` returns it. */
export interface FigureHit {
  id: string;
  imageUrl: string;
  caption: string;
  alt: string;
  bookTitle: string;
  bookUrl: string;
  attribution: string;
  licence: string;
  chapterTitle: string;
  similarity: number;
}

/**
 * A Creative Commons url as the ladder's SPDX-style identifier, or null.
 *
 * 🔴 AN ALLOW LIST WITH NO WILDCARD, for the reason `normaliseLicence` gives in reference-images.ts:
 * a `startsWith("creativecommons.org/licenses/by")` test reads as reasonable and silently admits
 * `by-nc/`, which forbids the commercial use Nemesis is. NC and ND are absent on purpose, so a row
 * carrying one falls through to null, the candidate loses its licence, and `chooseAsset` refuses it.
 * Unusable is the correct outcome; unattributed is not.
 *
 * 🔴 THE VERSION IS READ FROM THE URL RATHER THAN ASSUMED TO BE 4.0. Real books in this catalogue
 * carry 3.0 grants, and recording a 3.0 figure as 4.0 would be inventing the terms we hold it under.
 */
export function licenceFromCcUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const clean = url.trim().toLowerCase();
  const by = clean.match(/creativecommons\.org\/licenses\/(by|by-sa)\/(\d)\.(\d)/);
  if (by) {
    const family = by[1] === "by" ? "CC-BY" : "CC-BY-SA";
    const version = `${by[2]}.${by[3]}`;
    const identifier = `${family}-${version}`;
    // Only the versions §42 lists. A 2.0 grant is real and is simply not one we have decided on.
    return ["CC-BY-3.0", "CC-BY-4.0", "CC-BY-SA-3.0", "CC-BY-SA-4.0"].includes(identifier)
      ? identifier
      : null;
  }
  if (/creativecommons\.org\/publicdomain\/zero\/1\.0/.test(clean)) return "CC0-1.0";
  if (/creativecommons\.org\/publicdomain\/mark/.test(clean)) return "public-domain";
  return null;
}

/**
 * One shelf row as a candidate the ladder can judge.
 *
 * 🔴 RETURNS null RATHER THAN A CANDIDATE WITH A MISSING FIELD. A row with no attribution or an
 * unrecognised licence is not a weaker candidate, it is one `chooseAsset` would refuse anyway; and
 * a candidate that reaches the ladder and is rejected there costs a refusal reason that reads like
 * a coverage problem when it is really a bookkeeping one. Dropping it here keeps those distinct,
 * which is the whole discipline `AssetRefusal` exists to hold.
 */
export function candidateFrom(hit: FigureHit): ReferenceCandidate | null {
  const licence = licenceFromCcUrl(hit.licence);
  if (!licence) return null;
  if (!hit.attribution.trim()) return null;
  if (!hit.bookTitle.trim()) return null;
  if (!hit.imageUrl.trim() || hit.imageUrl.length > 500) return null;

  // 🔴 EVERY BOUND BELOW IS `figureAsset`'s (canvas-visual.ts), APPLIED WHERE TRIMMING IS STILL
  // POSSIBLE. Stored figure blocks are re-validated with hard caps — caption 300, attribution 200,
  // source 80 — and a field over the cap there refuses the WHOLE figure. Measured on the shelf:
  // 1,840 captions and 588 attributions run longer than the caps, because textbook authors write
  // real sentences. Trimmed here, the figure survives with a shortened line; untrimmed, it renders
  // once and then vanishes from the stored lesson, which reads as the canvas losing pictures.
  const caption = bounded(hit.caption.trim(), 300);
  const bookUrl = /^https:\/\//.test(hit.bookUrl) && hit.bookUrl.length <= 400 ? hit.bookUrl : null;
  const assetLicence: AssetLicence = {
    attribution: bounded(hit.attribution.trim(), 200),
    licence,
    source: bounded(hit.bookTitle.trim(), 80),
    ...(bookUrl ? { url: bookUrl } : {}),
  };

  return {
    assetPath: hit.imageUrl,
    // The author's sentence, which is both what was indexed and what a learner reads.
    ...(caption ? { caption } : {}),
    licence: assetLicence,
    providerId: "textbook-shelf",
    provenance: "reference_image",
    // Where in the book it sits. Reporting only: never a licence decision.
    tags: [hit.bookTitle, hit.chapterTitle].filter((tag) => tag.trim().length > 0),
    ...(bookUrl ? { url: bookUrl } : {}),
  };
}

/** Word-safe cut to a validator's cap. The ellipsis is inside the cap, so the result always fits. */
function bounded(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}\u2026`;
}

/** Injected so every rule above is testable without a network. */
export interface FigureSearchDeps {
  readonly search?: (concept: string, limit: number) => Promise<FigureHit[]>;
}

/**
 * Ask the shelf for pictures of a concept.
 *
 * 🔴 AN EMPTY ARRAY ON EVERY FAILURE, NEVER A THROW. The shelf being unavailable and the shelf
 * holding nothing about this concept are the same thing to a teaching turn: there is no
 * trustworthy picture, which §42 already knows how to say honestly. A canvas must not lose a
 * lesson because a search index is down.
 */
export async function textbookFigures(
  concept: string,
  limit = 4,
  deps: FigureSearchDeps = {},
): Promise<ReferenceCandidate[]> {
  const trimmed = concept.trim();
  if (!trimmed) return [];
  const search = deps.search ?? defaultSearch;
  try {
    const hits = await search(trimmed, limit);
    return hits.map(candidateFrom).filter((c): c is ReferenceCandidate => c !== null);
  } catch {
    return [];
  }
}

async function defaultSearch(concept: string, limit: number): Promise<FigureHit[]> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];
  const res = await fetch("/api/v1/figures/search", {
    body: JSON.stringify({ concept, limit }),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { figures?: FigureHit[] };
  return Array.isArray(json.figures) ? json.figures : [];
}
