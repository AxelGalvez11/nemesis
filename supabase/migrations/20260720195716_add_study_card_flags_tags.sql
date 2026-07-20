alter table public.study_cards
  add column if not exists flagged boolean not null default false,
  add column if not exists tags text[] not null default '{}';

create index if not exists study_cards_owner_flagged_idx
  on public.study_cards(user_id, flagged)
  where flagged = true;

create index if not exists study_cards_tags_gin_idx
  on public.study_cards using gin(tags);

comment on column public.study_cards.flagged is
  'User-controlled flag exposed in the Study card browser.';

comment on column public.study_cards.tags is
  'Normalized user tags used to browse cards across decks.';
