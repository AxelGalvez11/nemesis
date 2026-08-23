-- ROLLBACK for 20260806160000_study_scheduler_ordering.sql
--
-- This is the EXACT definition of grade_study_card as it stood in production on
-- 2026-08-06 before the ordering fix was applied (md5 095aa19a4f90a8924cde9a4965392ad0,
-- 1828 bytes). Run it to restore the previous behaviour.
--
-- 🔴 Restoring this reinstates the bug: on a new card it schedules again → 1 day,
-- hard → 2 days, good → 1 day, so Again is indistinguishable from Good and Hard is
-- scheduled LATER than Good. It also reinstates the one-day floor, so a failed card
-- cannot return inside the sitting, and `lapses` goes back to being written and never
-- read. Only run this if the replacement is causing a worse problem.

CREATE OR REPLACE FUNCTION public.grade_study_card(p_card_id uuid, p_grade text)
 RETURNS TABLE(card_id uuid, next_due timestamp with time zone, interval_days integer, repetitions integer, lapses integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_card public.study_cards%rowtype;
  next_interval integer;
begin
  if p_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception 'invalid study grade';
  end if;

  select * into current_card
  from public.study_cards
  where id = p_card_id and user_id = (select auth.uid()) and not suspended
  for update;
  if not found then raise exception 'study card not found'; end if;

  next_interval := case p_grade
    when 'again' then 1
    when 'hard' then greatest(1, ceil(greatest(current_card.interval_days, 1) * 1.2)::integer)
    when 'good' then case when current_card.repetitions = 0 then 1 else greatest(2, ceil(current_card.interval_days * 2.5)::integer) end
    when 'easy' then case when current_card.repetitions = 0 then 4 else greatest(4, ceil(current_card.interval_days * 3.5)::integer) end
  end;

  update public.study_cards as card
  set due_at = now() + make_interval(days => next_interval),
      interval_days = next_interval,
      repetitions = current_card.repetitions + 1,
      lapses = current_card.lapses + case when p_grade = 'again' then 1 else 0 end
  where card.id = current_card.id and card.user_id = current_card.user_id
  returning card.id, card.due_at, card.interval_days, card.repetitions, card.lapses
  into card_id, next_due, interval_days, repetitions, lapses;

  insert into public.study_review_logs(user_id, card_id, grade, previous_due, next_due, interval_days)
  values (current_card.user_id, current_card.id, p_grade, current_card.due_at, next_due, interval_days);
  return next;
end;
$function$;
