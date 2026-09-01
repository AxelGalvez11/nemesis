-- Calendar, stage 2: the fields people actually fill in.
--
-- Owner 2026-09-01, continuing the Google parity work. Stage 1 fixed the shape
-- of TIME; this is the smaller, more visible half — the things a person types or
-- picks on an event and Nemesis had nowhere to put.
--
--   location      "Room 3.14". There was no field, so it went in the notes or
--                 nowhere, and nothing could ever read it back.
--   color_id      Google's own event-colour id, "1".."11". An OVERRIDE of the
--                 kind colour, exactly as Google's event colour overrides its
--                 calendar's. The ids are Google's so a synced event looks the
--                 same in both apps — see lib/workspace/event-colors.ts.
--   status        confirmed / tentative / cancelled. Earns its place beyond
--                 parity: a date read off a syllabus that hedged ("we'll
--                 probably test this in week 8") is exactly "tentative", and
--                 until now the choice was to write it down as fact or bin it.
--   transparency  Google's word for "does this block out the time, or just sit
--                 there" — opaque means busy, transparent means free.
--   visibility    default / public / private / confidential.
--
-- APPLIED 2026-09-01, on the owner's go-ahead, immediately after
-- 20260901T10_calendar_google_parity_time.sql.
--
-- Every column is nullable with no default and nothing is backfilled, so every
-- existing row stays valid and both clients keep working untouched — they select
-- an explicit column list. Absent has a defined meaning everywhere: no location,
-- the kind's own colour, confirmed, busy, and the calendar's default visibility.

alter table public.calendar_events
  add column if not exists location text,
  -- text, not an integer: Google's API sends these as strings and round-tripping
  -- them unchanged is the entire reason they are Google's ids and not ours.
  add column if not exists color_id text,
  add column if not exists status text,
  add column if not exists transparency text,
  add column if not exists visibility text;

-- 🔴 CONSTRAINED TO THE VALUES THAT MEAN SOMETHING, and null-tolerant so no
-- existing row is invalidated. A free-text status is a status nothing can branch
-- on: the month grid dims a cancelled event and the conflict checker ignores it,
-- and both need the word to be one of three rather than whatever was typed.
alter table public.calendar_events
  drop constraint if exists calendar_events_status_known;
alter table public.calendar_events
  add constraint calendar_events_status_known
  check (status is null or status in ('confirmed', 'tentative', 'cancelled'));

alter table public.calendar_events
  drop constraint if exists calendar_events_transparency_known;
alter table public.calendar_events
  add constraint calendar_events_transparency_known
  check (transparency is null or transparency in ('opaque', 'transparent'));

alter table public.calendar_events
  drop constraint if exists calendar_events_visibility_known;
alter table public.calendar_events
  add constraint calendar_events_visibility_known
  check (visibility is null or visibility in ('default', 'public', 'private', 'confidential'));

-- Google's palette is 1..11. Anything else would paint nothing and silently lose
-- the kind colour it was meant to override.
alter table public.calendar_events
  drop constraint if exists calendar_events_color_known;
alter table public.calendar_events
  add constraint calendar_events_color_known
  check (color_id is null or color_id ~ '^(10|11|[1-9])$');
