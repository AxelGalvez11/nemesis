-- Supabase project default privileges may grant broader table capabilities to
-- authenticated than this browser client needs. Keep the Study surface least
-- privilege: row CRUD only; no TRUNCATE, REFERENCES, or TRIGGER privileges.
revoke all on public.study_decks, public.study_cards, public.study_review_logs from authenticated;
grant select, insert, update, delete on public.study_decks, public.study_cards to authenticated;
grant select, insert on public.study_review_logs to authenticated;
