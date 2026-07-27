-- Security-advisor hardening (2026-07-24).
--
-- Closes the three findings from the Supabase security advisors that are BOTH real and
-- safe to change. Each one was verified against the live database before being written
-- here; the reasoning is recorded inline because two of them reverse an earlier decision.
--
-- Deliberately NOT changed (see the notes at the bottom): the 15 `SECURITY DEFINER`
-- lints (0028/0029), `pg_net` in the public schema, and the auth leaked-password
-- setting. Those are either intentional, unfixable from SQL, or higher-risk than the
-- finding they'd close.

-- ---------------------------------------------------------------------------
-- 1. join_waitlist: drop the anon grant. The waitlist form no longer exists.
-- ---------------------------------------------------------------------------
-- This REVERSES the emphatic "Do NOT fix it by revoking anon" comment in
-- 0121_waitlist.sql. That comment was correct when it was written: the PharmaOrb landing
-- page had a live email-capture form, and the anon grant was the whole point of the
-- endpoint. The product has since moved on and the form is gone. Verified 2026-07-24,
-- three independent ways:
--   * no source file in `landing/` references `join_waitlist` or renders an email input
--     (the only mentions left are README.md and .env.example, i.e. stale docs);
--   * the live site at enternemesis.com has no email field — both calls-to-action link
--     out to app.enternemesis.com/sign-up;
--   * public.waitlist holds 2 rows, newest 2026-06-10 — six weeks stale.
--
-- With no caller, the anon grant is a pure liability: an unauthenticated, unrate-limited
-- write endpoint. 0121 itself flagged that gap ("no rate limit yet — Cloudflare Turnstile
-- is a documented fast-follow; damage ceiling = junk rows"). Revoking closes it outright
-- instead of paying for Turnstile to protect a form that no longer exists, and it clears
-- advisor lint 0028 (the only anon-reachable SECURITY DEFINER function in the database).
--
-- `authenticated` goes too, for the same reason: the removed form was the only caller and
-- it ran as an anonymous visitor, so no signed-in code path ever reached this either. That
-- leaves `service_role` as the sole executor and clears lint 0029 for this function as well.
--
-- IF THE WAITLIST EVER COMES BACK, this is the one line to undo:
--   grant execute on function public.join_waitlist(text) to anon, authenticated;
-- The function body and signature are untouched, so restoring the grant fully restores
-- the old behaviour — including the deliberate no-enumeration-oracle design (returns
-- void, ON CONFLICT DO NOTHING) and the table's own email-shape CHECK.
revoke execute on function public.join_waitlist(text) from anon, authenticated;

comment on function public.join_waitlist is
  'Landing waitlist capture. ANON + AUTHENTICATED EXECUTE WERE REVOKED 2026-07-24 — the '
  'landing form was removed in the school-OS pivot, leaving this an uncalled '
  'unauthenticated write. service_role only. Retained (not dropped) so the 2 historical '
  'rows keep a documented writer. To bring the waitlist back: grant execute on function '
  'public.join_waitlist(text) to anon, authenticated. Returns void + ON CONFLICT DO '
  'NOTHING => no email-enumeration oracle.';

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on the two trigger functions that were missing it.
-- ---------------------------------------------------------------------------
-- Advisor lint 0011. Both are SECURITY INVOKER (so the blast radius is the calling user's
-- own privileges, not the owner's) and both bodies are one line: `new.updated_at := now()`.
-- Nothing here resolves through the search_path today, which is exactly why pinning it is
-- free — `now()` lives in pg_catalog, which stays implicitly searched even at `''`. This
-- forecloses the general shape of the attack (a caller putting a shadowing schema ahead of
-- public on their own search_path) rather than fixing a live exploit.
alter function public.library_documents_touch() set search_path = '';
alter function public.calendar_feeds_touch()   set search_path = '';

-- ---------------------------------------------------------------------------
-- 3. Revoke the latent anon/authenticated grants on three service-role-only tables.
-- ---------------------------------------------------------------------------
-- Supabase's default privileges hand `anon` and `authenticated` full DML on every new
-- table in `public`. For these three that was never intended — they are written only by
-- the backend under `service_role`.
--
-- WHY THIS CANNOT BREAK A WORKING PATH — this is a proof, not an expectation. All three
-- tables have RLS enabled with ZERO policies, which denies `anon` and `authenticated`
-- outright no matter what the grants say. So anything reaching these tables today is
-- necessarily `service_role`, which bypasses RLS and holds its own separate grant. There
-- is no caller for the privileges being removed. What this buys is defence in depth: if
-- someone later adds a policy to one of these tables by mistake, the missing grant is a
-- second lock that still holds.
--
-- `public.waitlist` is the pointed case — 0121_waitlist.sql asserts "the table grants anon
-- nothing, so emails can never be read back through PostgREST". That was not actually
-- true: the default privileges had granted anon SELECT (plus INSERT/UPDATE/DELETE/
-- TRUNCATE) all along, and only the RLS-with-no-policy layer was holding the line. This
-- makes the comment true as written.
--
-- The other four tables the advisor flagged for RLS-without-policy —
-- library_index_state, live_audio_reservations, ops_alerts, stripe_checkout_locks — were
-- checked and already carry no anon/authenticated grants. They need nothing.
revoke all on table public.source_enrichment   from anon, authenticated;
revoke all on table public.waitlist            from anon, authenticated;
revoke all on table public.watch_known_sources from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Findings intentionally left alone, so the next reader doesn't re-litigate them.
-- ---------------------------------------------------------------------------
-- * Lints 0028/0029, "SECURITY DEFINER function is executable" (15 hits). All 16 function
--   bodies were read. The five that touch user data (export_my_data, get_my_entitlements,
--   get_my_usage, get_watchlist_updates, report_answer) every one filter on auth.uid();
--   the rest return public reference data (drug labels, trials, PubMed, source chunks).
--   All have search_path pinned. These lints fire on EVERY SECURITY DEFINER function
--   reachable by a role — they are inventory, not defects. Revoking EXECUTE would break
--   callers (including the deployed nemesis-llm edge function, whose source is not in git)
--   to buy no security.
-- * Lint 0014, `pg_net` installed in public. Hygiene, not an exploit path. `ALTER
--   EXTENSION pg_net SET SCHEMA extensions` would break any `net.http_post` caller, and
--   the deployed edge functions can't be fully enumerated from git. Not worth it.
-- * auth_leaked_password_protection is a dashboard setting with no SQL or MCP surface.
--   Owner action: Authentication -> Policies -> enable "Leaked password protection".
