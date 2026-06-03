-- PharmaBro Phase 1 — net-new Layer-A providers (NOT from Ascend).
--
-- Adds two provider enum values for PharmaBro-specific public sources:
--   purple_book — FDA "Purple Book" licensed biological products (351(a)/351(k)),
--                 biosimilar + interchangeable status, reference product, BLA.
--                 License: fda_public.
--   cms_nadac   — CMS National Average Drug Acquisition Cost (pricing). Used only
--                 for a coarse dataset-level provenance row; the per-NDC price
--                 time series lives in a dedicated Layer-B projection table (a
--                 weekly series would churn core_sources supersession). public_domain.
--
-- Enum-only change: ADD VALUE is safe in a transaction (PG12+); the values are
-- not referenced until ingest (a separate transaction). License gate + the
-- commercial_use_allowed CHECK on core_sources still apply at insert.
--
-- See: supabase/functions/core-source-sync/providers/{purple-book,pricing}.ts,
--      supabase/functions/core-source-sync/license.ts, IMPLEMENTATION_PLAN.md §10.

ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'purple_book';
ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'cms_nadac';
