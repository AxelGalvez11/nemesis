-- PharmaBro Phase 2 — Layer A<->B bridge + read RPCs. See IMPLEMENTATION_PLAN.md §5, §8.
--
-- The bridge scopes Layer-A evidence (core_sources) to a canonical drug_entity.
-- The read RPCs back the frozen §8 contract: /search, /drugs/{id} (+ label,
-- trials, pubmed). All are SECURITY DEFINER (mirror match_core_source_chunks) so
-- the app's authenticated path is exactly what we validate; every read JOINs
-- core_sources so the citation (url / license / retrieved_at) rides in the
-- payload — "cited" must mean a citation in the response, not just an FK.

-- =============================================================================
-- 1. drug_entity_sources — the A<->B bridge
-- =============================================================================

CREATE TABLE drug_entity_sources (
  drug_entity_id uuid NOT NULL REFERENCES drug_entities(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES core_sources(id) ON DELETE CASCADE,
  relation text DEFAULT 'about',            -- about | mentions | label_for | trial_of
  PRIMARY KEY (drug_entity_id, source_id)
);
CREATE INDEX drug_entity_sources_source_idx ON drug_entity_sources (source_id);

ALTER TABLE drug_entity_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_entity_sources_read_authenticated
  ON drug_entity_sources FOR SELECT TO authenticated USING (true);

-- The entity-linker also stamps core_sources.metadata.drug_entity_id (host-side),
-- so a future /ask retriever can gain an optional filter_drug_entity arg with a
-- one-line WHERE add (deferred to Phase 3 — not exercised in Phase 2).

-- =============================================================================
-- 2. search_entities(q) — FTS + trigram + ALIAS union  (AC1)
-- =============================================================================
-- The acceptance query: "ozempic" (a brand alias) must resolve to the
-- "semaglutide" canonical entity. So matching MUST union canonical_name +
-- drug_aliases.alias. Exact > prefix > trigram similarity.

CREATE OR REPLACE FUNCTION public.search_entities(
  q text,
  max_results int DEFAULT 20
)
RETURNS TABLE (
  type text,
  id uuid,
  name text,
  subtitle text,
  status text,
  score real
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH ranked AS (
    SELECT e.id, max(m.s)::real AS s
    FROM drug_entities e
    JOIN LATERAL (
      SELECT CASE
               WHEN lower(e.canonical_name) = lower(trim(q)) THEN 1.0
               WHEN lower(e.canonical_name) LIKE lower(trim(q)) || '%' THEN 0.9
               ELSE similarity(e.canonical_name, q)
             END AS s
      UNION ALL
      SELECT CASE
               WHEN lower(a.alias) = lower(trim(q)) THEN 1.0
               WHEN lower(a.alias) LIKE lower(trim(q)) || '%' THEN 0.88
               ELSE similarity(a.alias, q) * 0.95
             END
      FROM drug_aliases a
      WHERE a.drug_entity_id = e.id
    ) m ON true
    WHERE e.canonical_name % q
       OR lower(e.canonical_name) LIKE '%' || lower(trim(q)) || '%'
       OR EXISTS (
            SELECT 1 FROM drug_aliases a2
            WHERE a2.drug_entity_id = e.id
              AND (a2.alias % q OR lower(a2.alias) LIKE '%' || lower(trim(q)) || '%')
          )
    GROUP BY e.id
  )
  SELECT
    e.entity_type AS type,
    e.id,
    e.canonical_name AS name,
    (SELECT a.alias FROM drug_aliases a
       WHERE a.drug_entity_id = e.id AND a.alias_type = 'brand'
       ORDER BY a.confidence DESC NULLS LAST, a.alias LIMIT 1) AS subtitle,
    e.approved_status AS status,
    r.s AS score
  FROM ranked r
  JOIN drug_entities e ON e.id = r.id
  WHERE r.s > 0.15
  ORDER BY r.s DESC, e.canonical_name ASC
  LIMIT max_results;
$$;

-- =============================================================================
-- 3. get_drug(id) — overview + citations  (AC1 page)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_drug(p_id uuid)
RETURNS jsonb
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'id', e.id,
    'canonical_name', e.canonical_name,
    'entity_type', e.entity_type,
    'approved_status', e.approved_status,
    'mechanism_summary', e.mechanism_summary,
    'rxnorm_cui', e.rxnorm_cui,
    'primary_class', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name)
      FROM drug_classes c WHERE c.id = e.primary_class_id),
    'classes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
      FROM drug_class_memberships mem JOIN drug_classes c ON c.id = mem.class_id
      WHERE mem.drug_entity_id = e.id),
    'brand_names', (
      SELECT coalesce(jsonb_agg(DISTINCT a.alias), '[]'::jsonb)
      FROM drug_aliases a WHERE a.drug_entity_id = e.id AND a.alias_type = 'brand'),
    'evidence_score', (
      SELECT jsonb_build_object('score', s.score, 'rationale', s.rationale,
               'evidence_counts', s.evidence_counts, 'limitations', s.limitations)
      FROM evidence_scores s
      WHERE s.entity_id = e.id AND s.entity_type = 'drug'
      ORDER BY s.updated_at DESC LIMIT 1),
    'counts', jsonb_build_object(
      'labels', (SELECT count(*) FROM label_documents WHERE drug_entity_id = e.id),
      'trials', (SELECT count(*) FROM drug_entity_trials WHERE drug_entity_id = e.id),
      'pubmed', (SELECT count(*) FROM drug_entity_pubmed WHERE drug_entity_id = e.id),
      'prices', (SELECT count(*) FROM drug_prices WHERE drug_entity_id = e.id)),
    'sources', (
      SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
               'source_id', s.id, 'provider', s.provider, 'title', s.title,
               'url', s.source_url, 'license', s.license, 'retrieved_at', s.retrieved_at)), '[]'::jsonb)
      FROM drug_entity_sources des JOIN core_sources s ON s.id = des.source_id
      WHERE des.drug_entity_id = e.id)
  )
  FROM drug_entities e
  WHERE e.id = p_id;
$$;

-- =============================================================================
-- 4. get_drug_label(id) — extracted sections + citation  (AC4)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_drug_label(p_id uuid)
RETURNS TABLE (
  label_id uuid,
  source text,
  set_id text,
  published_date date,
  label_url text,
  extracted_sections jsonb,
  source_id uuid,
  provider text,
  citation_url text,
  license text,
  retrieved_at timestamptz
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT l.id, l.source, l.set_id, l.published_date, l.label_url,
         l.extracted_sections,
         s.id, s.provider::text, coalesce(s.source_url, l.label_url),
         s.license::text, s.retrieved_at
  FROM label_documents l
  LEFT JOIN core_sources s ON s.id = l.source_id
  WHERE l.drug_entity_id = p_id
  ORDER BY l.published_date DESC NULLS LAST;
$$;

-- =============================================================================
-- 5. get_drug_trials(id, phase?, status?) — CT.gov studies + citation  (AC5)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_drug_trials(
  p_id uuid,
  p_phase text DEFAULT NULL,
  p_status text DEFAULT NULL,
  max_results int DEFAULT 50
)
RETURNS TABLE (
  trial_id uuid,
  nct_id text,
  brief_title text,
  phase text,
  status text,
  sponsor text,
  conditions jsonb,
  interventions jsonb,
  primary_outcomes jsonb,
  enrollment int,
  source_id uuid,
  citation_url text,
  license text,
  retrieved_at timestamptz
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT t.id, t.nct_id, t.brief_title, t.phase, t.status, t.sponsor,
         t.conditions, t.interventions, t.primary_outcomes, t.enrollment,
         s.id, coalesce(s.source_url, t.source_url), s.license::text, s.retrieved_at
  FROM drug_entity_trials det
  JOIN clinical_trials t ON t.id = det.trial_id
  LEFT JOIN core_sources s ON s.id = t.source_id
  WHERE det.drug_entity_id = p_id
    AND (p_phase IS NULL OR t.phase ILIKE '%' || p_phase || '%')
    AND (p_status IS NULL OR t.status ILIKE p_status)
  ORDER BY t.last_update_posted DESC NULLS LAST
  LIMIT max_results;
$$;

-- =============================================================================
-- 6. get_drug_pubmed(id, type?) — PubMed articles + citation  (AC6)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_drug_pubmed(
  p_id uuid,
  p_type text DEFAULT NULL,
  max_results int DEFAULT 50
)
RETURNS TABLE (
  article_id uuid,
  pmid text,
  title text,
  journal text,
  publication_date date,
  authors jsonb,
  publication_types jsonb,
  mesh_terms jsonb,
  abstract text,
  source_id uuid,
  citation_url text,
  license text,
  retrieved_at timestamptz
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT a.id, a.pmid, a.title, a.journal, a.publication_date,
         a.authors, a.publication_types, a.mesh_terms, a.abstract,
         s.id, coalesce(s.source_url, a.source_url), s.license::text, s.retrieved_at
  FROM drug_entity_pubmed dep
  JOIN pubmed_articles a ON a.id = dep.article_id
  LEFT JOIN core_sources s ON s.id = a.source_id
  WHERE dep.drug_entity_id = p_id
    AND (p_type IS NULL OR a.publication_types ? p_type)
  ORDER BY a.publication_date DESC NULLS LAST
  LIMIT max_results;
$$;

-- =============================================================================
-- 7. Grants — authenticated (app path) + service_role
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.search_entities(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_drug(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_drug_label(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_drug_trials(uuid, text, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_drug_pubmed(uuid, text, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_entities IS
  'Phase 2 /search: unions canonical_name + drug_aliases.alias (brand->generic) with trgm + FTS. Backs AC1.';
COMMENT ON FUNCTION public.get_drug IS
  'Phase 2 /drugs/{id}: overview + classes + brands + counts + cited Layer-A sources.';
