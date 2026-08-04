"use client";

// The Explain side chat (owner 2026-08-04): "make the explain bubble appear to
// the right of the flashcard or test", "make it have a pulse for thinking",
// "make it be a dynamic answer not hardcoded format", "the explain should be
// like a mini side chat." One component serves both players: it opens seeded
// with the current card or question, streams the first explanation, and then
// takes follow-up questions like a tutor sitting beside the student.
//
// Transcripts cache per item (the parent owns the Map so it survives the
// panel unmounting) — reopening the same card never bills twice; asking a
// follow-up is a deliberate new call.

import { IconArrowUp, IconSparkles, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { explainSeedMessages } from "@/lib/workspace/study-ai-extras";
import type { WireMsg } from "@/lib/workspace/chat-api";
import { cn } from "@/lib/utils";

export interface ExplainTurn {
  role: "assistant" | "user";
  text: string;
}

interface ExplainChatProps {
  /** One transcript per item — card id or `${artifactId}:${questionIndex}`. */
  contextKey: string;
  /** What the coach is looking at, from explainCardContext / explainQuestionContext. */
  context: string;
  cache: Map<string, ExplainTurn[]>;
  onClose: () => void;
  previewMode: boolean;
  userId: string | null;
  className?: string;
}

/** Three quiet dots that breathe while the model thinks. */
function ThinkingPulse() {
  return (
    <span aria-label="Thinking" className="flex items-center gap-1 py-1" data-testid="explain-pulse" role="status">
      {[0, 1, 2].map((dot) => (
        <span
          className="size-1.5 animate-pulse rounded-full bg-(--ui-text-tertiary)"
          key={dot}
          style={{ animationDelay: `${dot * 220}ms`, animationDuration: "1.1s" }}
        />
      ))}
    </span>
  );
}

/** A believable stand-in for /dev-preview, shaped like a real answer rather
 *  than a template — the point of the feature is that answers vary. */
function previewAnswer(context: string, followUp: string | null): string {
  if (followUp) {
    return `Good question. ${followUp.replace(/\?+$/, "")} comes down to the same relationship the item tests — trace it one step at a time and the answer falls out.`;
  }
  const firstLine = context.split("\n")[0]?.replace(/^[A-Za-z ]+: /, "") ?? "this idea";
  return `The heart of it: ${firstLine}\n\nWork from what the item gives you toward the answer one step at a time, and notice which step the item is really testing — that step is the one worth remembering. Ask a follow-up if any link in the chain feels loose.`;
}

export function ExplainChat({ cache, className, context, contextKey, onClose, previewMode, userId }: ExplainChatProps) {
  const [turns, setTurns] = useState<ExplainTurn[]>(() => cache.get(contextKey) ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const keyRef = useRef(contextKey);
  keyRef.current = contextKey;

  // Follow the transcript as it grows or streams.
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns, streamText, busy]);

  const seeded = useRef(new Set<string>());
  const ask = useMemo(() => {
    return async (followUp: string | null, history: ExplainTurn[]) => {
      const key = contextKey;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setStreamText("");
      setError(null);
      try {
        let text: string;
        if (previewMode) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          text = previewAnswer(context, followUp);
        } else {
          if (!userId) throw new Error("Sign in to use AI explanations.");
          const wire: WireMsg[] = [
            ...explainSeedMessages(context),
            ...history.map((turn) => ({ content: turn.text, role: turn.role }) as WireMsg),
            ...(followUp ? [{ content: followUp, role: "user" } as WireMsg] : []),
          ];
          const reply = await postChatCompletion(userId, wire, {
            decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
            onDelta: (_delta, accumulated) => {
              if (keyRef.current === key) setStreamText(accumulated);
            },
            signal: controller.signal,
          });
          if (!reply.text) throw new Error(reply.errorText ?? "The engine couldn't explain this. Try again.");
          text = reply.text;
        }
        if (keyRef.current !== key) return;
        const nextTurns: ExplainTurn[] = [...history, ...(followUp ? [{ role: "user", text: followUp } as ExplainTurn] : []), { role: "assistant", text }];
        cache.set(key, nextTurns);
        setTurns(nextTurns);
      } catch (cause) {
        if (controller.signal.aborted || keyRef.current !== key) return;
        setError(cause instanceof Error ? cause.message : "Couldn't explain this. Try again.");
      } finally {
        if (keyRef.current === key) {
          setBusy(false);
          setStreamText("");
        }
      }
    };
  }, [cache, context, contextKey, previewMode, userId]);

  // A new item under the panel: show its cached transcript, or seed a fresh
  // one exactly once per item per sitting.
  useEffect(() => {
    const cached = cache.get(contextKey) ?? [];
    setTurns(cached);
    setDraft("");
    setError(null);
    setStreamText("");
    if (cached.length === 0 && !seeded.current.has(contextKey)) {
      seeded.current.add(contextKey);
      void ask(null, []);
    }
    return () => abortRef.current?.abort();
  }, [ask, cache, contextKey]);

  function sendFollowUp() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    // Optimistically show the question while the answer streams.
    setTurns((current) => [...current, { role: "user", text }]);
    void ask(text, turns);
  }

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-(--ui-stroke-secondary) bg-[rgb(250_250_250)] dark:bg-[rgb(26_26_28)]",
        className,
      )}
      data-testid="explain-panel"
      // The flashcard player binds Space/Enter/1-4 on window; nothing typed or
      // pressed inside this panel may double as a reveal or a grade.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 border-b border-(--ui-stroke-tertiary) py-2 pl-3.5 pr-2">
        <IconSparkles className="shrink-0 text-(--ui-text-tertiary)" size={13} />
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Explain</span>
        <Button aria-label="Close explanation" className="ml-auto" onClick={onClose} size="icon-xs" type="button" variant="ghost">
          <IconX />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3" ref={scrollRef}>
        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <p className="ml-6 rounded-xl bg-black/[0.05] px-3 py-1.5 text-[0.8125rem] leading-relaxed dark:bg-white/[0.07]" key={index}>
              {turn.text}
            </p>
          ) : (
            <AssistantMarkdown className="text-[0.8125rem] leading-relaxed" htmlSubSup key={index} obsidianUnderline singleDollarMath text={turn.text} />
          ),
        )}
        {busy && (streamText
          ? <AssistantMarkdown className="text-[0.8125rem] leading-relaxed" htmlSubSup obsidianUnderline singleDollarMath text={streamText} />
          : <ThinkingPulse />)}
        {error && (
          <div className="space-y-1.5">
            <p className="text-xs text-destructive" role="alert">{error}</p>
            <Button onClick={() => void ask(null, turns)} size="sm" type="button" variant="outline">Try again</Button>
          </div>
        )}
      </div>
      <form
        className="flex items-center gap-1.5 border-t border-(--ui-stroke-tertiary) py-2 pl-3.5 pr-2"
        onSubmit={(event) => {
          event.preventDefault();
          sendFollowUp();
        }}
      >
        <input
          aria-label="Ask a follow-up"
          className="min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none placeholder:text-(--ui-text-quaternary)"
          data-testid="explain-input"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up…"
          value={draft}
        />
        <Button aria-label="Send" disabled={busy || draft.trim().length === 0} size="icon-xs" type="submit" variant="ghost">
          <IconArrowUp />
        </Button>
      </form>
    </aside>
  );
}
