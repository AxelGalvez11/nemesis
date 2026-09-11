-- Space, M9 part two (docs/space/PLAN.md): AI Meeting Notes record through the durable recording pipeline.
--
-- A recording made in a workspace meeting note is filed as surface 'space': the job and its artifact exist as they do
-- for the Sessions and notebook recorders, the context is the meeting block and the message is its page, and there is
-- no Library note (the workspace page is where the notes land). The two surface checks are replaced by wider ones;
-- every existing row is 'sessions' or 'notebook' and still passes.

alter table public.recording_jobs drop constraint if exists recording_jobs_surface_check;
alter table public.recording_jobs
  add constraint recording_jobs_surface_check check (surface in ('sessions', 'notebook', 'space'));

alter table public.chat_recording_artifacts drop constraint if exists chat_recording_artifacts_surface_check;
alter table public.chat_recording_artifacts
  add constraint chat_recording_artifacts_surface_check check (surface in ('sessions', 'notebook', 'space'));
