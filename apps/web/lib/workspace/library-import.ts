/**
 * Turn an imported document's extracted text into an "interconnected" Library note.
 *
 * Interconnection here is dependency-free and graph-visible: we scan the extracted
 * text for the titles of notes that already exist and append a `## Related` section of
 * raw `[[Title]]` wiki-links. Anything that walks those links reads
 * raw `[[...]]` from note content, so those links become edges on BOTH the new note and
 * the ones it references — and backlinks appear on the existing notes with no edit to
 * them (see library-links.ts backlinksFor).
 *
 * Pure and DOM-free so it can be unit-tested without a browser or Supabase.
 */

/**
 * Titles shorter than this are too generic to auto-link on ("Lab", "Week", "pH") — they
 * would match half of every document and bury the real connections in noise.
 */
const MIN_TITLE_LEN = 4;

/** A single import never links to more than this many existing notes (keeps it signal). */
const MAX_RELATED = 12;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Existing note titles that appear as a whole phrase in `text`, returned in order of
 * first appearance, deduped, and capped. Matching is case-insensitive but the returned
 * string is the note's exact title (so the wiki-link resolves). Word-boundary guarded so
 * "Beta" matches "a Beta blocker" but not "Betamax".
 */
export function findRelatedTitles(
  text: string,
  notes: readonly { title: string }[],
): string[] {
  const haystack = text.toLowerCase();
  if (!haystack.trim()) return [];

  const seen = new Set<string>();
  const matches: { title: string; at: number }[] = [];
  for (const note of notes) {
    const title = (note.title ?? "").trim();
    if (title.length < MIN_TITLE_LEN) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    // A letter/number on either side means we're inside a larger word — not a real match.
    const boundary = `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(key)}(?:$|[^\\p{L}\\p{N}])`;
    const at = haystack.search(new RegExp(boundary, "u"));
    if (at < 0) continue;
    seen.add(key);
    matches.push({ title, at });
  }

  return matches
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_RELATED)
    .map((match) => match.title);
}

/**
 * The final markdown body for an imported document: the extracted text, then a
 * `## Related` section of `- [[Title]]` bullets. Raw `[[...]]` form is deliberate — the
 * graph's link parser only sees the raw form, never the rendered one. Returns the
 * trimmed body unchanged when there is nothing to relate.
 */
export function composeImportedNote(text: string, relatedTitles: readonly string[]): string {
  const body = text.trim();
  if (relatedTitles.length === 0) return body;
  const related = relatedTitles.map((title) => `- [[${title}]]`).join("\n");
  return `${body}\n\n## Related\n${related}\n`;
}

/** Title for an imported file: the extractor's title if it found one, else the filename. */
export function importedTitleFrom(fileName: string, extractedTitle?: string | null): string {
  const fromExtract = (extractedTitle ?? "").trim();
  if (fromExtract) return fromExtract;
  const fromName = fileName.replace(/\.[^.]+$/, "").trim();
  return fromName || "Imported document";
}
