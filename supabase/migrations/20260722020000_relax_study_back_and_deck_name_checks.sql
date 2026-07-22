-- Cloze cards legitimately have an empty back (Anki's optional "Extra" side),
-- and imported Anki deck-tree names can exceed 120 chars. Keep upper bounds.
-- Applied to prod 2026-07-22 while fixing the starter-deck import failure:
-- "new row for relation study_cards violates check constraint study_cards_back_check".
alter table public.study_cards drop constraint study_cards_back_check;
alter table public.study_cards add constraint study_cards_back_check check (char_length(back) <= 20000);
alter table public.study_decks drop constraint study_decks_name_check;
alter table public.study_decks add constraint study_decks_name_check check (char_length(name) between 1 and 300);
