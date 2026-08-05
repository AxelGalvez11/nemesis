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

/** Typography a student cannot type. A real syllabus says `patient’s` with a
 *  curly apostrophe and `10–12` with an en dash; nobody searching for those
 *  reaches for the curly key. Every entry is one character in and one character
 *  out, so this costs the offset invariant nothing.
 *
 *  Deliberately absent: `…`, which would have to become three dots and move
 *  every character after it. Unicode spaces need no entry either — they already
 *  satisfy `\s`, so the whitespace run in `foldWithMap` collapses them. */
const TYPOGRAPHIC_FOLD: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "´": "'", "ʼ": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
};

/** Case-, accent- and typography-folded, and **exactly as long as its input**.
 *
 *  🔴 The length rule is measured in UTF-16 code units, not characters, because
 *  that is what a string offset actually indexes. A character outside the basic
 *  plane — the mathematical italic `𝑥` an engineering PDF is full of, a rare CJK
 *  glyph, an emoji — occupies TWO units, and folding it to one silently shifted
 *  every highlight after it by one character, drifting further with each one.
 *  Turkish `İ` fails the same rule in the other direction: its lowercase is two
 *  units long. So the fold is clamped to the input's own width rather than
 *  trusted to preserve it. */
export function foldForSearch(text: string): string {
  let folded = "";
  for (const character of text) {
    const width = character.length;
    const mapped = TYPOGRAPHIC_FOLD[character] ?? character;
    const stripped = mapped.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
    // A character that decomposes to nothing (a lone combining mark) keeps its
    // slot as a space, so offsets stay aligned with the original string.
    const candidate = stripped || " ";
    folded += candidate.length === width ? candidate : candidate.slice(0, width).padEnd(width, " ");
  }
  return folded;
}

/** Glyphs that stand in for several typed letters. Real academic PDFs are set
 *  with them and no keyboard produces them, so `ﬁrst` has to answer to "first".
 *  These DO change length, which is why they are expanded in `foldWithMap`,
 *  where an offset map already exists to absorb it. */
const LIGATURE_FOLD: Record<string, string> = {
  "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
  "æ": "ae", "œ": "oe", "ß": "ss",
};

/** Characters that are in the text but not on the page: a soft hyphen left by
 *  the typesetter, a zero-width joiner, a byte-order mark. Dropped entirely, so
 *  a word broken across a line still answers to the word. */
// Listed by code point rather than as literal characters: they are invisible in
// an editor, so a literal set here would be impossible to review or safely edit.
// Soft hyphen, zero-width space/non-joiner/joiner, word joiner, BOM.
const INVISIBLE = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

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
    if (INVISIBLE.has(character.codePointAt(0) ?? -1)) continue;
    if (/\s/.test(character)) {
      if (inWhitespace) continue;
      // A compound broken across a line — a real syllabus reads "the three-\n
      // extension limit" — is still one word to whoever types it. A whitespace
      // run that CONTAINS a line break and follows a hyphen disappears entirely
      // instead of becoming a space, so "three-extension" matches. The run has
      // to be examined whole: "-\r\n   " is the same break with indentation
      // after it. The hyphen itself stays — it is what the student types.
      if (folded.endsWith("-")) {
        let end = index;
        while (end < source.length && /\s/.test(source[end] ?? "")) end += 1;
        if (source.slice(index, end).includes("\n")) {
          index = end - 1;
          continue;
        }
      }
      inWhitespace = true;
      folded += " ";
      offsets.push(index);
      continue;
    }
    inWhitespace = false;
    // A ligature stands for several letters and so occupies several slots in
    // the folded string — every one of them pointing back at the single
    // character it came from, which is what keeps the highlight over the glyph.
    const expanded = LIGATURE_FOLD[character] ?? character;
    for (const unit of expanded) {
      folded += unit;
      offsets.push(index);
    }
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
