-- Learning steps: the half of the scheduler that answers in MINUTES.
--
-- WHAT WAS WRONG. 20260830T30 put FSRS in and left the card's next appearance entirely to it, so
-- every press produced a day interval and the smallest possible answer was "tomorrow". Owner, the
-- same day: *"the card is not supposed to be disappearing for days. It's supposed to be
-- disappearing for a couple of minutes… just saying good and it disappears for three days, that's
-- too much."* Correct, and it is not a tuning problem: FSRS alone is not a scheduler.
--
-- WHAT ANKI ACTUALLY DOES, read from rslib/src/scheduler/states/{normal,learning,steps,relearning,
-- review}.rs. Two mechanisms, not one:
--   • FSRS produces a memory state (stability, difficulty) and a REVIEW interval in days.
--   • LEARNING STEPS decide whether the card takes that interval yet, or comes back in minutes.
-- A card walks 1 minute then 10 minutes before it graduates. A failed review card relearns at 10
-- minutes. Only then do days apply.
--
-- THE ARCHITECTURE IS ANKI'S; THE CODE IS OURS. `remaining_steps` counts DOWN and the index into
-- the steps array is `total - remaining`; a NEW card is treated as a failed learning card and
-- starts at the full count (normal.rs states this outright); `good` takes `steps[index + 1]` and
-- graduates when that is past the end; `hard` repeats the current step, averaging the first two
-- when it is on the first; failing a REVIEW card is the only thing that counts as a lapse.
--
-- Mirrored exactly in apps/web/lib/workspace/study-scheduler.ts. The two must agree.

alter table public.study_cards
  add column if not exists state text not null default 'new'
    check (state in ('new', 'learning', 'review', 'relearning')),
  -- Steps left before this card graduates, counting down. Meaningless outside learning/relearning.
  add column if not exists remaining_steps smallint not null default 0 check (remaining_steps >= 0);

-- Anything already reviewed has graduated by definition; anything else has not been seen.
update public.study_cards set state = 'review' where repetitions > 0 and state = 'new';

alter table public.study_review_logs
  -- What was actually scheduled. Null means the card was put out in days, and `interval_days` is
  -- the answer. Without this the log would claim "4 days" for a card coming back in ten minutes.
  add column if not exists scheduled_minutes integer check (scheduled_minutes is null or scheduled_minutes >= 0),
  add column if not exists state text;

-- 🔴 THE INDEX IS ON `due_at`, WHICH NOW CARRIES MINUTES. It always could — the column is
-- timestamptz — but until today nothing ever wrote a sub-day value, so the intraday queue is new
-- traffic against an existing index rather than a new access pattern.

drop function if exists public.grade_study_card(uuid, text, integer);

create or replace function public.grade_study_card(p_card_id uuid, p_grade text, p_duration_ms integer default null)
returns table(
  card_id uuid,
  next_due timestamptz,
  interval_days integer,
  repetitions integer,
  lapses integer,
  stability double precision,
  difficulty double precision,
  state text,
  remaining_steps smallint,
  due_in_minutes double precision
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_card public.study_cards%rowtype;
  -- SQL arrays are 1-indexed, the paper's are 0-indexed: w[n] here is the paper's w[n-1].
  w double precision[] := array[
    0.4872, 1.4003, 3.7145, 13.8206,
    5.1618, 1.2298,
    0.8975, 0.031,
    1.6474, 0.1367, 1.0461,
    2.1072, 0.0793, 0.3246, 1.587,
    0.2272, 2.8755
  ]::double precision[];
  -- Anki's shipped defaults, in minutes: DeckConfig::default() carries learn_steps [1, 10] and
  -- relearn_steps [10]. Not a taste — a learner who has used Anki recognises this rhythm.
  learn_steps double precision[] := array[1, 10]::double precision[];
  relearn_steps double precision[] := array[10]::double precision[];
  v_steps double precision[];
  v_total integer;
  v_remaining integer;
  v_index integer;
  v_next_delay double precision;
  v_minutes double precision;
  v_factor double precision := 19.0 / 81.0;
  v_decay double precision := -0.5;
  v_retention double precision := 0.9;
  v_rating integer;
  v_elapsed double precision;
  v_recall double precision;
  v_seen boolean;
  v_stability_in double precision;
  v_difficulty_in double precision;
  v_stability double precision;
  v_difficulty double precision;
  v_interval integer;
  v_hard double precision;
  v_easy double precision;
  v_anchor double precision;
  v_state text;
  v_remaining_out integer;
  v_lapses integer;
  v_due timestamptz;
begin
  if p_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception 'invalid study grade';
  end if;

  select * into current_card
  from public.study_cards
  where id = p_card_id and user_id = (select auth.uid()) and not suspended
  for update;
  if not found then raise exception 'study card not found'; end if;

  v_rating := case p_grade when 'again' then 1 when 'hard' then 2 when 'good' then 3 else 4 end;
  v_seen := current_card.repetitions > 0;

  -- ── The memory step: FSRS, unchanged from 20260830T30 ──────────────────────
  -- 🔴 IT RUNS ON EVERY PRESS, INCLUDING ONES INSIDE A STEP, which is what Anki does with FSRS on.
  -- A ten-minute gap leaves retrievability at ~1.0, so walking the steps barely moves stability and
  -- cannot inflate the schedule.
  v_elapsed := greatest(0, extract(epoch from (
    now() - coalesce(
      current_card.last_reviewed_at,
      current_card.due_at - make_interval(days => current_card.interval_days)
    )
  )) / 86400.0);

  v_stability_in := case
    when current_card.stability > 0 then current_card.stability
    when v_seen then greatest(0.1, current_card.interval_days::double precision)
    else 0
  end;
  v_difficulty_in := case when current_card.difficulty > 0 then current_card.difficulty else w[5] end;

  if not v_seen or v_stability_in <= 0 then
    v_stability := greatest(0.1, w[v_rating]);
    v_difficulty := least(10, greatest(1, w[5] - (v_rating - 3) * w[6]));
  else
    v_recall := power(1 + v_factor * v_elapsed / v_stability_in, v_decay);
    v_anchor := least(10, greatest(1, w[5] - (4 - 3) * w[6]));
    v_difficulty := least(10, greatest(1,
      w[8] * v_anchor + (1 - w[8]) * (v_difficulty_in - w[7] * (v_rating - 3))
    ));
    if v_rating = 1 then
      v_stability := least(
        v_stability_in,
        w[12] * power(v_difficulty, -w[13]) * (power(v_stability_in + 1, w[14]) - 1) * exp(w[15] * (1 - v_recall))
      );
    else
      v_hard := case when v_rating = 2 then w[16] else 1 end;
      v_easy := case when v_rating = 4 then w[17] else 1 end;
      v_stability := v_stability_in * (1 + exp(w[9]) * (11 - v_difficulty) * power(v_stability_in, -w[10])
        * (exp(w[11] * (1 - v_recall)) - 1) * v_hard * v_easy);
    end if;
  end if;

  v_stability := least(36500, greatest(0.1, v_stability));
  -- The REVIEW interval. A card still in its steps carries it without taking it yet: this is where
  -- the card goes when it graduates, exactly as Anki's `card.interval` behaves in the learn queue.
  v_interval := least(36500, greatest(1, round(v_stability / v_factor * (power(v_retention, 1.0 / v_decay) - 1))::integer));

  -- ── The step machine ───────────────────────────────────────────────────────
  v_lapses := current_card.lapses;
  v_minutes := null;
  v_remaining_out := 0;

  if current_card.state = 'review' then
    if p_grade = 'again' then
      -- 🔴 THE ONLY PLACE A LAPSE IS COUNTED. Fumbling a card that never graduated is not a lapse
      -- in Anki and must not be one here, or a learner struggling with new material would look
      -- like somebody forgetting things they had already learned.
      v_lapses := v_lapses + 1;
      v_state := 'relearning';
      v_remaining_out := array_length(relearn_steps, 1);
      v_minutes := relearn_steps[1];
    else
      v_state := 'review';
    end if;
  else
    v_steps := case when current_card.state = 'relearning' then relearn_steps else learn_steps end;
    v_total := array_length(v_steps, 1);
    -- 🔴 A NEW CARD IS A FAILED LEARNING CARD (normal.rs says exactly this), so it starts at the
    -- FULL remaining count rather than one step in.
    v_remaining := case
      when current_card.state = 'new' or current_card.remaining_steps <= 0 then v_total
      else least(current_card.remaining_steps, v_total)
    end;
    v_index := least(greatest(v_total - v_remaining, 0), greatest(v_total - 1, 0));

    if p_grade = 'easy' then
      v_state := 'review';
    elsif p_grade = 'again' then
      v_state := case when current_card.state = 'relearning' then 'relearning' else 'learning' end;
      v_remaining_out := v_total;
      v_minutes := v_steps[1];
    elsif p_grade = 'hard' then
      v_state := case when current_card.state = 'relearning' then 'relearning' else 'learning' end;
      v_remaining_out := v_remaining;
      -- Hard repeats the step you are on. On the first step it sits between "again" and "good",
      -- otherwise Hard and Again would be the same press.
      v_minutes := case
        when v_index = 0 and v_total >= 2 then (v_steps[1] + v_steps[2]) / 2.0
        else least(v_steps[v_index + 1] * 1.5, v_steps[v_index + 1] + 1440)
      end;
    else
      v_next_delay := case when v_index + 2 > v_total then null else v_steps[v_index + 2] end;
      if v_next_delay is null then
        v_state := 'review';
      else
        v_state := case when current_card.state = 'relearning' then 'relearning' else 'learning' end;
        v_remaining_out := v_remaining - 1;
        v_minutes := v_next_delay;
      end if;
    end if;
  end if;

  v_due := case
    when v_minutes is null then now() + make_interval(days => v_interval)
    else now() + make_interval(mins => 0) + (v_minutes * interval '1 minute')
  end;

  update public.study_cards as card
  set due_at = v_due,
      interval_days = v_interval,
      repetitions = current_card.repetitions + 1,
      lapses = v_lapses,
      stability = v_stability,
      difficulty = v_difficulty,
      state = v_state,
      remaining_steps = v_remaining_out,
      last_reviewed_at = now()
  where card.id = current_card.id and card.user_id = current_card.user_id
  returning card.id, card.due_at, card.interval_days, card.repetitions, card.lapses,
            card.stability, card.difficulty, card.state, card.remaining_steps
  into card_id, next_due, interval_days, repetitions, lapses, stability, difficulty, state, remaining_steps;
  due_in_minutes := v_minutes;

  insert into public.study_review_logs(
    user_id, card_id, grade, previous_due, next_due, interval_days,
    duration_ms, elapsed_days, stability, difficulty, scheduled_minutes, state
  )
  values (
    current_card.user_id, current_card.id, p_grade, current_card.due_at, next_due, v_interval,
    p_duration_ms, v_elapsed, v_stability, v_difficulty, round(v_minutes)::integer, v_state
  );
  return next;
end;
$$;

revoke all on function public.grade_study_card(uuid, text, integer) from public, anon;
grant execute on function public.grade_study_card(uuid, text, integer) to authenticated;
