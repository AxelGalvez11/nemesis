-- Image occlusion cards: mask geometry rides on the card row, and the images
-- live in a private per-user storage bucket (first storage bucket in the app).

alter table public.study_cards
  add column if not exists payload jsonb;

comment on column public.study_cards.payload is
  'Card-type specific data. Image occlusion cards store {kind, image, width, height, mode, shapes, targetId}; other card types leave this null.';

-- Private bucket: images are served through short-lived signed URLs only.
-- SVG is deliberately excluded (script-capable format).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-images', 'study-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Owner-only object access, keyed on the first path segment being the user id
-- (uploads go to `<user_id>/<uuid>.<ext>`). No update policy: images are
-- immutable once uploaded.
drop policy if exists "study images owner select" on storage.objects;
create policy "study images owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "study images owner insert" on storage.objects;
create policy "study images owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "study images owner delete" on storage.objects;
create policy "study images owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-images' and (storage.foldername(name))[1] = auth.uid()::text);
