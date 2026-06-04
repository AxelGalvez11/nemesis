-- 0118 — get_source(id): the §8 GET /sources/{id} source-viewer record (doc-12).
--
-- The Source Viewer (a core Phase-6 screen) and any "view the basis" affordance
-- need the source-LEVEL record for one core_sources row. Answer-specific fields
-- (why_used, the cited excerpt) already live on the Phase-3 answer's citation
-- objects; this RPC returns the durable source record: provider/type, title, the
-- original URL, the external id, license/attribution, the published/fetched dates,
-- whether it is still current (superseded_at), the section list it covers, and the
-- free-form metadata. Mirrors get_drug (SECURITY DEFINER + jsonb) and the 0111/0112
-- read-lock (authenticated only; anon revoked).

CREATE OR REPLACE FUNCTION public.get_source(p_id uuid)
RETURNS jsonb
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'source_id', s.id,
    'provider', s.provider,
    'title', s.title,
    'subtitle', s.subtitle,
    'url', s.source_url,
    'external_id', s.provider_id,
    'license', s.license,
    'attribution_required', s.attribution_required,
    'published_at', s.effective_at,
    'fetched_at', s.fetched_at,
    'retrieved_at', s.retrieved_at,
    'superseded_at', s.superseded_at,
    -- is_current drives the doc-06 "outdated" state without the client re-deriving it.
    'is_current', (s.superseded_at IS NULL),
    -- The distinct sections this source covers (from the chunked content), so the
    -- viewer can show "relevant sections" for a standalone source open.
    'sections', (
      SELECT coalesce(jsonb_agg(DISTINCT ch.section ORDER BY ch.section), '[]'::jsonb)
      FROM core_source_chunks ch
      WHERE ch.source_id = s.id AND ch.section IS NOT NULL),
    -- metadata is surfaced verbatim; it must stay NON-SENSITIVE (drug names, RxCUIs,
    -- MeSH — already authenticated-readable via the core_sources table itself, so
    -- this is no new exposure). Any future sensitive key must be allowlisted here.
    'metadata', s.metadata
  )
  FROM core_sources s
  WHERE s.id = p_id;
$$;

-- Default-grant trap: revoke anon (the reads are authenticated-only, per 0111/0112),
-- keep authenticated + service_role (mirrors get_drug et al.).
REVOKE EXECUTE ON FUNCTION public.get_source(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_source(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_source(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_source IS
  '§8 GET /sources/{id}: durable source-viewer record for one core_sources row (doc-12). Answer-specific why_used/excerpt live on the citation objects.';
