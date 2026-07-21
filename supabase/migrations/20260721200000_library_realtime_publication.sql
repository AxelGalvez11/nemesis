-- Web Library live refresh (owner ask 2026-07-21): let Supabase Realtime emit
-- postgres_changes events for the readable library table, so the web app can
-- update in place when a phone (or another tab, or an agent tool) edits a note.
-- RLS stays the gate: subscribers only ever receive rows their own SELECT
-- policy allows (readable_library_documents_owner_all).
--
-- Applied to the live project on 2026-07-21 via the management API (migration
-- "add_readable_library_documents_to_realtime_publication"); this file is the
-- repo record and replays safely anywhere thanks to the duplicate guard.
-- Revert: alter publication supabase_realtime drop table public.readable_library_documents;
do $$
begin
  alter publication supabase_realtime add table public.readable_library_documents;
exception
  when duplicate_object then null;
end
$$;
