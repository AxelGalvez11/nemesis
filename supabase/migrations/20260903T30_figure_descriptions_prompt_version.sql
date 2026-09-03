-- Which question produced a cached figure description.
--
-- `figure_descriptions` is keyed on (user_id, content_key), where the content key is a hash of the
-- image's normalized PIXELS. That is exactly right for "this learner has already paid to have this
-- picture described" and exactly wrong the moment the question changes: the row records what a
-- model SAID about the picture, and a different prompt gets a different answer from the same bytes.
--
-- On 2026-09-03 FIGURE_PROMPT gained a clause telling the model to TRANSCRIBE a table rather than
-- describe it — the fix for a pharmacology lecture whose onset/peak/duration table is a pasted
-- screenshot, read as "values are provided for Onset, Peak time, and Duration" with not one value
-- returned. Without this column every table already cached as that one-sentence caption would have
-- been served back for the life of the account, and the reparse meant to prove the new clause works
-- would have been answered by the old one.
--
-- 🔴 NULLABLE, AND NOT BACKFILLED. Absent means "written under a prompt this build cannot name",
-- which is a different fact from "written under the current prompt" — the reader treats it as a
-- miss, so those rows are re-read once and overwritten in place. Guessing a version for them would
-- assert provenance nobody recorded.

alter table public.figure_descriptions
  add column if not exists prompt_version text;

comment on column public.figure_descriptions.prompt_version is
  'The FIGURE_PROMPT version that produced this description. NULL means unknown provenance, which reads as a cache miss.';

-- The lookup is (user_id, prompt_version, content_key). The existing primary key already leads with
-- user_id and content_key; this index serves the version predicate without changing that key, so an
-- upsert on (user_id, content_key) still overwrites a row written under an older prompt rather than
-- accumulating one row per version per picture.
create index if not exists figure_descriptions_prompt_version_idx
  on public.figure_descriptions (user_id, prompt_version, content_key);
