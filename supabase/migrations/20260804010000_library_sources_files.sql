-- Somewhere to keep the ORIGINAL uploaded files behind Library notes.
--
-- Owner 2026-08-03: "source files live inside the same Library, but in their
-- own 'Sources' area under each course or topic … Clicking a source opens the
-- original PDF, PowerPoint, image, or recording in the center viewer" and,
-- explicitly, "yes it needs to be stored so that users can click on it".
-- Until now every import lane extracted text and DISCARDED the file; this
-- migration is what lets an import keep it.
--
-- One row per kept file. folder_path mirrors the note tree's slash paths
-- (readable_library_documents), "" = Library root; the web app updates it
-- when a folder is renamed/moved and soft-deletes when a folder is deleted.
-- Bucket + policies are modelled on 20260724210000_library_images_bucket.sql:
-- private bucket, keys are `<user_id>/<uuid>.<ext>`, read access only via
-- signed URLs minted with the student's own session.

create table if not exists public.library_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_path text not null default '',
  file_name text not null check (char_length(file_name) <= 512),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists library_sources_user_idx
  on public.library_sources(user_id, deleted, created_at desc);

alter table public.library_sources enable row level security;

drop policy if exists library_sources_owner_select on public.library_sources;
create policy library_sources_owner_select
  on public.library_sources for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists library_sources_owner_insert on public.library_sources;
create policy library_sources_owner_insert
  on public.library_sources for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Update covers folder renames/moves keeping sources filed correctly, and the
-- deleted flag (soft delete). No hard DELETE from clients: originals are the
-- student's records, and reversible removal is the safer default.
drop policy if exists library_sources_owner_update on public.library_sources;
create policy library_sources_owner_update
  on public.library_sources for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.library_sources from anon, authenticated;
grant select, insert, update on public.library_sources to authenticated;

-- The bucket. 50 MB ceiling: lecture slide decks and chapter PDFs fit with
-- room to spare, and anything bigger fails at upload time (import continues
-- without the original) rather than quietly eating storage. Allowlist =
-- exactly what the Library import accepts and keeps: documents, slides,
-- photos, and recordings. Markdown/text are absent on purpose — those ARE
-- the note, saved verbatim, there is no separate original.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-sources',
  'library-sources',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg'
  ]
)
on conflict (id) do nothing;

drop policy if exists "library sources owner select" on storage.objects;
create policy "library sources owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'library-sources' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "library sources owner insert" on storage.objects;
create policy "library sources owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library-sources' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "library sources owner delete" on storage.objects;
create policy "library sources owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'library-sources' and (storage.foldername(name))[1] = auth.uid()::text);
