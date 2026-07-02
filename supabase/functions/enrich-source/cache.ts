// Pure helpers for the enrich-source cache/batch boundary: request validation
// (PMID shape + batch cap) and TTL freshness arithmetic. Kept isolated from the
// serve handler so both are unit-testable without a network or database.

/** A PMID is a positive numeric string, 1-9 digits (PubMed IDs are unpadded integers). */
const PMID_RE = /^\d{1,9}$/;

/**
 * Validate and cap a raw JSON-decoded `pmids` field. Non-array input, non-string
 * entries, and malformed ids are dropped silently (best-effort — never throws).
 */
export function parsePmids(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter((p): p is string => typeof p === "string" && PMID_RE.test(p));
  return valid.slice(0, max);
}

/**
 * True when a cache row fetched at `fetchedAt` (ISO timestamp) is still within
 * `ttlDays` of `now` (ms epoch). The TTL boundary itself counts as stale
 * (strict greater-than), so a row exactly `ttlDays` old is refreshed rather
 * than served one tick early.
 */
export function isFresh(fetchedAt: string, now: number, ttlDays: number): boolean {
  const cutoff = now - ttlDays * 24 * 3600 * 1000;
  return new Date(fetchedAt).getTime() > cutoff;
}

// Total-row count from a PostgREST `Content-Range` response header:
// "0-0/57" → 57, "*/0" → 0. Returns null when the header is absent or carries
// no exact count (e.g. "0-24/*") — callers must treat null as "count
// unavailable", never as zero.
export function parseContentRangeCount(header: string | null): number | null {
  const m = /\/(\d+)\s*$/.exec(header ?? "");
  return m ? Number(m[1]) : null;
}
