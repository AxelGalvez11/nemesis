-- 20260723T02 — drive library-index from pg_cron.
--
-- Same shape as the watch scheduler (20260618000100): a SECURITY DEFINER function
-- reads its target URL + service key from Vault and fires pg_net at the edge
-- function. DORMANT until the owner creates both Vault secrets — with them unset
-- it warns once and returns 0, so applying this early is safe.
--
-- ACTIVATION (owner runs these; keeps the service key out of migration text):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/library-index', 'library_index_url');
--   select vault.create_secret('<service-role-key>', 'library_index_service_role_key');
--
-- DEPLOY: owner-gated — `supabase db push`.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.run_library_indexing()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  -- Cheap exit first: nothing to do when no live note is stale. Keeps an idle prod
  -- silent (no secret lookup, no HTTP, no log noise).
  --
  -- Uses list_dirty_library_docs so this guard and the indexer's batch selection
  -- share ONE definition of staleness. If they ever diverge, the cron can fire
  -- forever at an indexer that considers the same rows clean.
  if not exists (select 1 from public.list_dirty_library_docs(1)) then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'library_index_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'library_index_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'library indexer: stale notes exist but Vault secrets (library_index_url / library_index_service_role_key) are unset — skipping';
    return 0;
  end if;

  -- ONE call per tick: the function drains its own batch internally (DOC_LIMIT),
  -- so fan-out here would just multiply concurrent embedding spend.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
  return 1;
end;
$$;

revoke execute on function public.run_library_indexing() from public, anon, authenticated;

-- Every 2 minutes: fast enough that a student who writes a note and immediately
-- asks about it usually gets a hit, slow enough that a burst of saves collapses
-- into one embedding pass. Missed ticks self-heal (state advances only on success).
select cron.schedule('library-index-every-2-min', '*/2 * * * *', $$ select public.run_library_indexing(); $$);
