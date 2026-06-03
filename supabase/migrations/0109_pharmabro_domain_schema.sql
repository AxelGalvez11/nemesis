-- PharmaBro Phase 2 — Layer-B domain schema (net-new, NOT from Ascend).
--
-- The typed PharmaBro catalog that sits on top of the Layer-A evidence
-- substrate (core_sources / core_source_chunks). See IMPLEMENTATION_PLAN.md §4.
--
-- Two RLS classes:
--   GLOBAL CATALOG  — authenticated read / service-role write (ingest + admin).
--   USER-OWNED      — per-user auth.uid() = user_id for all ops.
--
-- Cross-environment note (mirrors 0100's vector handling): the trigram indexes
-- use the `gin_trgm_ops` operator class from pg_trgm. On hosted Supabase the
-- extension lives in the `extensions` schema; the local CLI may place it in
-- `public`. We install it into `extensions` and SCHEMA-QUALIFY the opclass as
-- `extensions.gin_trgm_ops` so the DDL resolves in both environments.

-- =============================================================================
-- 0. pg_trgm (fuzzy search for /search) — install into `extensions`, like vector
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF ext_schema IS NULL THEN
    EXECUTE 'CREATE EXTENSION pg_trgm WITH SCHEMA extensions';
  ELSIF ext_schema <> 'extensions' THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END $$;

-- =============================================================================
-- 1. GLOBAL CATALOG
-- =============================================================================

-- drug_entities — canonical catalog. `normalized_name` is the UNIQUE upsert key
-- the entity-linker keys on (salt-stripped ingredient, e.g. "atorvastatin
-- calcium" -> "atorvastatin"); `canonical_name` is the display name. Without a
-- unique key the idempotent re-runnable linker (= the Phase-5 refresh runner)
-- would duplicate entities and fragment a drug page across copies.
CREATE TABLE drug_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN
    ('drug','supplement','peptide','biologic','class','company')),
  approved_status text NOT NULL CHECK (approved_status IN
    ('approved','investigational','research_use','supplement','unknown')),
  mechanism_summary text,
  primary_class_id uuid,            -- FK added after drug_classes exists (below)
  rxnorm_cui text,
  status_reviewed_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX drug_entities_canonical_idx ON drug_entities (canonical_name);
CREATE INDEX drug_entities_trgm ON drug_entities
  USING gin (canonical_name extensions.gin_trgm_ops);
CREATE INDEX drug_entities_fts ON drug_entities
  USING gin (to_tsvector('english', canonical_name));
CREATE INDEX drug_entities_rxcui_idx ON drug_entities (rxnorm_cui)
  WHERE rxnorm_cui IS NOT NULL;

CREATE TABLE drug_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,                 -- "GLP-1 receptor agonists"
  description text,
  body_system text,                          -- endocrine | cardiology | psychiatry
  reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Deferred FK: drug_entities.primary_class_id -> drug_classes(id) (display class).
ALTER TABLE drug_entities
  ADD CONSTRAINT drug_entities_primary_class_fk
  FOREIGN KEY (primary_class_id) REFERENCES drug_classes(id) ON DELETE SET NULL;

CREATE TABLE drug_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_entity_id uuid NOT NULL REFERENCES drug_entities(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_type text CHECK (alias_type IN ('brand','generic','synonym','company_code')),
  source text,
  confidence numeric,
  UNIQUE (drug_entity_id, alias, alias_type)
);
CREATE INDEX drug_aliases_trgm ON drug_aliases
  USING gin (alias extensions.gin_trgm_ops);
CREATE INDEX drug_aliases_entity_idx ON drug_aliases (drug_entity_id);

CREATE TABLE drug_class_memberships (
  drug_entity_id uuid NOT NULL REFERENCES drug_entities(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES drug_classes(id) ON DELETE CASCADE,
  PRIMARY KEY (drug_entity_id, class_id)
);

CREATE TABLE label_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_entity_id uuid NOT NULL REFERENCES drug_entities(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('dailymed','openfda')),
  spl_id text,
  set_id text,
  published_date date,
  label_url text,
  raw_json jsonb,
  -- boxed_warning, indications, contraindications, warnings, adverse_reactions,
  -- drug_interactions, pregnancy_lactation, renal_hepatic, patient_counseling
  extracted_sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id uuid REFERENCES core_sources(id),      -- provenance into Layer A
  content_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (source, set_id)
);
CREATE INDEX label_documents_entity_idx ON label_documents (drug_entity_id);
CREATE INDEX label_documents_setid_idx ON label_documents (set_id);

CREATE TABLE clinical_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nct_id text NOT NULL UNIQUE,
  brief_title text,
  official_title text,
  phase text,
  status text,
  sponsor text,
  conditions jsonb DEFAULT '[]'::jsonb,
  interventions jsonb DEFAULT '[]'::jsonb,
  primary_outcomes jsonb DEFAULT '[]'::jsonb,
  secondary_outcomes jsonb DEFAULT '[]'::jsonb,
  enrollment int,
  start_date date,
  completion_date date,
  results_first_posted date,
  last_update_posted date,
  source_url text,
  raw_json jsonb,
  source_id uuid REFERENCES core_sources(id),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX clinical_trials_nct_idx ON clinical_trials (nct_id);
CREATE INDEX clinical_trials_fts ON clinical_trials
  USING gin (to_tsvector('english', coalesce(brief_title,'')));

CREATE TABLE pubmed_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pmid text NOT NULL UNIQUE,
  title text,
  abstract text,
  journal text,
  publication_date date,
  authors jsonb DEFAULT '[]'::jsonb,
  publication_types jsonb DEFAULT '[]'::jsonb,  -- RCT | Review | SR | Meta-Analysis (Phase-4 backfill)
  mesh_terms jsonb DEFAULT '[]'::jsonb,
  doi text,
  source_url text,
  source_id uuid REFERENCES core_sources(id),
  fetched_at timestamptz DEFAULT now()
);
CREATE INDEX pubmed_articles_pmid_idx ON pubmed_articles (pmid);
CREATE INDEX pubmed_fts ON pubmed_articles
  USING gin (to_tsvector('english', coalesce(title,'')||' '||coalesce(abstract,'')));

CREATE TABLE drug_entity_trials (
  drug_entity_id uuid NOT NULL REFERENCES drug_entities(id) ON DELETE CASCADE,
  trial_id uuid NOT NULL REFERENCES clinical_trials(id) ON DELETE CASCADE,
  PRIMARY KEY (drug_entity_id, trial_id)
);

CREATE TABLE drug_entity_pubmed (
  drug_entity_id uuid NOT NULL REFERENCES drug_entities(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES pubmed_articles(id) ON DELETE CASCADE,
  PRIMARY KEY (drug_entity_id, article_id)
);

CREATE TABLE evidence_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,                  -- drug_entity OR claim id
  entity_type text NOT NULL CHECK (entity_type IN ('drug','claim','class')),
  claim_text text,                          -- null for drug-level
  score text NOT NULL CHECK (score IN
    ('very_strong','strong','moderate','weak','very_weak','unknown')),
  rationale text NOT NULL,
  evidence_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations text,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by_version text NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX evidence_scores_entity_idx ON evidence_scores (entity_id, entity_type);

CREATE TABLE updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('drug','class','trial','company','keyword')),
  item_ref text NOT NULL,                   -- uuid or keyword string
  update_type text NOT NULL CHECK (update_type IN
    ('pubmed_new','label_update','trial_status','trial_results','fda_safety','new_comparison')),
  title text NOT NULL,
  summary text,
  source_id uuid REFERENCES core_sources(id) ON DELETE SET NULL,
  source_url text,
  importance_score numeric,
  detected_at timestamptz DEFAULT now()
);
CREATE INDEX updates_item_idx ON updates (item_type, item_ref);
CREATE INDEX updates_detected_idx ON updates (detected_at DESC);

-- drug_prices — typed NADAC projection (the Phase-1 cms_nadac row was coarse
-- provenance only; the per-NDC time series lives here). NADAC = average price
-- pharmacies pay to ACQUIRE a drug (CMS survey), NOT a patient's out-of-pocket
-- price; the disclaimer is enforced on the cms_nadac source row + app layer.
-- NDC stored 11-digit normalized to join openFDA product_ndc.
CREATE TABLE drug_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_entity_id uuid REFERENCES drug_entities(id) ON DELETE CASCADE,
  ndc text NOT NULL,                        -- 11-digit normalized
  rxcui text,
  description text,                         -- NADAC "NDC Description"
  nadac_per_unit numeric,
  pricing_unit text,                        -- ML | GM | EA
  classification_for_rate_setting text,     -- G (generic) | B (brand)
  pricing_basis text NOT NULL DEFAULT 'average_acquisition_cost',
  as_of_date date,
  effective_date date,
  source_id uuid REFERENCES core_sources(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (ndc, as_of_date)
);
CREATE INDEX drug_prices_entity_idx ON drug_prices (drug_entity_id);
CREATE INDEX drug_prices_ndc_idx ON drug_prices (ndc);

-- =============================================================================
-- 2. USER-OWNED
-- =============================================================================

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Sensitive fields encrypted at rest (pgsodium/Vault or app-layer); HARD DELETE
-- on request (doc-18). Separate + independently deletable from the account.
CREATE TABLE user_health_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  age_range text,
  sex text,
  pregnancy_status text,
  allergies jsonb DEFAULT '[]'::jsonb,
  medications jsonb DEFAULT '[]'::jsonb,
  supplements jsonb DEFAULT '[]'::jsonb,
  conditions jsonb DEFAULT '[]'::jsonb,
  kidney_disease_flag text CHECK (kidney_disease_flag IN ('yes','no','unknown')),
  liver_disease_flag text CHECK (liver_disease_flag IN ('yes','no','unknown')),
  goals jsonb DEFAULT '[]'::jsonb,
  consent_version text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('drug','class','trial','company','keyword')),
  item_ref text NOT NULL,                   -- uuid or keyword string
  alert_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('instant','daily','weekly')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX watchlist_items_user_idx ON watchlist_items (user_id);

CREATE TABLE generated_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- null for guest
  question text NOT NULL,
  intent text,
  detected_entities jsonb DEFAULT '[]'::jsonb,
  answer jsonb NOT NULL,
  evidence_grade text,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieval_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_name text NOT NULL,
  prompt_version text NOT NULL,
  safety_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_health_context boolean NOT NULL DEFAULT false,
  user_reported boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX generated_answers_user_idx ON generated_answers (user_id);

CREATE TABLE saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('answer','drug','comparison')),
  ref_id uuid,
  payload jsonb NOT NULL,                    -- frozen snapshot
  created_at timestamptz DEFAULT now()
);
CREATE INDEX saved_reports_user_idx ON saved_reports (user_id);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','student','professional')),
  status text NOT NULL DEFAULT 'active',     -- active | trialing | expired | canceled
  rc_app_user_id text,
  rc_entitlement text,
  current_period_end timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- =============================================================================
-- 3. updated_at triggers (reuse the core_sources trigger fn from 0101)
-- =============================================================================

CREATE TRIGGER drug_entities_updated_at_trigger
  BEFORE UPDATE ON drug_entities
  FOR EACH ROW EXECUTE FUNCTION core_sources_set_updated_at();
CREATE TRIGGER drug_classes_updated_at_trigger
  BEFORE UPDATE ON drug_classes
  FOR EACH ROW EXECUTE FUNCTION core_sources_set_updated_at();
CREATE TRIGGER label_documents_updated_at_trigger
  BEFORE UPDATE ON label_documents
  FOR EACH ROW EXECUTE FUNCTION core_sources_set_updated_at();
CREATE TRIGGER user_health_context_updated_at_trigger
  BEFORE UPDATE ON user_health_context
  FOR EACH ROW EXECUTE FUNCTION core_sources_set_updated_at();

-- =============================================================================
-- 4. RLS
-- =============================================================================

-- ---- GLOBAL CATALOG: authenticated read, service-role write ----
-- (service_role bypasses RLS; absence of write policies denies authenticated writes.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drug_entities','drug_aliases','drug_classes','drug_class_memberships',
    'label_documents','clinical_trials','pubmed_articles','drug_entity_trials',
    'drug_entity_pubmed','evidence_scores','updates','drug_prices'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      t || '_read_authenticated', t);
  END LOOP;
END $$;

-- ---- USER-OWNED: auth.uid() = user_id ----
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_owner ON profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_health_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY uhc_owner ON user_health_context FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY wl_owner ON watchlist_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- generated_answers: read-own; INSERT is service-role only (edge `ask` writes
-- guest rows with null user_id), so no authenticated INSERT policy.
ALTER TABLE generated_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ga_read_own ON generated_answers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY sr_owner ON saved_reports FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- subscriptions: read-own; writes via RevenueCat webhook (service-role) only.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_read_own ON subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE drug_entities IS
  'PharmaBro canonical catalog (Layer B). normalized_name = unique upsert key for the idempotent entity-linker. canonical_name = display.';
COMMENT ON TABLE drug_prices IS
  'NADAC per-NDC average ACQUISITION cost (CMS survey) — NOT patient out-of-pocket price. Typed projection of the cms_nadac Layer-A source.';
