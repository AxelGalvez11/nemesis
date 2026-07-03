import type { AnswerSections, ClaimSupport } from "@pharmabro/shared";

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

// WS-1 slice B: each paper's OWN verbatim supporting quote, keyed by normalized citation tag,
// across every answer section (not just the clicked claim). Picks the FIRST non-empty quote per
// tag — deterministic, no ranking. Purely a client-side derivation of data already present in
// answer_sections[].support[] (computed by attachSupport server-side); never fabricated, never an
// LLM paraphrase. Returns an empty map when `sections` is absent, so callers can skip the lookup
// entirely when the WS-1 flag is off or an older saved answer has no answer_sections.
export function supportQuotesByTag(
  sections: AnswerSections | undefined | null,
): Map<string, string> {
  const m = new Map<string, string>();
  if (!sections) return m;
  const points = [
    ...sections.what_we_know,
    ...sections.what_we_do_not_know,
    ...sections.safety_notes,
  ];
  for (const p of points) {
    for (const s of p.support ?? []) {
      const key = normTag(s.citation_tag);
      if (!m.has(key) && s.quote.trim()) m.set(key, s.quote);
    }
  }
  return m;
}
