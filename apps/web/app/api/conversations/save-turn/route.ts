import type {
  AskResponse,
  Citation,
  ConversationMessage,
  ConversationSummary,
  SaveConversationTurnRequest,
  SaveConversationTurnResponse,
} from "@pharmabro/shared";
import { adminClient, json, verifyBearer } from "@/lib/server";

interface StoredAnswerRow {
  id: string;
  question: string;
  answer: AskResponse;
}

interface ConversationRow {
  id: string;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

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

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const body = await req.json().catch(() => null) as SaveConversationTurnRequest | null;
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const answerId = typeof body?.answer_id === "string" ? body.answer_id.trim() : "";
    const requestedConversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";

    if (!question) return json({ error: "question required" }, 400);
    if (!answerId) return json({ error: "answer_id required" }, 400);

    const admin = adminClient();
    const { data: stored, error: answerError } = await admin
      .from("generated_answers")
      .select("id,question,answer")
      .eq("id", answerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (answerError) throw answerError;
    if (!stored) return json({ error: "answer not found" }, 404);

    const answer = (stored as StoredAnswerRow).answer;
    const conversation = requestedConversationId
      ? await getOwnedConversation(admin, requestedConversationId, user.id)
      : await createConversation(admin, user.id, question);

    if (!conversation) return json({ error: "conversation not found" }, 404);

    const nextOrdinal = await nextMessageOrdinal(admin, conversation.id);
    const citations = Array.isArray(answer.citations) ? answer.citations : [];
    const assistantContent = typeof answer.plain_english_summary === "string"
      ? answer.plain_english_summary
      : "Cited answer saved.";

    const { data: messages, error: messageError } = await admin
      .from("conversation_messages")
      .insert([
        {
          conversation_id: conversation.id,
          user_id: user.id,
          role: "user",
          ordinal: nextOrdinal,
          content: question,
          payload: {},
          citations: [],
        },
        {
          conversation_id: conversation.id,
          user_id: user.id,
          role: "assistant",
          ordinal: nextOrdinal + 1,
          content: assistantContent,
          answer_id: answerId,
          payload: answer,
          citations,
        },
      ])
      .select("id,conversation_id,role,ordinal,content,answer_id,payload,citations,created_at")
      .order("ordinal", { ascending: true });

    if (messageError) throw messageError;

    const { data: updated, error: updateError } = await admin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .eq("user_id", user.id)
      .select("id,title,status,created_at,updated_at")
      .single();

    if (updateError) throw updateError;

    return json({
      conversation: normalizeConversation(updated),
      messages: (messages ?? []).map(normalizeMessage),
    } satisfies SaveConversationTurnResponse);
  } catch (error) {
    console.error("conversation_save_turn_failed", error);
    return json({ error: "conversation_save_turn_failed" }, 500);
  }
}

async function getOwnedConversation(
  admin: ReturnType<typeof adminClient>,
  id: string,
  userId: string,
): Promise<ConversationSummary | null> {
  const { data, error } = await admin
    .from("conversations")
    .select("id,title,status,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeConversation(data) : null;
}

async function createConversation(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  question: string,
): Promise<ConversationSummary> {
  const { data, error } = await admin
    .from("conversations")
    .insert({ user_id: userId, title: cleanTitle(question) })
    .select("id,title,status,created_at,updated_at")
    .single();
  if (error) throw error;
  return normalizeConversation(data);
}

async function nextMessageOrdinal(admin: ReturnType<typeof adminClient>, conversationId: string): Promise<number> {
  const { data, error } = await admin
    .from("conversation_messages")
    .select("ordinal")
    .eq("conversation_id", conversationId)
    .order("ordinal", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.ordinal ?? 0) + 1;
}

function cleanTitle(value: string): string {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return "New chat";
  return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

function normalizeConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
    citations: Array.isArray(row.citations) ? row.citations as Citation[] : [],
    created_at: row.created_at,
  };
}
