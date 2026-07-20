"use client";

// User bubble — ordinary document-flow message with an inline edit action.
// It intentionally never becomes sticky: long conversations must scroll as a
// single transcript and never hide assistant content behind a pinned prompt.

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { SessionMessage } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

const USER_BUBBLE_BASE_CLASS =
  "composer-human-message relative flex w-fit min-w-0 max-w-[85%] self-end flex-col gap-1.5 overflow-y-auto rounded-[1.75rem] border bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] px-4 py-2.5 text-left";
const USER_BUBBLE_READ_CLASS =
  "cursor-default text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground/95 transition-colors border-(--ui-stroke-tertiary) hover:border-(--ui-stroke-secondary)";

export function UserMessage({ message, onEdit }: { message: SessionMessage; onEdit: (at: string, content: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  return (
    <div
      className="group/user-message flex w-full min-w-0 flex-col items-stretch gap-0 self-end overflow-visible pb-(--conversation-turn-gap) pt-1"
      data-message-id={message.at}
      data-role="user"
      data-slot="aui_user-message-root"
    >
      {editing ? (
        <div className="ml-auto w-full max-w-[85%] rounded-[1.75rem] border border-(--ui-stroke-secondary) bg-background p-3 shadow-sm">
          <textarea autoFocus className="min-h-24 w-full resize-y bg-transparent text-[length:var(--conversation-text-font-size)] leading-relaxed outline-none" onChange={(event) => setDraft(event.target.value)} value={draft} />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button onClick={() => { setDraft(message.content); setEditing(false); }} size="xs" variant="ghost">Cancel</Button>
            <Button disabled={!draft.trim()} onClick={() => { onEdit(message.at, draft); setEditing(false); }} size="xs" variant="secondary">Save</Button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={cn(USER_BUBBLE_BASE_CLASS, USER_BUBBLE_READ_CLASS, "text-center")}
          >
            <div className="min-h-[1.25rem] w-full">{message.content}</div>
          </div>
          <Button className="ml-auto mt-1 h-5 gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) opacity-0 transition-opacity group-hover/user-message:opacity-100 focus-visible:opacity-100" onClick={() => setEditing(true)} size="xs" variant="ghost"><Codicon name="edit" size="0.7rem" /> Edit</Button>
        </>
      )}
    </div>
  );
}
