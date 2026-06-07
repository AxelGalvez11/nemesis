import type { ConversationSummary } from "@pharmabro/shared";
import { adminClient, json, verifyBearer } from "@/lib/server";

interface ConversationRow {
  id: string;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export async function GET(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const { data, error } = await adminClient()
      .from("conversations")
      .select("id,title,status,created_at,updated_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) throw error;
    return json((data ?? []).map(normalizeConversation));
  } catch (error) {
    console.error("conversations_list_failed", error);
    return json({ error: "conversations_list_failed" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const user = await verifyBearer(req);
    if (!user) return json({ error: "authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? cleanTitle(body.title) : "New chat";

    const { data, error } = await adminClient()
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id,title,status,created_at,updated_at")
      .single();

    if (error) throw error;
    return json(normalizeConversation(data), 201);
  } catch (error) {
    console.error("conversation_create_failed", error);
    return json({ error: "conversation_create_failed" }, 500);
  }
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
