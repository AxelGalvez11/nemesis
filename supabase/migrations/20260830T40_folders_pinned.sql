-- A project can be pinned, exactly like a canvas can (learning_canvases.pinned_at, 20260810T01).
-- The reference pins PROJECTS into the sidebar's Pinned section alongside pinned chats, and a
-- pinned project leaves the Projects section rather than appearing twice. A timestamp rather
-- than a boolean so the pinned block keeps its own stable order instead of reshuffling when an
-- unrelated row is touched — the same reasoning learning_canvases.pinned_at documents.
alter table public.folders add column if not exists pinned_at timestamptz;

comment on column public.folders.pinned_at is
  'When the learner pinned this project to the sidebar''s Pinned section; null = not pinned.';

-- Partial: almost every folder is unpinned, and the sidebar only ever asks for the pinned few.
create index if not exists folders_pinned_idx
  on public.folders (user_id, pinned_at desc)
  where pinned_at is not null;
