-- Persist user-owned web app conversations for the public beta Ask surface.

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC);

CREATE TRIGGER conversations_updated_at_trigger
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION core_sources_set_updated_at();

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  ordinal integer NOT NULL,
  content text NOT NULL,
  answer_id uuid REFERENCES generated_answers(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, ordinal)
);

CREATE INDEX IF NOT EXISTS conversation_messages_conversation_idx
  ON conversation_messages (conversation_id, ordinal);

CREATE INDEX IF NOT EXISTS conversation_messages_answer_idx
  ON conversation_messages (answer_id)
  WHERE answer_id IS NOT NULL;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select_own ON conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY conversations_insert_own ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY conversations_update_own ON conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY conversations_delete_own ON conversations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY conversation_messages_select_own ON conversation_messages
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_messages_insert_own ON conversation_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_messages_update_own ON conversation_messages
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_messages_delete_own ON conversation_messages
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE conversations IS
  'User-owned saved chat headers for the public web Ask experience.';

COMMENT ON TABLE conversation_messages IS
  'Ordered user and assistant messages saved under a conversation.';
