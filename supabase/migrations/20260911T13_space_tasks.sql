-- Space, M4 part three (docs/space/PLAN.md): assigning someone to a row tells them, and My Tasks lists what they own.
--
-- 1. `assign` joins the notification kinds.
-- 2. ws_notify_assign: after a row is written, each person newly listed in one of its Person properties (by the row's
--    database schema, `s:<property>` on the collection record) gets an `assign` notification, through ws_notify, so the
--    person acting, anyone who cannot open the database and an unread duplicate are skipped as for comments and mentions.
-- 3. ws_my_tasks: live rows, in databases the caller can open and no trashed page holds, whose Person properties list
--    the caller, leaving out rows whose Status option sits in the complete group. Soonest due first, undated last.

alter table public.ws_notifications drop constraint ws_notifications_kind_check;

alter table public.ws_notifications add constraint ws_notifications_kind_check check (kind in ('share', 'comment', 'mention', 'assign'));

create or replace function public.ws_notify_assign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := coalesce(new.edited_by, new.created_by);
  v_before jsonb := null;
  v_schema jsonb;
  v_key text;
  v_user uuid;
begin
  if new.kind <> 'row' or not new.alive then return null; end if;
  if tg_op = 'UPDATE' then v_before := old.props; end if;
  select c.props into v_schema from public.ws_records c where c.id = new.parent_id and c.kind = 'collection';
  if v_schema is null then return null; end if;
  for v_key in
    select substr(s.key, 3) from jsonb_each(v_schema) s
    where s.key like 's:%' and jsonb_typeof(s.value) = 'object' and s.value ->> 'type' = 'person'
  loop
    if coalesce(jsonb_typeof(new.props -> v_key), '') <> 'array' then continue; end if;
    for v_user in
      select e.value::uuid from jsonb_array_elements_text(new.props -> v_key) as e(value)
      where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (v_before is null or coalesce(jsonb_typeof(v_before -> v_key), '') <> 'array' or not ((v_before -> v_key) ? e.value))
    loop
      perform public.ws_notify(v_user, 'assign', new.page_id, new.id, v_actor, coalesce(new.props ->> 'title', ''));
    end loop;
  end loop;
  return null;
end;
$fn$;

drop trigger if exists ws_records_notify_assign on public.ws_records;

create trigger ws_records_notify_assign after insert or update of props on public.ws_records for each row when (new.kind = 'row') execute function public.ws_notify_assign();

create or replace function public.ws_my_tasks(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(t.item order by t.due nulls last, t.edited_at desc)
    from (
      select jsonb_build_object(
          'id', r.id, 'page_id', r.page_id, 'space_id', r.space_id,
          'title', coalesce(r.props ->> 'title', ''),
          'database', coalesce(p.props ->> 'title', ''),
          'status', st.value, 'status_color', st.color, 'due', du.value,
          'edited_at', r.edited_at
        ) as item,
        du.value as due,
        r.edited_at
      from public.ws_records r
      join public.ws_records c on c.id = r.parent_id and c.kind = 'collection'
      join public.ws_records p on p.id = r.page_id and p.kind = 'page' and p.alive
      left join lateral (
        select r.props ->> substr(s.key, 3) as value,
          (select o ->> 'color' from jsonb_array_elements(case when jsonb_typeof(s.value -> 'options') = 'array' then s.value -> 'options' else '[]'::jsonb end) as o
           where o ->> 'value' = r.props ->> substr(s.key, 3) limit 1) as color,
          exists (select 1 from jsonb_array_elements(case when jsonb_typeof(s.value -> 'options') = 'array' then s.value -> 'options' else '[]'::jsonb end) as o
           where o ->> 'value' = r.props ->> substr(s.key, 3) and o ->> 'group' = 'complete') as done
        from jsonb_each(c.props) s
        where s.key like 's:%' and jsonb_typeof(s.value) = 'object' and s.value ->> 'type' = 'status'
        limit 1
      ) st on true
      left join lateral (
        select r.props ->> substr(s.key, 3) as value
        from jsonb_each(c.props) s
        where s.key like 's:%' and jsonb_typeof(s.value) = 'object' and s.value ->> 'type' = 'date'
          and coalesce(r.props ->> substr(s.key, 3), '') <> ''
        limit 1
      ) du on true
      where r.kind = 'row' and r.alive
        and exists (
          select 1 from jsonb_each(c.props) s
          where s.key like 's:%' and jsonb_typeof(s.value) = 'object' and s.value ->> 'type' = 'person'
            and jsonb_typeof(r.props -> substr(s.key, 3)) = 'array'
            and (r.props -> substr(s.key, 3)) ? v_uid::text
        )
        and not coalesce(st.done, false)
        and not exists (select 1 from public.ws_records a where a.id = any(p.path) and not a.alive)
        and public.ws_role_rank(public.ws_page_role(v_uid, r.page_id)) >= 1
      order by du.value nulls last, r.edited_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) t
  ), '[]'::jsonb);
end;
$fn$;

revoke execute on function public.ws_notify_assign() from public, anon, authenticated;

revoke execute on function public.ws_my_tasks(integer) from public, anon;

grant execute on function public.ws_my_tasks(integer) to authenticated;
