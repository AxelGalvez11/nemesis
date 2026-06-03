-- PharmaBro Phase 3 — add the deferred `filter_drug_entity` arg to the retriever.
--
-- Phase 2 built the drug_entity_sources A<->B bridge but deferred the optional
-- retriever filter to Phase 3, "so an untested signature change doesn't ship"
-- (only /ask exercises it). /ask now needs it: single-entity intents must scope
-- retrieval to one drug's sources so a "semaglutide side effects" query can't
-- surface a metformin chunk that merely scores well.
--
-- Scoping is via the bridge table (authoritative many-to-many), NOT
-- core_sources.metadata->>'drug_entity_id' (single-valued; a source about a
-- combo product maps to several entities). The new arg is the 6th param with a
-- NULL default, so every existing call site -- match_core_source_chunks(emb) --
-- still resolves unchanged.
--
-- CREATE OR REPLACE cannot change a function's argument count, so we DROP the
-- 5-arg signature (0107's) and CREATE the 6-arg one.
--
-- ANON GRANT (memory `pharmabro-supabase-anon-default-grant`): Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon`,
-- so the NEW signature gets a fresh anon EXECUTE grant at creation. 0112's revoke
-- targeted the 5-arg signature, which no longer exists. Re-REVOKE the 6-arg one.

DROP FUNCTION IF EXISTS public.match_core_source_chunks(
  extensions.vector(1024), INT, FLOAT, TEXT[], TEXT
);

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
  'Phase 3: 1024-dim ANN over core_source_chunks. Joins core_sources for license/provider/URL, excludes superseded. Optional filter_drug_entity scopes to one entity via the drug_entity_sources bridge (single-entity /ask intents).';

GRANT EXECUTE ON FUNCTION
  public.match_core_source_chunks(extensions.vector(1024), INT, FLOAT, TEXT[], TEXT, UUID)
  TO authenticated, service_role;

-- Match the authenticated-read model (§4): anon gets no catalog/retrieval access.
REVOKE EXECUTE ON FUNCTION
  public.match_core_source_chunks(extensions.vector(1024), INT, FLOAT, TEXT[], TEXT, UUID)
  FROM anon;
