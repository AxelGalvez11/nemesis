-- 0128_harden_function_search_path.sql
-- Security hardening: pin search_path on the one function flagged by the Supabase
-- security linter (lint 0011 function_search_path_mutable).
--
-- core_sources_set_updated_at() is a BEFORE UPDATE trigger used by several tables
-- (core_sources, drug_classes, label_documents, user_health_context, conversations).
-- Its body references only `now()` (pg_catalog — always resolved first, even with an
-- empty search_path) and the NEW row column, so pinning search_path = '' is safe:
-- nothing in the body resolves through a user-controlled schema, which removes the
-- theoretical search_path-injection surface the linter warns about.
--
-- NOT done here (deliberate): the linter also flags `pg_net` living in the `public`
-- schema (lint 0014 extension_in_public). Moving an extension out of public can break
-- anything that references its objects unqualified, and it carries no real security
-- benefit for this app — so it is intentionally left in place. Do not "fix" it without
-- auditing every unqualified pg_net reference first.

ALTER FUNCTION public.core_sources_set_updated_at() SET search_path = '';
