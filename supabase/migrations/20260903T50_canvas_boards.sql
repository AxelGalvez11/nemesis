-- The spatial Canvas: one row per board, the whole board as ONE jsonb document, its undo history
-- beside it, and a version number so two tabs cannot silently overwrite each other.
--
-- Modelled on Wondering's `canvases` (docs/wondering-canvas-reference.md §1): document + history
-- + expectedVersion. `learning_canvases` is the CHAT and is untouched; a board is a different
-- thing with a different shape and its own table, not a `kind` column on the chat's.

create table if not exists public.canvas_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled canvas' check (char_length(title) <= 120),
  document jsonb not null default '{"version":1,"cards":[],"sources":[],"selectedSourceIds":[],"useWebSearch":false}'::jsonb,
  history jsonb not null default '{"past":[],"future":[]}'::jsonb,
  -- Optimistic concurrency: every write carries the version it read and bumps it by one. A write
  -- whose expected version no longer matches updates zero rows, and the client re-reads.
  version integer not null default 1,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canvas_boards_owner_idx
  on public.canvas_boards(user_id, updated_at desc)
  where deleted = false;

create or replace function public.canvas_boards_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists canvas_boards_touch on public.canvas_boards;
create trigger canvas_boards_touch before update on public.canvas_boards
for each row execute function public.canvas_boards_touch_updated_at();

alter table public.canvas_boards enable row level security;

drop policy if exists "canvas_boards_select_own" on public.canvas_boards;
create policy "canvas_boards_select_own" on public.canvas_boards
  for select using (auth.uid() = user_id);

drop policy if exists "canvas_boards_insert_own" on public.canvas_boards;
create policy "canvas_boards_insert_own" on public.canvas_boards
  for insert with check (auth.uid() = user_id);

drop policy if exists "canvas_boards_update_own" on public.canvas_boards;
create policy "canvas_boards_update_own" on public.canvas_boards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "canvas_boards_delete_own" on public.canvas_boards;
create policy "canvas_boards_delete_own" on public.canvas_boards
  for delete using (auth.uid() = user_id);
