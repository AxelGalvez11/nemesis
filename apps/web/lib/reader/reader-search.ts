// In-document search: find every occurrence of what the student typed, tell the
// reader which page it is on and which characters to paint.
//
// Two rules that decide the whole design:
//
//  1. **Case and accents fold; the text does not change length.** Highlighting
//     works by character OFFSET into a page's text, so any normalisation that
//     could add or remove a character would move every match after it. NFD
//     decomposition is therefore applied per character and immediately
//     recomposed to a single slot — `é` folds to `e` in one position, never two.
//  2. **No word boundaries, no stemming.** Those are language rules, and this
//     has to work identically for a German compound, an Arabic sentence and a
//     Chinese phrase. A substring match is the only rule that is fair to every
//     script (CLAUDE.md: structural signals over language-specific ones).

export interface SearchMatch {
  /** 1-based page / slide the match is on. */
  unit: number;
  /** Character offset into that unit's text. */
  start: number;
  end: number;
}

/** Case- and accent-folded, one output character per input character. */
export function foldForSearch(text: string): string {
  let folded = "";
  for (const character of text) {
    const stripped = character.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    // A character that decomposes to nothing (a lone combining mark) keeps its
    // slot as a space, so offsets stay aligned with the original string.
    folded += (stripped || " ").slice(0, 1).toLocaleLowerCase();
  }
  return folded;
}

/** Whitespace differences must not stop a match: PDFs break lines wherever the
 *  layout did, so "commerce  clause" and "commerce\nclause" have to be equal to
 *  "commerce clause". Runs of whitespace fold to a single space, and the map
 *  records where each folded character came from. */
function foldWithMap(text: string): { folded: string; offsets: number[] } {
  const source = foldForSearch(text);
  let folded = "";
  const offsets: number[] = [];
  let inWhitespace = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (/\s/.test(character)) {
      if (inWhitespace) continue;
      inWhitespace = true;
      folded += " ";
      offsets.push(index);
      continue;
    }
    inWhitespace = false;
    folded += character;
    offsets.push(index);
  }
  return { folded, offsets };
}

/** Every occurrence of `query` in one unit's text, as offsets into that text. */
export function findInUnit(text: string, query: string, unit: number): SearchMatch[] {
  const needle = foldWithMap(query).folded.trim();
  if (!needle) return [];
  const { folded, offsets } = foldWithMap(text);
  const matches: SearchMatch[] = [];
  let from = 0;
  for (;;) {
    const at = folded.indexOf(needle, from);
    if (at === -1) break;
    const start = offsets[at] ?? 0;
    const lastFolded = at + needle.length - 1;
    const end = (offsets[lastFolded] ?? start) + 1;
    matches.push({ unit, start, end });
    from = at + Math.max(needle.length, 1);
  }
  return matches;
}

/** The whole document, page by page. Input order is preserved, so results come
 *  back in reading order without a sort. */
export function findInDocument(units: readonly { unit: number; text: string }[], query: string): SearchMatch[] {
  return units.flatMap((page) => findInUnit(page.text, query, page.unit));
}

/** Which match is "current" after pressing next/previous, wrapping at both
 *  ends. Returns -1 for an empty result rather than 0, so a caller cannot
 *  accidentally index into nothing. */
export function stepMatch(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}

/** Split one unit's text into painted and unpainted runs, for a view that
 *  renders text itself (Reading mode). Ranges are clipped and merged so
 *  overlapping matches cannot produce nested or negative-length spans. */
export function highlightRuns(
  text: string,
  ranges: readonly { start: number; end: number }[],
): { text: string; highlighted: boolean; index: number }[] {
  const clean = ranges
    .map((range) => ({ start: Math.max(0, range.start), end: Math.min(text.length, range.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number; index: number }[] = [];
  clean.forEach((range, index) => {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range, index });
  });

  const runs: { text: string; highlighted: boolean; index: number }[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) runs.push({ text: text.slice(cursor, range.start), highlighted: false, index: -1 });
    runs.push({ text: text.slice(range.start, range.end), highlighted: true, index: range.index });
    cursor = range.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), highlighted: false, index: -1 });
  return runs;
}
