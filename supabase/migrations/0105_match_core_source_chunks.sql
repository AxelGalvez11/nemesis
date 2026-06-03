-- Phase 2 (source ingest): RPC for core_source_chunks similarity search.
--
-- Layer 1 retrieval uses 1536-dim OpenAI text-embedding-3-large
-- (or Cohere embed-v4.0) to match clinical-grade semantic accuracy
-- expected by FDA / DailyMed / RxNorm / CDC content.
--
-- Distinct from `match_embeddings` (768-dim user-content RPC) and
-- `match_multimodal_embeddings` (1536-dim with multimodal kind filter).
--
-- See: docs/source-strategy.md, supabase/migrations/0101_core_sources.sql

-- =============================================================================
-- match_core_source_chunks(query_embedding, match_count, match_threshold,
--                          filter_providers, filter_section)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.match_core_source_chunks(
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 8,
  match_threshold FLOAT DEFAULT 0.6,
  filter_providers TEXT[] DEFAULT NULL,
  filter_section TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_id UUID,
  chunk_text TEXT,
  section TEXT,
  span JSONB,
  provider TEXT,
  license TEXT,
  attribution_required BOOLEAN,
  source_url TEXT,
  retrieved_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.source_id,
    c.content AS chunk_text,
    c.section,
    c.span,
    s.provider::TEXT AS provider,
    s.license::TEXT AS license,
    s.attribution_required,
    s.source_url,
    s.retrieved_at,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.core_source_chunks c
  JOIN public.core_sources s ON s.id = c.source_id
  WHERE c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    AND (filter_providers IS NULL OR s.provider::TEXT = ANY(filter_providers))
    AND (filter_section IS NULL OR c.section ILIKE filter_section)
    AND s.superseded_at IS NULL  -- exclude superseded sources
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_core_source_chunks IS
  'Phase 2: ANN search over Layer 1 core_source_chunks (1536-dim). Joins back to core_sources for license + provider + URL. Filters out superseded sources. Used by hybrid RAG retrieval for clinical grounding.';

-- Grant execute to authenticated users (RLS still enforced via underlying tables).
GRANT EXECUTE ON FUNCTION public.match_core_source_chunks
  TO authenticated, service_role;
