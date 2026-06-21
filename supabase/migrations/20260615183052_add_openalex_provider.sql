-- WS-B: allow the OpenAlex long-tail (non-PMID works) to be SAVED into the library.
--
-- Until now `saveToLibrary` -> upsertCoreSource() rejected provider='openalex' because the
-- core_source_provider enum had no such value. The rejection was caught per-source, so live
-- citing and the OA full-text links already worked end-to-end — only the save-back into the
-- embedded corpus was blocked (the long tail could be shown/cited but never stored).
--
-- Additive + idempotent. The commercial-license gate is UNCHANGED: OpenAlex records that map to a
-- non-commercial / unknown license (cc_by_nc, per supabase/functions/core-source-sync/license.ts)
-- still fail the existing core_sources_commercial_friendly_check and remain live-only BY DESIGN;
-- only commercially-licensed (cc_by / cc0 / public-domain) OpenAlex works become storable.
--
-- See: live-ingest.ts (saveToLibrary), persist.ts (upsertCoreSource + assertCommercialFriendly),
--      core-source-sync/providers/openalex.ts (normalizeWork + mapOpenAlexLicense).

ALTER TYPE core_source_provider ADD VALUE IF NOT EXISTS 'openalex';
