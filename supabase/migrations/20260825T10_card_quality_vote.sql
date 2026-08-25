-- A learner can say a card was badly made, and nothing else.
--
-- Owner 2026-08-25: "I don't want users to edit flashcards, really. Mainly just download them if
-- they want to… Mainly just a thumbs up or a thumbs down if a card was bad. Badly generated."
--
-- 🔴 THIS IS NOT `flag`, AND THE DIFFERENCE IS WHO THE MESSAGE IS FOR. `flag` is the learner
-- talking to themselves — Anki's coloured markers, "come back to this one", meaningful only inside
-- their own deck. `quality` is the learner talking to US about a card NEMESIS WROTE. Overloading
-- `flag` with an eighth colour meaning "this generation was bad" would make the two impossible to
-- count apart, and the whole point of collecting it is to count it.
--
-- 🔴 ONE COLUMN, NOT A VOTES TABLE. A card has exactly one owner and therefore exactly one vote;
-- a votes table would model a many-to-many that cannot happen and would cost a join on every
-- review load. It also means the review screen can render the current vote with no extra fetch,
-- which is what makes the control feel like a toggle rather than a submission.
--
-- -1 thumbs down · 0 never voted · 1 thumbs up.

alter table public.study_cards
  add column if not exists quality smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'study_cards_quality_range'
  ) then
    alter table public.study_cards
      add constraint study_cards_quality_range check (quality in (-1, 0, 1));
  end if;
end $$;

-- 🔴 PARTIAL, BECAUSE ALMOST EVERY ROW IS 0. The only query this index exists for is "show me the
-- cards learners called bad", which never wants the unvoted majority. A full index here would be
-- most of the table restated on disk to answer a question nobody asks.
create index if not exists study_cards_quality_voted_idx
  on public.study_cards (user_id, quality)
  where quality <> 0;

comment on column public.study_cards.quality is
  'Learner''s verdict on how well this card was generated: -1 bad, 0 unvoted, 1 good. Not study state — see flag for the learner''s own markers.';
