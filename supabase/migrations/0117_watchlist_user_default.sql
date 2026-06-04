-- 0117 — make POST /watchlist match the frozen §8 contract body.
--
-- The frozen contract (IMPLEMENTATION_PLAN.md §8) is `POST /watchlist` with body
-- {item_type, item_ref, alert_types, frequency} — NO user_id (it is derived from
-- the caller's auth context). watchlist_items.user_id (0109) is NOT NULL with no
-- default, so a PostgREST insert of that exact body fails: the row has no user_id,
-- tripping both NOT NULL and the RLS WITH CHECK (auth.uid() = user_id).
--
-- The idiomatic Supabase fix is DEFAULT auth.uid(): the column fills from the JWT
-- claim in the request context, so the client sends the contract body and RLS still
-- guarantees a user can only create their OWN follows (WITH CHECK is unchanged). An
-- anon insert gets auth.uid() = null → NOT NULL rejects it (anon cannot follow).
-- This was never exercised before Phase 5 (no authenticated insert test existed in
-- Phase 2), so the gap surfaced at the AC7 gate.

ALTER TABLE watchlist_items ALTER COLUMN user_id SET DEFAULT auth.uid();

COMMENT ON COLUMN watchlist_items.user_id IS
  'Owner. DEFAULT auth.uid() so POST /watchlist (doc-11 body, no user_id) derives it from the JWT; RLS wl_owner WITH CHECK still pins it to the caller.';
