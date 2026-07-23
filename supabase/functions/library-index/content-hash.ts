/**
 * Stable hash of the text that actually gets embedded. The indexer compares this
 * against library_index_state.content_hash so a touch that did not change the
 * words (a move, a re-save, a sync echo) costs zero embedding calls.
 *
 * The title is length-prefixed so the title/content boundary is unambiguous
 * without embedding a control byte in this source file — ("AB","") and ("A","B")
 * hash differently because the prefixed length pins where the title ends.
 */
export async function contentHash(title: string, content: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${title.length}:${title}${content}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
