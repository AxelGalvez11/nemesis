-- Anki-parity colored flags: 0 = none, 1-7 = Red/Orange/Green/Blue/Pink/
-- Turquoise/Purple. The legacy boolean `flagged` stays and mirrors flag > 0
-- (the phone app still reads it); web reads/writes `flag`.
-- Applied to prod 2026-07-22 via MCP (add_study_card_flag_colors).
alter table public.study_cards
  add column if not exists flag smallint not null default 0
  check (flag between 0 and 7);
update public.study_cards set flag = 1 where flagged and flag = 0;
