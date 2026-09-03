-- Give a calendar row a way to say "I AM that event in Google".
--
-- Owner 2026-09-02: "be able to use Google Calendar and also be able to map events to Nemesis
-- Calendar and the Google Calendar. And be able to resolve discrepancies with scheduling."
--
-- 🔴🔴 THE CONNECTION ALREADY WORKED; THIS IS WHAT WAS MISSING. Google Calendar has been an offered
-- app since #929 and the owner's account has had ACTIVE connections since 2026-09-01 — a live
-- GOOGLECALENDAR_EVENTS_LIST returns their real events today. What did not exist was any way for a
-- row to name the Google event it came from. Without it there is no sync, only import: every pull
-- re-adds every event, an edit made in Google can never find the row it belongs to, and "the same
-- event disagrees in the two places" is a question with nowhere to ask it.
--
-- The table was ALREADY shaped like Google's — attendees, reminders, conference, rrule,
-- transparency, visibility, colour, event_type — and could not name a single one of those events.
--
-- Deliberately provider-agnostic: Outlook is offered alongside Google and carries a calendar too,
-- so the column says WHICH provider rather than hardcoding one.

alter table public.calendar_events
  add column if not exists external_provider  text,
  add column if not exists external_id        text,
  add column if not exists external_calendar  text,
  add column if not exists external_etag      text,
  add column if not exists external_updated   timestamptz,
  add column if not exists external_synced_at timestamptz;

comment on column public.calendar_events.external_provider is
  'Which outside calendar this row mirrors: google or outlook. Null = it lives only in Nemesis.';
comment on column public.calendar_events.external_id is
  'The provider''s own event id. Paired with external_provider; one without the other is meaningless.';
comment on column public.calendar_events.external_calendar is
  'The provider''s calendar id the event sits on ("primary", or a calendar address). NOT calendar_id, which is a Nemesis calendars.id.';
comment on column public.calendar_events.external_etag is
  'The provider''s version marker, so a pull can tell an unchanged event from an edited one.';
comment on column public.calendar_events.external_updated is
  'When the provider last changed it. Decides who wins when both sides moved.';
comment on column public.calendar_events.external_synced_at is
  'When Nemesis last reconciled this row against the provider.';

-- An id with no provider cannot be looked up, and a provider with no id names nothing.
alter table public.calendar_events
  drop constraint if exists calendar_events_external_pair;
alter table public.calendar_events
  add constraint calendar_events_external_pair
  check ((external_id is null) = (external_provider is null));

alter table public.calendar_events
  drop constraint if exists calendar_events_external_provider_known;
alter table public.calendar_events
  add constraint calendar_events_external_provider_known
  check (external_provider is null or external_provider in ('google', 'outlook'));

-- 🔴 THE COALESCE IS LOAD-BEARING, NOT TIDINESS. Google's default calendar is addressed as
-- "primary" but comes back on some paths with no calendar named at all, and in Postgres two NULLs
-- are not equal -- so a bare unique index over the raw column would happily accept the same Google
-- event twice, which is precisely the duplicate this index exists to prevent.
create unique index if not exists calendar_events_external_identity
  on public.calendar_events (user_id, external_provider, coalesce(external_calendar, 'primary'), external_id)
  where external_id is not null;

-- "Because it is on your Google Calendar" is a genuinely new answer to why an event exists, and
-- the existing three could not express it.
--
-- 🔴 WIDENING THIS ALONE IS NOT ENOUGH. `calendar-codec.ts` keeps its own closed ORIGINS set and
-- DROPS any origin missing from it, so the value would be written here and silently lost on the
-- very next read. Both were changed together; go and look there before adding a fifth.
alter table public.calendar_events
  drop constraint if exists calendar_events_origin_check;
alter table public.calendar_events
  add constraint calendar_events_origin_check
  check (origin is null or origin in ('user', 'source_extraction', 'nemesis_plan', 'google_calendar'));
