-- Answers live in the document, beside the note that asked for them.
--
-- Owner, 2026-09-04: *"it would be useful to have annotations with chat responses within the
-- document so users dont bloat the main chat"*. Until now a note pinned to a spot had exactly one
-- destination: press "Send to Nemesis" and the answer landed in the canvas conversation, where a
-- morning of small questions about one lecture buries the thread it was asked in. This makes a
-- comment a THREAD: the learner's note is the root, and what Nemesis says back is a row under it.
--
-- 🔴 A REPLY IS A COMMENT, NOT A SECOND TABLE. It has the same owner, the same document, the same
-- unit and the same resolve state as the note it answers; a `document_comment_replies` table would
-- duplicate every one of those columns and every RLS policy, and would have to be kept in step by
-- hand each time the parent changes. Two columns say everything that differs.
--
-- 🔴 `author`, NOT `is_ai`. A boolean answers one question forever; the column has to survive a
-- reply written by a study partner, or by an import from another tool. The CHECK can grow a value
-- without a rewrite, which a boolean cannot.
--
-- 🔴 THE CASCADE IS DELIBERATE AND IT IS THE ONLY ONE ON THIS TABLE. `doc_id` deliberately has no
-- foreign key (see the original migration: comments must survive bookkeeping changes to the
-- document). A reply is different in kind — it is a sentence about its parent's sentence and means
-- nothing without it, so deleting the note must take the answers with it. Orphan replies would
-- render as pins on a spot with no question.

alter table public.document_comments
  add column if not exists parent_id uuid references public.document_comments(id) on delete cascade;

alter table public.document_comments
  add column if not exists author text not null default 'learner';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_comments'::regclass
      and conname = 'document_comments_author_check'
  ) then
    alter table public.document_comments
      add constraint document_comments_author_check check (author in ('learner', 'nemesis'));
  end if;
end $$;

-- Reading a thread: every reply to one note, oldest first.
create index if not exists document_comments_by_parent
  on public.document_comments (user_id, parent_id, created_at)
  where parent_id is not null;

-- 🔴 THE OPEN-COMMENT INDEX MUST NOT COUNT REPLIES. `openCommentsForDocs` drives the "N" on the
-- pane's comments control and the pins in the margin; counting answers there would show two marks
-- for one question. Roots only, which is also what the old index meant when replies did not exist.
drop index if exists public.document_comments_open;
create index if not exists document_comments_open
  on public.document_comments (user_id, doc_id)
  where resolved_at is null and parent_id is null;
