-- Cloud-first phone: shared chat threads + calendar events (web + iOS).
-- Pattern follows readable_library_documents: owner-only RLS, anon fully revoked,
-- explicit grants to authenticated only.

-- ============================== chat_threads ==============================

create table if not exists public.chat_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default 'New chat' check (char_length(title) <= 200),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_threads enable row level security;

create policy chat_threads_owner on public.chat_threads
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.chat_threads from anon, authenticated;
grant select, insert, update, delete on public.chat_threads to authenticated;

create index if not exists chat_threads_user_idx
  on public.chat_threads (user_id, updated_at desc);

-- ============================== chat_messages =============================
-- Messages are immutable once written: no update grant on purpose.

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'system')),
  content    text not null check (char_length(content) <= 60000),
  meta       jsonb check (meta is null or pg_column_size(meta) <= 65536),
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy chat_messages_owner on public.chat_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.chat_messages from anon, authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

-- ============================= calendar_events ============================
-- Mirrors the web CalendarEvent model: `date` is a plain local calendar date
-- (no timezone), `time` a free-form display string, agent events read-only in UI.

create table if not exists public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 300),
  date       date not null,
  time       text check (time is null or char_length(time) <= 40),
  kind       text not null default 'other'
             check (kind in ('assignment', 'exam', 'rotation', 'class', 'other')),
  course     text check (course is null or char_length(course) <= 200),
  note       text check (note is null or char_length(note) <= 4000),
  source     text not null default 'manual' check (source in ('agent', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

create policy calendar_events_owner on public.calendar_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.calendar_events from anon, authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;

create index if not exists calendar_events_user_date_idx
  on public.calendar_events (user_id, date);
