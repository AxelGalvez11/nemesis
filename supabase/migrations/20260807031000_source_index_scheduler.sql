-- 20260807031000 — drive source-index from pg_cron.
--
-- SEPARATE FROM THE SCHEMA MIGRATION ON PURPOSE, exactly as 20260723T02 is
-- separate from the note-chunk schema. Two reasons, and both have bitten:
--
--   * pg_cron, pg_net and supabase_vault do not exist outside Supabase, so a
--     schema migration that also schedules a job cannot be applied to a plain
--     Postgres — which is where `scripts/phase4-index-roundtrip.mts` proves the
--     retrieval half actually works.
--   * Scheduling is an ACTIVATION, and activation should be a decision someone
--     makes, not a side effect of applying a schema change.
--
-- DEPLOY: owner-gated — `supabase db push`.

-- ── Driving it from pg_cron ─────────────────────────────────────────────────
--
-- Same shape as `run_library_indexing` (20260723T02): a SECURITY DEFINER
-- function reads its URL and key from Vault and fires pg_net at the edge
-- function. DORMANT until the owner creates both secrets — with them unset it
-- warns once and returns 0, so applying this migration turns nothing on and
-- spends nothing.
--
-- ACTIVATION (owner runs these; keeps the service key out of migration text):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/source-index', 'source_index_url');
--   select vault.create_secret('<service-role-key>', 'source_index_service_role_key');

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.run_source_indexing()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  -- 🔴 THE SAME STALENESS DEFINITION THE INDEXER USES, not a second one. If this
  -- guard and the indexer's batch selection ever disagree, the cron fires
  -- forever at a function that considers the same rows already done — which is
  -- exactly how the note indexer once burned ~720 embedding attempts a day.
  if not exists (
    select 1 from public.list_unchunked_parses('units-blocks-1', 'voyage-3-large-1024', 1)
  ) then
    return 0;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'source_index_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'source_index_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'source indexer: unindexed parses exist but Vault secrets (source_index_url / source_index_service_role_key) are unset — skipping';
    return 0;
  end if;

  -- ONE call per tick. The function drains its own batch (PARSE_LIMIT), so
  -- fanning out here would only multiply concurrent embedding spend.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
  return 1;
end;
$$;

revoke execute on function public.run_source_indexing() from public, anon, authenticated;

-- Every 5 minutes, not every 2. A document is indexed once and then never again
-- until the chunker or the embedding model changes, so there is no burst to
-- collapse — and each tick can cost thousands of embeddings where a note costs
-- a handful.
select cron.schedule('source-index-every-5-min', '*/5 * * * *', $$ select public.run_source_indexing(); $$);
