import type { AskResponse, Citation } from "./answer.ts";

export type ConversationRole = "user" | "assistant";

export interface ConversationSummary {
  id: string;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: ConversationRole;
  ordinal: number;
  content: string;
  answer_id: string | null;
  payload: AskResponse | Record<string, unknown>;
  citations: Citation[];
  created_at: string;
}

export interface SaveConversationTurnRequest {
  conversation_id?: string | null;
  question: string;
  answer_id: string;
}

export interface SaveConversationTurnResponse {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
}
