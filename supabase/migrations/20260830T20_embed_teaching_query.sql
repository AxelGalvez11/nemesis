-- The embed hop, moved to where the working key lives.
--
-- Vercel's SUPABASE_SERVICE_ROLE_KEY is a legacy JWT the gateway now refuses (403 on every
-- functions call - measured 2026-08-30; the project migrated to sb_secret keys). The Vault
-- already holds a valid secret key (source_index_service_role_key) for the cron loaders, so the
-- embed call runs here, as the definer, and the web app calls THIS function with the learner's
-- own session token instead of holding any privileged key at all. Library search and the figure
-- shelf both ride it.
--
-- Cost gate: EXECUTE is granted to authenticated only. Each call is a paid Voyage embedding;
-- anon gets nothing.
--
-- Returns null on every failure rather than raising: to the callers a missing embedding is
-- "semantic search unavailable" (a 503 and an empty shelf), never a broken teaching turn.
--
-- Applied to project qyjmivntajbigjswhahb on 2026-08-30 (embed_teaching_query_via_vault),
-- together with `create extension if not exists http with schema extensions`.
create extension if not exists http with schema extensions;

create or replace function public.embed_teaching_query(q text)
returns vector
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  key text;
  res extensions.http_response;
  body jsonb;
begin
  if q is null or length(trim(q)) = 0 then
    return null;
  end if;
  select decrypted_secret into key from vault.decrypted_secrets where name = 'source_index_service_role_key';
  if key is null then
    return null;
  end if;
  perform set_config('http.timeout_msec', '8000', true);
  begin
    select * into res from extensions.http((
      'POST',
      'https://qyjmivntajbigjswhahb.supabase.co/functions/v1/library-index/embed-query',
      ARRAY[extensions.http_header('Authorization', 'Bearer ' || key)],
      'application/json',
      jsonb_build_object('query', q)::text
    )::extensions.http_request);
  exception when others then
    return null;
  end;
  if res.status <> 200 then
    return null;
  end if;
  begin
    body := res.content::jsonb;
  exception when others then
    return null;
  end;
  if body ? 'embedding' then
    return (body -> 'embedding')::text::vector;
  end if;
  return null;
end;
$$;

revoke all on function public.embed_teaching_query(text) from public;
revoke all on function public.embed_teaching_query(text) from anon;
grant execute on function public.embed_teaching_query(text) to authenticated;
grant execute on function public.embed_teaching_query(text) to service_role;
