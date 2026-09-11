-- Space M6, part one: the inbox (docs/space/PLAN.md).
--
-- Someone shares a page with you, comments in a conversation you are part of, or mentions you in a page: each leaves one
-- row in ws_notifications for the person it is for, and a broadcast on that person's own channel so an open Inbox shows
-- it at once. Nothing is written for the person who acted, for anyone who cannot open the page, or twice while an
-- identical one is still unread.

-- ---------------------------------------------------------------------------------------------- table

create table if not exists public.ws_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('share', 'comment', 'mention')),
  page_id uuid not null references public.ws_records(id) on delete cascade,
  record_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  preview text not null default '',
  -- clock_timestamp, not now(): one write can notify twice, and the inbox still needs them in the order they happened.
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz
);
alter table public.ws_notifications enable row level security;
revoke all on public.ws_notifications from public, anon, authenticated;
create index if not exists ws_notifications_inbox on public.ws_notifications (user_id, created_at desc);
create index if not exists ws_notifications_unread on public.ws_notifications (user_id) where read_at is null;
create index if not exists ws_notifications_by_page on public.ws_notifications (page_id);
create index if not exists ws_notifications_by_actor on public.ws_notifications (actor_id) where actor_id is not null;

-- ---------------------------------------------------------------------------------------------- helpers

-- The people mentioned in a piece of rich text: segments are [text] or [text, marks], a mention is ['‣', [['u', id]]].
create or replace function public.ws_mentioned_users(p_rich jsonb)
returns table (id uuid)
language sql
immutable
set search_path = ''
as $$
  select distinct (mark ->> 1)::uuid
  from jsonb_array_elements(case when jsonb_typeof(p_rich) = 'array' then p_rich else '[]'::jsonb end) seg
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(seg) = 'array' and jsonb_typeof(seg -> 1) = 'array' then seg -> 1 else '[]'::jsonb end) mark
  where jsonb_typeof(mark) = 'array' and mark ->> 0 = 'u'
    and (mark ->> 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Rich text as plain text for a notification's preview; a mention reads as @.
create or replace function public.ws_rich_plain(p_rich jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(case when seg ->> 0 = '‣' then '@' else seg ->> 0 end, '' order by ord), '')
  from jsonb_array_elements(case when jsonb_typeof(p_rich) = 'array' then p_rich else '[]'::jsonb end)
    with ordinality as t(seg, ord)
  where jsonb_typeof(seg) = 'array';
$$;

-- A notification as the Inbox draws it. The actor comes without an email address.
create or replace function public.ws_notification_json(n public.ws_notifications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'page_id', n.page_id, 'record_id', n.record_id, 'preview', n.preview,
    'created_at', n.created_at, 'read', n.read_at is not null,
    'actor', case when n.actor_id is not null then public.ws_person_json(n.actor_id) - 'email' end,
    'page', (select public.ws_page_summary(r) from public.ws_records r where r.id = n.page_id)
  );
$$;

-- One notification for one person, unless they acted themselves, cannot open the page, or already have the same one
-- unread.
create or replace function public.ws_notify(p_user uuid, p_kind text, p_page uuid, p_record uuid, p_actor uuid, p_preview text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ws_notifications%rowtype;
begin
  if p_user is null or p_page is null or p_user = p_actor then return; end if;
  if public.ws_role_rank(public.ws_page_role(p_user, p_page)) < 1 then return; end if;
  if exists (select 1 from public.ws_notifications n
             where n.user_id = p_user and n.kind = p_kind and n.read_at is null
               and n.page_id = p_page and n.record_id is not distinct from p_record) then
    return;
  end if;
  insert into public.ws_notifications (user_id, kind, page_id, record_id, actor_id, preview)
  values (p_user, p_kind, p_page, p_record, p_actor, left(coalesce(p_preview, ''), 200))
  returning * into v_row;
  perform public.ws_send(jsonb_build_object('notification', public.ws_notification_json(v_row)), 'notify', 'ws:user:' || p_user);
end;
$$;

-- ---------------------------------------------------------------------------------------------- what notifies

-- Replaced whole from 20260911T11_space_invites.sql; the only change is the share notification.
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
  if not v_had and p_by is not null then
    perform public.ws_notify(p_user, 'share', p_page, null, p_by, coalesce(nullif(btrim(v_page.props ->> 'title'), ''), 'Untitled'));
  end if;
  return not v_had;
end;
$$;

-- A new comment tells the people already in that conversation (earlier commenters on the same page, block or row) and
-- whoever the page belongs to: the owner of a private page, otherwise the person who made it.
create or replace function public.ws_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_user uuid;
begin
  if new.kind <> 'comment' or new.created_by is null then return null; end if;
  select coalesce((select r.owner_id from public.ws_records r where r.id = new.path[1]),
                  (select p.created_by from public.ws_records p where p.id = new.page_id))
  into v_owner;
  for v_user in
    select distinct x.u from (
      select c.created_by as u from public.ws_records c
      where c.kind = 'comment' and c.parent_id = new.parent_id and c.id <> new.id and c.alive
      union all
      select v_owner
    ) x
    where x.u is not null and x.u <> new.created_by
  loop
    perform public.ws_notify(v_user, 'comment', new.page_id, new.id, new.created_by, new.props ->> 'text');
  end loop;
  return null;
end;
$$;

create or replace trigger ws_records_notify_comment
  after insert on public.ws_records
  for each row when (new.kind = 'comment')
  execute function public.ws_notify_comment();

-- Someone newly mentioned in a block hears about it. Only mentions that were not there before count, so editing a line
-- that already mentions someone stays quiet.
create or replace function public.ws_notify_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb := null;
  v_actor uuid := coalesce(new.edited_by, new.created_by);
  v_user uuid;
begin
  if new.kind <> 'block' then return null; end if;
  if tg_op = 'UPDATE' then v_before := old.props -> 'title'; end if;
  for v_user in
    select m.id from public.ws_mentioned_users(new.props -> 'title') m
    where not exists (select 1 from public.ws_mentioned_users(v_before) o where o.id = m.id)
  loop
    perform public.ws_notify(v_user, 'mention', new.page_id, new.id, v_actor, public.ws_rich_plain(new.props -> 'title'));
  end loop;
  return null;
end;
$$;

create or replace trigger ws_records_notify_mention
  after insert or update of props on public.ws_records
  for each row when (new.kind = 'block' and (new.props -> 'title')::text like '%["u", %')
  execute function public.ws_notify_mention();

-- ---------------------------------------------------------------------------------------------- the inbox

-- A person's inbox, newest first, only for pages they can still open, with how many are unread.
create or replace function public.ws_inbox(p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(public.ws_notification_json(t) order by t.created_at desc), '[]'::jsonb)
      from public.ws_notifications t
      where t.id in (
        select n.id from public.ws_notifications n
        where n.user_id = v_uid and (p_before is null or n.created_at < p_before)
          and public.ws_role_rank(public.ws_page_role(v_uid, n.page_id)) >= 1
        order by n.created_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 100)
      )
    ),
    'unread', (
      select count(*) from public.ws_notifications n
      where n.user_id = v_uid and n.read_at is null
        and public.ws_role_rank(public.ws_page_role(v_uid, n.page_id)) >= 1
    )
  );
end;
$$;

-- Marks notifications read: the ones named, or every unread one when none are named. Returns how many stay unread.
create or replace function public.ws_mark_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  update public.ws_notifications set read_at = now()
  where user_id = v_uid and read_at is null and (p_ids is null or id = any(p_ids));
  return (select count(*)::integer from public.ws_notifications where user_id = v_uid and read_at is null);
end;
$$;

-- ---------------------------------------------------------------------------------------------- grants

revoke execute on function
  public.ws_mentioned_users(jsonb), public.ws_rich_plain(jsonb), public.ws_notification_json(public.ws_notifications),
  public.ws_notify(uuid, text, uuid, uuid, uuid, text), public.ws_grant_user(uuid, uuid, text, uuid),
  public.ws_notify_comment(), public.ws_notify_mention(), public.ws_inbox(integer, timestamptz), public.ws_mark_read(uuid[])
from public, anon, authenticated;

grant execute on function public.ws_inbox(integer, timestamptz), public.ws_mark_read(uuid[]) to authenticated;
