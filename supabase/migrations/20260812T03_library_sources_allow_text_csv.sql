-- The storage bucket is a format door, and it was the FOURTH one found.
--
-- 🔴 THIS FILE EXISTS BECAUSE THE ALLOWLIST WAS PRODUCTION-ONLY CONFIGURATION.
-- `storage.buckets.allowed_mime_types` is enforced by Storage before a single
-- line of application code runs, so a type missing from it is a 415 that no
-- amount of parser work can reach — and until now the ONLY copy of that list
-- lived in the live project, where nothing could review it, diff it or test it.
--
-- Writing this migration is what revealed how deep that went: the `.xlsx` MIME
-- type is allowed in production and NO MIGRATION IN THIS REPOSITORY EVER ADDED
-- IT. Four format lists have already drifted here; an undocumented fifth,
-- reachable only through a dashboard, is not acceptable.
--
-- 🔴 APPEND-ONLY, AND IDEMPOTENT. Each value is added only if absent. Nothing is
-- removed, nothing is reordered, and the list deliberately does NOT become
-- 'text/*' — a wildcard would silently admit every future text format without
-- anyone deciding to support it. Re-running this is a no-op.
--
-- Against production on 2026-08-12 every value below was already present except
-- 'text/csv', which was added with owner approval and verified by reading the
-- array back: 17 values before, 18 after, exactly ['text/csv'] added, nothing
-- removed, no wildcard. So this file RECORDS the live state and widens it by
-- one; it does not reset it.
--
-- NOTE ON PERMISSIONS: `storage.buckets` is owned by `supabase_storage_admin`,
-- so this may need elevated rights depending on how migrations are applied. It
-- is written to be safely re-runnable either way.
--
-- The pair is enforced by apps/web/lib/notebooks/upload-mime-contract.test.ts,
-- which reads this file and checks that every MIME type the parser will accept
-- can actually be uploaded.

do $$
declare
  wanted text[] := array[
    -- documents the parser reads
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/markdown',
    'text/plain',
    -- photographs of notes and whiteboards, read by the vision lane
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/webp',
    -- recordings attached as sources
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a'
  ];
  missing text[];
begin
  select coalesce(array_agg(value), '{}')
    into missing
    from unnest(wanted) as value
   where not exists (
     select 1 from storage.buckets
      where id = 'library-sources' and allowed_mime_types @> array[value]
   );

  if array_length(missing, 1) is null then
    raise notice 'library-sources allowlist already complete — no change';
  else
    update storage.buckets
       set allowed_mime_types = allowed_mime_types || missing
     where id = 'library-sources';
    raise notice 'library-sources allowlist widened by %', missing;
  end if;
end $$;
