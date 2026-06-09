/**
 * Phase 2: persistence helpers for core_sources + core_source_chunks.
 *
 * Service-role writes only (RLS enforced). All inserts gated by
 * assertCommercialFriendly().
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assertCommercialFriendly, getLicenseRequirements } from "./license.ts";
import type { SectionedChunk } from "./chunking.ts";
import type { NormalizedSource } from "./normalized-source.ts";

// NormalizedSource now lives in the leaf ./normalized-source.ts (no runtime deps) so providers
// and the live path can name it without dragging this module's Supabase client into their
// type-check graph. Re-exported here so the many ingest-only callers importing it from persist.ts
// keep working unchanged.
export type { NormalizedSource } from "./normalized-source.ts";

export interface PersistResult {
  readonly source_id: string;
  readonly chunk_count: number;
  readonly skipped_unchanged: boolean;
}

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function client() {
  if (!SB_URL || !SERVICE_KEY) {
    throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  }
  return createClient(SB_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Upsert a source into core_sources. If content_hash matches existing row,
 * skip chunk re-embedding (saves $$). Returns source_id + skip flag.
 */
export async function upsertCoreSource(
  src: NormalizedSource,
): Promise<{ source_id: string; skipped_unchanged: boolean }> {
  assertCommercialFriendly(src.license);
  const sb = client();

  const { data: existing } = await sb
    .from("core_sources")
    .select("id, content_hash")
    .eq("provider", src.provider)
    .eq("provider_id", src.provider_id)
    .maybeSingle();

  if (existing && existing.content_hash === src.content_hash) {
    await sb
      .from("core_sources")
      .update({ retrieved_at: new Date().toISOString() })
      .eq("id", existing.id);
    const { count } = await sb
      .from("core_source_chunks")
      .select("*", { count: "exact", head: true })
      .eq("source_id", existing.id);
    const isOrphan = !count || count === 0;
    return { source_id: existing.id, skipped_unchanged: !isOrphan };
  }

  // Single source of truth for the stored flags: derive from the license's requirements rather
  // than hardcoding. assertCommercialFriendly() above already rejects commercial_use_allowed:false,
  // so this is always true here — but persisting the derived value keeps the row honest and makes
  // the DB CHECK (commercial_use_allowed = true) a genuine third line of defense, not a tautology.
  const req = getLicenseRequirements(src.license);
  const row = {
    provider: src.provider,
    provider_id: src.provider_id,
    title: src.title,
    subtitle: src.subtitle ?? null,
    license: src.license,
    attribution_required: req.attribution_required,
    commercial_use_allowed: req.commercial_use_allowed,
    share_alike_required: req.share_alike_required,
    source_url: src.source_url,
    content_hash: src.content_hash,
    fetched_at: new Date().toISOString(),
    retrieved_at: new Date().toISOString(),
    effective_at: src.effective_at ?? null,
    metadata: src.metadata,
  };

  if (existing) {
    const { data, error } = await sb
      .from("core_sources")
      .update({ ...row, superseded_at: null })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    // Wipe stale chunks so we re-embed against latest content.
    await sb.from("core_source_chunks").delete().eq("source_id", data.id);
    return { source_id: data.id, skipped_unchanged: false };
  }

  const { data, error } = await sb
    .from("core_sources")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return { source_id: data.id, skipped_unchanged: false };
}

/**
 * Bulk insert chunks with embeddings. Caller is responsible for embedding
 * the text first to keep this function pure-persistence.
 */
export async function insertChunks(
  source_id: string,
  chunks: ReadonlyArray<SectionedChunk>,
  embeddings: ReadonlyArray<number[]>,
  embedding_model = "voyage-3-large",
): Promise<number> {
  if (chunks.length !== embeddings.length) {
    throw new Error(
      `chunk/embedding count mismatch: ${chunks.length} vs ${embeddings.length}`,
    );
  }
  if (!chunks.length) return 0;

  const sb = client();

  const rows = chunks.map((c, i) => ({
    source_id,
    position: c.position,
    content: c.content,
    span: c.span,
    section: c.section,
    embedding: `[${embeddings[i].join(",")}]`,
    embedding_model,
    token_count: Math.ceil(c.content.length / 4),
  }));

  // Batch in groups of 50 (pgvector inserts can be slow with very large batches).
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await sb.from("core_source_chunks").insert(slice);
    if (error) throw error;
    inserted += slice.length;
  }
  return inserted;
}
