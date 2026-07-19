"use client";

// The message list for a notebook chat. User turns are rounded bubbles; assistant turns render as
// markdown. Auto-scrolls to the newest message. Presentational only — the chat view owns the data.

import { useEffect, useRef } from "react";

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import type { SessionMessage } from "@/lib/notebooks/chat";
import { cn } from "@/lib/utils";

interface NotebookTranscriptProps {
  messages: SessionMessage[];
  working: boolean;
  emptyHint?: string;
}

export function NotebookTranscript({ messages, working, emptyHint }: NotebookTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, working]);

  return (
    <div ref={scrollRef} className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1 py-4">
      {messages.length === 0 ? (
        <div className="grid flex-1 place-items-center px-4 text-center text-[0.9rem] text-(--ui-text-tertiary)">
          {emptyHint ?? "Ask about this notebook — it knows your instructions and the sources you added."}
        </div>
      ) : (
        messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "min-w-0 text-[0.95rem] leading-relaxed",
              m.role === "user"
                ? "self-end max-w-[85%] rounded-[1.75rem] bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] px-4 py-2.5 text-foreground"
                : "max-w-full text-foreground",
            )}
          >
            {m.role === "user" ? (
              <span className="whitespace-pre-wrap break-words">{m.content}</span>
            ) : (
              <AssistantMarkdown text={m.content} />
            )}
          </div>
        ))
      )}
      {working && <div className="mx-auto w-full max-w-3xl text-[0.85rem] text-(--ui-text-tertiary)">Thinking…</div>}
    </div>
  );
}
