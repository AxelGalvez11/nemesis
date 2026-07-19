"use client";

// User bubble — desktop src/components/assistant-ui/thread/user-message.tsx
// (shell spec §B4), v1: sticky bubble, clamps to ~2 lines with a bottom mask
// fade, click toggles full expand. No inline edit, no checkpoint picker, no
// hover action button — not in the C1 scope.

import { useLayoutEffect, useRef, useState } from "react";

import type { SessionMessage } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

const USER_BUBBLE_BASE_CLASS =
  "composer-human-message relative flex w-fit min-w-0 max-w-[85%] self-end flex-col gap-1.5 overflow-y-auto rounded-[1.75rem] border bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] px-4 py-2.5 text-left";
const USER_BUBBLE_READ_CLASS =
  "cursor-pointer pr-9 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground/95 transition-colors border-(--ui-stroke-tertiary) hover:border-(--ui-stroke-secondary)";

export function UserMessage({ message }: { message: SessionMessage }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [message.content]);

  return (
    <div
      className="group/user-message sticky z-40 -mx-4 flex w-[calc(100%+2rem)] min-w-0 max-w-none flex-col items-stretch gap-0 self-end overflow-visible bg-(--ui-chat-surface-background) px-4 pb-(--conversation-turn-gap) pt-1"
      data-message-id={message.at}
      data-role="user"
      data-slot="aui_user-message-root"
    >
      <div
        className={cn(USER_BUBBLE_BASE_CLASS, USER_BUBBLE_READ_CLASS, !expanded && "sticky-human-clamp")}
        data-clamped={!expanded && clamped ? "true" : undefined}
        onClick={() => setExpanded((value) => !value)}
        ref={bodyRef}
      >
        <div className="min-h-[1.25rem]">{message.content}</div>
      </div>
    </div>
  );
}
