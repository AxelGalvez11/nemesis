-- `updated_at` has never once recorded an edit.
--
-- 🔴 THE COLUMN EXISTED, DEFAULTED TO now(), AND HAD NO TRIGGER. Measured on production 2026-09-02:
-- all 172 rows have updated_at exactly equal to created_at, including events that have plainly been
-- edited since. So the column has spent its whole life being a second, worse copy of created_at
-- while looking, to anything reading it, like a change log.
--
-- 🔴 IT BECOMES LOAD-BEARING THE MOMENT EVENTS SYNC. Resolving "Google says the exam moved, Nemesis
-- says it did not" needs to know which side changed since the two last agreed, and half of that
-- answer is this column. A timestamp that silently means something else would make Nemesis
-- confidently pick the wrong winner and overwrite the right date.

create or replace function public.touch_calendar_event_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The client cannot forge this: whatever it sent is replaced by the server's clock. Two machines
  -- with different ideas of the time is exactly how a sync picks the wrong winner.
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calendar_events_touch_updated_at on public.calendar_events;
create trigger calendar_events_touch_updated_at
  before update on public.calendar_events
  for each row
  execute function public.touch_calendar_event_updated_at();
