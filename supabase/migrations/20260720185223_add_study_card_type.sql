alter table public.study_cards
  add column if not exists card_type text not null default 'basic'
  check (card_type in ('basic', 'reversed', 'cloze', 'image_occlusion'));

comment on column public.study_cards.card_type is
  'Card presentation/editing mode selected in the Study browser.';
