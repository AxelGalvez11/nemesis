/**
 * Phase 2: persistence helpers for core_sources + core_source_chunks.
 *
 * Service-role writes only (RLS enforced). All inserts gated by
 * assertCommercialFriendly().
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { CoreSourceLicense, CoreSourceProvider } from "./license.ts";
import { assertCommercialFriendly } from "./license.ts";
import type { SectionedChunk } from "./chunking.ts";

export interface NormalizedSource {
  readonly provider: CoreSourceProvider;
  readonly provider_id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly source_url: string;
  readonly license: CoreSourceLicense;
  readonly content_text: string; // full raw text passed to chunker
  readonly content_hash: string; // sha256 hex of normalized content
  readonly metadata: Record<string, unknown>;
  readonly effective_at?: string;
}

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

  const row = {
    provider: src.provider,
    provider_id: src.provider_id,
    title: src.title,
    subtitle: src.subtitle ?? null,
    license: src.license,
    attribution_required: licenseRequiresAttribution(src.license),
    commercial_use_allowed: true,
    share_alike_required: src.license === "cc_by_sa",
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

function licenseRequiresAttribution(l: CoreSourceLicense): boolean {
  return l === "cc_by" || l === "cc_by_sa" || l === "oer_open";
}
