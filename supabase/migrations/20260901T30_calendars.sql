-- Calendar, stage 3: calendars are things.
--
-- Owner 2026-09-01, continuing the Google parity work: "we would also want
-- google calendar colors too".
--
-- 🔴 THE COLOUR ASK IS WHY THIS TABLE EXISTS. In Google you do not have one
-- calendar; you have several — personal, each class, a shared one, one you
-- subscribed to — and each carries its own colour, its own timezone, and its own
-- tick box in the left rail. Nemesis had a single flat list of events, so there
-- was nothing for a calendar colour to BELONG to. Adding a colour column to
-- events would have answered a different question (this one event) and left the
-- real one — this whole calendar — still unanswerable.
--
-- APPLIED 2026-09-01, on the owner's go-ahead.
--
-- 🔴 `calendar_events.calendar_id` IS NULLABLE AND NOTHING IS BACKFILLED. Null
-- means "the primary calendar", which is what every one of the 172 existing rows
-- is, and it stays true whether or not a row for that calendar is ever created.
-- The alternative — inventing a primary calendar per user and stamping it onto
-- every existing row — is a data migration that could half-fail, to record a
-- fact the reader can work out for itself.

create table if not exists public.calendars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  -- Google's calendar-colour id, "1".."24". See lib/workspace/calendar-colors.ts
  -- for why this palette is separate from the eleven event colours.
  color_id   text check (color_id is null or color_id ~ '^(1[0-9]|2[0-4]|[1-9])$'),
  -- IANA zone new events on this calendar default to. Null = the reader's own.
  time_zone  text,
  -- Google's `selected`, inverted: the tick box in the left rail. Stored as
  -- HIDDEN rather than SHOWN so the default (false) is the visible state, and a
  -- calendar added by any means shows up rather than silently not.
  hidden     boolean not null default false,
  -- Reminders every event on this calendar inherits, in Google's own shape:
  -- [{"method":"popup","minutes":10}]. Nothing fires them yet — see stage 4.
  default_reminders jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendars enable row level security;

create policy calendars_owner on public.calendars
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.calendars from anon, authenticated;
grant select, insert, update, delete on public.calendars to authenticated;

create index if not exists calendars_user_idx on public.calendars (user_id);

-- 🔴 ON DELETE SET NULL, NOT CASCADE. Deleting a calendar must not delete the
-- exams that were on it. The events fall back to the primary calendar, which is
-- what null already means — a student who deletes a colour grouping has said
-- nothing about whether their finals still exist.
alter table public.calendar_events
  add column if not exists calendar_id uuid;

alter table public.calendar_events
  drop constraint if exists calendar_events_calendar_fk;
alter table public.calendar_events
  add constraint calendar_events_calendar_fk
  foreign key (calendar_id) references public.calendars (id) on delete set null;

-- "Everything on this calendar, in date order" — the read every view does once
-- a student has more than one.
create index if not exists calendar_events_calendar_idx
  on public.calendar_events (user_id, calendar_id, date)
  where calendar_id is not null;
