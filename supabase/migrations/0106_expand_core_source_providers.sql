-- Phase 7 (source ingest expansion): add 12 new authoritative providers.
--
-- All public-domain or commercial-friendly licensed (license gate +
-- DB CHECK constraint enforce this).
--
-- See: docs/source-strategy.md "Provider whitelist"

ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'nih_nhlbi';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'ahrq';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'clinicaltrials';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'ncbi_bookshelf';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'uspstf';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'va_dod';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'fda_safety';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'livertox';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'lactmed';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'fda_orange_book';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'cdc_mmwr';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'pubchem';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'pharmgkb';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'openstax';

-- New license type for share-alike content (PharmGKB CC BY-SA, ChEMBL, etc.)
-- cc_by_sa already exists in core_source_license enum (mig 0101).

COMMENT ON TYPE core_source_provider IS
  'Layer 1 source providers. All values must map to a commercial-friendly license at ingest. See apps/web/lib/sources/provenance.ts and supabase/functions/core-source-sync/license.ts for the canonical lookup.';
