// The citation tag is the join key between an answer's inline reference (citation_ids) and the
// evidence cards (chunk_tag). Both sides MUST normalize identically, so the function lives here and
// is imported by both the Ask page (which renders the inline chips) and the EvidencePanel (which
// builds the scroll-anchor id `ev-src-<normTag>`). Strips brackets and whitespace, e.g. "[ FDA 1 ]"
// → "FDA1".
export const normTag = (t: string): string => t.replace(/[[\]\s]/g, "");
