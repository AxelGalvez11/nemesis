-- Somewhere to keep a photograph.
--
-- The camera work (owner 2026-07-24: "taking photo should be analyzed and even
-- saved to library if it's a note") needs the picture itself to outlive the
-- moment it was taken: the transcript goes into the chat turn, but a Library
-- note that says "photographed the lecture slide" without the slide is a worse
-- note than one that shows it.
--
-- Modelled directly on 20260721041500_study_image_occlusion.sql (study-images),
-- which is the app's existing answer to the same question, so there is one
-- shape of image bucket here rather than two.
--
-- READ ACCESS IS BY SIGNED URL, and the client mints it with the student's own
-- session — a signed URL for an object the policies below would refuse is not
-- issuable, so the private posture survives even though a note body ends up
-- carrying a long-lived URL. Nothing in this app ever hands out a service key
-- to sign someone else's object.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-images',
  'library-images',
  false,
  -- 14 MB, deliberately EQUAL to VISION_MAX_BYTES in apps/web/lib/vision/gemini.ts.
  -- A larger ceiling here would let a photo upload cleanly and then fail to be
  -- read, which reads to the student as "the camera is broken" rather than "that
  -- file is too big". A 12-megapixel phone photo is 3-5 MB.
  14680064,
  -- HEIC/HEIF are first-class: they are what an iPhone camera writes by default,
  -- and an allowlist without them rejects the most common input on the platform
  -- this feature was asked for. SVG is deliberately absent (script-capable, and
  -- not a photograph); GIF likewise — the study bucket accepts it, but nothing
  -- takes a GIF with a camera.
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Owner-only object access, keyed on the first path segment being the user id
-- (uploads go to `<user_id>/<uuid>.<ext>`). No update policy: a photograph is
-- immutable once uploaded — re-taking one writes a new object.
drop policy if exists "library images owner select" on storage.objects;
create policy "library images owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'library-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "library images owner insert" on storage.objects;
create policy "library images owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "library images owner delete" on storage.objects;
create policy "library images owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'library-images' and (storage.foldername(name))[1] = auth.uid()::text);
