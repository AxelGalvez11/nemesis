-- 20260717T02_calendar_feeds.sql
-- Native-calendar feed (Phase 2, owner decision D3): the Mac renders the student's
-- schedule to ICS text and uploads it here so the iPhone's built-in Calendar app
-- can subscribe via a tokenized URL. This is the ONE scoped plaintext exception in
-- the otherwise end-to-end-encrypted sync: dates + event titles are readable
-- server-side (owner-accepted trade for native calendar integration); note
-- contents NEVER appear here — the Mac renderer only emits titles, times, and
-- locations. The in-app Calendar screen does NOT use this table (it reads the
-- encrypted kind=calendar library document).
-- Parent spec: docs/design/nemesis-phone-readonly-sync-2026-07.md.

create table public.calendar_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Capability token in the feed URL; 64 hex chars (256 bits), regenerable.
  token text not null unique check (char_length(token) = 64),
  ics text not null check (char_length(ics) <= 1000000),
  updated_at timestamptz not null default now()
);

create or replace function public.calendar_feeds_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger calendar_feeds_touch
  before insert or update on public.calendar_feeds
  for each row execute function public.calendar_feeds_touch();

alter table public.calendar_feeds enable row level security;

-- Only the owner (the Mac's authed session) reads or writes their feed row.
-- The public ICS endpoint uses the service role and looks up by token.
create policy calendar_feeds_own on public.calendar_feeds
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.calendar_feeds from anon;
