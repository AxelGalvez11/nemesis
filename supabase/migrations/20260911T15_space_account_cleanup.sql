-- Space, M10 part two (docs/space/PLAN.md): deleting an account removes the workspace data that was only theirs.
--
-- ws_account_cleanup(user) runs from /api/account/delete with the service role, before the login is deleted. A
-- workspace that no one else owns or is a member of goes, and its pages, databases, teamspaces, access, invites and
-- notifications cascade with it. In a workspace others still use, the person's private pages go when the login does
-- (ws_records.owner_id cascades). Files are not rows, so it returns the storage folders to empty: each deleted
-- workspace's, and each of the person's private pages' in the workspaces that stay.

create or replace function public.ws_account_cleanup(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_spaces uuid[];
  v_folders text[];
begin
  if p_user is null then raise exception 'which account?' using errcode = '22023'; end if;

  select coalesce(array_agg(s.id), '{}') into v_spaces
  from public.ws_spaces s
  where (s.created_by = p_user or exists (select 1 from public.ws_members m where m.space_id = s.id and m.user_id = p_user))
    and not exists (select 1 from public.ws_members m where m.space_id = s.id and m.user_id <> p_user and m.role in ('owner', 'member'));

  select coalesce(array_agg(x.folder order by x.folder), '{}') into v_folders from (
    select s::text || '/' as folder from unnest(v_spaces) as s
    union
    select p.space_id::text || '/' || p.id::text || '/'
    from public.ws_records root
    join public.ws_records p on p.space_id = root.space_id and p.kind = 'page' and p.path[1] = root.id
    where root.kind = 'page' and root.parent_id is null and root.owner_id = p_user and not (root.space_id = any(v_spaces))
  ) x;

  delete from public.ws_spaces where id = any(v_spaces);

  return jsonb_build_object('spaces', to_jsonb(v_spaces), 'folders', to_jsonb(v_folders));
end;
$fn$;

revoke execute on function public.ws_account_cleanup(uuid) from public, anon, authenticated;

grant execute on function public.ws_account_cleanup(uuid) to service_role;
