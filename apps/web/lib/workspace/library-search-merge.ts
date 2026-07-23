/**
 * Fuse the two Library search arms into one list for the model.
 *
 * Semantic (vector) hits lead because they answer "notes about this idea";
 * lexical (ILIKE) hits follow because they catch literal tokens a vector misses
 * — course codes, abbreviations, drug names typed once. Same motivation as the
 * dense⊕sparse fusion in 0125_hybrid_retrieval.sql, minus the FTS infrastructure.
 */

export interface SemanticHit {
  path: string;
  title: string;
  content: string;
  similarity: number;
}

export interface LexicalHit {
  path: string;
  title: string;
  snippet: string;
}

export interface LibraryHit {
  path: string;
  title: string;
  snippet: string;
  source: "semantic" | "lexical" | "both";
}

const SNIPPET_CHARS = 240;

export function mergeLibraryHits(
  semantic: readonly SemanticHit[],
  lexical: readonly LexicalHit[],
  limit: number,
): LibraryHit[] {
  const lexicalPaths = new Set(lexical.map((hit) => hit.path));
  const seen = new Set<string>();
  const out: LibraryHit[] = [];

  for (const hit of [...semantic].sort((a, b) => b.similarity - a.similarity)) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    out.push({
      path: hit.path,
      title: hit.title,
      snippet: hit.content.slice(0, SNIPPET_CHARS).trim(),
      source: lexicalPaths.has(hit.path) ? "both" : "semantic",
    });
  }

  for (const hit of lexical) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    out.push({ path: hit.path, title: hit.title, snippet: hit.snippet, source: "lexical" });
  }

  return out.slice(0, limit);
}
