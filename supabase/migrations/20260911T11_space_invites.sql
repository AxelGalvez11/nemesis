-- Space M5, part one: sharing a page with a person (docs/space/PLAN.md).
--
-- Owner, 2026-09-11: classmates work in the same pages "together from day one". Sharing grants a person a role on a
-- page (ws_permissions, principal_type 'user'), which reaches every page inside it through ws_page_role. The person
-- becomes a guest of the page's workspace: a guest reaches only what is granted (ws_page_role gives guests no section
-- access and ws_section lets them create nothing at the top), and the client opens a shared page inside its own
-- workspace. Someone without an account gets a pending invite that turns into the grant the first time they load the
-- workspace with that email confirmed, so a mistyped address gives nobody anything.

-- ---------------------------------------------------------------------------------------------- tables

create table if not exists public.ws_invites (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.ws_records(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null check (role in ('read', 'comment', 'edit', 'full')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  unique (page_id, email)
);
alter table public.ws_invites enable row level security;
revoke all on public.ws_invites from public, anon, authenticated;
create index if not exists ws_invites_open_by_email on public.ws_invites (email) where claimed_at is null;
create index if not exists ws_invites_by_inviter on public.ws_invites (invited_by);
create index if not exists ws_invites_by_claimer on public.ws_invites (claimed_by) where claimed_by is not null;

-- Deleting a page or an account checks these references; without an index each check reads the whole table.
create index if not exists ws_visits_by_page on public.ws_visits (page_id);
create index if not exists ws_favorites_by_page on public.ws_favorites (page_id);
create index if not exists ws_records_by_owner on public.ws_records (owner_id) where owner_id is not null;
create index if not exists ws_records_by_team on public.ws_records (team_id) where team_id is not null;

-- ---------------------------------------------------------------------------------------------- helpers

-- Grants a person a role on a page without lowering one they hold, makes them a guest of its workspace and tells their
-- sidebar. True when the person could not open the page before.
create or replace function public.ws_grant_user(p_page uuid, p_user uuid, p_role text, p_by uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page public.ws_records%rowtype;
  v_had boolean;
begin
  select * into v_page from public.ws_records where id = p_page and kind = 'page';
  if not found then return false; end if;
  v_had := public.ws_role_rank(public.ws_page_role(p_user, p_page)) >= 1;
  insert into public.ws_permissions (page_id, principal_type, principal_id, role, created_by)
  values (p_page, 'user', p_user, p_role, p_by)
  on conflict (page_id, principal_type, (coalesce(principal_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set role = public.ws_role_max(public.ws_permissions.role, excluded.role);
  insert into public.ws_members (space_id, user_id, role) values (v_page.space_id, p_user, 'guest')
  on conflict (space_id, user_id) do nothing;
  perform public.ws_send(
    jsonb_build_object('by', p_by, 'space', v_page.space_id, 'items', jsonb_build_array(public.ws_page_summary(v_page))),
    'tree', 'ws:user:' || p_user);
  return not v_had;
end;
$$;

-- A guest with nothing left to open in a workspace stops being its guest.
create or replace function public.ws_drop_idle_guest(p_space uuid, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.ws_members m
  where m.space_id = p_space and m.user_id = p_user and m.role = 'guest'
    and not exists (
      select 1 from public.ws_permissions g join public.ws_records r on r.id = g.page_id
      where g.principal_type = 'user' and g.principal_id = p_user and r.space_id = p_space);
$$;

-- Turns the pending invites for a person's confirmed email into grants. ws_bootstrap runs it on every load.
create or replace function public.ws_claim_invites(p_uid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_invite record;
  v_count integer := 0;
begin
  select lower(u.email) into v_email from auth.users u
  where u.id = p_uid and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false);
  if v_email is null then return 0; end if;
  for v_invite in
    select i.id, i.page_id, i.role, i.invited_by from public.ws_invites i
    join public.ws_records r on r.id = i.page_id and r.alive
    where i.email = v_email and i.claimed_at is null
    for update of i
  loop
    perform public.ws_grant_user(v_invite.page_id, p_uid, v_invite.role, v_invite.invited_by);
    update public.ws_invites set claimed_by = p_uid, claimed_at = now() where id = v_invite.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------- sharing

-- Shares a page with up to 20 people by email; only someone with full access on it can. The answer does not depend on
-- whether an address has an account, so the box cannot tell anyone who uses Nemesis. `notify` lists the addresses that
-- were not already in, for the route that emails them.
create or replace function public.ws_invite(p_page uuid, p_emails text[], p_role text default 'edit')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.ws_records%rowtype;
  v_raw text;
  v_email text;
  v_user uuid;
  v_seen text[] := '{}';
  v_notify text[] := '{}';
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_role is null or p_role not in ('read', 'comment', 'edit', 'full') then
    raise exception 'choose what they can do: full access, edit, comment or view' using errcode = '22023';
  end if;
  select * into v_page from public.ws_records where id = p_page and kind = 'page' and alive;
  if not found or public.ws_page_role(v_uid, p_page) <> 'full' then
    raise exception 'only someone with full access can share this page' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_emails), 0) = 0 or cardinality(p_emails) > 20 then
    raise exception 'invite between 1 and 20 people at a time' using errcode = '22023';
  end if;

  foreach v_raw in array p_emails loop
    v_email := lower(btrim(coalesce(v_raw, '')));
    continue when v_email = '' or v_email = any(v_seen);
    v_seen := v_seen || v_email;
    if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception '% is not an email address', v_email using errcode = '22023';
    end if;
    if not coalesce((public.consume_rate_limit('ws_invite', v_uid::text, 60, 86400) ->> 'allowed')::boolean, false) then
      raise exception 'that is a lot of invites for one day; try again tomorrow' using errcode = '54000';
    end if;

    select u.id into v_user from auth.users u
    where lower(u.email) = v_email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    limit 1;
    if v_user = v_uid then
      continue;
    elsif v_user is not null then
      if public.ws_grant_user(p_page, v_user, p_role, v_uid) then v_notify := v_notify || v_email; end if;
    else
      insert into public.ws_invites (page_id, email, role, invited_by)
      values (p_page, v_email, p_role, v_uid)
      on conflict (page_id, email) do update
        set role = public.ws_role_max(public.ws_invites.role, excluded.role), invited_by = excluded.invited_by
        where public.ws_invites.claimed_at is null;
      v_notify := v_notify || v_email;
    end if;
  end loop;

  return jsonb_build_object(
    'notify', to_jsonb(v_notify),
    'page', jsonb_build_object('id', v_page.id, 'title', coalesce(nullif(btrim(v_page.props ->> 'title'), ''), 'Untitled')),
    'inviter', public.ws_person_json(v_uid) ->> 'name'
  );
end;
$$;

-- Who can open a page and how, for the Share menu. Email addresses and pending invites go only to someone with full
-- access, who could share with those people anyway.
create or replace function public.ws_page_access(p_page uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.ws_records%rowtype;
  v_root public.ws_records%rowtype;
  v_role text;
  v_hide text;
begin
  select * into v_page from public.ws_records where id = p_page and kind = 'page';
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  v_role := public.ws_page_role(v_uid, p_page);
  if public.ws_role_rank(v_role) < 1 then return jsonb_build_object('error', 'no_access'); end if;
  v_hide := case when v_role = 'full' then '' else 'email' end;
  select * into v_root from public.ws_records where id = v_page.path[1];
  return jsonb_build_object(
    'role', v_role,
    'section', case when v_root.owner_id is not null then 'private' when v_root.team_id is not null then 'team' else 'workspace' end,
    'owner', case when v_root.owner_id is not null then public.ws_person_json(v_root.owner_id, 'full') - v_hide end,
    'people', (
      select coalesce(jsonb_agg((public.ws_person_json(g.principal_id, g.role) - v_hide)
        || jsonb_build_object('inherited', g.page_id <> p_page) order by g.created_at), '[]'::jsonb)
      from public.ws_permissions g
      where g.page_id = any(v_page.path) and g.principal_type = 'user'
    ),
    'pending', case when v_role = 'full' then (
      select coalesce(jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role) order by i.created_at), '[]'::jsonb)
      from public.ws_invites i where i.page_id = p_page and i.claimed_at is null
    ) else '[]'::jsonb end,
    'public', exists (select 1 from public.ws_permissions g where g.page_id = any(v_page.path) and g.principal_type = 'public')
  );
end;
$$;

-- Changes what one person or one pending invite can do on a page, or takes it away when p_role is null. Full access only.
create or replace function public.ws_set_access(p_page uuid, p_user uuid default null, p_email text default null, p_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page public.ws_records%rowtype;
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_role is not null and p_role not in ('read', 'comment', 'edit', 'full') then
    raise exception 'choose what they can do: full access, edit, comment or view' using errcode = '22023';
  end if;
  select * into v_page from public.ws_records where id = p_page and kind = 'page';
  if not found or public.ws_page_role(v_uid, p_page) <> 'full' then
    raise exception 'only someone with full access can change who can open this page' using errcode = '42501';
  end if;
  if (p_user is null) = (p_email is null) then
    raise exception 'name one person or one invite' using errcode = '22023';
  end if;

  if p_user is not null and p_role is null then
    delete from public.ws_permissions where page_id = p_page and principal_type = 'user' and principal_id = p_user;
    perform public.ws_drop_idle_guest(v_page.space_id, p_user);
    perform public.ws_send(
      jsonb_build_object('by', v_uid, 'space', v_page.space_id, 'items', jsonb_build_array(jsonb_build_object('id', p_page, 'kind', 'page', 'revoked', true))),
      'tree', 'ws:user:' || p_user);
  elsif p_user is not null then
    update public.ws_permissions set role = p_role where page_id = p_page and principal_type = 'user' and principal_id = p_user;
  elsif p_role is null then
    delete from public.ws_invites where page_id = p_page and email = lower(btrim(p_email)) and claimed_at is null;
  else
    update public.ws_invites set role = p_role where page_id = p_page and email = lower(btrim(p_email)) and claimed_at is null;
  end if;
  return public.ws_page_access(p_page);
end;
$$;

-- ---------------------------------------------------------------------------------------------- the rollout and the load

-- Replaced whole from 20260911T10_space_core.sql; the only changes are the invite lines.
create or replace function public.ws_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.ws_rollout
            where user_id in (auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid))
    -- Someone a page was shared with works in it too, whether or not their own account is in the rollout yet.
    or exists (select 1 from public.ws_permissions g where g.principal_type = 'user' and g.principal_id = auth.uid())
    or exists (select 1 from public.ws_invites i join auth.users u on u.id = auth.uid()
               where i.claimed_at is null and i.email = lower(u.email) and u.email_confirmed_at is not null)
  );
$$;

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

  -- Invites sent to this person's confirmed email before they had an account, or before they last loaded.
  perform public.ws_claim_invites(v_uid);

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

-- ---------------------------------------------------------------------------------------------- grants

revoke execute on function
  public.ws_grant_user(uuid, uuid, text, uuid), public.ws_drop_idle_guest(uuid, uuid), public.ws_claim_invites(uuid),
  public.ws_invite(uuid, text[], text), public.ws_page_access(uuid), public.ws_set_access(uuid, uuid, text, text),
  public.ws_enabled(), public.ws_bootstrap(uuid)
from public, anon, authenticated;

grant execute on function
  public.ws_invite(uuid, text[], text), public.ws_page_access(uuid), public.ws_set_access(uuid, uuid, text, text),
  public.ws_enabled(), public.ws_bootstrap(uuid)
to authenticated;
