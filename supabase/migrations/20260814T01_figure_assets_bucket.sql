-- Visual teaching assets share the library-images bucket.
--
-- WHY THIS FILE EXISTS AT ALL. Nothing here creates a table. It records a storage
-- config change that was otherwise invisible in the repo — the kind of drift that
-- makes a bucket behave one way in production and another in a fresh project, and
-- leaves the difference undiscoverable until an upload starts failing.
--
-- WHAT CHANGED. `slide-media.ts` treats GIF as a readable figure format, so a deck
-- with an animated diagram produces a figure with mime `image/gif`. The bucket's
-- allowlist did not include it, so that one figure — and only that one — would be
-- refused at upload while every other figure in the same deck stored fine. The store
-- reports such a refusal honestly (the figure simply gets no asset, and the count of
-- failures is logged), so the symptom would have been a diagram that is described in
-- words and can never be shown, with nothing anywhere calling itself broken.
--
-- The 14 MiB per-object limit is deliberately left alone: figures are downscaled past
-- `MAX_PIXELS` (2.2 MP) on the way in, and the largest across a real 124 MB lecture
-- deck measured 2.06 MB.

update storage.buckets
set allowed_mime_types = allowed_mime_types || array['image/gif']
where id = 'library-images'
  and not (allowed_mime_types @> array['image/gif']);
