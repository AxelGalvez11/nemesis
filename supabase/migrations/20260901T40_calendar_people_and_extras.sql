-- Calendar, stage 4: people and attachments — the last of the Google parity work.
--
-- Owner 2026-09-01: "keep going with stage 3 and 4".
--
-- 🔴 THIS IS THE ONLY STAGE THAT CAN REACH OUTSIDE THE APP, and the schema is
-- where that gets said once. Adding a guest to a Google event SENDS THAT PERSON
-- AN EMAIL. Nemesis stores the list and sends nothing: `attendees` is a record
-- of who is invited, never an instruction to invite them. When an event is
-- eventually pushed to Google, that push is the act that mails people, and it is
-- a thing the student asks for out loud rather than a side effect of typing a
-- name into a box.
--
--   attendees          [{"email","displayName","optional","responseStatus","comment"}]
--                      responseStatus is READ-ONLY here: only Google can know
--                      whether somebody accepted, so Nemesis shows what came back
--                      and never invents it.
--   reminders          {"useDefault":bool,"overrides":[{"method","minutes"}]}
--                      🔴 DECORATIVE UNTIL NEMESIS CAN NOTIFY. There is no
--                      notification system, so a reminder stored here fires only
--                      if the event also lives in Google. The UI says so rather
--                      than letting it read as a promise.
--   guests_can_*       Google's three guest permissions.
--   conference         The Meet link and its entry points. Nemesis can HOLD and
--                      show one; only Google can mint one.
--   attachments        [{"fileUrl","title","mimeType","iconLink"}]. Same: held
--                      and shown, created by Drive.
--   event_type         default / outOfOffice / focusTime / workingLocation.
--   source_title/url   Google's own "where this came from" pair. Distinct from
--                      this table's `origin`/`source_refs`, which say which
--                      lecture and page a DATE was read off — a Nemesis idea
--                      Google has no field for. Two different questions, two
--                      sets of columns, neither able to answer the other.
--
-- APPLIED 2026-09-01, on the owner's go-ahead.
--
-- Every column is nullable with no default and nothing is backfilled.

alter table public.calendar_events
  add column if not exists attendees jsonb,
  add column if not exists reminders jsonb,
  add column if not exists guests_can_modify boolean,
  add column if not exists guests_can_invite_others boolean,
  add column if not exists guests_can_see_other_guests boolean,
  add column if not exists conference jsonb,
  add column if not exists attachments jsonb,
  add column if not exists event_type text,
  add column if not exists source_title text,
  add column if not exists source_url text;

alter table public.calendar_events
  drop constraint if exists calendar_events_event_type_known;
alter table public.calendar_events
  add constraint calendar_events_event_type_known
  check (event_type is null
         or event_type in ('default', 'outOfOffice', 'focusTime', 'workingLocation'));

-- 🔴 A CEILING ON THE LISTS, because these are the only columns on this table a
-- student can grow without limit. A jsonb column with no bound is a row that can
-- be made big enough to slow every read of the calendar, and no real event has
-- two hundred guests or fifty attachments.
alter table public.calendar_events
  drop constraint if exists calendar_events_attendees_bounded;
alter table public.calendar_events
  add constraint calendar_events_attendees_bounded
  check (attendees is null
         or (jsonb_typeof(attendees) = 'array' and jsonb_array_length(attendees) <= 200));

alter table public.calendar_events
  drop constraint if exists calendar_events_attachments_bounded;
alter table public.calendar_events
  add constraint calendar_events_attachments_bounded
  check (attachments is null
         or (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 25));
