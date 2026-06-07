import type { ConversationMessage } from "@pharmabro/shared";
import { adminClient, json, verifyBearer } from "@/lib/server";

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  ordinal: number;
  content: string;
  answer_id: string | null;
  payload: Record<string, unknown>;
  citations: unknown;
  created_at: string;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const { id } = await context.params;
    const admin = adminClient();
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return json({ error: "conversation not found" }, 404);

    const { data, error } = await admin
      .from("conversation_messages")
      .select("id,conversation_id,role,ordinal,content,answer_id,payload,citations,created_at")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .order("ordinal", { ascending: true });

    if (error) throw error;
    return json((data ?? []).map(normalizeMessage));
  } catch (error) {
    console.error("conversation_messages_failed", error);
    return json({ error: "conversation_messages_failed" }, 500);
  }
}

function normalizeMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    ordinal: row.ordinal,
    content: row.content,
    answer_id: row.answer_id,
    payload: row.payload ?? {},
    citations: Array.isArray(row.citations) ? row.citations as ConversationMessage["citations"] : [],
    created_at: row.created_at,
  };
}
