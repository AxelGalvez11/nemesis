"use client";

// Notebook detail — switches between the project home (no chat open) and the full chat view (a chat
// open). Both read the shared store; `activeChatId` is the toggle. Thin by design; the two views own
// their own layout.

import { NotebookChatView } from "./notebook-chat-view";
import { NotebookHome } from "./notebook-home";
import { useNotebooks } from "./notebooks-store";

export function NotebookDetail() {
  const { selected, activeChatId } = useNotebooks();
  if (!selected) return null;
  return activeChatId ? <NotebookChatView /> : <NotebookHome />;
}
