-- Knowledge that outlives the document, and capabilities that outlive the canvas.
--
-- NOT YET APPLIED as of writing. Say so honestly and update this line when it lands: a header that
-- claims a table is live when it is not sends the next reader planning around a constraint that
-- does not exist, and one that claims the opposite is worse.
--
-- WHY TWO TABLES RATHER THAN ONE.
-- A knowledge object is something to KNOW; a learning objective is something to be able to DO with
-- it. `losartan <-> Cozaar` is one fact and several capabilities: produce the brand from the
-- generic, produce the generic from the brand, tell it apart from valsartan/Diovan. A learner
-- routinely demonstrates one and fails another, so a single row could only ever record an average
-- of skills that are not the same skill. Learner state attaches to the OBJECTIVE, which is why the
-- objective needs its own identity and its own row.
--
-- WHY THESE ARE PER-USER, NOT A SHARED GLOBAL DICTIONARY.
-- Every table in this schema is owned by `auth.uid() = user_id`, and that is the only RLS shape
-- verified end to end here. A globally shared table needs "anyone may insert, nobody owns", which
-- is exactly the shape that has previously refused 100% of writes while every unit test passed.
--
-- It would also leak. `statement` is taken verbatim from the learner's own document — "losartan —
-- Cozaar" is their glossary — so a world-readable row publishes one person's material to everyone
-- else. Per-user rows avoid that entirely.
--
-- 🔴 AND IT COSTS NOTHING WE NEED. The proof this exists for is ONE learner recognising their own
-- knowledge across two sessions; nothing requires convergence BETWEEN learners. Because the keys
-- are content-derived and identical for identical knowledge, going global later is a merge on
-- matching `identity_key` values rather than a re-derivation — the door stays open.
--
-- WHY IDENTITY IS A COLUMN AND NOT THE PRIMARY KEY.
-- Rows are referenced by uuid so a later identity-algorithm change does not have to rewrite every
-- foreign key in the database. `identity_key` carries its own version inside the string
-- (`association:v2:...`, `recall:v1:...`) precisely so rows made under old rules can be found.

-- ── knowledge ────────────────────────────────────────────────────────────────

create table if not exists public.knowledge_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Content-derived, order-independent, and carrying the version of the algorithm that made it.
  -- See apps/web/lib/learn/knowledge-identity.ts.
  identity_key text not null check (char_length(identity_key) <= 200),
  identity_version integer not null,
  -- One of the ten knowledge types. Deliberately NOT a CHECK constraint over all ten: only
  -- association is extracted today, and enumerating nine unreachable values would be a promise
  -- about payloads nobody has designed.
  type text not null check (char_length(type) <= 40),
  -- What the source called the relationship, from the grid's own column names. Null when the
  -- source named none — which means UNSTATED, never "no relationship".
  relation_kind text check (char_length(relation_kind) <= 200),
  -- One line naming what is to be known. 🔴 PRESENTATION ONLY: it is not part of identity, so
  -- rewording it must never orphan the evidence stored against this row.
  statement text not null default '' check (char_length(statement) <= 2000),
  -- The type-specific payload (an association's pair, later a causal chain) plus the durable
  -- CanonicalSourceAnchors it was extracted from. One column because these shapes are still moving.
  payload jsonb not null default '{}'::jsonb,
  -- Which extractor version produced this, so a corpus made under older rules can be redone.
  extraction_version text check (char_length(extraction_version) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 🔴 THE CONVERGENCE CONSTRAINT. Without it, the same fact met in a second document inserts a
-- second row, the objectives hanging off it get different ids, and evidence splits in half with
-- nothing able to notice — which is the entire failure this work exists to end.
create unique index if not exists knowledge_objects_identity_idx
  on public.knowledge_objects(user_id, identity_key);

alter table public.knowledge_objects enable row level security;

create policy knowledge_objects_owner_select on public.knowledge_objects
  for select using ((select auth.uid()) = user_id);
create policy knowledge_objects_owner_insert on public.knowledge_objects
  for insert with check ((select auth.uid()) = user_id);
create policy knowledge_objects_owner_update on public.knowledge_objects
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy knowledge_objects_owner_delete on public.knowledge_objects
  for delete using ((select auth.uid()) = user_id);

-- ── objectives ───────────────────────────────────────────────────────────────

create table if not exists public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- 🔴 A REAL FOREIGN KEY, NOT A TEXT COPY OF THE KNOWLEDGE KEY. Two representations of one
  -- relationship are two things that can disagree, and the disagreement would be invisible.
  knowledge_object_id uuid not null references public.knowledge_objects(id) on delete cascade,
  -- Derived from the knowledge identity plus the capability plus its parameters, so it inherits
  -- every semantic distinction the knowledge key already makes. See lib/learn/learning-objective.ts.
  identity_key text not null check (char_length(identity_key) <= 200),
  identity_version integer not null,
  -- Only `recall` is minted today. Not CHECK-constrained to a fixed list for the same reason as
  -- `type` above: a twelve-value ontology written before a second knowledge type has tested it
  -- would be eleven guesses.
  capability text not null check (char_length(capability) <= 40),
  -- `{ "inputRole": "generic", "outputRole": "brand" }` — what the learner is GIVEN and what they
  -- must PRODUCE, named as the source named its own columns.
  --
  -- 🔴 IDENTITY DESCRIBES THE CAPABILITY, NEVER A COLUMN POSITION. "Produce the brand, given the
  -- generic" is something a person can or cannot do. "Produce the right-hand value" is a fact about
  -- typesetting, and it means opposite things in a `Generic | Brand` glossary and a `Brand |
  -- Generic` revision sheet — one key for two opposite capabilities, with evidence for one
  -- direction silently credited to the other. With roles, both files converge correctly.
  --
  -- `{ "direction": ... }` is the weaker fallback, used ONLY when the source named no columns. Such
  -- rows already live in a separate identity space (their knowledge key carries `unstated`), so
  -- they cannot collide with role-bearing ones.
  parameters jsonb not null default '{}'::jsonb,
  -- Human-readable, presentation only, never part of identity.
  label text not null default '' check (char_length(label) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists learning_objectives_identity_idx
  on public.learning_objectives(user_id, identity_key);

-- The lookup the teaching policy makes: "what capabilities exist over this knowledge?"
create index if not exists learning_objectives_knowledge_idx
  on public.learning_objectives(knowledge_object_id);

alter table public.learning_objectives enable row level security;

create policy learning_objectives_owner_select on public.learning_objectives
  for select using ((select auth.uid()) = user_id);
create policy learning_objectives_owner_insert on public.learning_objectives
  for insert with check ((select auth.uid()) = user_id);
create policy learning_objectives_owner_update on public.learning_objectives
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy learning_objectives_owner_delete on public.learning_objectives
  for delete using ((select auth.uid()) = user_id);
