create table if not exists public.chat_recording_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  surface text not null check (surface in ('sessions', 'notebook')),
  context_id text not null check (char_length(context_id) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  transcript text not null default '',
  notes text not null default '',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_recording_artifacts_owner_context_idx
  on public.chat_recording_artifacts(user_id, surface, context_id, created_at desc);

alter table public.chat_recording_artifacts enable row level security;

drop policy if exists chat_recording_artifacts_select on public.chat_recording_artifacts;
create policy chat_recording_artifacts_select on public.chat_recording_artifacts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists chat_recording_artifacts_insert on public.chat_recording_artifacts;
create policy chat_recording_artifacts_insert on public.chat_recording_artifacts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists chat_recording_artifacts_update on public.chat_recording_artifacts;
create policy chat_recording_artifacts_update on public.chat_recording_artifacts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists chat_recording_artifacts_delete on public.chat_recording_artifacts;
create policy chat_recording_artifacts_delete on public.chat_recording_artifacts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.chat_recording_artifacts from anon, authenticated;
grant select, insert, update, delete on public.chat_recording_artifacts to authenticated;
