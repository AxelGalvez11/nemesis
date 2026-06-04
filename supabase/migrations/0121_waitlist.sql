-- 0121 — Waitlist (PharmaOrb landing page). A public, pre-launch email capture for the
-- waitlist / beta. The landing site is the ONLY writer and it has NO direct table access:
-- the single anon-reachable surface is join_waitlist(), a SECURITY DEFINER RPC that inserts
-- ON CONFLICT DO NOTHING and returns VOID. That is deliberate —
--   * returning void (not "did a row insert") denies an email-enumeration oracle;
--   * routing through the RPC (vs a direct anon RLS INSERT) avoids the 23505 unique-
--     violation error that would ALSO leak whether an email already exists;
--   * the table grants anon nothing, so emails can never be read back through PostgREST.
--
-- join_waitlist is INTENTIONALLY anon-EXECUTE — the OPPOSITE of the authenticated-only
-- RPCs in 0114/0119/0120. Do NOT "fix" it by revoking anon (see memory
-- `pharmabro-supabase-anon-default-grant`): it is a public endpoint by design. The
-- server-side email-shape CHECK + ON CONFLICT are the real gate (no rate limit yet —
-- Cloudflare Turnstile is a documented fast-follow; damage ceiling = junk rows). ADD
-- Turnstile + per-IP rate-limiting BEFORE any outbound email is ever wired to an insert
-- here (a confirmation / welcome mail on insert would turn this unbounded public write into
-- a spam-amplification vector). Email-only by design (no IP / user-agent) to hold the
-- project's data-minimization posture.

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text not null default 'landing',
  created_at  timestamptz not null default now(),
  constraint waitlist_email_shape check (
    char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

-- Case-insensitive uniqueness without depending on the citext extension.
create unique index if not exists waitlist_email_lower_idx
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;
-- No policies + no anon/authenticated table grants ⇒ the table is unreachable except
-- through the SECURITY DEFINER RPC below (which runs as owner and bypasses RLS).

create or replace function public.join_waitlist(p_email text)
returns void
language sql volatile security definer
set search_path = public, extensions
as $$
  insert into public.waitlist (email)
  values (trim(p_email))
  on conflict (lower(email)) do nothing;
$$;

-- Public endpoint BY DESIGN: revoke from PUBLIC (so it isn't granted to every role) but
-- explicitly GRANT to anon + authenticated — this is the intended waitlist surface.
revoke execute on function public.join_waitlist(text) from public;
grant  execute on function public.join_waitlist(text) to anon, authenticated;

comment on function public.join_waitlist is
  'PharmaOrb landing waitlist capture. INTENTIONALLY anon-executable (public endpoint). Returns void + ON CONFLICT DO NOTHING ⇒ no email-enumeration oracle. Inserts through the table CHECK; email-only.';
