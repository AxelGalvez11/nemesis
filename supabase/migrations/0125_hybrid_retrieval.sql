-- 0125 — hybrid retrieval: sparse FTS (tsvector + GIN) + hybrid_match RPC fusing
--        dense ANN ⊕ sparse FTS via Reciprocal Rank Fusion (PR2, backend evidence engine).
--
-- DEPENDS ON PR1 (0124 HNSW): the dense arm uses the HNSW index + hnsw.ef_search.
-- Apply 0124 first.
--
-- Why: PR0 showed the headroom is in RANKING, not recall — the right doc is usually
-- retrieved but sometimes buried (e.g. omeprazole-indications gold at rank 17, MRR 0.059;
-- label-grounded Qs at rank 5-7). Lexical/keyword matching (FTS) promotes the doc whose
-- text literally answers the question; fusing it with dense cosine via RRF lifts MRR/nDCG
-- while recall holds. Measured by the PR0 harness against the PR1 baseline.
--
-- ⚠️ AC3 PRESERVED BY CONSTRUCTION: dense cosine stays the SOLE no-source-refusal signal.
-- The final SELECT gates every returned row on `dense_similarity > match_threshold`, so a
-- fabricated-drug query (no dense match above threshold) returns ZERO rows even if FTS
-- coincidentally matches a lexeme. FTS only re-ranks (via RRF) docs that already clear the
-- dense floor — it can never rescue a doc the dense arm rejects. The harness AC3 check
-- (zero rows for fabricated probes at threshold 0.5) holds unchanged.
--
-- FTS CONFIG DECISION (surfaced to owner — see the plan doc):
--   Using 'english' (stemming + stopwords) as the default: questions are prose, so
--   "warns"/"warning", "tumors"/"tumor" must match, and the dense arm + RRF cover the rare
--   drug-code case (BPC-157, GLP-1). Alternative 'simple' preserves exact codes but loses
--   prose recall. Validate via an A/B on the golden set once code-heavy items exist; switch
--   is a one-line config change + reindex. Default chosen: 'english'.
--
-- ANON GRANT (memory `pharmabro-supabase-anon-default-grant`): hybrid_match is a NEW
-- function, so Supabase's default-privileges ALTER grants anon EXECUTE at creation —
-- REVOKE it (and PUBLIC) explicitly below. The authenticated-read model must hold.
--
-- Backfill/scale note: the STORED generated column computes for all existing rows at ALTER
-- time (~9k rows = fast). At millions, ADD COLUMN ... GENERATED ... STORED rewrites the
-- table (slow/locking) — do it in a maintenance window or via a nullable column + backfill
-- batches when the corpus is large (P4).
--
-- DEPLOY: owner-gated cloud write — `supabase db push` (ref qyjmivntajbigjswhahb). Merging
-- does NOT apply it (no migrate-on-merge workflow). This SQL is authored but NOT locally
-- tested (no cloud/Docker here) — validate on first deploy via the harness; expect possible
-- minor fix-ups. /ask is untouched (still calls match_core_source_chunks) until a later PR
-- flips it behind a flag, so deploying this RPC is additive and safe.

-- 1. Sparse index: STORED generated tsvector over chunk content + GIN.
--    to_tsvector(regconfig, text) is IMMUTABLE (required for a generated column).
ALTER TABLE public.core_source_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS core_source_chunks_tsv_idx
  ON public.core_source_chunks USING gin (content_tsv);

-- 2. Hybrid retriever. Same RETURNS shape as match_core_source_chunks (drop-in compatible),
--    `similarity` = dense cosine (the refusal signal), rows ORDERED BY fused RRF score.
CREATE OR REPLACE FUNCTION public.hybrid_match_core_source_chunks(
  query_embedding extensions.vector(1024),
  query_text TEXT,
  match_count INT DEFAULT 8,
  match_threshold FLOAT DEFAULT 0.6,
  rrf_k INT DEFAULT 60,
  candidate_count INT DEFAULT 50,
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
  WITH q AS (
    SELECT websearch_to_tsquery('english', coalesce(query_text, '')) AS tsq
  ),
  dense AS (
    SELECT c.id,
           row_number() OVER (ORDER BY c.embedding <=> query_embedding) AS rnk
    FROM public.core_source_chunks c
    JOIN public.core_sources s ON s.id = c.source_id
    WHERE c.embedding IS NOT NULL
      AND s.superseded_at IS NULL
      AND (filter_providers IS NULL OR s.provider::TEXT = ANY(filter_providers))
      AND (filter_section IS NULL OR c.section ILIKE filter_section)
      AND (filter_drug_entity IS NULL OR EXISTS (
            SELECT 1 FROM public.drug_entity_sources des
            WHERE des.source_id = c.source_id AND des.drug_entity_id = filter_drug_entity))
    ORDER BY c.embedding <=> query_embedding
    LIMIT candidate_count
  ),
  sparse AS (
    SELECT c.id,
           row_number() OVER (ORDER BY ts_rank_cd(c.content_tsv, q.tsq) DESC) AS rnk
    FROM public.core_source_chunks c
    JOIN public.core_sources s ON s.id = c.source_id
    CROSS JOIN q
    WHERE c.content_tsv @@ q.tsq
      AND s.superseded_at IS NULL
      AND (filter_providers IS NULL OR s.provider::TEXT = ANY(filter_providers))
      AND (filter_section IS NULL OR c.section ILIKE filter_section)
      AND (filter_drug_entity IS NULL OR EXISTS (
            SELECT 1 FROM public.drug_entity_sources des
            WHERE des.source_id = c.source_id AND des.drug_entity_id = filter_drug_entity))
    ORDER BY ts_rank_cd(c.content_tsv, q.tsq) DESC
    LIMIT candidate_count
  ),
  fused AS (
    SELECT COALESCE(d.id, sp.id) AS id,
           COALESCE(1.0 / (rrf_k + d.rnk), 0.0) + COALESCE(1.0 / (rrf_k + sp.rnk), 0.0) AS rrf_score
    FROM dense d
    FULL OUTER JOIN sparse sp ON d.id = sp.id
  )
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
  FROM fused f
  JOIN public.core_source_chunks c ON c.id = f.id
  JOIN public.core_sources s ON s.id = c.source_id
  WHERE (1 - (c.embedding <=> query_embedding)) > match_threshold  -- dense floor = AC3 gate
  ORDER BY f.rrf_score DESC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.hybrid_match_core_source_chunks IS
  'PR2: hybrid dense ANN (HNSW) ⊕ sparse FTS (english tsvector) fused via RRF (k=60). Returns match_core_source_chunks shape; similarity = dense cosine. Final dense-floor gate (> match_threshold) keeps dense cosine the sole no-source-refusal signal (AC3 by construction). filter_* scope identically to the dense RPC.';

-- 3. Authenticated-only (NEW function → must REVOKE the default anon grant).
GRANT EXECUTE ON FUNCTION
  public.hybrid_match_core_source_chunks(extensions.vector(1024), TEXT, INT, FLOAT, INT, INT, TEXT[], TEXT, UUID)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION
  public.hybrid_match_core_source_chunks(extensions.vector(1024), TEXT, INT, FLOAT, INT, INT, TEXT[], TEXT, UUID)
  FROM anon, PUBLIC;
