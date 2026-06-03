-- PharmaBro Phase 2 hardening — lock read RPCs to authenticated + service_role.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. The
-- explicit `GRANT ... TO authenticated, service_role` in 0110 (and 0107) did
-- NOT remove that default, so the `anon` role (a member of PUBLIC) could call
-- the SECURITY DEFINER read RPCs — and because they run as the owner, that
-- BYPASSES RLS and returns the whole catalog to unauthenticated callers.
-- Direct table reads already deny anon (no anon SELECT policy), so the gap is
-- only via these definer functions.
--
-- The documented model is "global catalog = authenticated read". Enforce it:
-- revoke the PUBLIC default; the explicit authenticated/service_role grants
-- remain. Guest browsing, if added, will use Supabase anonymous sign-in
-- (role=authenticated) or a later DELIBERATE grant to anon — never an
-- accidental PUBLIC default. See IMPLEMENTATION_PLAN.md §4 (RLS), §8.

REVOKE EXECUTE ON FUNCTION public.search_entities(text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_drug(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_drug_label(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_drug_trials(uuid, text, text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_drug_pubmed(uuid, text, int) FROM PUBLIC;

-- Same default-PUBLIC exposure on the Phase-1 retriever (anon could vector-search
-- the corpus, bypassing RLS). The core-source-sync / ask edge functions call it
-- as service_role, so locking it to authenticated+service_role is transparent to them.
REVOKE EXECUTE ON FUNCTION
  public.match_core_source_chunks(extensions.vector(1024), integer, double precision, text[], text)
  FROM PUBLIC;
