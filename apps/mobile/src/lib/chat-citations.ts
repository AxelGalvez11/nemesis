// Answers grounded on web search cite their numbered results as [1]..[5]. This
// turns those markers into `#nemesis-cite=` links; MessageBody's custom `link`
// render rule paints those as inline favicon pills (same pre-process idiom as
// the ==highlight== / <u>underline</u> rules in markdown-obsidian.ts).
//
// Ported VERBATIM from web's apps/web/lib/workspace/chat-citations.ts so a
// thread shared between phone and web renders identical pills — same grouping,
// same out-of-range handling, same code-span skipping. The only regex feature
// used is a negative LOOKAHEAD `(?!\()` (Hermes supports these); there is no
// lookbehind anywhere, which Hermes forbids.
//
// Consecutive markers ("[1][2]", or "[1] [2]") collapse into ONE pill whose
// href carries every index ("#nemesis-cite=1,2"); the renderer labels it with
// the first source and a "+n" suffix and lists all of them in the tap sheet.
//
// Kept as a pure module, separate from the renderer, so the edge cases below
// are covered by chat-citations.test.ts without mounting React Native.

/** The href scheme the renderer keys off. Exported so the parse below and the
 *  renderer agree on one spelling. */
export const CITE_HREF_PREFIX = "#nemesis-cite=";

/** A single `[12]` marker not already followed by `(` (i.e. not a markdown
 *  link). We scan positions with this rather than replacing greedily, so an
 *  out-of-range marker sitting between two valid ones stays literal text
 *  instead of being swallowed into a group. */
const CITE_MARKER_RE = /\[(\d{1,2})\](?!\()/g;

/** What may sit between two markers for them to still count as "consecutive":
 *  spaces/tabs only. A comma ("[1], [2]") reads as a list and a newline is a
 *  different sentence — neither should merge. */
const INTER_MARKER_GAP_RE = /^[ \t]*$/;

/** Fenced blocks and inline code, captured so split() keeps them as odd-index
 *  chunks we pass through untouched. */
const CODE_SEGMENT_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

interface Marker {
  start: number;
  end: number;
  n: number;
}

/**
 * Parse a citation href back into its 1-based source indices.
 *
 * Handles both a lone marker (`#nemesis-cite=3`) and a merged group
 * (`#nemesis-cite=1,2`). Returns [] for anything that is not a citation href,
 * so the renderer can treat "no indices" as "this link is not a pill".
 */
export function parseCitationHref(href: string | null | undefined): number[] {
  if (!href || !href.startsWith(CITE_HREF_PREFIX)) return [];
  return href
    .slice(CITE_HREF_PREFIX.length)
    .split(",")
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isInteger(n) && n >= 1);
}

/** Rewrite one non-code chunk: group consecutive in-range markers into a single
 *  pill link, leave everything else (prose, out-of-range markers) byte-for-byte
 *  as it was. */
function rewriteChunk(chunk: string, sourceCount: number): string {
  // Collect only in-range markers with their spans. Out-of-range ones are never
  // recorded, so they fall inside the untouched gaps we slice below — the model
  // sometimes invents a number and a bare "[9]" is less wrong than a pill
  // pointing at nothing.
  const markers: Marker[] = [];
  CITE_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CITE_MARKER_RE.exec(chunk)) !== null) {
    const digits = match[1];
    if (digits === undefined) continue;
    const n = Number.parseInt(digits, 10);
    if (n >= 1 && n <= sourceCount) {
      markers.push({ start: match.index, end: match.index + match[0].length, n });
    }
  }
  if (markers.length === 0) return chunk;

  const out: string[] = [];
  let cursor = 0;
  let i = 0;
  while (i < markers.length) {
    const groupStart = markers[i]!;
    // Extend the group while the next marker is only whitespace away.
    let last = i;
    let tail = markers[last]!;
    let next = markers[last + 1];
    while (next && INTER_MARKER_GAP_RE.test(chunk.slice(tail.end, next.start))) {
      last += 1;
      tail = next;
      next = markers[last + 1];
    }
    // Dedupe within the group, preserving first-seen order ("[1][1]" -> "1").
    const seen = new Set<number>();
    const indices: number[] = [];
    for (let k = i; k <= last; k += 1) {
      const n = markers[k]!.n;
      if (!seen.has(n)) {
        seen.add(n);
        indices.push(n);
      }
    }
    // Prose before the group, then the pill — the pill's visible text is the
    // first index but the renderer ignores it (it paints favicon + label), so a
    // lone marker still emits exactly the pre-grouping "[1](#nemesis-cite=1)".
    out.push(chunk.slice(cursor, groupStart.start));
    out.push(`[${indices[0]}](${CITE_HREF_PREFIX}${indices.join(",")})`);
    cursor = tail.end;
    i = last + 1;
  }
  out.push(chunk.slice(cursor));
  return out.join("");
}

/**
 * Rewrite in-range citation markers into pill links.
 *
 * `sourceCount` is the number of results the model was actually given. Markers
 * outside 1..sourceCount are left as plain text. Fenced and inline code is
 * preserved untouched so `arr[1]` never turns into a citation.
 */
export function citationsToMarkdown(text: string, sourceCount: number): string {
  if (sourceCount <= 0) return text;
  return text
    .split(CODE_SEGMENT_RE)
    .map((chunk, index) => (index % 2 === 1 ? chunk : rewriteChunk(chunk, sourceCount)))
    .join("");
}
