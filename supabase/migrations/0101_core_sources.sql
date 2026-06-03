-- Phase 1 (source strategy): Layer 1 Ascend Core authoritative source catalog.
--
-- Stores public-domain + commercial-friendly licensed sources used to ground
-- pharmacy clinical content (FDA labels, DailyMed SPL, RxNorm, CDC, NIH,
-- PubMed open access, DrugBank Open Data CC0, OER).
--
-- These are NOT user-owned tables. They are a global catalog written by
-- service-role edge functions (`core-source-sync`) and read by all
-- authenticated users for retrieval. RLS enforces read-only access.
--
-- See: docs/source-strategy.md

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- 1. core_sources — provider catalog
-- =============================================================================

CREATE TYPE core_source_provider AS ENUM (
  'openfda',
  'dailymed',
  'rxnorm',
  'cdc',
  'nih',
  'medlineplus',
  'pubmed_oa',
  'drugbank_open',
  'oer',
  'ascend_original'
);

CREATE TYPE core_source_license AS ENUM (
  'public_domain',
  'cc0',
  'cc_by',
  'cc_by_sa',
  'fda_public',
  'nlm_public',
  'oer_open',
  'ascend_owned'
);

CREATE TABLE IF NOT EXISTS core_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider core_source_provider NOT NULL,
  -- Provider-specific stable identifier (NDC, SPL set ID, RxCUI, PMID, etc.)
  provider_id TEXT NOT NULL,

  title TEXT NOT NULL,
  subtitle TEXT,

  license core_source_license NOT NULL,
  attribution_required BOOLEAN NOT NULL DEFAULT false,
  commercial_use_allowed BOOLEAN NOT NULL DEFAULT true,
  share_alike_required BOOLEAN NOT NULL DEFAULT false,

  source_url TEXT NOT NULL,
  -- SHA-256 hex of normalized source content. Used for change detection +
  -- cache invalidation when provider re-publishes a label.
  content_hash TEXT NOT NULL,

  -- ISO 8601 timestamps
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the provider says this content is effective from / until.
  effective_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,

  -- Free-form metadata (drug names, RxCUIs, MeSH terms, etc.)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per provider+identifier; re-fetches update existing row.
  UNIQUE (provider, provider_id)
);

-- License gate: reject anything that isn't commercial-friendly.
ALTER TABLE core_sources
  ADD CONSTRAINT core_sources_commercial_friendly_check
  CHECK (commercial_use_allowed = true);

CREATE INDEX core_sources_provider_idx
  ON core_sources (provider);

CREATE INDEX core_sources_retrieved_at_idx
  ON core_sources (retrieved_at DESC);

CREATE INDEX core_sources_metadata_gin_idx
  ON core_sources USING gin (metadata);

COMMENT ON TABLE core_sources IS
  'Layer 1 Ascend Core source catalog. Public/licensed authoritative sources for clinical grounding. Service-role write, authenticated read.';

-- =============================================================================
-- 2. core_source_chunks — embedded retrievable spans
-- =============================================================================

CREATE TABLE IF NOT EXISTS core_source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES core_sources(id) ON DELETE CASCADE,

  -- Chunk position within source (0-indexed)
  position INT NOT NULL,
  -- Chunk content text (Markdown-stripped, ready for embedding)
  content TEXT NOT NULL,
  -- Span back into original source (character offsets, page numbers, etc.)
  span JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Section heading / classification (e.g. "Contraindications", "Dosing")
  section TEXT,

  -- Embedding (text-embedding-3-large @ 1536 dims to match existing infra)
  embedding vector(1536),
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',

  token_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (source_id, position)
);

-- ANN index: ivfflat cosine. 100 lists is fine until ~100k rows.
CREATE INDEX core_source_chunks_vec_idx
  ON core_source_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX core_source_chunks_source_idx
  ON core_source_chunks (source_id);

CREATE INDEX core_source_chunks_section_idx
  ON core_source_chunks (section)
  WHERE section IS NOT NULL;

COMMENT ON TABLE core_source_chunks IS
  'Embedded retrievable spans of Layer 1 source content. Used in hybrid RAG for clinical grounding.';

-- =============================================================================
-- 3. RLS — service-role write, authenticated read
-- =============================================================================

ALTER TABLE core_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_source_chunks ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user. Layer 1 is global ground truth; no per-user gate.
CREATE POLICY core_sources_read_authenticated
  ON core_sources
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY core_source_chunks_read_authenticated
  ON core_source_chunks
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: service-role only (edge function `core-source-sync`).
-- No policy for INSERT/UPDATE/DELETE from `authenticated` role = denied by default.
-- service_role bypasses RLS entirely.

-- =============================================================================
-- 4. Updated_at trigger on core_sources
-- =============================================================================

CREATE OR REPLACE FUNCTION core_sources_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER core_sources_updated_at_trigger
  BEFORE UPDATE ON core_sources
  FOR EACH ROW
  EXECUTE FUNCTION core_sources_set_updated_at();
