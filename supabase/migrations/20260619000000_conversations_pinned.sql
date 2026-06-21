-- Pin chats to the top of the rail history. Additive + non-breaking: existing rows default to
-- false, and the existing select ("id,title,updated_at") is unaffected until the frontend opts in.
-- The conversations_update_own RLS policy already scopes updates to the owner, so toggling `pinned`
-- needs no new policy.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Rail history sorts pinned-first, then most-recent — index that ordering (small per-user lists, but
-- keeps the order index-backed alongside the existing user_id/updated_at index).
CREATE INDEX IF NOT EXISTS conversations_user_pinned_updated_idx
  ON conversations (user_id, pinned DESC, updated_at DESC);

COMMENT ON COLUMN conversations.pinned IS
  'User pinned this chat to the top of the rail history (default false).';
