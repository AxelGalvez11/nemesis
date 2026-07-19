-- Notebook chats — cloud-synced conversations inside a notebook (the Claude-Projects "Recents").
-- ADDITIVE + NON-DESTRUCTIVE. RLS per-user (auth.uid() = user_id). A notebook has many chats;
-- each chat is a titled thread of append-only messages. Chats + messages sync to the account so
-- they follow the student across devices (cloud-first). Cascades: delete a notebook -> its chats ->
-- their messages. Reuses the shared core_sources_set_updated_at() trigger for updated_at bumps.

create table if not exists public.notebook_chats (
  id           uuid primary key default gen_random_uuid(),
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default 'New chat',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.notebook_chats enable row level security;
drop policy if exists notebook_chats_owner on public.notebook_chats;
create policy notebook_chats_owner on public.notebook_chats
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.notebook_chats from anon;
create index if not exists notebook_chats_notebook_idx on public.notebook_chats (notebook_id, updated_at desc);

drop trigger if exists notebook_chats_updated_at_trigger on public.notebook_chats;
create trigger notebook_chats_updated_at_trigger
  before update on public.notebook_chats
  for each row execute function core_sources_set_updated_at();

create table if not exists public.notebook_chat_messages (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.notebook_chats (id) on delete cascade,
  -- notebook_id denormalized so a message row carries its notebook without a join (RLS + cheap reads).
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role         text not null check (role in ('user', 'assistant', 'system')),
  content      text not null,
  created_at   timestamptz not null default now()
);
alter table public.notebook_chat_messages enable row level security;
drop policy if exists notebook_chat_messages_owner on public.notebook_chat_messages;
create policy notebook_chat_messages_owner on public.notebook_chat_messages
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.notebook_chat_messages from anon;
create index if not exists notebook_chat_messages_chat_idx on public.notebook_chat_messages (chat_id, created_at);
