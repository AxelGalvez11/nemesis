-- Phase 7 (corpus): switch Layer 1 embeddings from 1536-dim to 1024-dim.
--
-- Rationale: Voyage AI voyage-3-large is the chosen embedding model for
-- Layer 1 clinical retrieval (top MTEB medical retrieval, ~half the cost
-- of OpenAI text-embedding-3-large). Voyage native dim is 1024.
-- Cohere embed-v4.0 also supports 1024-dim via output_dimension, used
-- as fallback.
--
-- Migration is non-destructive of schema but DROPS any existing
-- embeddings (none exist yet — Layer 1 hasn't been ingested).
--
-- See: docs/source-strategy-corpus-plan.md, docs/runbooks/initial-corpus-ingest.md

-- =============================================================================
-- 1. Drop existing 1536-dim ivfflat index (must recreate after dim change)
-- =============================================================================

DROP INDEX IF EXISTS public.core_source_chunks_vec_idx;

-- =============================================================================
-- 2. Recreate embedding column at 1024-dim
-- =============================================================================
-- Cleanest path: drop + recreate (all rows have NULL embedding currently).

ALTER TABLE public.core_source_chunks
  DROP COLUMN IF EXISTS embedding;

ALTER TABLE public.core_source_chunks
  ADD COLUMN embedding extensions.vector(1024);

-- Update default embedding model marker.
ALTER TABLE public.core_source_chunks
  ALTER COLUMN embedding_model SET DEFAULT 'voyage-3-large';

-- =============================================================================
-- 3. Recreate ivfflat ANN index
-- =============================================================================

CREATE INDEX core_source_chunks_vec_idx
  ON public.core_source_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- =============================================================================
-- 4. Recreate match_core_source_chunks RPC for 1024-dim
-- =============================================================================

DROP FUNCTION IF EXISTS public.match_core_source_chunks(
  extensions.vector(1536), INT, FLOAT, TEXT[], TEXT
);

CREATE OR REPLACE FUNCTION public.match_core_source_chunks(
  query_embedding extensions.vector(1024),
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
    AND s.superseded_at IS NULL
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_core_source_chunks IS
  'Phase 7: 1024-dim ANN search over Layer 1 core_source_chunks. Embedded with Voyage AI voyage-3-large (Cohere embed-v4.0 fallback). Joins back to core_sources for license + provider + URL. Filters out superseded sources.';

GRANT EXECUTE ON FUNCTION public.match_core_source_chunks
  TO authenticated, service_role;

-- =============================================================================
-- 5. Update column comment
-- =============================================================================

COMMENT ON COLUMN public.core_source_chunks.embedding IS
  '1024-dim vector embedding. Primary: Voyage AI voyage-3-large. Fallback: Cohere embed-v4.0 at output_dimension=1024.';
