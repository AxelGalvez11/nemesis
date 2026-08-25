-- A diagram is read once, ever.
--
-- Owner 2026-08-25: *"I need image occlusion and diagrams to come clean and quick."*
--
-- 🔴🔴 QUICK IS THE PROBLEM THIS TABLE SOLVES, AND THE NUMBERS SAY WHY. Producing one occlusion
-- question costs a repository search (up to 8s), an image download (up to 10s) and a vision read
-- (up to 38s). Measured in production, "neuron" took long enough to return 504. No amount of
-- tuning makes that feel instant, because the work genuinely takes that long.
--
-- But it is the SAME work every time. "nephron" resolves to one Commons diagram, and that diagram
-- has the same labelled parts in the same places today as it will next week. The second learner to
-- ask about a nephron should pay nothing, and neither should the first one asking a second time.
--
-- 🔴 SHARED ACROSS THE WHOLE PRODUCT, NOT PER LEARNER, because what it holds is not personal: a
-- public picture, its licence, and where its printed labels sit. Keying it per user would make
-- every learner pay the first-read cost of every subject, which is the entire cost this exists to
-- avoid — and would store the same public fact once per account.
--
-- 🔴 NO RLS POLICY, AND THAT IS DELIBERATE. RLS is enabled with no policy, so the anon and
-- authenticated roles can read nothing; only the service role reaches it, and only from the route.
-- A client that could read this table could enumerate what everyone is studying.
--
-- 🔴 A MISS AND A REFUSAL ARE BOTH CACHED. "this subject has no usable diagram" is just as
-- expensive to discover as a hit, and far more common — most subjects are not labelled diagrams.
-- Caching only successes would mean every hopeless subject paid full price forever. `ok` carries
-- which happened.

create table if not exists public.figure_occlusion_cache (
  -- The learner-facing subject, lowercased and collapsed. See `cacheKey` in the route.
  subject text primary key,
  ok boolean not null,
  -- Why not, when ok is false. Null on a hit.
  reason text,
  -- The exact URL the masks were measured against, and must be displayed at.
  asset_path text,
  width integer,
  height integer,
  -- Vision's boxes, as fractions: [{label, x, y, w, h}]
  boxes jsonb,
  licence jsonb,
  caption text,
  created_at timestamptz not null default now(),
  -- Bumped on every serve, so a later pass can see what is worth keeping warm.
  hits integer not null default 0
);

alter table public.figure_occlusion_cache enable row level security;

-- 🔴 STALENESS IS HANDLED BY AGE, NOT BY INVALIDATION. There is nothing to invalidate against:
-- Commons files change rarely and silently, and we would have to re-read a picture to discover it
-- had changed, which is the cost being avoided. An age index lets a refusal be retried sooner than
-- a hit is re-read.
create index if not exists figure_occlusion_cache_age_idx
  on public.figure_occlusion_cache (created_at desc);

comment on table public.figure_occlusion_cache is
  'One vision read per diagram subject, shared across all learners. Service role only.';
