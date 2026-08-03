"use client";

// Assistant message row — desktop src/components/assistant-ui/thread/assistant-message.tsx
// (shell spec §B5), v1: ActivityStrip (live + settled) + markdown prose +
// error card + footer with a Copy button only (no branch picker, no refresh,
// no overflow menu — not in the C1 scope).

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Tip } from "@/components/desktop-ui/tooltip";
import { citationDomains, faviconUrl } from "@/lib/favicon";
import type { ChatErrorKind } from "@/lib/workspace/chat-api";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import type { SessionMessage, SessionSource } from "@/lib/workspace/sessions-store";

import { ActivityStrip } from "./activity-strip";
import { OutputCard } from "./output-card";

export interface TurnError {
  text: string;
  kind: ChatErrorKind;
}

interface AssistantMessageProps {
  message: SessionMessage | null;
  animateReveal?: boolean;
  pending: boolean;
  liveSeconds: number | null;
  /** Live thinking-strip copy while pending; null = the plain shimmer. */
  activity?: string | null;
  durationSeconds: number | null;
  error: TurnError | null;
  onOpenSources?: () => void;
}

export function AssistantMessage({ message, animateReveal = false, pending, liveSeconds, activity = null, durationSeconds, error, onOpenSources }: AssistantMessageProps) {
  if (!message && !pending && !error) return null;

  const visibleText = message?.content || null;

  return (
    <div
      className={animateReveal
        ? "group flex w-full min-w-0 max-w-full animate-in flex-col gap-0 self-start overflow-hidden fade-in-0 duration-500"
        : "group flex w-full min-w-0 max-w-full flex-col gap-0 self-start overflow-hidden"}
      data-role="assistant"
      data-slot="aui_assistant-message-root"
      data-streaming={pending ? "true" : undefined}
    >
      <div
        className="wrap-anywhere min-w-0 max-w-full overflow-hidden text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground"
        data-slot="aui_assistant-message-content"
      >
        {!pending && <ActivityStrip placement="header" seconds={durationSeconds} />}
        {visibleText && <AssistantMarkdown sources={message?.sources} text={visibleText} />}
        {message?.outputs && message.outputs.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {message.outputs.map((output) => <OutputCard key={output.id} output={output} />)}
          </div>
        )}
        {pending && <ActivityStrip label={activity} placement="live" seconds={liveSeconds} />}
        {error && <AssistantErrorRow error={error} />}
      </div>
      {visibleText && <AssistantFooter onOpenSources={onOpenSources} sources={message?.sources ?? []} text={visibleText} />}
    </div>
  );
}

function AssistantErrorRow({ error }: { error: TurnError }) {
  if (error.kind === "budget") {
    return (
      <div className="mt-2 flex items-start gap-3 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-card) p-4">
        <Codicon className="mt-0.5 shrink-0 text-(--ui-text-tertiary)" name="warning" size="1rem" />
        <div>
          <p className="text-sm font-medium">Today&rsquo;s AI allowance is used up</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-start gap-1.5 text-[0.78rem] leading-5 text-[color-mix(in_srgb,var(--dt-destructive)_78%,var(--ui-text-secondary))]">
      <Codicon className="mt-0.5 shrink-0" name="error" size="0.875rem" />
      <span>{error.text}</span>
    </div>
  );
}

function AssistantFooter({ text, sources, onOpenSources }: { text: string; sources: ReadonlyArray<SessionSource>; onOpenSources?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard unavailable (permissions/non-secure context) — no-op.
      });
  };

  return (
    <div className="flex min-h-6 flex-row items-center justify-between gap-2 pr-(--message-text-indent) pl-(--message-text-indent)">
      {sources.length > 0 && (
        <Button className="h-6 gap-1.5 rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-2.5 text-[0.6875rem] text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)" onClick={onOpenSources} size="xs" variant="ghost">
          {/* Stacked favicons of the real sources, ChatGPT-style, in place of the old generic icon + count. */}
          <span className="flex -space-x-1">
            {citationDomains(sources).slice(0, 3).map((host) => (
              // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
              <img alt="" className="size-3.5 rounded-full ring-1 ring-(--ui-bg-secondary)" key={host} src={faviconUrl(host)} />
            ))}
          </span>
          Sources
        </Button>
      )}
      <div
        className="relative flex flex-row items-center justify-end gap-2 py-1.5 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
        data-slot="aui_msg-actions"
      >
        {/* No <Tip> wrapper: Button tooltips every icon-sized button from its
            aria-label, and wrapping here too rendered it twice. */}
        <Button aria-label="Copy" onClick={handleCopy} size="icon-xs" variant="ghost">
          <Codicon name={copied ? "check" : "copy"} size="0.875rem" />
        </Button>
      </div>
    </div>
  );
}
