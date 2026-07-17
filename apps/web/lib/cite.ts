import type { ClaimSupport } from "@nemesis/shared";

// The citation tag is the join key between an answer's inline reference (citation_ids) and the
// evidence cards (chunk_tag). Both sides MUST normalize identically, so the function lives here and
// is imported by both the Ask page (which renders the inline chips) and the EvidencePanel (which
// builds the scroll-anchor id `ev-src-<normTag>`). Strips brackets and whitespace, e.g. "[ FDA 1 ]"
// → "FDA1".
export const normTag = (t: string): string => t.replace(/[[\]\s]/g, "");

// The verbatim supporting sentence a claim attached for a given citation tag, or undefined. The
// `support` array is computed server-side (a real source substring, never an LLM guess), so this only
// ever surfaces text the cited source actually contains. Normalizes both sides with normTag so a
// bracketed/spaced tag still matches. Returns undefined when nothing supports the tag → the UI simply
// shows no highlight (graceful, never fabricated).
export function supportQuoteFor(
  support: ReadonlyArray<ClaimSupport> | undefined,
  tag: string,
): string | undefined {
  if (!support?.length) return undefined;
  const want = normTag(tag);
  return support.find((s) => normTag(s.citation_tag) === want)?.quote;
}
