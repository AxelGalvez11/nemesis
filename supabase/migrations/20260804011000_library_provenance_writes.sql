-- Let notes RECORD where they came from.
--
-- library_provenance shipped read-only (20260729222659): SELECT-only grant,
-- zero writers. The librarian import already attempts an insert per created
-- page and swallows the failure; this migration is the switch that makes
-- those stamps real, so source pills ("Lecture 1, slides 22–31") light up.
-- Owner-approved 2026-08-03 alongside file storage.
--
-- Also closes the NULL-key trap in the table's unique constraint: Postgres
-- treats NULLs as distinct, so `unique (document_id, source_kind, source_id,
-- source_path)` never deduplicates rows whose source_id/source_path are NULL.
-- The coalesce index below makes repeat stamping idempotent-by-error for
-- every writer, NULL fields included.

create unique index if not exists library_provenance_dedup_idx
  on public.library_provenance (
    document_id,
    source_kind,
    coalesce(source_id, ''),
    coalesce(source_path, '')
  );

drop policy if exists library_provenance_owner_insert on public.library_provenance;
create policy library_provenance_owner_insert
  on public.library_provenance for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Deleting a note cascades its provenance; direct row deletes stay possible
-- for the owner so a wrong stamp can be cleaned up.
drop policy if exists library_provenance_owner_delete on public.library_provenance;
create policy library_provenance_owner_delete
  on public.library_provenance for delete to authenticated
  using ((select auth.uid()) = user_id);

grant insert, delete on public.library_provenance to authenticated;
