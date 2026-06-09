// Read-through-ingest ("fetch once, keep forever"): persist live results into the library so
// the next identical query is served from the embedded corpus (no API call), the source gets a
// real source_id/chunk_id for clean citations, and the snapshot library grows with real usage
// instead of staying frozen at its ingest date.
//
// Reuses the exact ingest path the corpus was built with — so dedupe, supersession, and the
// commercial-license gate all apply for free:
//   - upsertCoreSource: matches on (provider, provider_id); same content_hash => skip re-embed
//     (no duplicates, no wasted $$); changed content => update in place (supersede).
//   - assertCommercialFriendly (inside upsert): a non-licensable source THROWS — caught per item
//     so one bad license never sinks the batch.

import type { NormalizedSource } from "../core-source-sync/persist.ts";
import { insertChunks, upsertCoreSource } from "../core-source-sync/persist.ts";
import { chunkClinicalText } from "../core-source-sync/chunking.ts";
import { embedCoreTexts } from "../core-source-sync/embeddings.ts";

export interface SaveResult {
  newlyEmbedded: number; // sources chunked + embedded this call
  chunksInserted: number;
  alreadyHad: number; // dedupe hits (unchanged) — proof the library isn't bloating
  failed: number; // license-gated or errored (skipped, not fatal)
  sourceIds: string[];
}

/**
 * Persist live sources into the library. Idempotent: re-saving an unchanged source is a no-op
 * (dedupe by content_hash). Never throws on a single bad source.
 */
export async function saveToLibrary(sources: ReadonlyArray<NormalizedSource>): Promise<SaveResult> {
  const res: SaveResult = { newlyEmbedded: 0, chunksInserted: 0, alreadyHad: 0, failed: 0, sourceIds: [] };

  for (const src of sources) {
    try {
      const { source_id, skipped_unchanged } = await upsertCoreSource(src);
      res.sourceIds.push(source_id);
      if (skipped_unchanged) {
        res.alreadyHad++;
        continue;
      }
      const chunks = chunkClinicalText(src.content_text);
      if (chunks.length === 0) continue;
      const embeddings = await embedCoreTexts(chunks.map((c) => c.content));
      res.chunksInserted += await insertChunks(source_id, chunks, embeddings);
      res.newlyEmbedded++;
    } catch (err) {
      // license-gated or transient error: skip this source, keep the batch alive.
      res.failed++;
      console.error(`saveToLibrary skipped ${src.provider}:${src.provider_id}:`, err instanceof Error ? err.message : err);
    }
  }

  return res;
}
