-- Space: the Notion-style workspace's backend (docs/space/PLAN.md, milestone M1).
--
-- Owner, 2026-09-11: "Make this live into the app, we have the frontend, now let's make the backend work",
-- with classmates editing together from day one.
--
-- 🔴 ONE RECORDS TABLE, NOT ONE TABLE PER THING. Pages, blocks, database rows, databases, views and comments
-- all sync the same way (a version, per-field versions, list operations, a page they are broadcast with), so
-- they share one table and one write function. Six tables would mean six copies of the conflict rules.
--
-- 🔴 NO CLIENT POLICIES ON ANY ws_ TABLE. RLS is on and nothing is granted: every read and write goes through
-- the SECURITY DEFINER functions below, which all ask ws_page_role(). A policy per table would have to restate
-- the whole permission model (private section, teamspaces, grants inherited down the page tree) in SQL that
-- runs per row; one function says it once.
--
-- 🔴 CONFLICTS ARE PER FIELD. Two people changing different fields of one record (a block's text and its
-- colour, a row's status and its due date) never collide: `fv` remembers the version at which each field last
-- changed, and a patch only conflicts on a field someone else changed after the patch's base. Ordered lists
-- (a page's blocks, a database's rows) travel as insert-after and remove operations, which never conflict.

-- ---------------------------------------------------------------------------------------------- tables

create table if not exists public.ws_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Workspace' check (char_length(name) between 1 and 100),
  icon jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ws_members (
  space_id uuid not null references public.ws_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists ws_members_by_user on public.ws_members (user_id);

-- A teamspace. 'default' is the one every member is in; 'open' anyone in the workspace can see and join;
-- 'closed' is listed but needs an invite; 'private' is not listed.
create table if not exists public.ws_teams (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.ws_spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  icon jsonb,
  description text not null default '',
  access text not null default 'open' check (access in ('default', 'open', 'closed', 'private')),
  default_role text not null default 'edit' check (default_role in ('read', 'comment', 'edit', 'full')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists ws_teams_by_space on public.ws_teams (space_id);

create table if not exists public.ws_team_members (
  team_id uuid not null references public.ws_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists ws_team_members_by_user on public.ws_team_members (user_id);

create table if not exists public.ws_records (
  -- Minted by the client (a page made offline needs its address before the server has heard of it).
  id uuid primary key,
  space_id uuid not null references public.ws_spaces(id) on delete cascade,
  kind text not null check (kind in ('page', 'block', 'row', 'collection', 'view', 'comment')),
  type text not null default '' check (char_length(type) <= 64),
  -- page: its parent page, or null at the top of a section. block: a page or a block. row: its collection.
  -- collection and view: the page they belong to. comment: the page, block or row it is about.
  parent_id uuid,
  -- The page this record is loaded and broadcast with (a page's is itself).
  page_id uuid not null,
  -- Ancestor pages, root first, ending with page_id. Permissions are inherited down it.
  path uuid[] not null,
  -- Only on a top-level page: whose Private section it sits in, or which teamspace.
  owner_id uuid references auth.users(id) on delete cascade,
  team_id uuid references public.ws_teams(id) on delete cascade,
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object'),
  alive boolean not null default true,
  trashed_at timestamptz,
  trashed_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  fv jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz not null default now(),
  check (owner_id is null or team_id is null)
);
create index if not exists ws_records_by_page on public.ws_records (page_id);
create index if not exists ws_records_by_parent on public.ws_records (parent_id);
create index if not exists ws_records_path on public.ws_records using gin (path);
create index if not exists ws_records_roots on public.ws_records (space_id) where kind = 'page' and parent_id is null;
create index if not exists ws_records_trash on public.ws_records (space_id, trashed_at desc) where kind = 'page' and alive = false;

-- Sharing. Inherited by every page under page_id.
create table if not exists public.ws_permissions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.ws_records(id) on delete cascade,
  principal_type text not null check (principal_type in ('user', 'space', 'team', 'public')),
  principal_id uuid,
  role text not null check (role in ('read', 'comment', 'edit', 'full')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((principal_type = 'public') = (principal_id is null))
);
create unique index if not exists ws_permissions_one_per_principal
  on public.ws_permissions (page_id, principal_type, coalesce(principal_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists ws_permissions_by_principal on public.ws_permissions (principal_type, principal_id);

create table if not exists public.ws_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.ws_records(id) on delete cascade,
  space_id uuid not null references public.ws_spaces(id) on delete cascade,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, page_id)
);

create table if not exists public.ws_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.ws_records(id) on delete cascade,
  space_id uuid not null references public.ws_spaces(id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
create index if not exists ws_visits_recent on public.ws_visits (user_id, space_id, visited_at desc);

-- One person's own view of the app: theme, sidebar sections open or hidden, recent emoji, current workspace.
create table if not exists public.ws_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

-- Who gets the new shell. The all-zero id means everyone.
create table if not exists public.ws_rollout (
  user_id uuid primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.ws_spaces enable row level security;
alter table public.ws_members enable row level security;
alter table public.ws_teams enable row level security;
alter table public.ws_team_members enable row level security;
alter table public.ws_records enable row level security;
alter table public.ws_permissions enable row level security;
alter table public.ws_favorites enable row level security;
alter table public.ws_visits enable row level security;
alter table public.ws_user_settings enable row level security;
alter table public.ws_rollout enable row level security;

revoke all on public.ws_spaces, public.ws_members, public.ws_teams, public.ws_team_members, public.ws_records,
  public.ws_permissions, public.ws_favorites, public.ws_visits, public.ws_user_settings, public.ws_rollout
  from anon, authenticated;

-- A page leaving takes everything under it: its blocks, rows, comments and the pages inside it. This is also
-- how deleting an account clears its Private section (owner_id cascades to the top-level page only).
create or replace function public.ws_records_after_page_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ws_records where space_id = old.space_id and path @> array[old.id] and id <> old.id;
  return null;
end;
$$;

drop trigger if exists ws_records_page_cascade on public.ws_records;
create trigger ws_records_page_cascade after delete on public.ws_records
for each row when (old.kind = 'page') execute function public.ws_records_after_page_delete();

-- ---------------------------------------------------------------------------------------------- roles

create or replace function public.ws_role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'full' then 4 when 'edit' then 3 when 'comment' then 2 when 'read' then 1 else 0 end;
$$;

create or replace function public.ws_role_max(a text, b text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when public.ws_role_rank(a) >= public.ws_role_rank(b) then coalesce(a, 'none') else coalesce(b, 'none') end;
$$;

create or replace function public.ws_space_role(p_uid uuid, p_space uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role from public.ws_members where space_id = p_space and user_id = p_uid), 'none');
$$;

-- What a person may do with a teamspace's pages by virtue of the teamspace alone.
create or replace function public.ws_team_role(p_uid uuid, p_team uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team public.ws_teams%rowtype;
  v_member text;
  v_space_role text;
begin
  select * into v_team from public.ws_teams where id = p_team and archived_at is null;
  if not found then return 'none'; end if;
  v_space_role := public.ws_space_role(p_uid, v_team.space_id);
  if v_space_role = 'none' then return 'none'; end if;
  select role into v_member from public.ws_team_members where team_id = p_team and user_id = p_uid;
  if v_member = 'owner' then return 'full'; end if;
  if v_member is not null then return v_team.default_role; end if;
  if v_space_role in ('owner', 'member') and v_team.access in ('default', 'open') then return v_team.default_role; end if;
  return 'none';
end;
$$;

-- 🔴 THE PERMISSION MODEL, IN ONE PLACE. Highest of:
--   the section the top-level page sits in (its Private owner, its teamspace, or the whole workspace),
--   any grant on the page or an ancestor (a person, the workspace, a teamspace, or anyone with the link).
create or replace function public.ws_page_role(p_uid uuid, p_page uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page public.ws_records%rowtype;
  v_root public.ws_records%rowtype;
  v_space_role text;
  v_role text := 'none';
  v_grant text;
begin
  select * into v_page from public.ws_records where id = p_page and kind = 'page';
  if not found then return 'none'; end if;

  select g.role into v_grant from public.ws_permissions g
  where g.page_id = any(v_page.path) and g.principal_type = 'public'
  order by public.ws_role_rank(g.role) desc limit 1;
  v_role := public.ws_role_max(v_role, v_grant);
  if p_uid is null then return v_role; end if;

  v_space_role := public.ws_space_role(p_uid, v_page.space_id);
  if v_space_role = 'none' then return v_role; end if;

  select * into v_root from public.ws_records where id = v_page.path[1];
  if v_root.owner_id is not null then
    if v_root.owner_id = p_uid then return 'full'; end if;
  elsif v_root.team_id is not null then
    v_role := public.ws_role_max(v_role, public.ws_team_role(p_uid, v_root.team_id));
  elsif v_space_role in ('owner', 'member') then
    v_role := public.ws_role_max(v_role, case when v_space_role = 'owner' then 'full' else 'edit' end);
  end if;

  select g.role into v_grant from public.ws_permissions g
  where g.page_id = any(v_page.path)
    and (
      (g.principal_type = 'user' and g.principal_id = p_uid)
      or (g.principal_type = 'space' and g.principal_id = v_page.space_id and v_space_role in ('owner', 'member'))
      or (g.principal_type = 'team' and exists (
        select 1 from public.ws_team_members tm where tm.team_id = g.principal_id and tm.user_id = p_uid))
    )
  order by public.ws_role_rank(g.role) desc limit 1;
  return public.ws_role_max(v_role, v_grant);
end;
$$;

-- ---------------------------------------------------------------------------------------------- helpers

-- Apply one list operation to a jsonb array of ids: {"del": [id...], "ins": [[id, after-id-or-null]...]}.
-- An insert whose anchor has gone (someone else removed it) lands at the end rather than failing.
create or replace function public.ws_list_apply(p_arr jsonb, p_op jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_arr jsonb := case when jsonb_typeof(p_arr) = 'array' then p_arr else '[]'::jsonb end;
  v_ins jsonb;
  v_item text;
  v_after jsonb;
  v_pos integer;
begin
  if jsonb_typeof(p_op -> 'del') = 'array' and jsonb_array_length(p_op -> 'del') > 0 then
    select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_arr
    from jsonb_array_elements(v_arr) with ordinality as t(e, o)
    where not (jsonb_typeof(e) = 'string' and (p_op -> 'del') ? (e #>> '{}'));
  end if;
  if jsonb_typeof(p_op -> 'ins') = 'array' then
    for v_ins in select e from jsonb_array_elements(p_op -> 'ins') as t(e) loop
      v_item := v_ins ->> 0;
      continue when v_item is null;
      v_after := v_ins -> 1;
      select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_arr
      from jsonb_array_elements(v_arr) with ordinality as t(e, o)
      where (e #>> '{}') is distinct from v_item;
      if v_after is null or jsonb_typeof(v_after) = 'null' then
        v_arr := jsonb_build_array(v_item) || v_arr;
      else
        v_pos := null;
        select (o - 1)::integer into v_pos
        from jsonb_array_elements(v_arr) with ordinality as t(e, o)
        where (e #>> '{}') = (v_after #>> '{}') limit 1;
        if v_pos is null then
          v_arr := v_arr || jsonb_build_array(v_item);
        else
          select coalesce(jsonb_agg(s.e order by s.o), '[]'::jsonb) into v_arr from (
            select t.e, t.o::numeric as o from jsonb_array_elements(v_arr) with ordinality as t(e, o)
            union all
            select to_jsonb(v_item), v_pos + 1.5
          ) s;
        end if;
      end if;
    end loop;
  end if;
  return v_arr;
end;
$$;

create or replace function public.ws_record_json(r public.ws_records)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'type', r.type, 'parent_id', r.parent_id, 'page_id', r.page_id,
    'path', to_jsonb(r.path), 'owner_id', r.owner_id, 'team_id', r.team_id, 'props', r.props,
    'alive', r.alive, 'trashed_at', r.trashed_at, 'v', r.version, 'fv', r.fv,
    'created_by', r.created_by, 'created_at', r.created_at, 'edited_by', r.edited_by, 'edited_at', r.edited_at
  );
$$;

-- A page as the sidebar, a mention or a breadcrumb needs it, without its body. `partial` tells the client which
-- props it is holding, so it never mistakes a missing field for a deleted one.
create or replace function public.ws_page_summary(r public.ws_records)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'type', r.type, 'parent_id', r.parent_id, 'page_id', r.page_id,
    'path', to_jsonb(r.path), 'owner_id', r.owner_id, 'team_id', r.team_id,
    'props', (select coalesce(jsonb_object_agg(k, r.props -> k), '{}'::jsonb)
              from unnest(array['title', 'icon', 'cover', 'rowOf', 'titleParts', 'titleDate', 'collection', 'description']) k
              where r.props ? k),
    'alive', r.alive, 'trashed_at', r.trashed_at, 'v', r.version,
    'created_by', r.created_by, 'created_at', r.created_at, 'edited_by', r.edited_by, 'edited_at', r.edited_at,
    'partial', true,
    'has_children', exists (select 1 from public.ws_records c where c.parent_id = r.id and c.kind = 'page' and c.alive)
  );
$$;

create or replace function public.ws_person_json(p_uid uuid, p_role text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'name', coalesce(nullif(s.data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''),
                     nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
    'avatar', coalesce(nullif(s.data ->> 'avatar', ''), nullif(u.raw_user_meta_data ->> 'avatar_url', '')),
    'role', p_role
  )
  from auth.users u
  left join public.ws_user_settings s on s.user_id = u.id
  where u.id = p_uid;
$$;

-- Where a new or moved record lands: its page and its path. `ok` is false when the parent is gone or wrong;
-- 🔴 IT DOES NOT RAISE, because an exception would throw away every other edit in the same write, and a parent
-- someone else deleted a second ago is ordinary in a shared page.
create or replace function public.ws_place(p_space uuid, p_kind text, p_id uuid, p_parent uuid,
  out page_id uuid, out path uuid[], out ok boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parent public.ws_records%rowtype;
begin
  ok := false;
  if p_parent is null then
    if p_kind <> 'page' then return; end if;
    page_id := p_id;
    path := array[p_id];
    ok := true;
    return;
  end if;
  select * into v_parent from public.ws_records r where r.id = p_parent and r.space_id = p_space;
  if not found then return; end if;
  if p_kind = 'page' then
    if v_parent.kind <> 'page' or v_parent.path @> array[p_id] then return; end if;
    page_id := p_id;
    path := v_parent.path || p_id;
  elsif v_parent.kind = 'page' then
    page_id := v_parent.id;
    path := v_parent.path;
  else
    page_id := v_parent.page_id;
    path := v_parent.path;
  end if;
  ok := true;
end;
$$;

-- Which section a top-level page goes in, and whether this person may put it there.
create or replace function public.ws_section(p_uid uuid, p_space uuid, p_section jsonb,
  out owner_id uuid, out team_id uuid, out allowed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space_role text := public.ws_space_role(p_uid, p_space);
begin
  owner_id := null;
  team_id := null;
  allowed := false;
  if v_space_role in ('none', 'guest') then return; end if;
  if p_section is null or jsonb_typeof(p_section) = 'null' or p_section = '"private"'::jsonb then
    owner_id := p_uid;
    allowed := true;
  elsif p_section = '"workspace"'::jsonb then
    allowed := true;
  elsif jsonb_typeof(p_section) = 'object' and p_section ? 'team' then
    team_id := (p_section ->> 'team')::uuid;
    allowed := exists (select 1 from public.ws_teams t where t.id = team_id and t.space_id = p_space)
      and public.ws_role_rank(public.ws_team_role(p_uid, team_id)) >= 3;
  end if;
end;
$$;

-- The realtime topics a sidebar-level change must reach: the section that holds the tree, plus everyone and
-- everything granted access somewhere on its path.
create or replace function public.ws_tree_topics(p_space uuid, p_path uuid[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(select distinct t from (
    select case
      when r.owner_id is not null then 'ws:user:' || r.owner_id
      when r.team_id is not null then 'ws:team:' || r.team_id
      else 'ws:space:' || p_space
    end as t
    from public.ws_records r where r.id = p_path[1]
    union all
    select case g.principal_type
      when 'user' then 'ws:user:' || g.principal_id
      when 'team' then 'ws:team:' || g.principal_id
      when 'space' then 'ws:space:' || g.principal_id
    end
    from public.ws_permissions g
    where g.page_id = any(p_path) and g.principal_type <> 'public'
  ) x where t is not null);
$$;

create or replace function public.ws_send(p_payload jsonb, p_event text, p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A write must never fail because the broadcast did; a client that misses it catches up on its next load.
  begin
    perform realtime.send(p_payload, p_event, p_topic, true);
  exception when others then
    raise warning 'ws_send % failed: %', p_topic, sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------------------------- writes

create or replace function public.ws_apply(p_space uuid, p_ops jsonb, p_client text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space_role text;
  v_op jsonb;
  v_kind text;
  v_id uuid;
  v_rec public.ws_records%rowtype;
  v_role text;
  v_need integer;
  v_results jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_denied jsonb := '[]'::jsonb;
  v_by_page jsonb := '{}'::jsonb;
  v_tree jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_val jsonb;
  v_base bigint;
  v_fbase bigint;
  v_version bigint;
  v_props jsonb;
  v_fv jsonb;
  v_set jsonb;
  v_lists jsonb;
  v_type text;
  v_parent uuid;
  v_page_new uuid;
  v_path_new uuid[];
  v_ok boolean;
  v_owner uuid;
  v_team uuid;
  v_allowed boolean;
  v_old_path uuid[];
  v_old_page uuid;
  v_moved boolean;
  v_topic text;
  v_topics text[];
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  v_space_role := public.ws_space_role(v_uid, p_space);
  if v_space_role = 'none' then raise exception 'not a member of this workspace' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'ops must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_ops) > 2000 then raise exception 'too many ops in one write' using errcode = '54000'; end if;

  for v_op in select e from jsonb_array_elements(p_ops) as t(e) loop
    v_id := (v_op ->> 'id')::uuid;
    v_kind := v_op ->> 'kind';

    if v_op ->> 'op' = 'create' then
      if v_kind is null or v_kind not in ('page', 'block', 'row', 'collection', 'view', 'comment') then
        raise exception 'unknown kind %', v_kind using errcode = '22023';
      end if;
      select * into v_rec from public.ws_records where id = v_id;
      if found then
        -- A retry after a lost acknowledgement. Nothing to do but say where it stands.
        if v_rec.space_id = p_space then
          v_results := v_results || jsonb_build_object('id', v_id, 'v', v_rec.version, 'existed', true);
        else
          v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true);
        end if;
        continue;
      end if;
      v_parent := nullif(v_op ->> 'parent_id', '')::uuid;
      select x.page_id, x.path, x.ok into v_page_new, v_path_new, v_ok from public.ws_place(p_space, v_kind, v_id, v_parent) x;
      if not v_ok then v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true); continue; end if;
      v_owner := null;
      v_team := null;
      if v_kind = 'page' and v_parent is null then
        select x.owner_id, x.team_id, x.allowed into v_owner, v_team, v_allowed from public.ws_section(v_uid, p_space, v_op -> 'section') x;
        if not v_allowed then v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true); continue; end if;
      else
        v_need := case when v_kind = 'comment' then 2 else 3 end;
        v_role := public.ws_page_role(v_uid, case when v_kind = 'page' then v_parent else v_page_new end);
        if public.ws_role_rank(v_role) < v_need then v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true); continue; end if;
      end if;
      v_props := coalesce(v_op -> 'props', '{}'::jsonb);
      if jsonb_typeof(v_props) <> 'object' then raise exception 'props must be an object' using errcode = '22023'; end if;
      insert into public.ws_records (id, space_id, kind, type, parent_id, page_id, path, owner_id, team_id, props,
        created_by, edited_by)
      values (v_id, p_space, v_kind, coalesce(v_op ->> 'type', ''), v_parent, v_page_new, v_path_new,
        v_owner, v_team, v_props, v_uid, v_uid)
      returning * into v_rec;
      v_results := v_results || jsonb_build_object('id', v_id, 'v', v_rec.version);
      v_item := public.ws_record_json(v_rec) || jsonb_build_object('created', true);
      v_by_page := jsonb_set(v_by_page, array[v_rec.page_id::text],
        coalesce(v_by_page -> v_rec.page_id::text, '[]'::jsonb) || v_item, true);
      if v_kind = 'page' or (v_kind = 'block' and v_rec.type = 'page') then
        v_tree := v_tree || (case when v_kind = 'page' then public.ws_page_summary(v_rec) else v_item end);
      end if;

    elsif v_op ->> 'op' = 'update' then
      select * into v_rec from public.ws_records where id = v_id and space_id = p_space for update;
      if not found then
        v_results := v_results || jsonb_build_object('id', v_id, 'missing', true);
        continue;
      end if;
      v_role := public.ws_page_role(v_uid, v_rec.page_id);
      v_set := coalesce(v_op -> 'set', '{}'::jsonb);
      v_lists := coalesce(v_op -> 'lists', '{}'::jsonb);
      if v_rec.kind = 'comment' and v_rec.created_by is distinct from v_uid and public.ws_role_rank(v_role) < 4 then
        -- Someone else's comment: an editor may resolve it, and nothing else.
        if public.ws_role_rank(v_role) < 3 or v_lists <> '{}'::jsonb
          or exists (select 1 from jsonb_object_keys(v_set) k where k <> 'resolved') then
          v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true);
          continue;
        end if;
      elsif v_rec.kind <> 'comment' and public.ws_role_rank(v_role) < 3 then
        v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true);
        continue;
      end if;

      v_base := nullif(v_op ->> 'base', '')::bigint;
      v_version := v_rec.version + 1;
      v_props := v_rec.props;
      v_fv := v_rec.fv;
      v_item := jsonb_build_object('id', v_id, 'kind', v_rec.kind, 'type', v_rec.type, 'page_id', v_rec.page_id,
        'parent_id', v_rec.parent_id, 'path', to_jsonb(v_rec.path), 'v', v_version, 'set', '{}'::jsonb);

      -- `bases` may say, field by field, which version of that field the client last saw. It is more exact than the
      -- record's `base` when a broadcast was missed: a change to another field then cannot hide a change to this one.
      for v_key, v_val in select key, value from jsonb_each(v_set) loop
        v_fbase := coalesce(nullif(v_op #>> array['bases', v_key], '')::bigint, v_base);
        if v_fbase is not null and coalesce((v_fv ->> v_key)::bigint, 0) > v_fbase then
          v_conflicts := v_conflicts || jsonb_build_object('id', v_id, 'field', v_key,
            'value', coalesce(v_props -> v_key, 'null'::jsonb), 'v', v_rec.version);
          continue;
        end if;
        if jsonb_typeof(v_val) = 'null' then
          v_props := v_props - v_key;
        else
          v_props := jsonb_set(v_props, array[v_key], v_val, true);
        end if;
        v_fv := jsonb_set(v_fv, array[v_key], to_jsonb(v_version), true);
        v_item := jsonb_set(v_item, array['set', v_key], v_val, true);
      end loop;

      for v_key, v_val in select key, value from jsonb_each(v_lists) loop
        v_props := jsonb_set(v_props, array[v_key], public.ws_list_apply(v_props -> v_key, v_val), true);
        v_fv := jsonb_set(v_fv, array[v_key], to_jsonb(v_version), true);
        v_item := jsonb_set(v_item, array['set', v_key], v_props -> v_key, true);
      end loop;

      v_type := v_rec.type;
      if v_op ? 'type' and (v_op ->> 'type') is distinct from v_rec.type then
        v_fbase := coalesce(nullif(v_op #>> array['bases', '$type'], '')::bigint, v_base);
        if v_fbase is not null and coalesce((v_fv ->> '$type')::bigint, 0) > v_fbase then
          v_conflicts := v_conflicts || jsonb_build_object('id', v_id, 'field', '$type', 'value', to_jsonb(v_rec.type), 'v', v_rec.version);
        else
          v_type := coalesce(v_op ->> 'type', '');
          v_fv := jsonb_set(v_fv, array['$type'], to_jsonb(v_version), true);
          v_item := jsonb_set(v_item, array['type'], to_jsonb(v_type), true);
          v_item := jsonb_set(v_item, array['set', '$type'], to_jsonb(v_type), true);
        end if;
      end if;

      v_moved := false;
      v_old_path := v_rec.path;
      v_old_page := v_rec.page_id;
      if v_op ? 'parent_id' and (nullif(v_op ->> 'parent_id', '')::uuid is distinct from v_rec.parent_id
          or (v_rec.kind = 'page' and v_rec.parent_id is null and v_op ? 'section')) then
        v_parent := nullif(v_op ->> 'parent_id', '')::uuid;
        select x.page_id, x.path, x.ok into v_page_new, v_path_new, v_ok from public.ws_place(p_space, v_rec.kind, v_id, v_parent) x;
        if not v_ok then v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true); continue; end if;
        v_owner := null;
        v_team := null;
        if v_rec.kind = 'page' and v_parent is null then
          select x.owner_id, x.team_id, x.allowed into v_owner, v_team, v_allowed from public.ws_section(v_uid, p_space, v_op -> 'section') x;
          if not v_allowed then v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true); continue; end if;
        elsif public.ws_role_rank(public.ws_page_role(v_uid, case when v_rec.kind = 'page' then v_parent else v_page_new end)) < 3 then
          v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true);
          continue;
        end if;
        if v_rec.kind = 'page' then
          update public.ws_records set path = v_path_new || path[cardinality(v_old_path) + 1:]
          where space_id = p_space and path @> array[v_id];
          update public.ws_records set owner_id = v_owner, team_id = v_team where id = v_id;
        elsif v_page_new is distinct from v_rec.page_id then
          -- A block (and whatever hangs off it) moving to another page takes its whole subtree along.
          with recursive d as (
            select r.id from public.ws_records r where r.id = v_id
            union all
            select r.id from public.ws_records r join d on r.parent_id = d.id where r.kind <> 'page'
          )
          update public.ws_records set page_id = v_page_new, path = v_path_new where id in (select id from d);
        end if;
        v_fv := jsonb_set(v_fv, array['$parent'], to_jsonb(v_version), true);
        v_item := jsonb_set(v_item, array['parent_id'], coalesce(to_jsonb(v_parent), 'null'::jsonb), true);
        v_item := v_item || jsonb_build_object('page_id', v_page_new, 'path', to_jsonb(v_path_new), 'moved', true);
        v_moved := true;
      end if;

      if v_item -> 'set' = '{}'::jsonb and not v_moved then
        v_results := v_results || jsonb_build_object('id', v_id, 'v', v_rec.version);
        continue;
      end if;

      update public.ws_records
      set props = v_props, fv = v_fv, type = v_type, parent_id = case when v_moved then v_parent else parent_id end,
          version = v_version, edited_by = v_uid, edited_at = now()
      where id = v_id
      returning * into v_rec;
      -- A list is merged with whatever others did to it, so the writer is told what it became.
      v_results := v_results || jsonb_build_object('id', v_id, 'v', v_version, 'lists',
        (select coalesce(jsonb_object_agg(k, v_props -> k), '{}'::jsonb) from jsonb_object_keys(v_lists) k));

      v_by_page := jsonb_set(v_by_page, array[v_rec.page_id::text],
        coalesce(v_by_page -> v_rec.page_id::text, '[]'::jsonb) || v_item, true);
      if v_moved and v_old_page is distinct from v_rec.page_id then
        -- Tell the page it left, too.
        v_by_page := jsonb_set(v_by_page, array[v_old_page::text],
          coalesce(v_by_page -> v_old_page::text, '[]'::jsonb) || jsonb_build_object('id', v_id, 'kind', v_rec.kind, 'left', true), true);
      end if;
      if v_rec.kind = 'page' or (v_rec.kind = 'block' and v_rec.type = 'page') then
        v_tree := v_tree || (case when v_rec.kind = 'page' then public.ws_page_summary(v_rec) || jsonb_build_object('set', v_item -> 'set') else v_item end);
      end if;

    elsif v_op ->> 'op' in ('trash', 'restore') then
      select * into v_rec from public.ws_records where id = v_id and space_id = p_space and kind = 'page' for update;
      if not found then
        v_results := v_results || jsonb_build_object('id', v_id, 'missing', true);
        continue;
      end if;
      if public.ws_role_rank(public.ws_page_role(v_uid, v_id)) < 3 then
        v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true);
        continue;
      end if;
      update public.ws_records
      set alive = (v_op ->> 'op' = 'restore'),
          trashed_at = case when v_op ->> 'op' = 'trash' then now() else null end,
          trashed_by = case when v_op ->> 'op' = 'trash' then v_uid else null end,
          version = version + 1,
          fv = jsonb_set(fv, array['$alive'], to_jsonb(version + 1), true),
          edited_by = v_uid, edited_at = now()
      where id = v_id
      returning * into v_rec;
      v_results := v_results || jsonb_build_object('id', v_id, 'v', v_rec.version);
      v_item := public.ws_page_summary(v_rec);
      v_by_page := jsonb_set(v_by_page, array[v_rec.page_id::text],
        coalesce(v_by_page -> v_rec.page_id::text, '[]'::jsonb) || v_item, true);
      v_tree := v_tree || v_item;

    elsif v_op ->> 'op' = 'destroy' then
      select * into v_rec from public.ws_records where id = v_id and space_id = p_space for update;
      if not found then
        v_results := v_results || jsonb_build_object('id', v_id, 'missing', true);
        continue;
      end if;
      v_role := public.ws_page_role(v_uid, v_rec.page_id);
      if not (
        (v_rec.kind = 'page' and public.ws_role_rank(v_role) >= 4)
        or (v_rec.kind = 'comment' and (v_rec.created_by = v_uid or public.ws_role_rank(v_role) >= 4))
        or (v_rec.kind not in ('page', 'comment') and public.ws_role_rank(v_role) >= 3)
      ) then
        v_denied := v_denied || to_jsonb(v_id); v_results := v_results || jsonb_build_object('id', v_id, 'denied', true);
        continue;
      end if;
      if v_rec.kind = 'page' then
        delete from public.ws_records where id = v_id;
      else
        with recursive d as (
          select r.id from public.ws_records r where r.id = v_id
          union all
          select r.id from public.ws_records r join d on r.parent_id = d.id where r.kind <> 'page'
        )
        delete from public.ws_records where id in (select id from d);
      end if;
      v_results := v_results || jsonb_build_object('id', v_id, 'destroyed', true);
      v_item := jsonb_build_object('id', v_id, 'kind', v_rec.kind, 'type', v_rec.type, 'page_id', v_rec.page_id,
        'parent_id', v_rec.parent_id, 'path', to_jsonb(v_rec.path), 'destroyed', true);
      v_by_page := jsonb_set(v_by_page, array[v_rec.page_id::text],
        coalesce(v_by_page -> v_rec.page_id::text, '[]'::jsonb) || v_item, true);
      if v_rec.kind = 'page' or (v_rec.kind = 'block' and v_rec.type = 'page') then
        v_tree := v_tree || v_item;
      end if;

    else
      raise exception 'unknown op %', v_op ->> 'op' using errcode = '22023';
    end if;
  end loop;

  -- 🔴 BROADCAST AFTER EVERYTHING APPLIED, never per op: a page's watchers get one message per write, in order.
  for v_key, v_val in select key, value from jsonb_each(v_by_page) loop
    if pg_column_size(v_val) > 180000 then
      perform public.ws_send(jsonb_build_object('by', v_uid, 'client', p_client, 'page', v_key, 'refetch', true), 'tx', 'ws:page:' || v_key);
    else
      perform public.ws_send(jsonb_build_object('by', v_uid, 'client', p_client, 'page', v_key, 'records', v_val), 'tx', 'ws:page:' || v_key);
    end if;
  end loop;

  if jsonb_array_length(v_tree) > 0 then
    for v_topic in
      select distinct unnest(public.ws_tree_topics(p_space, array(select jsonb_array_elements_text(e -> 'path'))::uuid[]))
      from jsonb_array_elements(v_tree) as t(e)
    loop
      perform public.ws_send(jsonb_build_object('by', v_uid, 'client', p_client, 'items', (
        select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_tree) as t(e)
        where v_topic = any(public.ws_tree_topics(p_space, array(select jsonb_array_elements_text(e -> 'path'))::uuid[]))
      )), 'tree', v_topic);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'results', v_results, 'conflicts', v_conflicts, 'denied', v_denied);
end;
$$;

-- ---------------------------------------------------------------------------------------------- reads

create or replace function public.ws_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.ws_rollout
    where user_id in (auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

-- Everything the shell needs before the first page: who you are, your workspaces, the people and teamspaces in
-- the current one, and the top of every sidebar section. Makes a workspace for someone arriving for the first time.
create or replace function public.ws_bootstrap(p_space uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_role text;
  v_settings jsonb;
  v_name text;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;

  if not exists (select 1 from public.ws_members where user_id = v_uid) then
    select coalesce(nullif(split_part(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), ' ', 1), ''),
                    split_part(u.email, '@', 1))
    into v_name from auth.users u where u.id = v_uid;
    insert into public.ws_spaces (name, created_by)
    values (left(coalesce(v_name, 'My') || '''s workspace', 100), v_uid)
    returning id into v_space;
    insert into public.ws_members (space_id, user_id, role) values (v_space, v_uid, 'owner');
  end if;

  select data into v_settings from public.ws_user_settings where user_id = v_uid;
  v_settings := coalesce(v_settings, '{}'::jsonb);

  v_space := null;
  if p_space is not null and public.ws_space_role(v_uid, p_space) <> 'none' then
    v_space := p_space;
  elsif (v_settings ->> 'current_space') is not null
      and public.ws_space_role(v_uid, (v_settings ->> 'current_space')::uuid) <> 'none' then
    v_space := (v_settings ->> 'current_space')::uuid;
  else
    select m.space_id into v_space from public.ws_members m where m.user_id = v_uid order by m.created_at limit 1;
  end if;
  v_role := public.ws_space_role(v_uid, v_space);

  return jsonb_build_object(
    'user', public.ws_person_json(v_uid),
    'settings', v_settings,
    'spaces', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'icon', s.icon, 'role', m.role,
        'members', (select count(*) from public.ws_members mm where mm.space_id = s.id)) order by m.created_at), '[]'::jsonb)
      from public.ws_members m join public.ws_spaces s on s.id = m.space_id where m.user_id = v_uid
    ),
    'space', (select jsonb_build_object('id', s.id, 'name', s.name, 'icon', s.icon, 'settings', s.settings, 'role', v_role)
              from public.ws_spaces s where s.id = v_space),
    'people', (
      select coalesce(jsonb_agg(public.ws_person_json(m.user_id, m.role) order by m.created_at), '[]'::jsonb)
      from public.ws_members m where m.space_id = v_space
    ),
    'teams', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'icon', t.icon, 'description', t.description,
        'access', t.access, 'default_role', t.default_role, 'role', public.ws_team_role(v_uid, t.id),
        'member', exists (select 1 from public.ws_team_members tm where tm.team_id = t.id and tm.user_id = v_uid))
        order by t.created_at), '[]'::jsonb)
      from public.ws_teams t
      where t.space_id = v_space and t.archived_at is null
        and (t.access <> 'private' or exists (select 1 from public.ws_team_members tm where tm.team_id = t.id and tm.user_id = v_uid))
    ),
    'roots', (
      select coalesce(jsonb_agg(public.ws_page_summary(r) order by r.created_at desc), '[]'::jsonb)
      from public.ws_records r
      where r.space_id = v_space and r.kind = 'page' and r.parent_id is null and r.alive
        and (r.owner_id = v_uid
          or (r.owner_id is null and r.team_id is null and v_role in ('owner', 'member'))
          or (r.team_id is not null and public.ws_role_rank(public.ws_team_role(v_uid, r.team_id)) >= 1))
    ),
    'shared', (
      select coalesce(jsonb_agg(public.ws_page_summary(r) order by r.created_at desc), '[]'::jsonb)
      from public.ws_records r
      where r.space_id = v_space and r.kind = 'page' and r.alive
        and exists (select 1 from public.ws_permissions g where g.page_id = r.id and g.principal_type = 'user' and g.principal_id = v_uid)
        and not exists (select 1 from public.ws_records root where root.id = r.path[1] and root.owner_id = v_uid)
    ),
    'favorites', (
      select coalesce(jsonb_agg(public.ws_page_summary(r) || jsonb_build_object('position', f.position) order by f.position, f.created_at), '[]'::jsonb)
      from public.ws_favorites f join public.ws_records r on r.id = f.page_id
      where f.user_id = v_uid and f.space_id = v_space and r.alive
        and public.ws_role_rank(public.ws_page_role(v_uid, r.id)) >= 1
    ),
    'recents', (
      select coalesce(jsonb_agg(x.j order by x.visited_at desc), '[]'::jsonb) from (
        select public.ws_page_summary(r) || jsonb_build_object('visited_at', vi.visited_at) as j, vi.visited_at
        from public.ws_visits vi join public.ws_records r on r.id = vi.page_id
        where vi.user_id = v_uid and vi.space_id = v_space and r.alive
          and public.ws_role_rank(public.ws_page_role(v_uid, r.id)) >= 1
        order by vi.visited_at desc limit 40
      ) x
    )
  );
end;
$$;

-- One page and everything on it: blocks, databases, rows, views and comments, plus what it needs to draw
-- links (the pages inside it and above it) and whether it sits in the Trash.
create or replace function public.ws_load_page(p_page uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.ws_records%rowtype;
  v_role text;
  v_row_of jsonb;
begin
  select * into v_page from public.ws_records where id = p_page and kind = 'page';
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  v_role := public.ws_page_role(v_uid, p_page);
  if public.ws_role_rank(v_role) < 1 then return jsonb_build_object('error', 'no_access'); end if;
  v_row_of := v_page.props -> 'rowOf';

  return jsonb_build_object(
    'role', v_role,
    'space_id', v_page.space_id,
    'page', public.ws_record_json(v_page),
    'records', (
      select coalesce(jsonb_agg(public.ws_record_json(r)), '[]'::jsonb)
      from public.ws_records r
      where r.page_id = p_page and r.id <> p_page
    ),
    -- A database row's page shows the row's properties, so it brings the row and its database's schema.
    'row', case when v_row_of is null then null else (
      select jsonb_build_object(
        'row', (select public.ws_record_json(r) from public.ws_records r where r.id = (v_row_of ->> 'row')::uuid and r.kind = 'row'),
        'collection', (select public.ws_record_json(r) from public.ws_records r where r.id = (v_row_of ->> 'coll')::uuid and r.kind = 'collection')
      )
    ) end,
    'children', (
      select coalesce(jsonb_agg(public.ws_page_summary(r)), '[]'::jsonb)
      from public.ws_records r where r.parent_id = p_page and r.kind = 'page'
    ),
    'ancestors', (
      select coalesce(jsonb_agg(public.ws_page_summary(r) order by array_position(v_page.path, r.id)), '[]'::jsonb)
      from public.ws_records r where r.id = any(v_page.path) and r.id <> p_page
    ),
    'in_trash', exists (select 1 from public.ws_records r where r.id = any(v_page.path) and not r.alive)
  );
end;
$$;

-- Expanding a page in the sidebar: the pages inside it and the blocks that place them, in page order.
create or replace function public.ws_load_children(p_pages uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ok uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ok from unnest(p_pages) id
  where public.ws_role_rank(public.ws_page_role(v_uid, id)) >= 1;

  return jsonb_build_object(
    'pages', (
      select coalesce(jsonb_agg(public.ws_page_summary(r)), '[]'::jsonb)
      from public.ws_records r where r.parent_id = any(v_ok) and r.kind = 'page'
    ),
    'links', (
      select coalesce(jsonb_agg(public.ws_record_json(b)), '[]'::jsonb)
      from public.ws_records b where b.page_id = any(v_ok) and b.kind = 'block' and b.type = 'page'
    ),
    'content', (
      select coalesce(jsonb_object_agg(p.id, (
        select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
        from jsonb_array_elements(p.props -> 'content') with ordinality as t(e, o)
        where exists (select 1 from public.ws_records b where b.id = (t.e #>> '{}')::uuid and b.kind = 'block' and b.type = 'page')
      )), '{}'::jsonb)
      from public.ws_records p where p.id = any(v_ok)
    )
  );
end;
$$;

-- Titles and icons for pages mentioned or linked elsewhere; a page you cannot open comes back as no_access.
create or replace function public.ws_page_summaries(p_ids uuid[])
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(case when public.ws_role_rank(public.ws_page_role(auth.uid(), r.id)) >= 1
    then public.ws_page_summary(r) else jsonb_build_object('id', r.id, 'no_access', true) end), '[]'::jsonb)
  from public.ws_records r where r.id = any(p_ids) and r.kind = 'page';
$$;

create or replace function public.ws_trash(p_space uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ws_page_summary(r) order by r.trashed_at desc), '[]'::jsonb)
  from public.ws_records r
  where r.space_id = p_space and r.kind = 'page' and not r.alive
    and public.ws_role_rank(public.ws_page_role(auth.uid(), r.id)) >= 3;
$$;

create or replace function public.ws_save_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_data jsonb;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'settings patch must be an object' using errcode = '22023'; end if;
  if pg_column_size(p_patch) > 500000 then raise exception 'settings too large' using errcode = '54000'; end if;
  insert into public.ws_user_settings (user_id, data) values (v_uid, jsonb_strip_nulls(p_patch))
  on conflict (user_id) do update
    set data = jsonb_strip_nulls(public.ws_user_settings.data || p_patch), updated_at = now()
  returning data into v_data;
  return v_data;
end;
$$;

create or replace function public.ws_visit(p_page uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
begin
  select space_id into v_space from public.ws_records where id = p_page and kind = 'page';
  if v_space is null or public.ws_role_rank(public.ws_page_role(v_uid, p_page)) < 1 then return; end if;
  if public.ws_space_role(v_uid, v_space) = 'none' then return; end if;
  insert into public.ws_visits (user_id, page_id, space_id) values (v_uid, p_page, v_space)
  on conflict (user_id, page_id) do update set visited_at = now();
end;
$$;

create or replace function public.ws_set_favorite(p_page uuid, p_on boolean, p_position double precision default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
begin
  select space_id into v_space from public.ws_records where id = p_page and kind = 'page';
  if v_space is null or public.ws_role_rank(public.ws_page_role(v_uid, p_page)) < 1 then return; end if;
  if not p_on then
    delete from public.ws_favorites where user_id = v_uid and page_id = p_page;
    return;
  end if;
  insert into public.ws_favorites (user_id, page_id, space_id, position)
  values (v_uid, p_page, v_space, coalesce(p_position,
    (select coalesce(min(position), 1) - 1 from public.ws_favorites where user_id = v_uid and space_id = v_space)))
  on conflict (user_id, page_id) do update set position = coalesce(p_position, public.ws_favorites.position);
end;
$$;

-- ---------------------------------------------------------------------------------------------- realtime

create or replace function public.ws_can_join(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or p_topic is null or split_part(p_topic, ':', 1) <> 'ws' then return false; end if;
  begin
    v_id := split_part(p_topic, ':', 3)::uuid;
  exception when others then
    return false;
  end;
  case split_part(p_topic, ':', 2)
    when 'user' then return v_id = v_uid;
    when 'space' then return public.ws_space_role(v_uid, v_id) in ('owner', 'member');
    when 'team' then return public.ws_role_rank(public.ws_team_role(v_uid, v_id)) >= 1;
    when 'page' then return public.ws_role_rank(public.ws_page_role(v_uid, v_id)) >= 1;
    else return false;
  end case;
end;
$$;

drop policy if exists "ws_topics_receive" on realtime.messages;
create policy "ws_topics_receive" on realtime.messages
  for select to authenticated
  using (public.ws_can_join((select realtime.topic())));

-- 🔴 CLIENTS MAY SAY WHO IS HERE (presence) AND WHERE THEIR CURSOR IS, NEVER WHAT CHANGED. A 'tx' or 'tree'
-- event is only ever sent by ws_apply, which runs as the definer and does not pass this policy; without the event
-- check any member could broadcast a fake edit that every open copy of the page would draw.
drop policy if exists "ws_topics_send" on realtime.messages;
create policy "ws_topics_send" on realtime.messages
  for insert to authenticated
  with check (
    public.ws_can_join((select realtime.topic()))
    and (extension = 'presence' or (extension = 'broadcast' and event in ('cursor', 'typing')))
  );

-- ---------------------------------------------------------------------------------------------- files

insert into storage.buckets (id, name, public, file_size_limit)
values ('ws-files', 'ws-files', false, 52428800)
on conflict (id) do nothing;

-- Path: <space>/<page>/<anything>. The page's role decides.
create or replace function public.ws_file_rank(p_name text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_space uuid;
  v_page uuid;
begin
  begin
    v_space := split_part(p_name, '/', 1)::uuid;
    v_page := split_part(p_name, '/', 2)::uuid;
  exception when others then
    return 0;
  end;
  if not exists (select 1 from public.ws_records where id = v_page and space_id = v_space and kind = 'page') then return 0; end if;
  return public.ws_role_rank(public.ws_page_role(auth.uid(), v_page));
end;
$$;

drop policy if exists "ws_files_read" on storage.objects;
create policy "ws_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'ws-files' and public.ws_file_rank(name) >= 1);
drop policy if exists "ws_files_write" on storage.objects;
create policy "ws_files_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'ws-files' and public.ws_file_rank(name) >= 3);
drop policy if exists "ws_files_delete" on storage.objects;
create policy "ws_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ws-files' and public.ws_file_rank(name) >= 3);

-- ---------------------------------------------------------------------------------------------- grants

-- Supabase's default privileges hand EXECUTE on every new function to anon. Internal helpers take a user id as
-- an argument, so exposing them would let anyone ask what anyone else can open.
revoke execute on function
  public.ws_records_after_page_delete(), public.ws_role_rank(text), public.ws_role_max(text, text),
  public.ws_space_role(uuid, uuid), public.ws_team_role(uuid, uuid), public.ws_page_role(uuid, uuid),
  public.ws_list_apply(jsonb, jsonb), public.ws_record_json(public.ws_records), public.ws_page_summary(public.ws_records),
  public.ws_person_json(uuid, text), public.ws_place(uuid, text, uuid, uuid), public.ws_section(uuid, uuid, jsonb),
  public.ws_tree_topics(uuid, uuid[]), public.ws_send(jsonb, text, text),
  public.ws_apply(uuid, jsonb, text), public.ws_enabled(), public.ws_bootstrap(uuid), public.ws_load_page(uuid),
  public.ws_load_children(uuid[]), public.ws_page_summaries(uuid[]), public.ws_trash(uuid),
  public.ws_save_settings(jsonb), public.ws_visit(uuid), public.ws_set_favorite(uuid, boolean, double precision),
  public.ws_can_join(text), public.ws_file_rank(text)
from public, anon, authenticated;

grant execute on function
  public.ws_apply(uuid, jsonb, text), public.ws_enabled(), public.ws_bootstrap(uuid), public.ws_load_page(uuid),
  public.ws_load_children(uuid[]), public.ws_page_summaries(uuid[]), public.ws_trash(uuid),
  public.ws_save_settings(jsonb), public.ws_visit(uuid), public.ws_set_favorite(uuid, boolean, double precision),
  -- Called by the realtime and storage policies, which run as the signed-in role. Both only answer about auth.uid().
  public.ws_can_join(text), public.ws_file_rank(text)
to authenticated;

-- The owner sees the new shell first (docs/space/PLAN.md, Rollout).
insert into public.ws_rollout (user_id, note)
values ('fabfec04-288c-48f6-8cb7-620c668e3487', 'owner, first to get the new workspace')
on conflict (user_id) do nothing;
