-- Versioned licence attestations for Layer 1 sources.
--
-- Owner ruling, 2026-08-23: "Do not create a second competing source table. `core_sources` remains
-- the canonical source identity. However, I do not want license history represented as one mutable
-- field if licenses can change."
--
-- An earlier draft of this work proposed a parallel `registry_sources` catalogue. That was rejected
-- and the rejection is right: two source catalogues is two answers to "what source is this", and
-- the second one is always the one that goes stale. So:
--
--     core_sources                    →  WHAT source is this?
--     core_source_license_versions    →  under WHAT VERIFIED CONDITIONS was this version approved?
--
-- 🔴 WHY A CHILD TABLE AND NOT MORE COLUMNS. A licence is a fact about a VERSION, not about a name,
-- and the two can both be true at once. Verified 2026-08-22 against the publishers' own pages:
-- OpenStax's older editions are CC BY and its current editions are CC BY-NC-SA. A Creative Commons
-- grant cannot be revoked, so the old edition stays commercially reusable for ever and the new one
-- never was. `core_sources.license` is a single mutable enum — it can hold one of those answers and
-- has nowhere to put the other, and whichever is written last silently reclassifies everything
-- already ingested under the first. That is not a hypothetical: 'openstax' is an existing value of
-- `core_source_provider` (0106_expand_core_source_providers.sql:21).
--
-- 🔴 `core_sources.license` IS NOT DEPRECATED BY THIS AND IS NOT TOUCHED. It keeps gating retrieval
-- exactly as it does today, including `core_sources_commercial_friendly_check`. This table is an
-- ADDITIONAL, stricter gate in front of CORPUS ingestion — the registries — and a source may sit in
-- `core_sources` for live retrieval while having no approved attestation here at all. Two gates that
-- answer two questions, not one gate written twice.
--
-- 🔴 NOTHING IS MIGRATED OR BACKFILLED. No existing row gains an attestation, because an attestation
-- is a claim that a named human read a named licence on a named date, and inventing 200 of those
-- from the enum already on the row would fill a table meant to hold VERIFIED facts with unverified
-- guesses wearing the same clothes. `20260806200000_course_identity.sql` refused a backfill for this
-- exact reason and the reasoning generalises. Every row here is created by a person.
--
-- Owner approved the design on 2026-08-23. 🔴 NOT YET APPLIED — see the PROVED line below.
--
-- PROVED: <fill in after `supabase db push`, from a run under `role authenticated` showing that a
--          non-service-role session can SELECT and cannot INSERT>

-- ---------------------------------------------------------------- source role

-- 🔴 WHICH QUESTION A SOURCE IS ALLOWED TO ANSWER. `curriculum_seed` material may be built FROM;
-- `ontology` supplies concept identity and terminology and NEVER pedagogical order; `structured_data`
-- is what a renderer draws from (a PDB accession, a PubChem record).
--
-- 🔴 `alignment_target` IS DELIBERATELY ABSENT FROM THIS LIST, AND ITS ABSENCE IS THE RULING.
-- AP, NCLEX, USMLE, NAPLEX, CPA, CFA and ABET publish outlines so candidates can study from them.
-- Published is not licensed. Those frameworks may be READ to ask "does our General Chemistry
-- curriculum broadly cover what AP Chemistry expects" and their wording and arrangement may never
-- enter the corpus — so there is nothing about one to store, and `core_sources` could not hold one
-- anyway: `core_sources_commercial_friendly_check` (0101) refuses any row that is not commercially
-- usable, which is precisely what these are. The refusal lives in `licensed-source.ts`, which knows
-- the role by name and rejects it; a storage location arrives with the coverage audit that reads it,
-- and not before. A column value nothing may hold is the dead architecture this work keeps cutting.
alter table core_sources
  add column if not exists source_role text;

alter table core_sources
  drop constraint if exists core_sources_role_known;
alter table core_sources
  add constraint core_sources_role_known
  check (source_role is null or source_role in ('curriculum_seed', 'ontology', 'structured_data'));

comment on column core_sources.source_role is
  'What this source may be used FOR. NULL on every row written before 2026-08-23, which reads as UNKNOWN and never as permitted — the registries require a non-null role plus an approved licence attestation.';

-- ------------------------------------------------- licence version attestations

create table if not exists public.core_source_license_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references core_sources(id) on delete cascade,

  -- 🔴 SPDX-STYLE AND EXACT, NOT THE COARSE ENUM. `core_sources.license` holds `cc_by`, which cannot
  -- distinguish CC BY 3.0 from CC BY 4.0 and — far worse — sits one careless edit away from `cc_by`
  -- meaning a `cc_by_nc` source. This column holds the identifier the licence page actually names,
  -- and it is the string `isReusableLicence()` in apps/web/lib/learn/visual-provenance.ts checks by
  -- EXACT match. That predicate is shared with the image ladder so there is one allow list, and
  -- `reference-images.ts` records why an exact match rather than a prefix: `startsWith("CC BY")`
  -- admits `CC BY-NC`, which is the licence that ends this product's commercial use.
  license_name text not null check (char_length(trim(license_name)) > 0),
  license_version text,

  -- The four rights, recorded rather than derived from the name. A future licence this schema has
  -- never heard of still has answers to these four questions.
  commercial_use boolean not null,
  derivatives boolean not null,
  attribution_required boolean not null,
  share_alike boolean not null,

  -- 🔴 THE CREDIT LINE ITSELF, WHICH IS THE COLUMN `core_sources` HAS NEVER HAD. Line 54 of 0101 is
  -- `attribution_required BOOLEAN` — it records THAT credit is owed and has nowhere to put WHAT it
  -- says. §42 of docs/canvas-product-contract.md requires the opposite: "the credit always exists to
  -- display at the moment the picture is shown. A licence stored in a database and never rendered is
  -- a record of a promise nobody kept." A boolean alone is exactly that record.
  attribution_text text,

  -- 🔴 WHICH EDITION, SNAPSHOT OR RELEASE WAS READ. Required for an approved row (see the CHECK
  -- below). Without it "OpenStax Chemistry" names two incompatible licences at once and the corpus
  -- has to be thrown away rather than re-checked.
  source_version text,

  -- 🔴 WHEN A HUMAN READ IT, AND WHERE. Not when a crawler ran — nothing crawls into this table.
  -- `verification_url` must be the page carrying the licence for THIS file or edition, never the
  -- publisher's general reuse policy: "A REPOSITORY NAME IS NOT A LICENCE" (§42).
  verified_at timestamptz not null default now(),
  verification_url text,

  -- SHA-256 of the terms text as read, so a silent change to a licence page is detectable rather
  -- than a matter of memory. Nullable: some sources state terms in a way that has no stable text.
  terms_hash text,

  status text not null default 'review'
    check (status in ('approved', 'review', 'blocked')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One attestation per source per licence per edition. A second reading of the same three is an
  -- UPDATE, not a new row, or "which one is current" has no answer.
  unique (source_id, license_name, source_version)
);

-- 🔴 THE GATE, IN SQL, FOR THE THREE THINGS SQL CAN ACTUALLY EXPRESS. Everything else lives in
-- `admitSource` in apps/web/lib/learn/licensed-source.ts, and is NOT duplicated here: two
-- hand-maintained copies of one rule in two languages is the drift this codebase keeps paying for.
-- What SQL keeps is only what TypeScript cannot enforce about a row written by any other client.
alter table public.core_source_license_versions
  drop constraint if exists core_source_license_versions_approved_is_usable;
alter table public.core_source_license_versions
  add constraint core_source_license_versions_approved_is_usable
  check (
    status <> 'approved'
    or (
      -- Nemesis is a paid product, so a non-commercial licence can never be approved. Verified
      -- 2026-08-22: OpenStax, MIT OpenCourseWare and WHO publications are all CC BY-NC-SA, and MIT's
      -- terms name this product's exact shape — "a commercial education business cannot offer
      -- courses based on OCW materials if students pay fees and the business intends to profit".
      commercial_use = true
      -- Ingest chunks, normalises and re-expresses text. That is a derivative work, so ND is out.
      and derivatives = true
      -- A credit line that was never recorded could never be rendered.
      and (attribution_required = false or coalesce(trim(attribution_text), '') <> '')
      -- An approved row with no edition names nothing checkable.
      and coalesce(trim(source_version), '') <> ''
    )
  );

-- At most one APPROVED attestation per source per edition. Two would make "may we ingest this"
-- depend on row order.
create unique index if not exists core_source_license_versions_one_approved_idx
  on public.core_source_license_versions (source_id, source_version)
  where status = 'approved';

create index if not exists core_source_license_versions_source_idx
  on public.core_source_license_versions (source_id, status);

create or replace function public.core_source_license_versions_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists core_source_license_versions_touch on public.core_source_license_versions;
create trigger core_source_license_versions_touch
  before update on public.core_source_license_versions
  for each row execute function public.core_source_license_versions_touch_updated_at();

-- ------------------------------------------------------------------------ RLS
--
-- Same posture as `core_sources` (0101:144-162): global ground truth, readable by any signed-in
-- user, written only by service role. 🔴 AND THE REVOKE/GRANT BLOCK 0101 DOES NOT HAVE.
-- 20260724200000 records that Supabase's defaults hand `anon` and `authenticated` full DML at the
-- GRANT layer, so RLS with no policy is the only thing standing in the way — correct, but one
-- accidental permissive policy away from a corpus any user can rewrite.

alter table public.core_source_license_versions enable row level security;

drop policy if exists core_source_license_versions_read on public.core_source_license_versions;
create policy core_source_license_versions_read on public.core_source_license_versions
  for select to authenticated using (true);

-- No insert/update/delete policy: denied by default for `authenticated`. service_role bypasses RLS.
revoke all on public.core_source_license_versions from anon, authenticated;
grant select on public.core_source_license_versions to authenticated;

comment on table public.core_source_license_versions is
  'Verified licence attestations per source per edition. A row is a claim that a named human read a named licence on a named date. Nothing is backfilled; every row is created by a person. Approved rows are the only ones the registry ingest gate will accept.';
