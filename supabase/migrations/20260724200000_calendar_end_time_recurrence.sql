-- Calendar: end time + recurrence.
--
-- These two columns are what stand between the calendar and (a) event blocks
-- whose height means something, and (b) a syllabus's repeating class schedule.
-- Both are the same root gap: 20260720210000_cloud_chat_calendar.sql stores one
-- `date` and one free-text `time`, so a "9am lecture" has a start and nothing
-- else. The week/day time grid currently draws every block at a fixed 45
-- minutes because there is no honest alternative, and syllabus import writes a
-- repeating course as ONE anchor event because there is nowhere to put "MWF
-- until December 12".
--
-- NOT YET APPLIED — this is a production database change and needs the owner's
-- go-ahead. Everything shipped alongside it works without it:
--   - components/workspace/calendar/time-grid.ts `durationOf` returns the
--     default; it is the only place that needs to read `end_time`.
--   - lib/workspace/syllabus.ts `meetingToAnchorEvent` writes the pattern into
--     the note; it is the only place that needs to write `recurrence`.
-- Neither column is SELECTed or written by the current code, so applying this
-- early is harmless and skipping it changes nothing.
--
-- Both columns are nullable with no default, so every existing row stays valid
-- and both clients (web + iOS) keep working untouched — they select an explicit
-- column list and simply will not ask for these until they are wired.

alter table public.calendar_events
  -- Same free-text shape as `time`, for symmetry with the existing column and
  -- because the UI normalizes to HH:MM before writing either one.
  add column if not exists end_time text
    check (end_time is null or char_length(end_time) <= 40),

  -- {"days":[1,3,5],"until":"2026-12-12"} — days are 0=Sunday, matching
  -- JavaScript's getDay() and SyllabusMeeting.daysOfWeek, so no client has to
  -- translate. Size-capped like chat_messages.meta; a recurrence rule that
  -- needs more than 2 KB is a parsing failure, not a course schedule.
  add column if not exists recurrence jsonb
    check (recurrence is null or pg_column_size(recurrence) <= 2048);

comment on column public.calendar_events.end_time is
  'Optional HH:MM end time. When null the UI draws a default-length block.';
comment on column public.calendar_events.recurrence is
  'Optional {days:[0-6], until:YYYY-MM-DD}. When null the event happens once.';
