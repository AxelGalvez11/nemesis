"use client";

// Notebook chat panel — a compact chat scoped to one notebook. General mode ships now (the model
// sees the notebook's instructions + source titles via lib/notebooks/chat.ts); the grounded toggle
// renders but is disabled with a "Soon" affordance so the UI contract is stable for Phase 2 (RAG).
// Transcript + composer only; the surrounding detail pane (notebooks-main) owns the layout.

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Tip } from "@/components/desktop-ui/tooltip";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { notebookChatStore, sendNotebookTurn, useNotebookChat, type NotebookWireSource } from "@/lib/notebooks/chat";
import { cn } from "@/lib/utils";

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat about this notebook.";

interface NotebookChatPanelProps {
  notebookId: string;
  instructions: string | null;
  sources: NotebookWireSource[];
  uid: string | null;
  preview: boolean;
}

export function NotebookChatPanel({ notebookId, instructions, sources, uid, preview }: NotebookChatPanelProps) {
  const { messages, working, clear } = useNotebookChat(notebookId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, working]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || working) return;
    setDraft("");
    if (preview) {
      const now = new Date().toISOString();
      notebookChatStore.append(notebookId, { role: "user", content: text, at: now });
      notebookChatStore.setWorking(notebookId, true);
      window.setTimeout(() => {
        notebookChatStore.append(notebookId, { role: "assistant", content: PREVIEW_REPLY, at: new Date().toISOString() });
        notebookChatStore.setWorking(notebookId, false);
      }, 700);
      return;
    }
    if (!uid) {
      notebookChatStore.append(notebookId, { role: "assistant", content: "Sign in to chat about this notebook.", at: new Date().toISOString() });
      return;
    }
    void sendNotebookTurn({ uid, notebookId, instructions, sources, userText: text });
  }, [draft, working, preview, uid, notebookId, instructions, sources]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-chat-surface-background)">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-(--ui-bg-elevated) p-0.5 text-[0.7rem] font-medium">
          <span className="rounded-md bg-(--ui-control-active-background) px-2 py-0.5 text-foreground shadow-[inset_0_0_0_1px_var(--ui-stroke-tertiary)]">
            General
          </span>
          <Tip label="Coming soon — answers drawn only from this notebook's sources, with citations.">
            <span className="cursor-default rounded-md px-2 py-0.5 text-(--ui-text-quaternary)">Grounded · Soon</span>
          </Tip>
        </div>
        {messages.length > 0 && (
          <Button aria-label="Clear chat" onClick={clear} size="icon-xs" type="button" variant="ghost">
            <Codicon name="clear-all" size="0.8rem" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3">
        {messages.length === 0 ? (
          <div className="grid flex-1 place-items-center px-4 text-center text-xs text-(--ui-text-tertiary)">
            Ask about this notebook — it knows your instructions and which sources you added.
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "min-w-0 text-sm",
                m.role === "user"
                  ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-(--ui-control-active-background) px-3 py-2 text-foreground"
                  : "max-w-full text-foreground",
              )}
            >
              {m.role === "user" ? <span className="whitespace-pre-wrap break-words">{m.content}</span> : <AssistantMarkdown text={m.content} />}
            </div>
          ))
        )}
        {working && <div className="text-xs text-(--ui-text-tertiary)">Thinking…</div>}
      </div>

      <div className="shrink-0 border-t border-(--ui-stroke-tertiary) p-2">
        <div className="flex items-end gap-2 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1.5">
          <textarea
            className="min-h-8 max-h-40 flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about this notebook…"
            rows={1}
            value={draft}
          />
          <Button
            aria-label="Send"
            className="shrink-0"
            disabled={!draft.trim() || working}
            onClick={submit}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Codicon name="send" size="0.9rem" />
          </Button>
        </div>
      </div>
    </div>
  );
}
