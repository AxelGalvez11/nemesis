"use client";

// The full chat view inside a notebook (Claude's in-project chat): a "Notebook / Chat" breadcrumb, the
// transcript, and the composer — no right rail. Reads the active chat from the store and sends turns
// through the cloud-backed orchestrator. Preview builds return a canned reply.

import { useCallback, useMemo } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { Codicon } from "@/components/desktop-ui/codicon";
import { notebookChatStore, sendNotebookTurn, useNotebookChat, type NotebookWireSource } from "@/lib/notebooks/chat";

import { NotebookComposer } from "./notebook-composer";
import { NotebookTranscript } from "./notebook-transcript";
import { useNotebooks } from "./notebooks-store";

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat about this notebook.";

export function NotebookChatView() {
  const { session } = useAuth();
  const preview = Boolean(useWorkspacePreview());
  const uid = preview ? "preview-user" : (session?.user.id ?? null);

  const { selected, activeChatId, chats, sources, backToHome } = useNotebooks();
  const { messages, working } = useNotebookChat(activeChatId);

  const wireSources: NotebookWireSource[] = useMemo(
    () => sources.map((s) => ({ name: s.name, content: s.content })),
    [sources],
  );

  const instructions = selected?.instructions ?? null;
  const notebookId = selected?.id ?? null;

  const submit = useCallback(
    (text: string) => {
      if (!activeChatId || !notebookId) return;
      if (preview) {
        notebookChatStore.append(activeChatId, { role: "user", content: text, at: new Date().toISOString() });
        notebookChatStore.setWorking(activeChatId, true);
        window.setTimeout(() => {
          notebookChatStore.append(activeChatId, { role: "assistant", content: PREVIEW_REPLY, at: new Date().toISOString() });
          notebookChatStore.setWorking(activeChatId, false);
        }, 600);
        return;
      }
      if (!uid) {
        notebookChatStore.append(activeChatId, { role: "assistant", content: "Sign in to chat about this notebook.", at: new Date().toISOString() });
        return;
      }
      void sendNotebookTurn({ uid, notebookId, chatId: activeChatId, instructions, sources: wireSources, userText: text });
    },
    [activeChatId, notebookId, preview, uid, instructions, wireSources],
  );

  if (!selected || !activeChatId) return null;
  const chat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 px-6 pb-2 pt-[calc(var(--titlebar-height)+1rem)] text-[0.85rem]">
        <button
          type="button"
          onClick={backToHome}
          className="max-w-[16rem] truncate rounded-md px-1.5 py-0.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
        >
          {selected.name}
        </button>
        <Codicon name="chevron-right" size="0.7rem" className="shrink-0 text-(--ui-text-quaternary)" />
        <span className="max-w-[20rem] truncate font-medium text-foreground">{chat?.title ?? "New chat"}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
        <NotebookTranscript messages={messages} working={working} />
        <div className="shrink-0 pb-5 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <NotebookComposer onSubmit={submit} working={working} autoFocus placeholder={`Message ${selected.name}…`} />
          </div>
        </div>
      </div>
    </div>
  );
}
