-- 0124 — retrieval index: ivfflat -> HNSW (PR1, backend evidence engine).
--
-- Why: ivfflat (lists=100) was "fine until ~100k rows" (0101). HNSW gives better
-- recall/latency and scales toward millions — the first retrieval-quality change
-- graded by the PR0 eval harness (eval/retrieval-eval.ts). Single-variable change:
-- the float vector is kept (no halfvec yet) and the RPC body/signature are identical
-- to 0113 — only the index method and a pinned hnsw.ef_search change, so the harness
-- measures the index in isolation.
--
-- ef_search: HNSW returns at most ef_search candidates, so it must be >= the number
-- of rows requested. The eval harness calls match_count=50, so ef_search MUST be
-- >= 50; we pin 100 (near-exact at the current ~9k vectors, with latency headroom).
-- Tunable later (raise for recall, lower for latency) or parameterize per-call in PR2.
-- If `SET hnsw.ef_search` errors at deploy (GUC unknown to the planner for this build),
-- drop the SET line and instead `ALTER DATABASE ... SET hnsw.ef_search = 100;` out of band.
--
-- ANON GRANT (memory `pharmabro-supabase-anon-default-grant`): CREATE OR REPLACE on the
-- SAME signature PRESERVES existing grants (0113's anon REVOKE holds), but we re-REVOKE/
-- GRANT defensively + idempotently so the authenticated-only contract is self-evident here.
--
-- Index build: non-CONCURRENT (db push may wrap in a txn; CONCURRENTLY can't run there).
-- ~9k rows builds in seconds; at millions it is minutes-to-hours — switch to CONCURRENTLY
-- (outside a txn) when the corpus is large (P4).
--
-- DEPLOY: owner-gated cloud write — `supabase db push` against ref qyjmivntajbigjswhahb.
-- Merging this file does NOT deploy it (no auto-migrate workflow); it must be pushed.
-- Acceptance after deploy: re-run eval/retrieval-eval.ts; aggregate >= committed baseline
-- (eval/baselines/2026-06-08-retrieval-baseline.json) within tolerance; guardrail green;
-- anon RPC still denied.

-- 1. Drop the ivfflat ANN index (name from 0101, recreated in 0107).
DROP INDEX IF EXISTS public.core_source_chunks_vec_idx;

-- 2. Create the HNSW ANN index (cosine; matches the RPC's <=> ordering).
--    Opclass is schema-qualified (extensions.vector_cosine_ops): pgvector lives in the
--    `extensions` schema and `supabase db push` runs without it on search_path, so an
--    UNqualified opclass name fails with "operator class does not exist for access method hnsw".
CREATE INDEX core_source_chunks_vec_idx
  ON public.core_source_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. Re-create the retriever with a pinned hnsw.ef_search. Signature + body are
--    identical to 0113 except the added SET clause (single-variable change).
CREATE OR REPLACE FUNCTION public.match_core_source_chunks(
  query_embedding extensions.vector(1024),
  match_count INT DEFAULT 8,
  match_threshold FLOAT DEFAULT 0.6,
  filter_providers TEXT[] DEFAULT NULL,
  filter_section TEXT DEFAULT NULL,
  filter_drug_entity UUID DEFAULT NULL
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
SET hnsw.ef_search = 100
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
    AND (filter_drug_entity IS NULL OR EXISTS (
          SELECT 1 FROM public.drug_entity_sources des
          WHERE des.source_id = c.source_id
            AND des.drug_entity_id = filter_drug_entity))
    AND s.superseded_at IS NULL
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_core_source_chunks IS
  'PR1: HNSW ANN (ef_search=100) over core_source_chunks. Body identical to 0113; only the index method + pinned ef_search changed. Joins core_sources for license/provider/URL, excludes superseded. filter_drug_entity scopes via the drug_entity_sources bridge.';

-- 4. Authenticated-only (defensive; CREATE OR REPLACE preserves grants, restated here).
GRANT EXECUTE ON FUNCTION
  public.match_core_source_chunks(extensions.vector(1024), INT, FLOAT, TEXT[], TEXT, UUID)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION
  public.match_core_source_chunks(extensions.vector(1024), INT, FLOAT, TEXT[], TEXT, UUID)
  FROM anon, PUBLIC;
