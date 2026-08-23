-- Flashcard grading: make the four buttons mean what they say.
--
-- Measured on the owner's own review history before this change (129 real
-- grades): Again averaged 1.00 days out, Good 1.26, Hard 1.55. Hard scheduled
-- cards FURTHER AWAY than Good, and Again was indistinguishable from Good.
--
-- The cause is visible in the old rule set. On a new card (interval_days = 0,
-- the state a first session is spent entirely in) it evaluated to:
--
--     again → 1 day      hard → 2 days      good → 1 day      easy → 4 days
--
-- so Again and Good were identical and Hard was the longest of the three.
-- `lapses` was incremented on every failure and read by nothing, and the
-- smallest expressible interval was one day, so a failed card could never come
-- back inside the sitting.
--
-- No schema change is required for sub-day scheduling: due_at is already
-- timestamptz. The only reason nothing shorter than a day could be scheduled is
-- that this function always called make_interval(days => …). It now schedules
-- in minutes and keeps interval_days as the days-scale memory that future
-- growth multiplies — a relearning card is due in ten minutes while carrying an
-- interval of one day.
--
-- Ordering is enforced by construction: good is built as "at least a day beyond
-- hard", easy as "at least a day beyond good", so no combination of interval,
-- ease and lapses can produce a tie. The old fixed floors (max(2, …), max(4, …))
-- collided at short intervals once ease was damped.
--
-- Mirrored exactly by apps/web/lib/workspace/study-scheduler.ts. The two are
-- kept honest by study-scheduler.test.ts. Change one, change both.

create or replace function public.grade_study_card(p_card_id uuid, p_grade text)
returns table(card_id uuid, next_due timestamp with time zone, interval_days integer, repetitions integer, lapses integer)
language plpgsql
set search_path to ''
as $function$
declare
  current_card public.study_cards%rowtype;
  v_learning boolean;
  v_base integer;
  v_ease numeric;
  v_hard integer;
  v_good integer;
  v_easy integer;
  v_interval integer;
  v_due_minutes integer;
  v_repetitions integer;
  v_lapses integer;
begin
  if p_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception 'invalid study grade';
  end if;

  select * into current_card
  from public.study_cards
  where id = p_card_id and user_id = (select auth.uid()) and not suspended
  for update;
  if not found then raise exception 'study card not found'; end if;

  v_learning := current_card.repetitions = 0;
  v_base := greatest(floor(current_card.interval_days)::integer, 1);

  -- Each lapse permanently damps growth; the 1.3 floor stops a heavily-lapsed
  -- card from being trapped at a one-day interval forever. This is the whole
  -- reason `lapses` is written.
  v_ease := greatest(1.3, 2.5 - 0.15 * greatest(current_card.lapses, 0));

  v_hard := greatest(1, ceil(v_base * 1.2)::integer);
  v_good := greatest(v_hard + 1, ceil(v_base * v_ease)::integer);
  v_easy := greatest(v_good + 1, ceil(v_base * (v_ease + 1.0))::integer);

  if p_grade = 'again' then
    -- Back to learning, due inside the sitting. A lapse is only counted against
    -- a card that had actually graduated: fumbling a card you have never
    -- successfully recalled is not forgetting it, and scoring it as one would
    -- damp the ease of every card a student found hard on first sight.
    v_due_minutes := 10;
    v_interval := 1;
    v_repetitions := 0;
    v_lapses := current_card.lapses + case when v_learning then 0 else 1 end;
  elsif v_learning then
    v_lapses := current_card.lapses;
    if p_grade = 'hard' then
      -- Later than a failure, still inside the sitting.
      v_due_minutes := 60;
      v_interval := 1;
      v_repetitions := 0;
    else
      -- Graduates. Anki's graduating intervals are kept as they were.
      v_interval := case p_grade when 'easy' then 4 else 1 end;
      v_due_minutes := v_interval * 1440;
      v_repetitions := 1;
    end if;
  else
    v_lapses := current_card.lapses;
    v_interval := case p_grade when 'hard' then v_hard when 'good' then v_good else v_easy end;
    v_due_minutes := v_interval * 1440;
    v_repetitions := current_card.repetitions + 1;
  end if;

  update public.study_cards as card
  set due_at = now() + make_interval(mins => v_due_minutes),
      interval_days = v_interval,
      repetitions = v_repetitions,
      lapses = v_lapses
  where card.id = current_card.id and card.user_id = current_card.user_id
  returning card.id, card.due_at, card.interval_days, card.repetitions, card.lapses
  into card_id, next_due, interval_days, repetitions, lapses;

  insert into public.study_review_logs(user_id, card_id, grade, previous_due, next_due, interval_days)
  values (current_card.user_id, current_card.id, p_grade, current_card.due_at, next_due, interval_days);
  return next;
end;
$function$;
