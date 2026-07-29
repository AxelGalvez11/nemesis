-- Nemesis second-brain graph and organization substrate.
--
-- The readable Library note remains the canonical, portable Markdown source.
-- This migration adds a materialized relationship graph, provenance, safe AI
-- proposals, an audit/undo log, and a bounded background queue. Calendar and
-- Study stay normalized in their existing tables and are joined at retrieval
-- time rather than copied into the Voyage vector index.
--
-- Security:
--   * every exposed table has owner RLS;
--   * browser/phone clients can only SELECT graph/proposal/audit data;
--   * graph materialization and proposal application are backend operations;
--   * cross-user queue/RPC functions are service-role only;
--   * SECURITY DEFINER trigger helpers live outside the exposed public schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Typed note graph
-- ---------------------------------------------------------------------------

create table if not exists public.library_link_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_document_id uuid not null
    references public.readable_library_documents(id) on delete cascade,
  target_document_id uuid
    references public.readable_library_documents(id) on delete set null,
  target_ref text not null check (char_length(target_ref) between 1 and 500),
  target_key text not null check (char_length(target_key) between 1 and 500),
  relation text not null check (
    relation in ('prerequisite_of', 'part_of', 'related_to', 'contrasts_with', 'applied_in')
  ),
  origin text not null default 'content' check (origin in ('content', 'user', 'ai', 'import')),
  source_excerpt text check (source_excerpt is null or char_length(source_excerpt) <= 2000),
  confidence real not null default 1 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, relation, target_key)
);

create index if not exists library_link_edges_user_source_idx
  on public.library_link_edges(user_id, source_document_id);
create index if not exists library_link_edges_user_target_idx
  on public.library_link_edges(user_id, target_document_id)
  where target_document_id is not null;

alter table public.library_link_edges enable row level security;
drop policy if exists library_link_edges_owner_select on public.library_link_edges;
create policy library_link_edges_owner_select
  on public.library_link_edges for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.library_link_edges from anon, authenticated;
grant select on public.library_link_edges to authenticated;

-- Exact source lineage for notes generated from lectures, recordings, tests,
-- notebook output, or another note. location is deliberately JSONB so a source
-- can retain page/slide/time ranges without flattening them into prose.
create table if not exists public.library_provenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null
    references public.readable_library_documents(id) on delete cascade,
  source_kind text not null check (
    source_kind in (
      'library_note', 'upload', 'lecture', 'recording', 'test',
      'study_deck', 'notebook_source', 'notebook_output', 'chat'
    )
  ),
  source_id text,
  source_path text,
  location jsonb not null default '{}'::jsonb
    check (pg_column_size(location) <= 16384),
  excerpt text check (excerpt is null or char_length(excerpt) <= 4000),
  created_at timestamptz not null default now(),
  unique (document_id, source_kind, source_id, source_path)
);

create index if not exists library_provenance_user_document_idx
  on public.library_provenance(user_id, document_id);
alter table public.library_provenance enable row level security;
drop policy if exists library_provenance_owner_select on public.library_provenance;
create policy library_provenance_owner_select
  on public.library_provenance for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.library_provenance from anon, authenticated;
grant select on public.library_provenance to authenticated;

-- ---------------------------------------------------------------------------
-- Suggestions, traceability, and undo
-- ---------------------------------------------------------------------------

create table if not exists public.library_organization_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (
    action in ('add_link', 'create_note', 'move_note', 'merge_notes', 'split_note', 'update_hub')
  ),
  source_document_id uuid
    references public.readable_library_documents(id) on delete cascade,
  target_document_id uuid
    references public.readable_library_documents(id) on delete cascade,
  relation text check (
    relation is null or
    relation in ('prerequisite_of', 'part_of', 'related_to', 'contrasts_with', 'applied_in')
  ),
  payload jsonb not null default '{}'::jsonb
    check (pg_column_size(payload) <= 65536),
  reason text not null check (char_length(reason) between 1 and 2000),
  trigger_kind text not null default 'new_material' check (
    trigger_kind in ('new_material', 'new_question', 'repeated_lapse', 'manual')
  ),
  confidence real not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'pending' check (
    status in ('pending', 'applied', 'rejected', 'undone')
  ),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  applied_at timestamptz
);

create index if not exists library_organization_proposals_user_status_idx
  on public.library_organization_proposals(user_id, status, created_at desc);
create unique index if not exists library_organization_proposals_pending_link_uniq
  on public.library_organization_proposals(
    user_id, source_document_id, target_document_id, relation
  )
  where action = 'add_link' and status = 'pending';

alter table public.library_organization_proposals enable row level security;
drop policy if exists library_organization_proposals_owner_select on public.library_organization_proposals;
create policy library_organization_proposals_owner_select
  on public.library_organization_proposals for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.library_organization_proposals from anon, authenticated;
grant select on public.library_organization_proposals to authenticated;

create table if not exists public.library_brain_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  proposal_id uuid references public.library_organization_proposals(id) on delete set null,
  action text not null check (
    action in ('add_link', 'create_note', 'move_note', 'merge_notes', 'split_note', 'update_hub')
  ),
  document_id uuid references public.readable_library_documents(id) on delete set null,
  before_state jsonb not null default '{}'::jsonb
    check (pg_column_size(before_state) <= 262144),
  after_state jsonb not null default '{}'::jsonb
    check (pg_column_size(after_state) <= 262144),
  reason text not null check (char_length(reason) between 1 and 2000),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists library_brain_activity_user_created_idx
  on public.library_brain_activity(user_id, created_at desc);
alter table public.library_brain_activity enable row level security;
drop policy if exists library_brain_activity_owner_select on public.library_brain_activity;
create policy library_brain_activity_owner_select
  on public.library_brain_activity for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.library_brain_activity from anon, authenticated;
grant select on public.library_brain_activity to authenticated;

-- Service-only state prevents an unchanged note from buying another model call.
create table if not exists public.library_brain_state (
  document_id uuid primary key
    references public.readable_library_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null,
  analyzed_at timestamptz not null default now()
);
alter table public.library_brain_state enable row level security;
revoke all on public.library_brain_state from public, anon, authenticated;

-- One coalescing queue row per live document. A save burst becomes one analysis,
-- and the lease/backoff fields make concurrent cron ticks and bad notes bounded.
create table if not exists public.library_brain_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null
    references public.readable_library_documents(id) on delete cascade,
  reason text not null default 'new_material' check (
    reason in ('new_material', 'new_question', 'repeated_lapse', 'manual')
  ),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);
create index if not exists library_brain_queue_ready_idx
  on public.library_brain_queue(available_at, created_at)
  where attempts < 20;
alter table public.library_brain_queue enable row level security;
revoke all on public.library_brain_queue from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Materialize [[links]] from canonical note content
-- ---------------------------------------------------------------------------

create or replace function private.library_link_key(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(
    regexp_replace(
      regexp_replace(trim(p_value), '\.md$', '', 'i'),
      '^[./]+|[[:space:]]+$',
      '',
      'g'
    )
  );
$$;

create or replace function private.library_relation_slug(p_label text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case lower(trim(p_label))
    when 'prerequisite of' then 'prerequisite_of'
    when 'part of' then 'part_of'
    when 'related to' then 'related_to'
    when 'contrasts with' then 'contrasts_with'
    when 'applied in' then 'applied_in'
    when 'example of' then 'applied_in'
    else null
  end;
$$;

create or replace function private.resolve_library_link_target(
  p_user_id uuid,
  p_target_key text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.readable_library_documents d
  where d.user_id = p_user_id
    and d.deleted = false
    and d.kind = 'note'
    and (
      private.library_link_key(d.path) = p_target_key
      or private.library_link_key(d.title) = p_target_key
      or private.library_link_key(regexp_replace(d.path, '^.*/', '')) = p_target_key
    )
  order by
    case
      when private.library_link_key(d.path) = p_target_key then 0
      when private.library_link_key(d.title) = p_target_key then 1
      else 2
    end,
    d.updated_at desc
  limit 1;
$$;

create or replace function private.refresh_library_links_for_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.readable_library_documents%rowtype;
  v_line text;
  v_typed text[];
  v_link text[];
  v_target_ref text;
  v_target_key text;
  v_relation text;
  v_target_id uuid;
begin
  select * into v_doc
  from public.readable_library_documents
  where id = p_document_id;

  delete from public.library_link_edges
  where source_document_id = p_document_id;

  if v_doc.id is null or v_doc.deleted or v_doc.kind <> 'note' then
    return;
  end if;

  -- A readable relation line is both the portable Markdown contract and the
  -- typed graph contract. Example: "- Prerequisite of: [[Renal clearance]]".
  for v_line in
    select regexp_split_to_table(coalesce(v_doc.content, ''), E'\r?\n')
  loop
    v_typed := regexp_match(
      v_line,
      '^[[:space:]]*[-*]?[[:space:]]*(Prerequisite of|Part of|Related to|Contrasts with|Applied in|Example of)[[:space:]]*:[[:space:]]*\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]',
      'i'
    );

    if v_typed is not null then
      v_relation := private.library_relation_slug(v_typed[1]);
      v_target_ref := trim(v_typed[2]);
      v_target_key := private.library_link_key(v_target_ref);
      v_target_id := private.resolve_library_link_target(v_doc.user_id, v_target_key);

      insert into public.library_link_edges(
        user_id, source_document_id, target_document_id, target_ref,
        target_key, relation, origin, source_excerpt, confidence
      )
      values (
        v_doc.user_id, v_doc.id, v_target_id, v_target_ref,
        v_target_key, v_relation, 'content', left(v_line, 2000), 1
      )
      on conflict (source_document_id, relation, target_key)
      do update set
        target_document_id = excluded.target_document_id,
        target_ref = excluded.target_ref,
        source_excerpt = excluded.source_excerpt,
        updated_at = now();
    end if;

    -- Plain Obsidian wikilinks remain first-class. They become related_to only
    -- when the same line/target did not already declare a typed relation.
    for v_link in
      select regexp_matches(
        v_line,
        '\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]',
        'g'
      )
    loop
      v_target_ref := trim(v_link[1]);
      v_target_key := private.library_link_key(v_target_ref);
      if not exists (
        select 1
        from public.library_link_edges edge
        where edge.source_document_id = v_doc.id
          and edge.target_key = v_target_key
      ) then
        v_target_id := private.resolve_library_link_target(v_doc.user_id, v_target_key);
        insert into public.library_link_edges(
          user_id, source_document_id, target_document_id, target_ref,
          target_key, relation, origin, source_excerpt, confidence
        )
        values (
          v_doc.user_id, v_doc.id, v_target_id, v_target_ref,
          v_target_key, 'related_to', 'content', left(v_line, 2000), 1
        )
        on conflict (source_document_id, relation, target_key) do nothing;
      end if;
    end loop;
  end loop;

  -- Creating a formerly-missing target resolves every owner's backlink without
  -- rewriting any source note.
  update public.library_link_edges edge
  set target_document_id = private.resolve_library_link_target(edge.user_id, edge.target_key),
      updated_at = now()
  where edge.user_id = v_doc.user_id
    and edge.target_document_id is null;
end;
$$;

create or replace function private.library_document_brain_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_library_links_for_document(new.id);

  if new.deleted = false and new.kind = 'note' then
    insert into public.library_brain_queue(
      user_id, document_id, reason, attempts, available_at,
      locked_until, last_error, updated_at
    )
    values (
      new.user_id, new.id, 'new_material', 0, now(),
      null, null, now()
    )
    on conflict (document_id) do update set
      user_id = excluded.user_id,
      reason = excluded.reason,
      attempts = 0,
      available_at = now(),
      locked_until = null,
      last_error = null,
      updated_at = now();
  else
    delete from public.library_brain_queue where document_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists readable_library_documents_brain on public.readable_library_documents;
create trigger readable_library_documents_brain
after insert or update of path, kind, title, content, deleted
on public.readable_library_documents
for each row execute function private.library_document_brain_trigger();

-- Repeated "again" grades make the originating note eligible for a new graph
-- analysis. This does not mutate or delete student writing; it only creates
-- proposals which the student can accept or reject.
create or replace function private.study_lapse_brain_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
begin
  if new.grade <> 'again' then return new; end if;
  if (
    select count(*)
    from public.study_review_logs log
    where log.user_id = new.user_id
      and log.card_id = new.card_id
      and log.grade = 'again'
      and log.reviewed_at >= now() - interval '30 days'
  ) < 3 then
    return new;
  end if;

  select document.id into v_document_id
  from public.study_cards card
  join public.readable_library_documents document
    on document.user_id = card.user_id
   and document.deleted = false
   and document.kind = 'note'
   and (
     private.library_link_key(document.path) = private.library_link_key(card.source_path)
     or private.library_link_key(document.title) = private.library_link_key(card.source_path)
   )
  where card.id = new.card_id
    and card.user_id = new.user_id
    and card.source_path is not null
  order by document.updated_at desc
  limit 1;

  if v_document_id is not null then
    insert into public.library_brain_queue(
      user_id, document_id, reason, attempts, available_at,
      locked_until, last_error, updated_at
    )
    values (
      new.user_id, v_document_id, 'repeated_lapse', 0, now(),
      null, null, now()
    )
    on conflict (document_id) do update set
      reason = 'repeated_lapse',
      attempts = 0,
      available_at = now(),
      locked_until = null,
      last_error = null,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists study_review_logs_brain on public.study_review_logs;
create trigger study_review_logs_brain
after insert on public.study_review_logs
for each row execute function private.study_lapse_brain_trigger();

revoke all on function private.library_link_key(text) from public;
revoke all on function private.library_relation_slug(text) from public;
revoke all on function private.resolve_library_link_target(uuid, text) from public;
revoke all on function private.refresh_library_links_for_document(uuid) from public;
revoke all on function private.library_document_brain_trigger() from public;
revoke all on function private.study_lapse_brain_trigger() from public;

-- ---------------------------------------------------------------------------
-- Retrieval and bounded queue RPCs
-- ---------------------------------------------------------------------------

-- User-facing ANN search with document ids for graph expansion. SECURITY
-- INVOKER means library_chunks RLS remains the account boundary.
create or replace function public.match_library_brain(
  query_embedding extensions.vector(1024),
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  document_id uuid,
  path text,
  title text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.document_id,
    c.path,
    c.title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.library_chunks c
  where c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 20));
$$;
revoke execute on function public.match_library_brain(
  extensions.vector(1024), int, float
) from public, anon;
grant execute on function public.match_library_brain(
  extensions.vector(1024), int, float
) to authenticated, service_role;

-- Same ANN shape for the background organizer, with an explicit user id. It is
-- service-only: a client can never supply a different account id.
create or replace function public.match_library_brain_for_user(
  p_user_id uuid,
  query_embedding extensions.vector(1024),
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  document_id uuid,
  path text,
  title text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.document_id,
    c.path,
    c.title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.library_chunks c
  where c.user_id = p_user_id
    and c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 20));
$$;
revoke execute on function public.match_library_brain_for_user(
  uuid, extensions.vector(1024), int, float
) from public, anon, authenticated;
grant execute on function public.match_library_brain_for_user(
  uuid, extensions.vector(1024), int, float
) to service_role;

create or replace function public.claim_library_brain_queue(p_limit int default 3)
returns table (
  queue_id uuid,
  user_id uuid,
  document_id uuid,
  reason text,
  attempts integer
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select queue.id
    from public.library_brain_queue queue
    where queue.attempts < 20
      and queue.available_at <= now()
      and (queue.locked_until is null or queue.locked_until < now())
    order by queue.available_at asc, queue.created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  update public.library_brain_queue queue
  set locked_until = now() + interval '5 minutes',
      updated_at = now()
  from claimed
  where queue.id = claimed.id
  returning queue.id, queue.user_id, queue.document_id, queue.reason, queue.attempts;
$$;
revoke execute on function public.claim_library_brain_queue(int)
  from public, anon, authenticated;
grant execute on function public.claim_library_brain_queue(int) to service_role;

create or replace function public.finish_library_brain_queue(
  p_queue_id uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    delete from public.library_brain_queue where id = p_queue_id;
    return;
  end if;

  update public.library_brain_queue
  set attempts = least(attempts + 1, 20),
      available_at = now() + make_interval(
        mins => least(360, (power(2, least(attempts + 1, 8))::int * 2))
      ),
      locked_until = null,
      last_error = left(p_error, 2000),
      updated_at = now()
  where id = p_queue_id;
end;
$$;
revoke execute on function public.finish_library_brain_queue(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finish_library_brain_queue(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Background scheduler (dormant until library_brain_url exists in Vault)
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.run_library_brain()
returns integer
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  if not exists (
    select 1 from public.library_brain_queue queue
    where queue.attempts < 20
      and queue.available_at <= now()
      and (queue.locked_until is null or queue.locked_until < now())
  ) then
    return 0;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'library_brain_url';
  -- Reuse the already-provisioned server credential; no secret is copied into
  -- this migration or exposed to a client.
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'library_index_service_role_key';
  if v_url is null or v_key is null then
    raise warning 'library brain: queue is ready but Vault secrets are unset';
    return 0;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
  return 1;
end;
$$;
revoke execute on function public.run_library_brain()
  from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'library-brain-every-5-min'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;
select cron.schedule(
  'library-brain-every-5-min',
  '*/5 * * * *',
  $$ select public.run_library_brain(); $$
);

-- Materialize the graph for existing notes and coalesce them into the first
-- organization pass. The queue is inert until the Edge function URL is enabled.
do $$
declare
  v_document record;
begin
  for v_document in
    select id, user_id
    from public.readable_library_documents
    where deleted = false and kind = 'note'
  loop
    perform private.refresh_library_links_for_document(v_document.id);
    insert into public.library_brain_queue(user_id, document_id, reason)
    values (v_document.user_id, v_document.id, 'new_material')
    on conflict (document_id) do nothing;
  end loop;
end;
$$;
