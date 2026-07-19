-- Cloud-owned collections for grouped practice tests and mind maps.

create table public.study_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('test', 'mindmap')),
  group_name text not null default '' check (char_length(group_name) <= 120),
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index study_artifacts_owner_kind_group_idx
  on public.study_artifacts(user_id, kind, group_name, updated_at desc);

create trigger study_artifacts_touch before update on public.study_artifacts
for each row execute function public.study_touch_updated_at();

alter table public.study_artifacts enable row level security;

create policy study_artifacts_select on public.study_artifacts for select to authenticated
using ((select auth.uid()) = user_id);

create policy study_artifacts_insert on public.study_artifacts for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy study_artifacts_update on public.study_artifacts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy study_artifacts_delete on public.study_artifacts for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.study_artifacts from anon, authenticated;
grant select, insert, update, delete on public.study_artifacts to authenticated;
