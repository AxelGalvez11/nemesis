-- Calendar, stage 1: the shape of time.
--
-- Owner 2026-09-01: "i want all the gaps with google calendar to be closed...
-- anything google calendar allows to change via oauth should also be changable
-- in nemesis". This is the first of four stages, and the one everything else
-- sits on: until an event can say WHEN it happens the way Google says it,
-- nothing arriving from Google can be stored without losing part of itself.
--
-- Five gaps close here, and each one is a thing that was silently wrong rather
-- than merely missing:
--
--   end_date     A three-day conference had to be entered as three events. There
--                was one `date` and nowhere to put the other end.
--   all_day      Whether something has a clock time was GUESSED from `time` being
--                empty. "Essay due Friday" and "a lecture whose time we failed to
--                read" looked identical, so a half-read import landed in the
--                all-day strip looking deliberate.
--   time_zone    Every clock time was stored bare and local. A student flying home
--                saw their 9am seminar at 9am wherever they were, which is an hour
--                to eight hours from when it runs.
--   rrule        The repeat rule could say exactly one thing: "these weekdays,
--                weekly, until this date". A fortnightly seminar, a first-Monday
--                lab and "twelve sessions" were all unsayable — and a rule ARRIVING
--                from Google had to be flattened into weekly, which puts a student
--                in a lab that is not running.
--   override_of  The only thing that could be done to one meeting of a series was
--                cancel it, so a lecture moved to Friday had to be deleted and
--                re-created as an unrelated event.
--
-- APPLIED 2026-09-01, on the owner's go-ahead. Verified after applying: all six
-- columns present, both constraints and the index in place, 0 rows carrying any
-- of them (nothing is backfilled — that is what additive means for data that
-- already exists).
--
-- 🔴 IT SHIPPED BEFORE IT WAS APPLIED, AND THAT ORDER IS THE POINT. Everything
-- alongside it works without it:
--   - the decoder reads each column only if present, and every reader has a
--     defined meaning for absent (one day, local zone, the old weekly shape);
--   - `recurrence` is still written whenever the rule is simple enough to fit it,
--     so a client running today's deploy keeps seeing weekly classes;
--   - lib/workspace/rrule.ts is pure and tested with no database at all.
-- Applying it early is harmless and skipping it changes nothing on screen.
--
-- Every column is nullable with no default and nothing is backfilled, so every
-- existing row stays valid and both clients keep working untouched — they select
-- an explicit column list.

alter table public.calendar_events
  -- Inclusive last day, for an event that runs over several. Null = one day.
  add column if not exists end_date date,
  -- Null = fall back to "has no time", which is what every existing row meant.
  add column if not exists all_day boolean,
  -- IANA zone name ("Europe/London"). Null = the reader's own zone, which is
  -- also what every existing row has always meant.
  add column if not exists time_zone text,
  -- RFC 5545 lines, exactly as Google's `recurrence` array carries them:
  -- ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", "EXDATE:20260317"].
  -- jsonb rather than text[] so the shape matches what the API hands over and
  -- nothing has to re-encode it on the way through.
  add column if not exists rrule jsonb,
  -- Which series this row stands in for, and on which of its dates. uuid, to
  -- match `id`. No FK: the parent may be deleted while the moved lecture stays
  -- true, and expansion treats an orphan override as an ordinary one-off event.
  add column if not exists override_of uuid,
  add column if not exists original_date date;

-- Both or neither. An override naming no date would suppress nothing, and the
-- moved lecture would be drawn twice — once from the rule, once on its own.
alter table public.calendar_events
  drop constraint if exists calendar_events_override_pair;
alter table public.calendar_events
  add constraint calendar_events_override_pair
  check ((override_of is null) = (original_date is null));

-- An end before the start is not a span. Cheap to enforce here, and it means no
-- reader has to defend against a negative length.
alter table public.calendar_events
  drop constraint if exists calendar_events_end_after_start;
alter table public.calendar_events
  add constraint calendar_events_end_after_start
  check (end_date is null or end_date >= date);

-- Expansion looks up every override for a series at once.
create index if not exists calendar_events_override_idx
  on public.calendar_events(user_id, override_of)
  where override_of is not null;
