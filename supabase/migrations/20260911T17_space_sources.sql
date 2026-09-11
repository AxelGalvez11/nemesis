-- Workspace sources: the material a workspace is built on (docs/space/PLAN.md, M13).
--
-- Owner, 2026-09-11: a workspace keeps the sources, the chats, the notes and what was made in one place, and a
-- workspace shared with classmates shares its sources and its notes while each person's chats stay their own.
--
-- 🔴 THE BYTES STAY WHERE EVERY OTHER UPLOAD IN THIS APP ALREADY PUTS THEM. A file goes into the private
-- library-sources bucket under the person's own session (lib/workspace/library-sources.ts) and is read by the one
-- extraction route (/api/notebooks/extract/file), which has the measured limits, the vision fallback and the coverage
-- record. Nothing here re-implements any of that.
--
-- 🔴 WHAT THIS TABLE ADDS IS THE PART A SHARED WORKSPACE NEEDS: which page a source belongs to, and the extracted
-- text in a place a classmate can read. The owner's own `library_sources` and `readable_library_documents` rows are
-- scoped to their user id, so a classmate's chat could never read them; a row here is reached through the page's
-- role, which is how everything else in the workspace is reached.
--
-- Left for a later part: opening the original file as a classmate (the bytes are still in the owner's bucket), and
-- telling other people's open tabs that a source arrived. Both are additions, neither changes this shape.

create table if not exists public.ws_sources (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.ws_spaces(id) on delete cascade,
  -- The workspace page. A deleted page takes its sources with it, the way its child pages go.
  page_id uuid not null references public.ws_records(id) on delete cascade,
  name text not null,
  mime text,
  bytes bigint,
  -- The row in the uploader's own library_sources the bytes came from, so the original can be found again.
  library_source uuid,
  -- The extracted text. Empty while it is being read, and on a source that could not be read.
  body text not null default '',
  chars integer not null default 0,
  status text not null default 'reading' check (status in ('reading', 'ready', 'failed')),
  error text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ws_sources_page_idx on public.ws_sources (page_id, created_at);

-- No client policies: every read and write goes through the functions below, which ask the page's role first.
alter table public.ws_sources enable row level security;

create or replace function public.ws_source_json(s public.ws_sources)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'page', s.page_id,
    'name', s.name,
    'mime', s.mime,
    'bytes', s.bytes,
    'chars', s.chars,
    'status', s.status,
    'error', s.error,
    'by', s.created_by,
    'at', s.created_at
  );
$$;

-- Adds one source to a workspace. Only somebody who can edit the page may, and the text is capped so one enormous
-- upload cannot be used to fill the table.
create or replace function public.ws_add_source(
  p_page uuid,
  p_name text,
  p_mime text default null,
  p_bytes bigint default null,
  p_library_source uuid default null,
  p_body text default '',
  p_status text default 'ready',
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.ws_records%rowtype;
  v_body text := left(coalesce(p_body, ''), 600000);
  v_row public.ws_sources%rowtype;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_page from public.ws_records where id = p_page and kind = 'page';
  if not found then raise exception 'no such page' using errcode = 'P0002'; end if;
  if public.ws_role_rank(public.ws_page_role(v_uid, p_page)) < public.ws_role_rank('edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.ws_sources (space_id, page_id, name, mime, bytes, library_source, body, chars, status, error, created_by)
  values (
    v_page.space_id,
    p_page,
    left(coalesce(nullif(btrim(p_name), ''), 'Source'), 512),
    p_mime,
    p_bytes,
    p_library_source,
    v_body,
    length(v_body),
    case when p_status in ('reading', 'ready', 'failed') then p_status else 'ready' end,
    left(p_error, 500)
  )
  returning * into v_row;

  return public.ws_source_json(v_row);
end;
$$;

-- The text a source turned out to hold, once it has been read. Only the person who added it may fill it in.
create or replace function public.ws_set_source_text(p_id uuid, p_body text, p_status text default 'ready', p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.ws_sources%rowtype;
  v_body text := left(coalesce(p_body, ''), 600000);
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_row from public.ws_sources where id = p_id;
  if not found then raise exception 'no such source' using errcode = 'P0002'; end if;
  if public.ws_role_rank(public.ws_page_role(v_uid, v_row.page_id)) < public.ws_role_rank('edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.ws_sources
  set body = v_body,
      chars = length(v_body),
      status = case when p_status in ('reading', 'ready', 'failed') then p_status else 'ready' end,
      error = left(p_error, 500)
  where id = p_id
  returning * into v_row;

  return public.ws_source_json(v_row);
end;
$$;

-- What a workspace holds, for anyone who can open it. The text itself is not in this list: a sidebar and a source
-- list ask this, and neither needs to carry a hundred lectures across the wire.
create or replace function public.ws_page_sources(p_page uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.ws_role_rank(public.ws_page_role(v_uid, p_page)) < public.ws_role_rank('read') then
    return '[]'::jsonb;
  end if;
  return coalesce(
    (select jsonb_agg(public.ws_source_json(s) order by s.created_at)
     from public.ws_sources s
     where s.page_id = p_page),
    '[]'::jsonb
  );
end;
$$;

-- The text of the sources a question should read. Anyone who can open the workspace can ask, which is what makes a
-- shared workspace's chats work at all: the text lives here rather than in the uploader's own rows.
create or replace function public.ws_source_bodies(p_page uuid, p_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.ws_role_rank(public.ws_page_role(v_uid, p_page)) < public.ws_role_rank('read') then
    return '[]'::jsonb;
  end if;
  return coalesce(
    (select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'mime', s.mime, 'body', s.body) order by s.created_at)
     from public.ws_sources s
     where s.page_id = p_page
       and s.status = 'ready'
       and (p_ids is null or s.id = any(p_ids))),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.ws_remove_source(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.ws_sources%rowtype;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_row from public.ws_sources where id = p_id;
  if not found then return false; end if;
  if public.ws_role_rank(public.ws_page_role(v_uid, v_row.page_id)) < public.ws_role_rank('edit') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.ws_sources where id = p_id;
  return true;
end;
$$;

grant execute on function
  public.ws_add_source(uuid, text, text, bigint, uuid, text, text, text),
  public.ws_set_source_text(uuid, text, text, text),
  public.ws_page_sources(uuid),
  public.ws_source_bodies(uuid, uuid[]),
  public.ws_remove_source(uuid)
to authenticated;

comment on table public.ws_sources is
  'Files a workspace is built on: which page they belong to and the text they turned out to hold, readable by anyone the page is shared with. The bytes stay in the uploader''s own library-sources bucket.';
