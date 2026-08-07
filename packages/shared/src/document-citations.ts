/**
 * A citation is only a citation if reopening it lands where it says.
 *
 * 🔴 THE DEFECT THIS EXISTS TO END: SOME STORED LOCATIONS ARE MODEL-SUPPLIED.
 * A model asked to cite its source will produce a page number, and that number
 * is a guess dressed as a fact. It is right often enough to look reliable and
 * wrong often enough to matter — and nothing downstream can tell the difference,
 * because a plausible page number and a correct one are the same shape.
 *
 * So nothing here trusts a claimed location. The primitive is the opposite one:
 * take the TEXT a model quoted, find where it actually is, and derive the
 * locator from the document. A quote that cannot be found produces no citation
 * at all, which is the honest outcome — the alternative is a link that opens the
 * wrong page and quietly teaches the student the system is unreliable.
 *
 * PURE. No storage, no model, no rendering.
 */

import {
  blockToText,
  locate,
  type DocBlock,
  type DocLocator,
  type DocumentModel,
} from "./document-model.ts";

/** Why a citation was refused. Each is a different fix, so none share a bucket. */
export type CitationRefusal =
  /** No block in this document carries that id. */
  | "unknown-block"
  /** The block exists, but its text does not contain the quote. */
  | "quote-not-found"
  /** The quote is too short to identify anything. */
  | "quote-too-short"
  /** The quote appears in more than one place, so the locator would be a guess. */
  | "ambiguous";

export type CitationResult =
  | { ok: true; locator: DocLocator; block: DocBlock; quote: string }
  | { ok: false; refusal: CitationRefusal };

/**
 * The shortest quote that can identify a place in a document.
 *
 * 🔴 A SHORT QUOTE MATCHES EVERYWHERE, AND MATCHING EVERYWHERE IS INDISTINGUISH-
 * ABLE FROM MATCHING CORRECTLY. "the patient" occurs on forty pages of a real
 * course document; a citation built from it points at the first one and looks
 * exactly like a citation that was checked.
 */
export const MIN_QUOTE_CHARS = 24;

/**
 * Compare on words, not on characters.
 *
 * Extraction inserts and removes whitespace: a PDF's runs are joined by measured
 * gaps, a Word paragraph may carry a tab, and a model retyping a quote will
 * normalise punctuation spacing without meaning to. Requiring an exact character
 * match refuses citations that are correct, which trains everyone to route
 * around the check.
 */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Turn a quote into a locator by finding it, never by believing a claim.
 *
 * Returns the block that genuinely contains the text. When several do, it
 * refuses: a locator chosen from among equals is a guess, and this module exists
 * because guesses were being stored as facts.
 */
export function citeQuote(doc: DocumentModel, quote: string): CitationResult {
  const needle = normalise(quote);
  if (needle.length < MIN_QUOTE_CHARS) return { ok: false, refusal: "quote-too-short" };

  const hits = doc.blocks.filter((block) => normalise(blockToText(block)).includes(needle));
  if (hits.length === 0) return { ok: false, refusal: "quote-not-found" };
  if (hits.length > 1) return { ok: false, refusal: "ambiguous" };

  const block = hits[0]!;
  return { block, locator: locate(doc, block), ok: true, quote: quote.trim() };
}

/**
 * Check a citation that already exists — the one a model, or an older parse,
 * handed us.
 *
 * 🔴 BOTH HALVES ARE CHECKED, BECAUSE A CORRECT ID WITH A WRONG QUOTE AND A
 * WRONG ID WITH A CORRECT QUOTE FAIL DIFFERENTLY. The first means the text moved
 * — a reparse, a better extractor — and the citation should be re-derived. The
 * second means the location was invented. Collapsing them into "invalid" would
 * lose which.
 */
export function verifyCitation(
  doc: DocumentModel,
  citation: { blockId: string; quote: string },
): CitationResult {
  const block = doc.blocks.find((b) => b.id === citation.blockId);
  if (!block) return { ok: false, refusal: "unknown-block" };
  const needle = normalise(citation.quote);
  if (needle.length < MIN_QUOTE_CHARS) return { ok: false, refusal: "quote-too-short" };
  if (!normalise(blockToText(block)).includes(needle)) return { ok: false, refusal: "quote-not-found" };
  return { block, locator: locate(doc, block), ok: true, quote: citation.quote.trim() };
}

/**
 * Reopen a locator: the block it names, or null.
 *
 * 🔴 THE UNIT IS CHECKED AGAINST THE DOCUMENT, NOT AGAINST THE LOCATOR'S OWN
 * CLAIM. A locator carries a unit and a unit kind, and a stored one may have
 * been written before a reparse moved things. Believing its self-description
 * would make every check pass by construction, which is the shape of a test that
 * verifies nothing.
 */
export function resolveLocator(doc: DocumentModel, locator: DocLocator): DocBlock | null {
  const block = doc.blocks.find((b) => b.id === locator.blockId);
  if (!block) return null;
  const unit = doc.units[block.unit];
  if (!unit) return null;
  if (block.unit !== locator.unit || unit.kind !== locator.unitKind) return null;
  return block;
}

/**
 * Every citation in a set, split into the ones that hold and the ones that do
 * not.
 *
 * Returning both is deliberate. A caller that only received the survivors would
 * have no way to say "two of the four claims could not be checked", and silently
 * dropping a failed citation presents a partially-verified answer as a fully
 * verified one.
 */
export function partitionCitations(
  doc: DocumentModel,
  citations: readonly { blockId: string; quote: string }[],
): { verified: CitationResult[]; refused: { citation: { blockId: string; quote: string }; refusal: CitationRefusal }[] } {
  const verified: CitationResult[] = [];
  const refused: { citation: { blockId: string; quote: string }; refusal: CitationRefusal }[] = [];
  for (const citation of citations) {
    const result = verifyCitation(doc, citation);
    if (result.ok) verified.push(result);
    else refused.push({ citation, refusal: result.refusal });
  }
  return { refused, verified };
}
