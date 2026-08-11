-- Provenance for calendar events, so "why is this here?" has an answer.
--
-- APPLIED 2026-08-11.
--
-- Every column is nullable and nothing is backfilled: the 175 rows already in this table
-- predate all of it and must keep decoding exactly as before. That is what additive means for
-- data that already exists. Verified after applying: 175 rows, 0 with origin, 0 with extra.
--
-- `origin` is NOT the same axis as the existing `source`. `source` says who may edit the row
-- ('agent' is read-only in the UI) — a permissions fact. `origin` says what KIND of thing it is:
-- an exam has a date because the world says so, a review block exists because Nemesis suggested
-- it, and rendering those as peers is what makes a calendar untrustworthy.

alter table public.calendar_events
  add column if not exists origin text
    check (origin is null or origin in ('user', 'source_extraction', 'nemesis_plan')),
  -- No FK: a canvas may be deleted while its extracted exam date stays true. The date came from
  -- the world, not from the session that happened to notice it.
  add column if not exists canvas_id uuid,
  -- Which excerpts of which sources said so. A date the learner cannot trace is a date they
  -- have to take on faith, and dates are too consequential for faith.
  add column if not exists source_refs jsonb,
  add column if not exists confidence real
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- What the material literally said ("next Thursday"), and what that was measured against.
  -- Never discarded: without them a resolved date cannot be re-checked or explained.
  add column if not exists original_expression text,
  add column if not exists resolved_against timestamptz,
  -- Fields a newer client understands and this one does not. Carried through read/write so an
  -- older tab re-saving a row cannot silently destroy something a newer deploy added.
  add column if not exists extra jsonb;

-- "What is coming up for this canvas" — the Calendar→Canvas link.
create index if not exists calendar_events_canvas_idx
  on public.calendar_events(user_id, canvas_id, date)
  where canvas_id is not null;
