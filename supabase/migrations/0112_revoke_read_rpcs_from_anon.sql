-- PharmaBro Phase 2 hardening (cont.) — revoke read RPCs from the `anon` role.
--
-- 0111 revoked the PUBLIC default, but anon STILL reached the SECURITY DEFINER
-- read RPCs. Cause: Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public
-- GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`, so every
-- function created in `public` gets an EXPLICIT grant to anon at creation time
-- — not via PUBLIC. Revoking PUBLIC therefore left anon's direct grant intact.
--
-- Revoke EXECUTE from anon explicitly. authenticated + service_role keep their
-- grants (the app path + ingest). Net: global-catalog reads require an
-- authenticated session, matching the documented RLS model (§4). Guest browsing,
-- if added, becomes a DELIBERATE `GRANT ... TO anon` or Supabase anonymous
-- sign-in — not an accidental default.

REVOKE EXECUTE ON FUNCTION public.search_entities(text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_drug(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_drug_label(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_drug_trials(uuid, text, text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_drug_pubmed(uuid, text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION
  public.match_core_source_chunks(extensions.vector(1024), integer, double precision, text[], text)
  FROM anon;
