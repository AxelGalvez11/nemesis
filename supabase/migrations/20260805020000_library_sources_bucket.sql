-- One canonical uploaded object, addressable by row id.
--
-- Ingestion used to POST the file's BYTES to a Vercel function, which capped every
-- upload at ~4.5 MB whatever the UI promised. Uploads now go browser -> private
-- bucket -> server reads the object. The reference the client sends is this table's
-- `id`, and the server resolves the storage path from the row by (id, user_id) —
-- so a client never names a path and the service role never trusts one.
--
-- For that to cover PHOTOS as well as documents, the row has to say WHICH bucket it
-- lives in: pictures are stored in `library-images` (their own signed-URL lifetime
-- and preview path) while documents share `library-sources`. Before this column the
-- bucket was implied by the table name, which is exactly the kind of implicit
-- knowledge that makes a second bucket impossible to add safely.
--
-- Additive and defaulted, so every existing row keeps meaning precisely what it
-- meant before and no backfill is required.

alter table public.library_sources
  add column if not exists bucket text not null default 'library-sources';

-- Only buckets ingestion may read from. A CHECK rather than a foreign key to
-- storage.buckets: the set is tiny, it changes when code changes, and a bad value
-- should fail at write time with a readable message rather than at read time as a
-- mysterious empty download.
alter table public.library_sources
  drop constraint if exists library_sources_bucket_check;
alter table public.library_sources
  add constraint library_sources_bucket_check
  check (bucket in ('library-sources', 'library-images'));

comment on column public.library_sources.bucket is
  'Storage bucket holding storage_path. Ingestion resolves the object from (id, user_id) so no client-supplied path is ever trusted.';
