-- FSRS-6 replaces FSRS-4.5, because 4.5 could not see a learning step.
--
-- WHY. 20260830T30 shipped FSRS-4.5 (seventeen parameters) and 20260830T40 added Anki's learning
-- steps on top. Those two do not fit together: 4.5 has no notion of a same-day review, so the press
-- ten minutes into a step was scored with the LONG-TERM forgetting curve, which is not what it is.
-- FSRS-6 — what Anki has shipped since 25.07 — models it directly. Asked whether our defaults were
-- the best available, the honest answer was that the algorithm was two versions old.
--
-- WHAT CHANGES, structurally:
--   • DECAY IS FITTED (w[21], 0.1542) rather than fixed at 0.5, so the forgetting curve's shape is
--     learned. The factor is derived from it and must never be typed out.
--   • INITIAL DIFFICULTY IS EXPONENTIAL in the grade: w[5] - exp(w[6] * (grade - 1)) + 1.
--   • DIFFICULTY STEPS ARE DAMPED: the same press moves an already-hard card less.
--   • THERE IS A SAME-DAY STABILITY CURVE (w[18..20]) used when the gap is under a day.
--   • A LAPSE IS CAPPED AT A FRACTION of the old stability, not merely stopped from growing.
--
-- WHAT IT MEANS IN PRACTICE: intervals are shorter and better calibrated. A new card answered Good
-- twice graduates to 2 days rather than 4; Easy on a new card is 8 days rather than 14.
--
-- Mirrored exactly in apps/web/lib/workspace/study-scheduler.ts.

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
  -- 🔴 SQL ARRAYS ARE 1-INDEXED, THE PAPER'S ARE 0-INDEXED: w[n] here is the paper's w[n-1].
  -- Cross-check against study-scheduler.ts by MEANING, never by position.
  w double precision[] := array[
    0.212, 1.2931, 2.3065, 8.2956,      -- initial stability: again, hard, good, easy
    6.4133, 0.8334,                     -- initial difficulty, and its exponential slope
    3.0194, 0.001,                      -- difficulty step, and mean reversion weight
    1.8722, 0.1666, 0.796,              -- the success curve
    1.4835, 0.0614, 0.2629, 1.6483,     -- the lapse curve
    0.6014, 1.8729,                     -- hard penalty, easy bonus
    0.5425, 0.0912, 0.0658,             -- the SAME-DAY curve, which is where a learning step lands
    0.1542                              -- the decay, fitted in FSRS-6
  ]::double precision[];
  -- Anki's shipped defaults, in minutes: DeckConfig::default().
  learn_steps double precision[] := array[1, 10]::double precision[];
  relearn_steps double precision[] := array[10]::double precision[];
  v_steps double precision[];
  v_total integer;
  v_remaining integer;
  v_index integer;
  v_next_delay double precision;
  v_minutes double precision;
  v_decay double precision;
  v_factor double precision;
  v_retention double precision := 0.9;
  v_rating integer;
  v_elapsed double precision;
  v_recall double precision;
  v_seen boolean;
  v_stability_in double precision;
  v_difficulty_in double precision;
  v_stability double precision;
  v_difficulty double precision;
  v_stepped double precision;
  v_sinc double precision;
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

  -- 🔴 DERIVED, NEVER TYPED. The factor is the value that makes retrievability exactly 0.9 when
  -- elapsed days equals stability, which is the DEFINITION of stability. Hand-typing an
  -- approximation would redefine the unit the whole algorithm is expressed in.
  v_decay := -w[21];
  v_factor := power(0.9, 1.0 / v_decay) - 1;

  v_rating := case p_grade when 'again' then 1 when 'hard' then 2 when 'good' then 3 else 4 end;
  v_seen := current_card.repetitions > 0;

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
  -- The neutral seed for a card with no recorded difficulty is D0(good).
  v_difficulty_in := case
    when current_card.difficulty > 0 then current_card.difficulty
    else least(10, greatest(1, w[5] - exp(w[6] * (3 - 1)) + 1))
  end;

  if not v_seen or v_stability_in <= 0 then
    v_stability := greatest(0.1, w[v_rating]);
    v_difficulty := least(10, greatest(1, w[5] - exp(w[6] * (v_rating - 1)) + 1));
  else
    -- Difficulty: one DAMPED step, then mean reversion toward D0(easy).
    v_anchor := least(10, greatest(1, w[5] - exp(w[6] * (4 - 1)) + 1));
    v_stepped := v_difficulty_in + (-w[7] * (v_rating - 3)) * (10 - v_difficulty_in) / 9.0;
    v_difficulty := least(10, greatest(1, v_stepped + w[8] * (v_anchor - v_stepped)));

    if v_elapsed < 1 then
      -- 🔴 SAME DAY IS ITS OWN CURVE, and having it is the whole reason for being on FSRS-6. A
      -- press inside a learning step is not a test of long-term memory and must not be scored as
      -- one. A same-day pass may never shrink the memory; a same-day failure may, and must.
      v_sinc := exp(w[18] * (v_rating - 3 + w[19])) * power(v_stability_in, -w[20]);
      v_stability := v_stability_in * case when v_rating >= 2 then greatest(v_sinc, 1) else v_sinc end;
    else
      v_recall := power(1 + v_factor * v_elapsed / v_stability_in, v_decay);
      if v_rating = 1 then
        -- Capped at a FRACTION of the old stability, not merely stopped from growing: a forgotten
        -- card always comes out weaker than it went in.
        v_stability := least(
          w[12] * power(v_difficulty, -w[13]) * (power(v_stability_in + 1, w[14]) - 1) * exp(w[15] * (1 - v_recall)),
          v_stability_in / exp(w[18] * w[19])
        );
      else
        v_hard := case when v_rating = 2 then w[16] else 1 end;
        v_easy := case when v_rating = 4 then w[17] else 1 end;
        v_stability := v_stability_in * (1 + exp(w[9]) * (11 - v_difficulty) * power(v_stability_in, -w[10])
          * (exp(w[11] * (1 - v_recall)) - 1) * v_hard * v_easy);
      end if;
    end if;
  end if;

  v_stability := least(36500, greatest(0.1, v_stability));
  v_interval := least(36500, greatest(1, round(v_stability / v_factor * (power(v_retention, 1.0 / v_decay) - 1))::integer));

  -- ── The step machine, unchanged from 20260830T40 ───────────────────────────
  v_lapses := current_card.lapses;
  v_minutes := null;
  v_remaining_out := 0;

  if current_card.state = 'review' then
    if p_grade = 'again' then
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
    else now() + (v_minutes * interval '1 minute')
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

-- 🔴 THE BACKFILLED DIFFICULTY MOVES WITH THE VERSION. 20260830T30 seeded every already-reviewed
-- card at 4.5's neutral anchor (5.1618). FSRS-6's neutral point is D0(good) = 6.4133 - e^0.8334*2 + 1,
-- and leaving the old value would put every legacy card on the wrong part of the difficulty curve
-- from its very next review. Only rows still carrying the old constant are touched, so a card that
-- has been graded since keeps what it earned.
update public.study_cards
set difficulty = least(10, greatest(1, 6.4133 - exp(0.8334 * 2) + 1))
where difficulty = 5.1618;
