-- FSRS replaces the fixed-multiplier scheduler, and every review starts recording how long it took.
--
-- WHAT WAS WRONG. `grade_study_card` multiplied the last interval by a constant per grade
-- (again→1, hard→x1.2, good→x2.5, easy→x3.5). That is SM-2 with the only adaptive part of SM-2 —
-- the per-card ease factor — left out, so every card in every collection moved on one identical
-- ladder and nothing a learner did could change it. It also ignored HOW OVERDUE a card was, which
-- is the strongest evidence a review produces: remembering something three weeks late says far more
-- about the memory than remembering it on the day.
--
-- WHAT REPLACES IT. FSRS-4.5, with the authors' published default parameters. Two numbers are now
-- stored per card — stability (days until recall falls to 90%) and difficulty (1-10) — and
-- retrievability is computed from the gap since the last review. See
-- apps/web/lib/workspace/study-scheduler.ts, which carries the same equations for the preview lane
-- and for the optimistic update, and must agree with this file to the decimal.
--
-- DURATION IS RECORDED AND NOTHING READS IT. Neither Anki nor FSRS uses answer latency as a
-- scheduling input; the hesitation is reported by which button gets pressed. It is logged here
-- because a signal nobody collected can never be evaluated later, and because the existing review
-- logs are useful today only because they have existed since July.

-- ── Card memory state ────────────────────────────────────────────────────────
alter table public.study_cards
  add column if not exists stability double precision not null default 0 check (stability >= 0),
  add column if not exists difficulty double precision not null default 0 check (difficulty >= 0 and difficulty <= 10),
  -- When this card was last graded. Until now it was only derivable as due_at minus interval_days,
  -- which is correct but breaks the moment anything else touches due_at.
  add column if not exists last_reviewed_at timestamptz;

-- Every card reviewed under the old scheduler keeps its place. Its interval IS what the old
-- scheduler meant by "how long this memory lasts", so it becomes the seed stability; difficulty
-- starts at the neutral anchor D0(good) because the old rows carry no evidence either way.
-- Cards never reviewed are left at zero and take their initial values from the first real grade.
update public.study_cards
set stability = greatest(0.1, interval_days::double precision),
    difficulty = 5.1618,
    last_reviewed_at = due_at - make_interval(days => interval_days)
where repetitions > 0 and stability = 0;

-- ── Review log: what the optimiser will need later ───────────────────────────
alter table public.study_review_logs
  -- How long the learner took, in milliseconds, from seeing the card to grading it. Nullable: rows
  -- written before 2026-08-30, and by clients that do not send it, genuinely have no value.
  add column if not exists duration_ms integer check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 3600000)),
  -- The gap FSRS actually reads. Stored rather than recomputed because due_at can be edited.
  add column if not exists elapsed_days double precision,
  -- The card's memory state AFTER this review, so a fitted-parameter run can replay the trajectory.
  add column if not exists stability double precision,
  add column if not exists difficulty double precision;

-- ── The scheduler ────────────────────────────────────────────────────────────
-- 🔴 THE OLD TWO-ARGUMENT FUNCTION IS DROPPED, NOT LEFT BESIDE THIS ONE. A 2-arg function and a
-- 3-arg function whose third argument has a default are AMBIGUOUS for a named call carrying two
-- arguments, and PostgREST calls by name — every existing client would start failing. Dropping it
-- means `{p_card_id, p_grade}` resolves here with p_duration_ms null, which is what the web canvas
-- bridge and the mobile app send today.
drop function if exists public.grade_study_card(uuid, text);

create or replace function public.grade_study_card(p_card_id uuid, p_grade text, p_duration_ms integer default null)
returns table(
  card_id uuid,
  next_due timestamptz,
  interval_days integer,
  repetitions integer,
  lapses integer,
  stability double precision,
  difficulty double precision
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_card public.study_cards%rowtype;
  -- 🔴 SQL ARRAYS ARE 1-INDEXED, THE PAPER'S ARE 0-INDEXED. w[n] here is the paper's w[n-1].
  -- Every reference below is written in SQL indices; cross-check against study-scheduler.ts by
  -- MEANING, never by position.
  w double precision[] := array[
    0.4872, 1.4003, 3.7145, 13.8206,          -- initial stability: again, hard, good, easy
    5.1618, 1.2298,                           -- initial difficulty, and its slope per grade
    0.8975, 0.031,                            -- difficulty step, and mean reversion weight
    1.6474, 0.1367, 1.0461,                   -- the success curve
    2.1072, 0.0793, 0.3246, 1.587,            -- the lapse curve
    0.2272, 2.8755                            -- hard penalty, easy bonus
  ]::double precision[];
  -- Derived, not chosen: the value that makes retrievability exactly 0.9 when elapsed = stability.
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

  -- The gap since the last review. `last_reviewed_at` is authoritative; the fallback reconstructs
  -- it the only way the old schema allowed, and covers any row the backfill could not reach.
  v_elapsed := greatest(0, extract(epoch from (
    now() - coalesce(
      current_card.last_reviewed_at,
      current_card.due_at - make_interval(days => current_card.interval_days)
    )
  )) / 86400.0);

  -- Seed a card that has no FSRS state yet, exactly as the backfill above would have.
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
    -- One step, then pulled back toward D0(easy) so a few bad days cannot pin a card at 10 forever.
    v_anchor := least(10, greatest(1, w[5] - (4 - 3) * w[6]));
    v_difficulty := least(10, greatest(1,
      w[8] * v_anchor + (1 - w[8]) * (v_difficulty_in - w[7] * (v_rating - 3))
    ));
    if v_rating = 1 then
      -- A lapse never lengthens a memory, whatever the curve says.
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
  -- Floor of one day: a lapse can drive stability under a day, and "due in 0 days" is a card that
  -- never leaves the queue. Anki uses intraday relearning steps for this; we have no intraday queue.
  v_interval := least(36500, greatest(1, round(v_stability / v_factor * (power(v_retention, 1.0 / v_decay) - 1))::integer));

  update public.study_cards as card
  set due_at = now() + make_interval(days => v_interval),
      interval_days = v_interval,
      repetitions = current_card.repetitions + 1,
      lapses = current_card.lapses + case when p_grade = 'again' then 1 else 0 end,
      stability = v_stability,
      difficulty = v_difficulty,
      last_reviewed_at = now()
  where card.id = current_card.id and card.user_id = current_card.user_id
  returning card.id, card.due_at, card.interval_days, card.repetitions, card.lapses, card.stability, card.difficulty
  into card_id, next_due, interval_days, repetitions, lapses, stability, difficulty;

  insert into public.study_review_logs(
    user_id, card_id, grade, previous_due, next_due, interval_days,
    duration_ms, elapsed_days, stability, difficulty
  )
  values (
    current_card.user_id, current_card.id, p_grade, current_card.due_at, next_due, v_interval,
    p_duration_ms, v_elapsed, v_stability, v_difficulty
  );
  return next;
end;
$$;

revoke all on function public.grade_study_card(uuid, text, integer) from public, anon;
grant execute on function public.grade_study_card(uuid, text, integer) to authenticated;
