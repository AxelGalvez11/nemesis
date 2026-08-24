-- 20260824T10 — Nemesis remembers the person, not just the canvas.
--
-- 🔴🔴 THE GAP THIS CLOSES, MEASURED 2026-08-24: nothing carried between canvases. The
-- instructions the model runs on contained no fact about the learner at all, so every
-- conversation began from zero — a student three weeks from a final, who had already
-- attached the syllabus and missed the same distinction four times, was met each morning
-- by software that had never heard of them. Owner's build order, workstream C.
--
-- 🔴🔴 IT IS VISIBLE AND DELETABLE BY THE LEARNER, AND THAT IS A SCHEMA DECISION RATHER
-- THAN A UI ONE. Every row holds ONE plain sentence the learner can read (`statement`),
-- never an embedding, a score, or a model's private notes about them. A learning app
-- that quietly accumulates an unreadable file on a student is a different, worse product,
-- and storing only readable sentences is what makes "show me everything you remember"
-- answerable rather than approximated.
--
-- 🔴 IT DUPLICATES NOTHING. What the learner got WRONG already lives in `learner_evidence`
-- per objective, and this table must never mirror it — that data is richer, judged, and
-- already the input to objective ordering. What is missing and belongs here is the
-- cross-canvas half: which subjects they are studying, what is due and when, and how they
-- have asked to be taught. See the `kind` check.
--
-- 🔴 STRUCTURAL, NEVER SUBJECT-MATTER (CLAUDE.md). Nothing in this schema knows what any
-- field of study is, so a law student's rows and a mechanical engineer's rows are the same
-- shape and are written by the same rule.

create table if not exists public.learner_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What sort of fact this is. Deliberately four, and deliberately not "anything":
  --   subject     what they are studying, as a subject
  --   deadline    something with a date attached (an exam, a submission)
  --   preference  how they have asked to be taught
  --   context     who they are as a learner, where nothing above fits
  -- A free-text kind would become a dumping ground within a week, and the retrieval that
  -- feeds the model reads by kind.
  kind text not null check (kind in ('subject', 'deadline', 'preference', 'context')),

  -- 🔴 ONE SENTENCE, IN PLAIN LANGUAGE, WRITTEN TO BE READ BY THE LEARNER. The Settings
  -- screen prints this verbatim. The length cap is not storage thrift: a "sentence" that
  -- can run to a page is a transcript, and a transcript is the unreadable file above.
  statement text not null check (char_length(statement) between 1 and 400),

  -- When it stops being true. Non-null mainly for deadlines, so an exam that has passed
  -- can stop being mentioned without anyone deleting it. Enforced by the READ, never by a
  -- sweep, for the same reason web_search_cache does it that way.
  expires_at timestamptz,

  -- Where it was learned, so a learner asking "how do you know that?" can be answered.
  -- Nullable and NOT a foreign key: a canvas may be deleted, and losing the provenance is
  -- not a reason to lose the fact.
  source_canvas_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.learner_memory is
  'What Nemesis remembers about one learner across canvases, as plain sentences they can read and delete. Never a mirror of learner_evidence.';

alter table public.learner_memory enable row level security;

-- Owner-only, same posture as projects/conversations/saved_reports: `for all` covers
-- select/insert/update/delete in one policy.
--
-- 🔴 CLIENT-WRITABLE ON PURPOSE, UNLIKE web_search_cache. The learner must be able to
-- DELETE a line from their own browser without a server round-trip; a memory you can read
-- but not remove is worse than no memory screen at all.
drop policy if exists learner_memory_owner on public.learner_memory;
create policy learner_memory_owner on public.learner_memory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists learner_memory_user_idx
  on public.learner_memory (user_id, kind, created_at desc);
